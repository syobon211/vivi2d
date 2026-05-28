import type { LayerSemanticRole } from "@vivi2d/core/types";
import {
  DEFAULT_MANUAL_SPLIT_PROTECTED_ROLES,
  DEFAULT_MANUAL_SPLIT_QUALITY_POLICY,
  type ManualSplitQualityCheckId,
  type ManualSplitQualityPolicy,
  type ManualSplitQualitySeverity,
  type ManualSplitRepairAction,
} from "./manual-split-quality-policy";

export interface ManualSplitAlphaMaskView {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}

export interface ManualSplitQualityMask {
  id: string;
  role: LayerSemanticRole;
  mask: ManualSplitAlphaMaskView;
}

export interface ManualSplitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualSplitQualityFinding {
  id: ManualSplitQualityCheckId;
  severity: ManualSplitQualitySeverity;
  maskId?: string;
  role?: LayerSemanticRole;
  bounds?: ManualSplitRect;
  score?: number;
  threshold?: number;
  repairActions: ManualSplitRepairAction[];
}

export interface ManualSplitQualityReport {
  status: "pass" | "warning" | "blocked";
  findings: readonly ManualSplitQualityFinding[];
  blockerCount: number;
  warningCount: number;
}

export interface ManualSplitQualityInput {
  sourceAlpha: ManualSplitAlphaMaskView;
  masks: readonly ManualSplitQualityMask[];
  requiredRoles?: readonly LayerSemanticRole[];
  protectedRoles?: readonly LayerSemanticRole[];
  sourceFingerprintOk?: boolean;
  textureBudgetBytes?: number;
  estimatedOutputBytes?: number;
  policy?: Partial<ManualSplitQualityPolicy>;
}

interface MaskStats {
  mask: ManualSplitQualityMask;
  pixelCount: number;
  bounds: ManualSplitRect | undefined;
  components: readonly ConnectedComponent[];
  boundaryPixels: number;
}

interface ConnectedComponent {
  pixels: number;
  bounds: ManualSplitRect;
}

const SEVERITY_ORDER: Record<ManualSplitQualitySeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

export function analyzeManualSplitQuality(
  input: ManualSplitQualityInput,
): ManualSplitQualityReport {
  const policy = { ...DEFAULT_MANUAL_SPLIT_QUALITY_POLICY, ...input.policy };
  validateCompatibleMask(input.sourceAlpha, "sourceAlpha");
  const protectedRoles = new Set(input.protectedRoles ?? DEFAULT_MANUAL_SPLIT_PROTECTED_ROLES);
  const findings: ManualSplitQualityFinding[] = [];
  const stats = input.masks.map((mask) => createMaskStats(mask, input.sourceAlpha, policy));
  const nonEmptyStats = stats.filter((entry) => entry.pixelCount > 0);
  const sourceOpaque = countAlphaPixels(input.sourceAlpha, policy.sourceOpaqueAlphaThreshold);
  const sourceHighAlpha = countAlphaPixels(input.sourceAlpha, policy.sourceHighAlphaThreshold);
  const denominator = Math.max(1, sourceOpaque);

  if (input.sourceFingerprintOk === false) {
    pushFinding(findings, {
      id: "sourceFingerprintMismatch",
      severity: "blocker",
      repairActions: [],
    });
  }

  if (nonEmptyStats.length === 0) {
    pushFinding(findings, {
      id: "noNonEmptyMasks",
      severity: "blocker",
      repairActions: ["assignToMask"],
    });
  }

  for (const role of input.requiredRoles ?? []) {
    if (!nonEmptyStats.some((entry) => entry.mask.role === role)) {
      pushFinding(findings, {
        id: "missingRequiredSemantic",
        severity: "blocker",
        role,
        repairActions: ["assignToMask"],
      });
    }
  }

  if (
    input.textureBudgetBytes !== undefined &&
    input.estimatedOutputBytes !== undefined &&
    input.estimatedOutputBytes > input.textureBudgetBytes
  ) {
    pushFinding(findings, {
      id: "applyWouldExceedTextureBudget",
      severity: "blocker",
      score: input.estimatedOutputBytes,
      threshold: input.textureBudgetBytes,
      repairActions: ["reduceTextureBudget"],
    });
  }

  const coverage = computeCoverage(input.sourceAlpha, stats, policy);
  const lostHighAlphaRatio =
    sourceHighAlpha > 0 ? coverage.lostHighAlphaPixels / sourceHighAlpha : 0;
  if (lostHighAlphaRatio > policy.maxHighAlphaPixelsLostRatio) {
    pushFinding(findings, {
      id: "highAlphaPixelsLost",
      severity: "blocker",
      score: lostHighAlphaRatio,
      threshold: policy.maxHighAlphaPixelsLostRatio,
      bounds: coverage.unassignedBounds,
      repairActions: ["assignToMask", "fillHoles"],
    });
  } else if (
    coverage.unassignedOpaquePixels / denominator >
    policy.maxUnassignedOpaquePixelsWarningRatio
  ) {
    pushFinding(findings, {
      id: "unassignedOpaquePixels",
      severity: "warning",
      score: coverage.unassignedOpaquePixels / denominator,
      threshold: policy.maxUnassignedOpaquePixelsWarningRatio,
      bounds: coverage.unassignedBounds,
      repairActions: ["assignToMask", "fillHoles"],
    });
  }

  addOverlapFindings(findings, input.sourceAlpha, stats, protectedRoles, policy);
  addMaskShapeFindings(findings, nonEmptyStats, sourceOpaque, protectedRoles, policy);

  const sorted = findings.sort(compareFindings);
  const blockerCount = sorted.filter((finding) => finding.severity === "blocker").length;
  const warningCount = sorted.filter((finding) => finding.severity === "warning").length;
  return {
    status: blockerCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "pass",
    findings: sorted,
    blockerCount,
    warningCount,
  };
}

