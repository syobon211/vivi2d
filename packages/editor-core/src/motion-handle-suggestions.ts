import type { LayerSemanticRole } from "@vivi2d/core/types";
import type {
  AcceptedMaskAlphaHash,
  AcceptedMaskPlacementHash,
  ProtectedRegionSetHash,
  SourceMaskBytesHash,
} from "./accepted-mask-packet";
import type {
  MotionKind,
  MotionSemanticPolicy,
  RootAnchorKind,
  TipAnchorKind,
} from "./motion-template-policy";

export const MOTION_HANDLE_SUGGESTION_LIMITS = Object.freeze({
  alphaThreshold: 128,
  maxWidth: 4096,
  maxHeight: 4096,
  maxPixels: 4_194_304,
  maxComponents: 256,
  maxBoundarySamples: 256,
  maxContextRects: 32,
  significantComponentRatio: 0.05,
  minSignificantComponentPixels: 8,
  minRootTipDistancePx: 3,
});

export type MotionHandleSuggestionConfidence = "low" | "medium" | "high";

export type MotionHandleSuggestionInputSource =
  | "acceptedManualMask"
  | "regionBoundsPseudoMask";

export type MotionHandleAcceptedMaskFingerprint = `maskAlpha:v1:${string}`;

export type MotionHandleSuggestionWarning =
  | "roundMask"
  | "smallMask"
  | "multiLobeMask"
  | "protectedFaceAdjacent"
  | "weakAdjacency"
  | "lowConfidence"
  | "manualReviewRequired";

export type MotionHandleSuggestionReason =
  | "strongSafeAdjacency"
  | "clearBoundaryDirection"
  | "rolePolicyMatched"
  | "manualReviewRecommended"
  | "protectedAreaNearby"
  | "ambiguousShape"
  | "inputRejected";

export type MotionHandleSuggestionContextKind =
  | "head"
  | "face"
  | "body"
  | "parentLayer"
  | "attachment"
  | "protected";

export interface MotionHandleSuggestionContextRect {
  kind: MotionHandleSuggestionContextKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MotionHandleSuggestionMask {
  width: number;
  height: number;
  alpha: Uint8Array | Uint8ClampedArray;
}

export interface MotionHandleSuggestionInput {
  regionId: string;
  role: LayerSemanticRole;
  inputSource: MotionHandleSuggestionInputSource;
  mask: MotionHandleSuggestionMask;
  semanticPolicy: MotionSemanticPolicy;
  contextRects?: readonly MotionHandleSuggestionContextRect[];
}

export interface SuggestedHandlePoint {
  x: number;
  y: number;
  source: "boundarySample" | "centroidFallback" | "manualReview";
}

export interface UserAcceptedMotionHandle {
  kind: "userAcceptedMotionHandle";
  id: string;
  regionId: string;
  role: LayerSemanticRole;
  root: SuggestedHandlePoint;
  tip: SuggestedHandlePoint | null;
  acceptedAt: string;
  sourceMaskFingerprint: `sha256:v1:${string}`;
  sourceMaskBytesHash?: SourceMaskBytesHash;
  acceptedMaskAlphaHash?: AcceptedMaskAlphaHash;
  acceptedMaskPlacementHash?: AcceptedMaskPlacementHash;
  protectedRegionSetHash?: ProtectedRegionSetHash;
  acceptedMaskFingerprint?: MotionHandleAcceptedMaskFingerprint;
  semanticPolicyId: string;
  semanticPolicyVersion: number;
  motionBudgetBucket: "none" | "low" | "medium" | "high";
  acceptedFromSuggestionStatus: "review" | "apply";
}

export type MotionHandleSuggestionResult =
  | {
      status: "apply";
      regionId: string;
      role: LayerSemanticRole;
      root: SuggestedHandlePoint;
      tip: SuggestedHandlePoint;
      confidence: "high";
      autoApplicable: true;
      warnings: readonly [];
      reasons: readonly MotionHandleSuggestionReason[];
    }
  | {
      status: "review";
      regionId: string;
      role: LayerSemanticRole;
      root: SuggestedHandlePoint;
      tip: SuggestedHandlePoint | null;
      confidence: "low" | "medium";
      autoApplicable: false;
      warnings: readonly MotionHandleSuggestionWarning[];
      reasons: readonly MotionHandleSuggestionReason[];
    }
  | {
      status: "rejected";
      regionId?: string;
      role?: LayerSemanticRole;
      confidence: "low";
      autoApplicable: false;
      warnings: readonly MotionHandleSuggestionWarning[];
      reasons: readonly MotionHandleSuggestionReason[];
    };

interface ValidatedMotionHandleSuggestionInput
  extends Omit<MotionHandleSuggestionInput, "mask" | "contextRects"> {
  mask: {
    width: number;
    height: number;
    alpha: Uint8Array;
  };
  contextRects: readonly MotionHandleSuggestionContextRect[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface ComponentSummary {
  label: number;
  pixels: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centroid: Point;
  spreadXx: number;
  spreadXy: number;
  spreadYy: number;
}

const INPUT_TOP_LEVEL_KEYS = new Set([
  "regionId",
  "role",
  "inputSource",
  "mask",
  "semanticPolicy",
  "contextRects",
]);
const MASK_KEYS = new Set(["width", "height", "alpha"]);
const CONTEXT_RECT_KEYS = new Set(["kind", "x", "y", "width", "height"]);
const POLICY_KEYS = new Set([
  "role",
  "policyId",
  "policyVersion",
  "defaultMotionKind",
  "protected",
  "rootAnchorPriority",
  "tipPriority",
  "maxRotationDeg",
  "maxDisplacementPxRatio",
  "physicsPreset",
  "requireUserOptIn",
]);
const PROVIDER_PROVENANCE_KEYS = new Set([
  "providerId",
  "proposalId",
  "capabilityId",
  "requestToken",
  "metadata",
  "artifact",
]);
const SEMANTIC_ROLES: ReadonlySet<LayerSemanticRole> = new Set([
  "head",
  "face",
  "eyeLeft",
  "eyeRight",
  "eyebrowLeft",
  "eyebrowRight",
  "mouth",
  "nose",
  "hair",
  "hairFront",
  "hairBack",
  "hairSide",
  "body",
  "armLeft",
  "armRight",
  "handLeft",
  "handRight",
  "legLeft",
  "legRight",
  "tail",
  "ear",
  "accessory",
  "unknown",
]);
const MOTION_KINDS: ReadonlySet<MotionKind> = new Set([
  "rigid",
  "secondaryMotion",
  "skinned",
  "manualOnly",
]);
const ROOT_PRIORITIES: ReadonlySet<RootAnchorKind> = new Set([
  "headAdjacent",
  "faceAdjacent",
  "parentLayerAdjacent",
  "attachmentPoint",
  "top",
  "inner",
  "center",
]);
const TIP_PRIORITIES: ReadonlySet<TipAnchorKind> = new Set([
  "farthestFromRoot",
  "downward",
  "outward",
  "longAxisEnd",
  "manualReview",
]);
const CONTEXT_KINDS: ReadonlySet<MotionHandleSuggestionContextKind> = new Set([
  "head",
  "face",
  "body",
  "parentLayer",
  "attachment",
  "protected",
]);
const INPUT_SOURCES: ReadonlySet<MotionHandleSuggestionInputSource> = new Set([
  "acceptedManualMask",
  "regionBoundsPseudoMask",
]);

export function suggestMotionHandles(
  input: unknown,
): MotionHandleSuggestionResult {
  const validation = validateMotionHandleSuggestionInput(input);
  if (!validation.ok) {
    return rejectedResult(validation.regionId, validation.role);
  }

  const { regionId, role, inputSource, mask, semanticPolicy, contextRects } =
    validation.input;
  const summary = summarizeMask(mask);
  if (!summary.ok) {
    return rejectedResult(regionId, role, summary.warnings);
  }

  const { component, warnings: summaryWarnings, labels } = summary;
  const bounds = componentBounds(component);
  const centroidPoint = toSuggestedPoint(component.centroid, mask, "centroidFallback");
  const samplePoints = sampleBoundaryPoints(mask, labels, component.label);
  if (samplePoints.length === 0) {
    return reviewResult(regionId, role, centroidPoint, centroidPoint, "low", [
      ...summaryWarnings,
      "manualReviewRequired",
      "lowConfidence",
    ]);
  }

  const shape = summarizeComponentShape(component);
  const rootCandidate = chooseRootCandidate(
    samplePoints,
    bounds,
    component.centroid,
    semanticPolicy,
    contextRects,
    mask,
  );
  const tipCandidate = chooseTipCandidate(
    samplePoints,
    rootCandidate.point,
    bounds,
    component.centroid,
    shape,
    semanticPolicy,
    mask,
  );

  const root = toSuggestedPoint(rootCandidate.point, mask, "boundarySample");
  const tip = toSuggestedPoint(tipCandidate.point, mask, "boundarySample");
  const rootTipDistance = distance(root, tip);
  const motionAllowed =
    inputSource === "acceptedManualMask" &&
    semanticPolicy.protected === false &&
    semanticPolicy.requireUserOptIn !== true &&
    (semanticPolicy.defaultMotionKind === "secondaryMotion" ||
      semanticPolicy.defaultMotionKind === "skinned");
  const warnings = new Set<MotionHandleSuggestionWarning>(summaryWarnings);

  if (shape.directionStrength < 0.18) warnings.add("roundMask");
  if (rootCandidate.score < 0.35) warnings.add("weakAdjacency");
  if (
    isProtectedFaceAdjacentAccessory(role, bounds, contextRects) ||
    semanticPolicy.protected
  ) {
    warnings.add("protectedFaceAdjacent");
  }
  if (rootTipDistance < Math.max(
    MOTION_HANDLE_SUGGESTION_LIMITS.minRootTipDistancePx,
    Math.min(bounds.width, bounds.height) * 0.15,
  )) {
    warnings.add("smallMask");
  }
  if (!motionAllowed) warnings.add("manualReviewRequired");

  const confidence = bucketConfidence({
    rootScore: rootCandidate.score,
    tipScore: tipCandidate.score,
    directionStrength: shape.directionStrength,
    motionAllowed,
    warnings,
  });
  if (confidence === "low") warnings.add("lowConfidence");

  const reasons = createReasons({
    rootScore: rootCandidate.score,
    directionStrength: shape.directionStrength,
    motionAllowed,
    warnings,
  });

  if (
    confidence === "high" &&
    motionAllowed &&
    inputSource === "acceptedManualMask" &&
    !warnings.has("manualReviewRequired") &&
    !warnings.has("lowConfidence") &&
    !warnings.has("weakAdjacency") &&
    !warnings.has("protectedFaceAdjacent") &&
    !warnings.has("roundMask") &&
    !warnings.has("multiLobeMask") &&
    !warnings.has("smallMask")
  ) {
    return {
      status: "apply",
      regionId,
      role,
      root,
      tip,
      confidence,
      autoApplicable: true,
      warnings: Object.freeze([]),
      reasons,
    };
  }

  warnings.add("manualReviewRequired");
  return {
    status: "review",
    regionId,
    role,
    root,
    tip,
    confidence: confidence === "high" ? "medium" : confidence,
    autoApplicable: false,
    warnings: Object.freeze([...warnings]),
    reasons: reasons.includes("manualReviewRecommended")
      ? reasons
      : Object.freeze([...reasons, "manualReviewRecommended"]),
  };
}

function validateMotionHandleSuggestionInput(
  input: unknown,
):
  | { ok: true; input: ValidatedMotionHandleSuggestionInput }
  | { ok: false; regionId?: string; role?: LayerSemanticRole } {
  const inputRecord = getPlainDataRecord(input, INPUT_TOP_LEVEL_KEYS);
  if (!inputRecord.ok) return { ok: false };
  if (hasProviderProvenanceField(inputRecord.values)) return { ok: false };

  const regionId = getString(inputRecord.values.regionId);
  const role = getSemanticRole(inputRecord.values.role);
  const inputSource = getInputSource(inputRecord.values.inputSource);
  if (!regionId || !role) return { ok: false, regionId, role };
  if (!inputSource) return { ok: false, regionId, role };

  const mask = validateMask(inputRecord.values.mask);
  if (!mask) return { ok: false, regionId, role };

  const semanticPolicy = validateSemanticPolicy(
    inputRecord.values.semanticPolicy,
    role,
  );
  if (!semanticPolicy) return { ok: false, regionId, role };

  const contextRects = validateContextRects(inputRecord.values.contextRects);
  if (!contextRects) return { ok: false, regionId, role };

  return {
    ok: true,
    input: {
      regionId,
      role,
      inputSource,
      mask,
      semanticPolicy,
      contextRects,
    },
  };
}

function getPlainDataRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
):
  | { ok: true; values: Record<string, unknown> }
  | { ok: false } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false };
  }
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return { ok: false };
    if (Object.getOwnPropertySymbols(value).length > 0) return { ok: false };
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const values: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!allowedKeys.has(key)) return { ok: false };
      if ("get" in descriptor || "set" in descriptor) return { ok: false };
      values[key] = descriptor.value;
    }
    return { ok: true, values };
  } catch {
    return { ok: false };
  }
}