export function hasManualSplitQualityBlockers(
  report: Pick<ManualSplitQualityReport, "blockerCount">,
): boolean {
  return report.blockerCount > 0;
}

function validateCompatibleMask(mask: ManualSplitAlphaMaskView, label: string): void {
  if (
    !Number.isInteger(mask.width) ||
    !Number.isInteger(mask.height) ||
    mask.width <= 0 ||
    mask.height <= 0 ||
    mask.alpha.length !== mask.width * mask.height
  ) {
    throw new Error(`${label} must contain width * height alpha values.`);
  }
}

function createMaskStats(
  mask: ManualSplitQualityMask,
  sourceAlpha: ManualSplitAlphaMaskView,
  policy: ManualSplitQualityPolicy,
): MaskStats {
  validateCompatibleMask(mask.mask, `mask:${mask.id}`);
  if (mask.mask.width !== sourceAlpha.width || mask.mask.height !== sourceAlpha.height) {
    throw new Error(`mask:${mask.id} dimensions must match sourceAlpha.`);
  }
  const components = connectedComponents(mask.mask, policy.maskAlphaThreshold);
  return {
    mask,
    pixelCount: countAlphaPixels(mask.mask, policy.maskAlphaThreshold),
    bounds: unionRects(components.map((component) => component.bounds)),
    components,
    boundaryPixels: countBoundaryPixels(mask.mask, policy.maskAlphaThreshold),
  };
}

function countAlphaPixels(mask: ManualSplitAlphaMaskView, threshold: number): number {
  let count = 0;
  for (const alpha of mask.alpha) {
    if (alpha > threshold) count += 1;
  }
  return count;
}

function computeCoverage(
  sourceAlpha: ManualSplitAlphaMaskView,
  stats: readonly MaskStats[],
  policy: ManualSplitQualityPolicy,
): {
  lostHighAlphaPixels: number;
  unassignedOpaquePixels: number;
  unassignedBounds: ManualSplitRect | undefined;
} {
  let lostHighAlphaPixels = 0;
  let unassignedOpaquePixels = 0;
  let unassignedBounds: ManualSplitRect | undefined;
  for (let index = 0; index < sourceAlpha.alpha.length; index += 1) {
    const isCovered = stats.some((entry) => entry.mask.mask.alpha[index]! > policy.maskAlphaThreshold);
    if (isCovered) continue;
    const x = index % sourceAlpha.width;
    const y = Math.floor(index / sourceAlpha.width);
    if (sourceAlpha.alpha[index]! > policy.sourceHighAlphaThreshold) {
      lostHighAlphaPixels += 1;
      unassignedBounds = includePoint(unassignedBounds, x, y);
    }
    if (sourceAlpha.alpha[index]! > policy.sourceOpaqueAlphaThreshold) {
      unassignedOpaquePixels += 1;
      unassignedBounds = includePoint(unassignedBounds, x, y);
    }
  }
  return { lostHighAlphaPixels, unassignedOpaquePixels, unassignedBounds };
}