function hasProviderProvenanceField(values: Record<string, unknown>): boolean {
  return Object.keys(values).some((key) => PROVIDER_PROVENANCE_KEYS.has(key));
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function getSemanticRole(value: unknown): LayerSemanticRole | undefined {
  return typeof value === "string" && SEMANTIC_ROLES.has(value as LayerSemanticRole)
    ? (value as LayerSemanticRole)
    : undefined;
}

function getInputSource(
  value: unknown,
): MotionHandleSuggestionInputSource | undefined {
  return typeof value === "string" &&
    INPUT_SOURCES.has(value as MotionHandleSuggestionInputSource)
    ? (value as MotionHandleSuggestionInputSource)
    : undefined;
}

export function isAutoApplicableMotionHandleSuggestion(
  suggestion: MotionHandleSuggestionResult | undefined,
): suggestion is Extract<MotionHandleSuggestionResult, { status: "apply" }> {
  return (
    suggestion?.status === "apply" &&
    suggestion.autoApplicable === true &&
    suggestion.confidence === "high" &&
    suggestion.tip != null &&
    suggestion.warnings.length === 0
  );
}

function validateMask(value: unknown):
  | { width: number; height: number; alpha: Uint8Array }
  | undefined {
  const maskRecord = getPlainDataRecord(value, MASK_KEYS);
  if (!maskRecord.ok) return undefined;
  const { width, height, alpha } = maskRecord.values;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height)
  ) {
    return undefined;
  }
  if (
    width <= 0 ||
    height <= 0 ||
    width > MOTION_HANDLE_SUGGESTION_LIMITS.maxWidth ||
    height > MOTION_HANDLE_SUGGESTION_LIMITS.maxHeight
  ) {
    return undefined;
  }
  const pixels = width * height;
  if (pixels > MOTION_HANDLE_SUGGESTION_LIMITS.maxPixels) return undefined;
  if (!(alpha instanceof Uint8Array) && !(alpha instanceof Uint8ClampedArray)) {
    return undefined;
  }
  try {
    if (
      typeof SharedArrayBuffer !== "undefined" &&
      alpha.buffer instanceof SharedArrayBuffer
    ) {
      return undefined;
    }
    if (isResizableOrGrowableArrayBuffer(alpha.buffer)) {
      return undefined;
    }
    if (alpha.byteLength !== pixels) return undefined;
    const copy = new Uint8Array(alpha.byteLength);
    copy.set(alpha);
    return { width, height, alpha: copy };
  } catch {
    return undefined;
  }
}

function isResizableOrGrowableArrayBuffer(buffer: ArrayBufferLike): boolean {
  const candidate = buffer as ArrayBuffer & {
    readonly resizable?: boolean;
    readonly growable?: boolean;
    readonly maxByteLength?: number;
  };
  return (
    candidate.resizable === true ||
    candidate.growable === true ||
    (typeof candidate.maxByteLength === "number" &&
      candidate.maxByteLength !== candidate.byteLength)
  );
}

function validateSemanticPolicy(
  value: unknown,
  expectedRole: LayerSemanticRole,
): MotionSemanticPolicy | undefined {
  const policyRecord = getPlainDataRecord(value, POLICY_KEYS);
  if (!policyRecord.ok) return undefined;
  const values = policyRecord.values;
  if (values.role !== expectedRole) return undefined;
  if (typeof values.policyId !== "string" || values.policyId.trim() === "") {
    return undefined;
  }
  if (
    typeof values.policyVersion !== "number" ||
    !Number.isSafeInteger(values.policyVersion) ||
    values.policyVersion <= 0
  ) {
    return undefined;
  }
  if (!MOTION_KINDS.has(values.defaultMotionKind as MotionKind)) return undefined;
  if (typeof values.protected !== "boolean") return undefined;
  if (!isFiniteNumber(values.maxRotationDeg)) return undefined;
  if (!isFiniteNumber(values.maxDisplacementPxRatio)) return undefined;
  if (
    values.requireUserOptIn !== undefined &&
    typeof values.requireUserOptIn !== "boolean"
  ) {
    return undefined;
  }
  if (
    !Array.isArray(values.rootAnchorPriority) ||
    values.rootAnchorPriority.some(
      (entry) => !ROOT_PRIORITIES.has(entry as RootAnchorKind),
    )
  ) {
    return undefined;
  }
  if (
    !Array.isArray(values.tipPriority) ||
    values.tipPriority.some((entry) => !TIP_PRIORITIES.has(entry as TipAnchorKind))
  ) {
    return undefined;
  }
  if (typeof values.physicsPreset !== "string") return undefined;
  return values as unknown as MotionSemanticPolicy;
}