function addOverlapFindings(
  findings: ManualSplitQualityFinding[],
  sourceAlpha: ManualSplitAlphaMaskView,
  stats: readonly MaskStats[],
  protectedRoles: ReadonlySet<LayerSemanticRole>,
  policy: ManualSplitQualityPolicy,
): void {
  const sourceOpaque = Math.max(1, countAlphaPixels(sourceAlpha, policy.sourceOpaqueAlphaThreshold));
  for (let firstIndex = 0; firstIndex < stats.length; firstIndex += 1) {
    const first = stats[firstIndex]!;
    if (first.pixelCount === 0) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < stats.length; secondIndex += 1) {
      const second = stats[secondIndex]!;
      if (second.pixelCount === 0) continue;
      const overlap = countOverlap(first.mask.mask, second.mask.mask, policy.maskAlphaThreshold);
      if (overlap.count === 0) continue;
      const ratio = overlap.count / sourceOpaque;
      const touchesProtected =
        protectedRoles.has(first.mask.role) || protectedRoles.has(second.mask.role);
      pushFinding(findings, {
        id: touchesProtected ? "protectedSemanticContamination" : "maskOverlap",
        severity:
          touchesProtected || ratio > policy.maxOverlapRatioBlocker
            ? "blocker"
            : "warning",
        maskId: touchesProtected
          ? protectedRoles.has(first.mask.role)
            ? second.mask.id
            : first.mask.id
          : first.mask.id,
        role: touchesProtected
          ? protectedRoles.has(first.mask.role)
            ? second.mask.role
            : first.mask.role
          : first.mask.role,
        bounds: overlap.bounds,
        score: ratio,
        threshold: policy.maxOverlapRatioBlocker,
        repairActions: touchesProtected
          ? ["reviewProtectedRegion", "resolveOverlap"]
          : ["resolveOverlap"],
      });
    }
  }
}

function addMaskShapeFindings(
  findings: ManualSplitQualityFinding[],
  stats: readonly MaskStats[],
  sourceOpaque: number,
  protectedRoles: ReadonlySet<LayerSemanticRole>,
  policy: ManualSplitQualityPolicy,
): void {
  const protectedBounds = unionRects(
    stats
      .filter((entry) => protectedRoles.has(entry.mask.role))
      .flatMap((entry) => (entry.bounds ? [entry.bounds] : [])),
  );
  for (const entry of stats) {
    const coverageRatio = entry.pixelCount / Math.max(1, sourceOpaque);
    if (coverageRatio < policy.minMaskCoverageWarningRatio) {
      pushFinding(findings, {
        id: "lowMaskCoverage",
        severity: "warning",
        maskId: entry.mask.id,
        role: entry.mask.role,
        bounds: entry.bounds,
        score: coverageRatio,
        threshold: policy.minMaskCoverageWarningRatio,
        repairActions: ["assignToMask"],
      });
    }
    const tinyIsland = entry.components.find(
      (component) => component.pixels <= policy.tinyIslandMaxPixels,
    );
    if (tinyIsland && entry.components.length > 1) {
      pushFinding(findings, {
        id: "tinyIsland",
        severity: "warning",
        maskId: entry.mask.id,
        role: entry.mask.role,
        bounds: tinyIsland.bounds,
        score: tinyIsland.pixels,
        threshold: policy.tinyIslandMaxPixels,
        repairActions: ["removeIslands"],
      });
    }
    if (entry.components.length > 1) {
      pushFinding(findings, {
        id: "multiLobeMask",
        severity: "warning",
        maskId: entry.mask.id,
        role: entry.mask.role,
        bounds: entry.bounds,
        score: entry.components.length,
        threshold: 1,
        repairActions: ["splitMask", "removeIslands"],
      });
    }
    if (
      entry.bounds &&
      Math.min(entry.bounds.width, entry.bounds.height) <= policy.thinFragmentMinSpanPx
    ) {
      pushFinding(findings, {
        id: "thinFragment",
        severity: "warning",
        maskId: entry.mask.id,
        role: entry.mask.role,
        bounds: entry.bounds,
        score: Math.min(entry.bounds.width, entry.bounds.height),
        threshold: policy.thinFragmentMinSpanPx,
        repairActions: ["featherEdge", "splitMask"],
      });
    }
    if (
      entry.pixelCount > 0 &&
      entry.boundaryPixels / Math.max(1, Math.sqrt(entry.pixelCount)) >
        policy.jaggedEdgeBoundaryRatio
    ) {
      pushFinding(findings, {
        id: "jaggedEdge",
        severity: "warning",
        maskId: entry.mask.id,
        role: entry.mask.role,
        bounds: entry.bounds,
        score: entry.boundaryPixels / Math.max(1, Math.sqrt(entry.pixelCount)),
        threshold: policy.jaggedEdgeBoundaryRatio,
        repairActions: ["featherEdge"],
      });
    }
    if (
      entry.mask.role === "accessory" &&
      entry.bounds &&
      protectedBounds &&
      rectsTouch(entry.bounds, protectedBounds, policy.accessoryNearProtectedDistancePx)
    ) {
      pushFinding(findings, {
        id: "ambiguousAccessoryNearFace",
        severity: "warning",
        maskId: entry.mask.id,
        role: entry.mask.role,
        bounds: entry.bounds,
        repairActions: ["reviewProtectedRegion"],
      });
    }
  }
}