function validateContextRects(
  value: unknown,
): readonly MotionHandleSuggestionContextRect[] | undefined {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) return undefined;
  if (value.length > MOTION_HANDLE_SUGGESTION_LIMITS.maxContextRects) {
    return undefined;
  }
  const rects: MotionHandleSuggestionContextRect[] = [];
  for (const entry of value) {
    const rectRecord = getPlainDataRecord(entry, CONTEXT_RECT_KEYS);
    if (!rectRecord.ok) return undefined;
    const { kind, x, y, width, height } = rectRecord.values;
    if (!CONTEXT_KINDS.has(kind as MotionHandleSuggestionContextKind)) {
      return undefined;
    }
    if (
      !isFiniteNumber(x) ||
      !isFiniteNumber(y) ||
      !isFiniteNumber(width) ||
      !isFiniteNumber(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return undefined;
    }
    rects.push({
      kind: kind as MotionHandleSuggestionContextKind,
      x,
      y,
      width,
      height,
    });
  }
  return Object.freeze(rects);
}

function summarizeMask(mask: ValidatedMotionHandleSuggestionInput["mask"]):
  | {
      ok: true;
      component: ComponentSummary;
      labels: Int32Array;
      warnings: readonly MotionHandleSuggestionWarning[];
    }
  | { ok: false; warnings: readonly MotionHandleSuggestionWarning[] } {
  const { width, height, alpha } = mask;
  const pixelCount = width * height;
  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components: ComponentSummary[] = [];
  let nextLabel = 1;

  for (let index = 0; index < pixelCount; index += 1) {
    if (labels[index] !== 0 || alpha[index]! < MOTION_HANDLE_SUGGESTION_LIMITS.alphaThreshold) {
      continue;
    }
    if (components.length >= MOTION_HANDLE_SUGGESTION_LIMITS.maxComponents) {
      return {
        ok: false,
        warnings: ["multiLobeMask", "manualReviewRequired"],
      };
    }
    components.push(fillComponent({
      alpha,
      labels,
      queue,
      width,
      height,
      startIndex: index,
      label: nextLabel,
    }));
    nextLabel += 1;
  }

  if (components.length === 0) {
    return { ok: false, warnings: ["smallMask", "lowConfidence"] };
  }

  const sortedComponents = [...components].sort((a, b) => b.pixels - a.pixels);
  const largest = sortedComponents[0]!;
  const significantOtherCount = sortedComponents
    .slice(1)
    .filter(
      (component) =>
        component.pixels >=
        Math.max(
          MOTION_HANDLE_SUGGESTION_LIMITS.minSignificantComponentPixels,
          largest.pixels * MOTION_HANDLE_SUGGESTION_LIMITS.significantComponentRatio,
        ),
    ).length;
  const warnings = new Set<MotionHandleSuggestionWarning>();
  if (largest.pixels < 16) {
    warnings.add("smallMask");
    warnings.add("lowConfidence");
  }
  if (significantOtherCount > 0) warnings.add("multiLobeMask");
  return {
    ok: true,
    component: largest,
    labels,
    warnings: Object.freeze([...warnings]),
  };
}

function fillComponent(args: {
  alpha: Uint8Array;
  labels: Int32Array;
  queue: Int32Array;
  width: number;
  height: number;
  startIndex: number;
  label: number;
}): ComponentSummary {
  const { alpha, labels, queue, width, height, startIndex, label } = args;
  let read = 0;
  let write = 0;
  let pixels = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXx = 0;
  let sumXy = 0;
  let sumYy = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  labels[startIndex] = label;
  queue[write] = startIndex;
  write += 1;
  while (read < write) {
    const index = queue[read]!;
    read += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const px = x + 0.5;
    const py = y + 0.5;
    pixels += 1;
    sumX += px;
    sumY += py;
    sumXx += px * px;
    sumXy += px * py;
    sumYy += py * py;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);

    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (
        neighbor >= 0 &&
        labels[neighbor] === 0 &&
        alpha[neighbor]! >= MOTION_HANDLE_SUGGESTION_LIMITS.alphaThreshold
      ) {
        labels[neighbor] = label;
        queue[write] = neighbor;
        write += 1;
      }
    }
  }

  const invPixels = 1 / Math.max(1, pixels);
  const centroid = { x: sumX * invPixels, y: sumY * invPixels };
  return {
    label,
    pixels,
    minX,
    minY,
    maxX,
    maxY,
    centroid,
    spreadXx: sumXx * invPixels - centroid.x * centroid.x,
    spreadXy: sumXy * invPixels - centroid.x * centroid.y,
    spreadYy: sumYy * invPixels - centroid.y * centroid.y,
  };
}

function componentBounds(component: ComponentSummary): Rect {
  return {
    x: component.minX,
    y: component.minY,
    width: Math.max(1, component.maxX - component.minX),
    height: Math.max(1, component.maxY - component.minY),
  };
}

function sampleBoundaryPoints(
  mask: ValidatedMotionHandleSuggestionInput["mask"],
  labels: Int32Array,
  label: number,
): readonly Point[] {
  const boundaryIndexes: number[] = [];
  const { width, height } = mask;
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] !== label) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const atEdge =
      x === 0 ||
      x + 1 === width ||
      y === 0 ||
      y + 1 === height ||
      labels[index - 1] !== label ||
      labels[index + 1] !== label ||
      labels[index - width] !== label ||
      labels[index + width] !== label;
    if (atEdge) boundaryIndexes.push(index);
  }
  if (boundaryIndexes.length <= MOTION_HANDLE_SUGGESTION_LIMITS.maxBoundarySamples) {
    return Object.freeze(boundaryIndexes.map((index) => indexToPoint(index, width)));
  }
  const step =
    boundaryIndexes.length / MOTION_HANDLE_SUGGESTION_LIMITS.maxBoundarySamples;
  const samples: Point[] = [];
  for (
    let cursor = 0;
    samples.length < MOTION_HANDLE_SUGGESTION_LIMITS.maxBoundarySamples;
    cursor += step
  ) {
    const index = boundaryIndexes[Math.min(boundaryIndexes.length - 1, Math.floor(cursor))]!;
    samples.push(indexToPoint(index, width));
  }
  return Object.freeze(samples);
}

function indexToPoint(index: number, width: number): Point {
  return {
    x: (index % width) + 0.5,
    y: Math.floor(index / width) + 0.5,
  };
}