function connectedComponents(
  mask: ManualSplitAlphaMaskView,
  threshold: number,
): ConnectedComponent[] {
  const visited = new Uint8Array(mask.alpha.length);
  const components: ConnectedComponent[] = [];
  const queue: number[] = [];
  for (let start = 0; start < mask.alpha.length; start += 1) {
    if (visited[start] || mask.alpha[start]! <= threshold) continue;
    visited[start] = 1;
    queue.length = 0;
    queue.push(start);
    let pixels = 0;
    let bounds: ManualSplitRect | undefined;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!;
      const x = index % mask.width;
      const y = Math.floor(index / mask.width);
      pixels += 1;
      bounds = includePoint(bounds, x, y);
      for (const neighbor of neighbors4(index, x, y, mask.width, mask.height)) {
        if (visited[neighbor] || mask.alpha[neighbor]! <= threshold) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    components.push({ pixels, bounds: bounds! });
  }
  return components;
}

function neighbors4(
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
): number[] {
  const result: number[] = [];
  if (x > 0) result.push(index - 1);
  if (x + 1 < width) result.push(index + 1);
  if (y > 0) result.push(index - width);
  if (y + 1 < height) result.push(index + width);
  return result;
}

function countBoundaryPixels(mask: ManualSplitAlphaMaskView, threshold: number): number {
  let count = 0;
  for (let index = 0; index < mask.alpha.length; index += 1) {
    if (mask.alpha[index]! <= threshold) continue;
    const x = index % mask.width;
    const y = Math.floor(index / mask.width);
    if (
      neighbors4(index, x, y, mask.width, mask.height).some(
        (neighbor) => mask.alpha[neighbor]! <= threshold,
      ) ||
      x === 0 ||
      y === 0 ||
      x + 1 === mask.width ||
      y + 1 === mask.height
    ) {
      count += 1;
    }
  }
  return count;
}

function countOverlap(
  first: ManualSplitAlphaMaskView,
  second: ManualSplitAlphaMaskView,
  threshold: number,
): { count: number; bounds: ManualSplitRect | undefined } {
  let count = 0;
  let bounds: ManualSplitRect | undefined;
  for (let index = 0; index < first.alpha.length; index += 1) {
    if (first.alpha[index]! <= threshold || second.alpha[index]! <= threshold) continue;
    const x = index % first.width;
    const y = Math.floor(index / first.width);
    count += 1;
    bounds = includePoint(bounds, x, y);
  }
  return { count, bounds };
}

function includePoint(
  rect: ManualSplitRect | undefined,
  x: number,
  y: number,
): ManualSplitRect {
  if (!rect) return { x, y, width: 1, height: 1 };
  const minX = Math.min(rect.x, x);
  const minY = Math.min(rect.y, y);
  const maxX = Math.max(rect.x + rect.width - 1, x);
  const maxY = Math.max(rect.y + rect.height - 1, y);
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function unionRects(rects: readonly ManualSplitRect[]): ManualSplitRect | undefined {
  let result: ManualSplitRect | undefined;
  for (const rect of rects) {
    result = includePoint(includePoint(result, rect.x, rect.y), rect.x + rect.width - 1, rect.y + rect.height - 1);
  }
  return result;
}

function rectsTouch(first: ManualSplitRect, second: ManualSplitRect, padding: number): boolean {
  return !(
    first.x + first.width + padding < second.x ||
    second.x + second.width + padding < first.x ||
    first.y + first.height + padding < second.y ||
    second.y + second.height + padding < first.y
  );
}

function pushFinding(
  findings: ManualSplitQualityFinding[],
  finding: ManualSplitQualityFinding,
): void {
  findings.push(finding);
}

function compareFindings(
  first: ManualSplitQualityFinding,
  second: ManualSplitQualityFinding,
): number {
  return (
    SEVERITY_ORDER[first.severity] - SEVERITY_ORDER[second.severity] ||
    first.id.localeCompare(second.id) ||
    (first.maskId ?? "").localeCompare(second.maskId ?? "") ||
    (first.role ?? "").localeCompare(second.role ?? "") ||
    rectKey(first.bounds).localeCompare(rectKey(second.bounds))
  );
}

function rectKey(rect: ManualSplitRect | undefined): string {
  return rect ? `${rect.x}:${rect.y}:${rect.width}:${rect.height}` : "";
}