function summarizeComponentShape(component: ComponentSummary): {
  direction: Point;
  directionStrength: number;
} {
  const xx = Math.max(0, component.spreadXx);
  const yy = Math.max(0, component.spreadYy);
  const xy = component.spreadXy;
  const total = xx + yy;
  if (total <= 1e-9) {
    return { direction: { x: 1, y: 0 }, directionStrength: 0 };
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const contrast = Math.sqrt((xx - yy) * (xx - yy) + 4 * xy * xy) / total;
  return {
    direction: { x: Math.cos(angle), y: Math.sin(angle) },
    directionStrength: Math.max(0, Math.min(1, contrast)),
  };
}

function chooseRootCandidate(
  points: readonly Point[],
  bounds: Rect,
  centroid: Point,
  semanticPolicy: MotionSemanticPolicy,
  contextRects: readonly MotionHandleSuggestionContextRect[],
  mask: ValidatedMotionHandleSuggestionInput["mask"],
): { point: Point; score: number } {
  return chooseBestPoint(points, (point) =>
    scoreByPriorities(semanticPolicy.rootAnchorPriority, "max", (priority) => {
      switch (priority) {
        case "headAdjacent":
          return contextCloseness(point, contextRects, ["head"], mask);
        case "faceAdjacent":
          return contextCloseness(point, contextRects, ["face", "protected"], mask);
        case "parentLayerAdjacent":
          return contextCloseness(point, contextRects, ["parentLayer", "body"], mask);
        case "attachmentPoint":
          return contextCloseness(point, contextRects, ["attachment", "parentLayer"], mask);
        case "top":
          return 1 - normalizeInRange(point.y, bounds.y, bounds.y + bounds.height);
        case "inner":
        case "center":
          return 1 - normalizedDistance(point, centroid, mask);
      }
    }),
  );
}

function chooseTipCandidate(
  points: readonly Point[],
  root: Point,
  bounds: Rect,
  centroid: Point,
  shape: { direction: Point; directionStrength: number },
  semanticPolicy: MotionSemanticPolicy,
  mask: ValidatedMotionHandleSuggestionInput["mask"],
): { point: Point; score: number } {
  return chooseBestPoint(points, (point) =>
    scoreByPriorities(semanticPolicy.tipPriority, "weighted", (priority) => {
      switch (priority) {
        case "farthestFromRoot":
          return normalizedDistance(point, root, mask);
        case "downward":
          return normalizeInRange(point.y, bounds.y, bounds.y + bounds.height);
        case "outward":
          return normalizedDistance(point, centroid, mask);
        case "longAxisEnd": {
          const offsetX = point.x - centroid.x;
          const offsetY = point.y - centroid.y;
          const projected = Math.abs(offsetX * shape.direction.x + offsetY * shape.direction.y);
          return Math.min(1, projected / imageDiagonal(mask));
        }
        case "manualReview":
          return 0;
      }
    }),
  );
}

function chooseBestPoint(
  points: readonly Point[],
  scorePoint: (point: Point) => number,
): { point: Point; score: number } {
  let bestPoint = points[0]!;
  let bestScore = -Infinity;
  for (const point of points) {
    const score = scorePoint(point);
    if (
      score > bestScore ||
      (score === bestScore && (point.y < bestPoint.y || (point.y === bestPoint.y && point.x < bestPoint.x)))
    ) {
      bestPoint = point;
      bestScore = score;
    }
  }
  return { point: bestPoint, score: Math.max(0, Math.min(1, bestScore)) };
}

function scoreByPriorities<T extends string>(
  priorities: readonly T[],
  mode: "max" | "weighted",
  scorePriority: (priority: T, index: number) => number,
): number {
  if (mode === "max") {
    let best = 0;
    priorities.forEach((priority, index) => {
      const weight = Math.max(0.25, 1 - index * 0.12);
      best = Math.max(
        best,
        weight * Math.max(0, Math.min(1, scorePriority(priority, index))),
      );
    });
    return best;
  }
  let weighted = 0;
  let totalWeight = 0;
  priorities.forEach((priority, index) => {
    const weight = Math.max(0.25, 1 - index * 0.12);
    weighted += weight * Math.max(0, Math.min(1, scorePriority(priority, index)));
    totalWeight += weight;
  });
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

function contextCloseness(
  point: Point,
  rects: readonly MotionHandleSuggestionContextRect[],
  kinds: readonly MotionHandleSuggestionContextKind[],
  mask: ValidatedMotionHandleSuggestionInput["mask"],
): number {
  const candidates = rects.filter((rect) => kinds.includes(rect.kind));
  if (candidates.length === 0) return 0;
  return Math.max(
    ...candidates.map((rect) =>
      1 - Math.min(1, distancePointToRect(point, rect) / imageDiagonal(mask)),
    ),
  );
}

function isProtectedFaceAdjacentAccessory(
  role: LayerSemanticRole,
  bounds: Rect,
  contextRects: readonly MotionHandleSuggestionContextRect[],
): boolean {
  if (role !== "accessory") return false;
  const protectedRects = contextRects.filter(
    (rect) => rect.kind === "face" || rect.kind === "protected",
  );
  if (protectedRects.length === 0) return false;
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const threshold = Math.max(8, Math.min(bounds.width, bounds.height) * 0.75);
  return protectedRects.some((rect) => distancePointToRect(center, rect) <= threshold);
}

function bucketConfidence(args: {
  rootScore: number;
  tipScore: number;
  directionStrength: number;
  motionAllowed: boolean;
  warnings: ReadonlySet<MotionHandleSuggestionWarning>;
}): MotionHandleSuggestionConfidence {
  if (
    args.warnings.has("smallMask") ||
    args.warnings.has("roundMask") ||
    args.warnings.has("weakAdjacency") ||
    args.warnings.has("protectedFaceAdjacent") ||
    args.motionAllowed === false
  ) {
    return "low";
  }
  const score =
    args.rootScore * 0.38 +
    args.tipScore * 0.28 +
    args.directionStrength * 0.22 +
    (args.motionAllowed ? 0.12 : 0);
  if (score >= 0.62 && !args.warnings.has("multiLobeMask")) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function createReasons(args: {
  rootScore: number;
  directionStrength: number;
  motionAllowed: boolean;
  warnings: ReadonlySet<MotionHandleSuggestionWarning>;
}): readonly MotionHandleSuggestionReason[] {
  const reasons = new Set<MotionHandleSuggestionReason>();
  if (args.rootScore >= 0.65) reasons.add("strongSafeAdjacency");
  if (args.directionStrength >= 0.35) reasons.add("clearBoundaryDirection");
  if (args.motionAllowed) reasons.add("rolePolicyMatched");
  if (args.warnings.has("protectedFaceAdjacent")) reasons.add("protectedAreaNearby");
  if (
    args.warnings.has("roundMask") ||
    args.warnings.has("multiLobeMask") ||
    args.warnings.has("weakAdjacency")
  ) {
    reasons.add("ambiguousShape");
  }
  if (
    args.warnings.has("manualReviewRequired") ||
    args.warnings.has("lowConfidence")
  ) {
    reasons.add("manualReviewRecommended");
  }
  return Object.freeze([...reasons]);
}

function reviewResult(
  regionId: string,
  role: LayerSemanticRole,
  root: SuggestedHandlePoint,
  tip: SuggestedHandlePoint | null,
  confidence: "low" | "medium",
  warnings: readonly MotionHandleSuggestionWarning[],
): MotionHandleSuggestionResult {
  return {
    status: "review",
    regionId,
    role,
    root,
    tip,
    confidence,
    autoApplicable: false,
    warnings: Object.freeze([...new Set(warnings)]),
    reasons: Object.freeze(["manualReviewRecommended", "ambiguousShape"]),
  };
}

function rejectedResult(
  regionId?: string,
  role?: LayerSemanticRole,
  warnings: readonly MotionHandleSuggestionWarning[] = [
    "manualReviewRequired",
    "lowConfidence",
  ],
): MotionHandleSuggestionResult {
  return {
    status: "rejected",
    ...(regionId ? { regionId } : {}),
    ...(role ? { role } : {}),
    confidence: "low",
    autoApplicable: false,
    warnings: Object.freeze([
      ...new Set<MotionHandleSuggestionWarning>([
        ...warnings,
        "manualReviewRequired",
        "lowConfidence",
      ]),
    ]),
    reasons: Object.freeze(["inputRejected", "manualReviewRecommended"]),
  };
}

function toSuggestedPoint(
  point: Point,
  mask: ValidatedMotionHandleSuggestionInput["mask"],
  source: SuggestedHandlePoint["source"],
): SuggestedHandlePoint {
  return {
    x: clamp(point.x, 0, mask.width),
    y: clamp(point.y, 0, mask.height),
    source,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distancePointToRect(point: Point, rect: Rect): number {
  const dx = point.x < rect.x ? rect.x - point.x : Math.max(0, point.x - (rect.x + rect.width));
  const dy = point.y < rect.y ? rect.y - point.y : Math.max(0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function normalizedDistance(
  a: Point,
  b: Point,
  mask: ValidatedMotionHandleSuggestionInput["mask"],
): number {
  return Math.min(1, distance(a, b) / imageDiagonal(mask));
}

function imageDiagonal(mask: ValidatedMotionHandleSuggestionInput["mask"]): number {
  return Math.max(1, Math.hypot(mask.width, mask.height));
}

function normalizeInRange(value: number, min: number, max: number): number {
  const size = Math.max(1e-9, max - min);
  return Math.max(0, Math.min(1, (value - min) / size));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
