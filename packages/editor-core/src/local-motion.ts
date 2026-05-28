import type {
  LayerNode,
  LayerRiggingHint,
  LayerSemanticRole,
  ProjectData,
  SkinWeight,
  ViviMeshNode,
} from "@vivi2d/core/types";
import { isBone, isViviMesh } from "@vivi2d/core/types";
import {
  getMotionSemanticPolicy,
  isProtectedMotionSemantic,
  type MotionSemanticPolicy,
} from "./motion-template-policy";
import {
  createAcceptedMaskAlphaHash,
  createAcceptedMaskPlacementHash,
  createDefaultAcceptedMaskPlacement,
  createProtectedRegionSetHash,
  createSourceMaskBytesHash,
  validateScopedSha256,
  type AcceptedMaskAlphaHash,
  type AcceptedMaskPlacementHash,
  type ProtectedRegionSetHash,
  type SourceMaskBytesHash,
} from "./accepted-mask-packet";
import {
  MOTION_HANDLE_SUGGESTION_LIMITS,
  isAutoApplicableMotionHandleSuggestion,
  suggestMotionHandles,
  type MotionHandleSuggestionInputSource,
  type MotionHandleSuggestionContextKind,
  type MotionHandleSuggestionContextRect,
  type MotionHandleSuggestionMask,
  type MotionHandleSuggestionResult,
  type MotionHandleAcceptedMaskFingerprint,
  type SuggestedHandlePoint,
  type UserAcceptedMotionHandle,
} from "./motion-handle-suggestions";
import {
  createSafeAutoSetupOperationSignature,
  createSafeAutoSetupManagedSignature,
  SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX,
  type SafeAutoSetupDiagnostic,
  type SafeAutoSetupOperation,
} from "./safe-auto-setup-plan";
import {
  PREVIEW_ONLY_STATUS,
  assertNoEditorPreviewFields,
  createEditorOnlyPreview,
  type BrandedLocalPreviewFrame,
  type EditorOnlyPreview,
  type LocalPreviewFrame,
} from "./local-motion-preview-boundary";

export {
  assertNoEditorPreviewFields,
  createEditorOnlyPreview,
  type BrandedLocalPreviewFrame,
  type EditorOnlyPreview,
  type LocalPreviewFrame,
};

export type LocalMotionRiggingHint = Extract<
  LayerRiggingHint,
  "rigid" | "localBones" | "skinned" | "physics"
>;

export interface LocalMotionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocalMotionVec2 {
  x: number;
  y: number;
}

export type ManagedRigReferenceKey =
  `${"node" | "bone" | "ik" | "skin" | "physics"}:${string}`;

export interface LocalMotionSourceBinding {
  sourceLayerId: string;
  sourceLayerPath: readonly string[];
  sourceLayerSemanticRole?: LayerSemanticRole;
  manualSplitSourceLayerId: string;
  manualSplitSourceFingerprint: string;
  sourceLayerRevision: string;
  sourceTextureId: string;
  sourceTextureRevision: string;
}

export interface LocalHandleConstraints {
  maxTranslationPx: number;
  maxRotationDeg: number;
  minScale: number;
  maxScale: number;
  maxShear: number;
  preserveAreaRatio: number;
  pinnedBoundaryPx: number;
}

export interface MotionBudget {
  maxRestDeltaPx: number;
  maxStressDeltaPx: number;
  maxProtectedDisplacementPx: number;
  maxHiddenRevealRatio: number;
  maxDuplicateContourRatio: number;
  strength: number;
}

export interface UnderpaintCoverageSummary {
  confidenceMean: number;
  lowConfidencePixelRatio: number;
  coveredRevealRatio: number;
  missingRevealBounds: readonly LocalMotionRect[];
}

export interface LocalMotionRegion {
  id: string;
  layerId: string;
  manualSplitLayerId?: string;
  manualSplitSourceLayerId?: string;
  semanticRole: LayerSemanticRole;
  riggingHint: LocalMotionRiggingHint;
  maskId: string;
  sourceManualSplitMaskId: string;
  sourceFingerprint: string;
  bounds: LocalMotionRect;
  protected: boolean;
  motionBudget: MotionBudget;
  underpaintCoverage?: UnderpaintCoverageSummary;
  acceptedMaskAlphaHash?: AcceptedMaskAlphaHash;
  acceptedMaskPlacementHash?: AcceptedMaskPlacementHash;
  sourceMaskBytesHash?: SourceMaskBytesHash;
  protectedRegionSetHash?: ProtectedRegionSetHash;
  acceptedMaskAlphaFingerprintHint?: MotionHandleAcceptedMaskFingerprint;
  handleSuggestion?: MotionHandleSuggestionResult;
}

export interface LocalMotionAcceptedManualMask {
  width: number;
  height: number;
  alpha: Uint8Array | Uint8ClampedArray;
  fingerprint?: MotionHandleAcceptedMaskFingerprint;
  acceptedMaskAlphaHash?: AcceptedMaskAlphaHash;
  acceptedMaskPlacementHash?: AcceptedMaskPlacementHash;
  sourceMaskBytesHash?: SourceMaskBytesHash;
  protectedRegionSetHash?: ProtectedRegionSetHash;
  protectedRegionSetRevision?: string;
  protectedRegions?: readonly {
    id: string;
    role: LayerSemanticRole;
    bounds: LocalMotionRect;
    cropGeneration?: number;
  }[];
  sourceLayerRevision?: string;
  sourceTextureRevision?: string;
}

export type LocalMotionAcceptedManualMaskMap = Readonly<
  Record<string, LocalMotionAcceptedManualMask>
>;

export type LocalMotionHandleKind = "bone" | "ikTarget" | "pin" | "falloffGuide";
export type LocalMotionHandleSemantic = "root" | "mid" | "tip" | "pin" | "swing";

export interface LocalMotionHandle {
  id: string;
  regionId: string;
  kind: LocalMotionHandleKind;
  name: string;
  anchor: LocalMotionVec2;
  tip?: LocalMotionVec2;
  parentHandleId?: string;
  semantic: LocalMotionHandleSemantic;
  radiusPx: number;
  constraints: LocalHandleConstraints;
  managedSignature?: string;
  acceptedMotionHandle?: UserAcceptedMotionHandle;
}

export interface LocalMotionQualityGateResult {
  id:
    | "rest_recompose_delta"
    | "protected_crop_delta"
    | "protected_displacement"
    | "motion_region_flip"
    | "local_area_change"
    | "max_shear"
    | "hidden_reveal_score"
    | "duplicate_contour_score"
    | "runtime_profile_scan"
    | "provider_boundary_scan";
  status: "pass" | "warning" | "fail" | "notRun";
  value?: number;
  threshold?: number;
  affectedRegionIds?: readonly string[];
  message?: string;
}

export interface LocalMotionQualityReport {
  status: "notRun" | "pass" | "warning" | "blocked";
  gates: readonly LocalMotionQualityGateResult[];
  lastEvaluatedGeneration?: number;
}

export interface LocalPreviewSolver {
  id: string;
  regionId: string;
  kind: "constrainedAffine" | "mlsRigid" | "mlsSimilarity" | "arapLocal";
  status: "previewOnly" | "disabled" | "candidateForAdr";
  handleIds: readonly string[];
  pinHandleIds: readonly string[];
  gridResolutionPx: number;
  maxControlPoints: number;
  maxEvaluationVertices: number;
  createdAtGeneration: number;
  diagnostics: readonly LocalPreviewSolverDiagnostic[];
}

export interface LocalPreviewSolverDiagnostic {
  severity: "info" | "warning" | "error";
  code:
    | "previewOnly"
    | "unsupportedForProtectedRegion"
    | "controlPointLimitExceeded"
    | "evaluationVertexLimitExceeded"
    | "nonFiniteOutput"
    | "areaChangeExceeded"
    | "shearExceeded"
    | "hiddenRevealExceeded";
  message: string;
  regionId?: string;
  bounds?: LocalMotionRect;
}

export interface LocalMotionDraft {
  id: string;
  projectId: string;
  baseProjectRevision: string;
  baseTextureStoreRevision: string;
  sourceFingerprint: string;
  manualSplitSources: readonly LocalMotionSourceBinding[];
  managedRigBackReferenceRevisions: Readonly<Record<ManagedRigReferenceKey, string>>;
  generation: number;
  regions: readonly LocalMotionRegion[];
  handles: readonly LocalMotionHandle[];
  previewSolvers: readonly LocalPreviewSolver[];
  activePreviewSolverId?: string;
  quality: LocalMotionQualityReport;
  undoStackIds: readonly string[];
  redoStackIds: readonly string[];
}

export type MotionHandleDraft = LocalMotionDraft;

export interface LocalMotionDraftOptions {
  id?: string;
  projectId?: string;
  baseProjectRevision?: string;
  baseTextureStoreRevision?: string;
  sourceFingerprint?: string;
  sourceLayerRevisions?: Readonly<Record<string, string>>;
  sourceTextureRevisions?: Readonly<Record<string, string>>;
  managedRigBackReferenceRevisions?: Readonly<Record<ManagedRigReferenceKey, string>>;
  acceptedManualMasks?: LocalMotionAcceptedManualMaskMap;
}

export interface CompileLocalMotionDraftOptions {
  excludedLayerIds?: ReadonlySet<string>;
}

export interface CompileLocalMotionDraftResult {
  operations: SafeAutoSetupOperation[];
  diagnostics: SafeAutoSetupDiagnostic[];
  skippedRegionIds: string[];
}

export interface LocalMotionValidationDiagnostic {
  severity: "error" | "warning";
  code:
    | "invalidDraftShape"
    | "invalidRegion"
    | "invalidHandle"
    | "invalidBudget"
    | "protectedInvariantMismatch"
    | "danglingReference"
    | "cycleDetected"
    | "unsafePreviewSolver";
  path: string;
  message: string;
}

export interface LocalMotionValidationResult {
  ok: boolean;
  diagnostics: readonly LocalMotionValidationDiagnostic[];
}

const VERSIONED_SHA256_FINGERPRINT_PATTERN = /^sha256:v1:[a-f0-9]{64}$/;
const ACCEPTED_MASK_FINGERPRINT_PATTERN = /^maskAlpha:v1:[a-f0-9]{16}$/;
const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

export const DEFAULT_LOCAL_HANDLE_CONSTRAINTS: LocalHandleConstraints = Object.freeze({
  maxTranslationPx: 24,
  maxRotationDeg: 18,
  minScale: 0.96,
  maxScale: 1.04,
  maxShear: 0.12,
  preserveAreaRatio: 0.94,
  pinnedBoundaryPx: 8,
});

export const DEFAULT_MOTION_BUDGET: MotionBudget = Object.freeze({
  maxRestDeltaPx: 0,
  maxStressDeltaPx: 24,
  maxProtectedDisplacementPx: 0,
  maxHiddenRevealRatio: 0.01,
  maxDuplicateContourRatio: 0.02,
  strength: 0.7,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pushDiagnostic(
  diagnostics: LocalMotionValidationDiagnostic[],
  diagnostic: LocalMotionValidationDiagnostic,
): void {
  diagnostics.push(diagnostic);
}

function createLayerPath(pathIds: readonly string[], layerId: string): readonly string[] {
  return Object.freeze([...pathIds, layerId]);
}

function defaultSourceFingerprint(project: ProjectData): string {
  return `project:${project.name}:${project.width}x${project.height}`;
}

function updateFnv64Byte(hash: bigint, value: number): bigint {
  return ((hash ^ BigInt(value & 0xff)) * FNV64_PRIME) & FNV64_MASK;
}

function updateFnv64Uint32(hash: bigint, value: number): bigint {
  let next = hash;
  next = updateFnv64Byte(next, value);
  next = updateFnv64Byte(next, value >>> 8);
  next = updateFnv64Byte(next, value >>> 16);
  next = updateFnv64Byte(next, value >>> 24);
  return next;
}

export function createLocalMotionAcceptedMaskFingerprint(
  width: number,
  height: number,
  alpha: Uint8Array | Uint8ClampedArray,
): MotionHandleAcceptedMaskFingerprint | null {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    alpha.byteLength !== width * height
  ) {
    return null;
  }
  let hash = FNV64_OFFSET_BASIS;
  hash = updateFnv64Uint32(hash, width);
  hash = updateFnv64Uint32(hash, height);
  for (const value of alpha) {
    hash = updateFnv64Byte(hash, value);
  }
  return `maskAlpha:v1:${hash.toString(16).padStart(16, "0")}`;
}

function createManagedRevision(value: unknown): string {
  return createSafeAutoSetupManagedSignature(value);
}

function addManagedRevision(
  revisions: Record<ManagedRigReferenceKey, string>,
  key: ManagedRigReferenceKey,
  value: unknown,
): void {
  revisions[key] = createManagedRevision(value);
}

function collectManagedRigBackReferenceRevisions(
  project: ProjectData,
): Readonly<Record<ManagedRigReferenceKey, string>> {
  const revisions: Record<ManagedRigReferenceKey, string> = {};
  const visit = (layers: readonly LayerNode[]): void => {
    for (const layer of layers) {
      if (layer.managedTag || layer.managedSignature || layer.managedSourceFingerprint) {
        addManagedRevision(
          revisions,
          `${layer.kind === "bone" ? "bone" : "node"}:${layer.id}`,
          {
            id: layer.id,
            kind: layer.kind,
            managedTag: layer.managedTag,
            managedSignature: layer.managedSignature,
            managedSourceFingerprint: layer.managedSourceFingerprint,
          },
        );
      }
      if (layer.children.length > 0) visit(layer.children);
    }
  };
  visit(project.layers);
  for (const [layerId, skin] of Object.entries(project.skins ?? {})) {
    if (skin.managedTag || skin.managedSignature || skin.managedSourceFingerprint) {
      addManagedRevision(revisions, `skin:${layerId}`, {
        layerId,
        managedTag: skin.managedTag,
        managedSignature: skin.managedSignature,
        managedSourceFingerprint: skin.managedSourceFingerprint,
      });
    }
  }
  for (const group of project.physicsGroups ?? []) {
    if (group.managedTag || group.managedSignature || group.managedSourceFingerprint) {
      addManagedRevision(revisions, `physics:${group.id ?? group.name}`, {
        id: group.id,
        name: group.name,
        managedTag: group.managedTag,
        managedSignature: group.managedSignature,
        managedSourceFingerprint: group.managedSourceFingerprint,
      });
    }
  }
  for (const controller of project.ikControllers ?? []) {
    if (
      controller.managedTag ||
      controller.managedSignature ||
      controller.managedSourceFingerprint
    ) {
      addManagedRevision(revisions, `ik:${controller.id}`, {
        id: controller.id,
        managedTag: controller.managedTag,
        managedSignature: controller.managedSignature,
        managedSourceFingerprint: controller.managedSourceFingerprint,
      });
    }
  }
  return Object.freeze(revisions);
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "region";
}

function centerOfRect(rect: LocalMotionRect): LocalMotionVec2 {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function createDefaultHandlesForRegion(region: LocalMotionRegion): LocalMotionHandle[] {
  const safeRegionId = sanitizeIdPart(region.id);
  const semanticPolicy = getMotionSemanticPolicy(region.semanticRole);
  const movingRadius = Math.min(region.bounds.width, region.bounds.height);
  const movingConstraints = {
    ...DEFAULT_LOCAL_HANDLE_CONSTRAINTS,
    maxTranslationPx: Math.max(
      0,
      movingRadius * semanticPolicy.maxDisplacementPxRatio,
    ),
    maxRotationDeg: semanticPolicy.maxRotationDeg,
  };
  const radiusPx = Math.max(
    4,
    Math.min(region.bounds.width, region.bounds.height) * 0.18,
  );
  if (region.protected || region.riggingHint === "rigid") {
    return [
      {
        id: `motionHandle:${safeRegionId}:pin`,
        regionId: region.id,
        kind: "pin",
        name: `${region.semanticRole} pin`,
        anchor: centerOfRect(region.bounds),
        semantic: "pin",
        radiusPx,
        constraints: {
          ...DEFAULT_LOCAL_HANDLE_CONSTRAINTS,
          maxTranslationPx: 0,
          maxRotationDeg: 0,
          minScale: 1,
          maxScale: 1,
          maxShear: 0,
        },
      },
    ];
  }

  const suggestion = region.handleSuggestion;
  if (!isAutoApplicableMotionHandleSuggestion(suggestion)) {
    return [
      {
        id: `motionHandle:${safeRegionId}:review`,
        regionId: region.id,
        kind: "pin",
        name: `${region.semanticRole} review`,
        anchor: centerOfRect(region.bounds),
        semantic: "pin",
        radiusPx,
        constraints: {
          ...DEFAULT_LOCAL_HANDLE_CONSTRAINTS,
          maxTranslationPx: 0,
          maxRotationDeg: 0,
          minScale: 1,
          maxScale: 1,
          maxShear: 0,
        },
      },
    ];
  }

  const root = suggestion.root;
  const tip = suggestion.tip;
  const acceptedMotionHandle = createAcceptedMotionHandleFromSuggestion(
    region,
    suggestion,
  );
  if (!acceptedMotionHandle) {
    return [
      {
        id: `motionHandle:${safeRegionId}:review`,
        regionId: region.id,
        kind: "pin",
        name: `${region.semanticRole} review`,
        anchor: centerOfRect(region.bounds),
        semantic: "pin",
        radiusPx,
        constraints: {
          ...DEFAULT_LOCAL_HANDLE_CONSTRAINTS,
          maxTranslationPx: 0,
          maxRotationDeg: 0,
          minScale: 1,
          maxScale: 1,
          maxShear: 0,
        },
      },
    ];
  }
  const rootId = `motionHandle:${safeRegionId}:root`;
  return [
    {
      id: rootId,
      regionId: region.id,
      kind: "bone",
      name: `${region.semanticRole} root`,
      anchor: root,
      tip,
      semantic: "root",
      radiusPx,
      constraints: movingConstraints,
      acceptedMotionHandle,
    },
    {
      id: `motionHandle:${safeRegionId}:tip`,
      regionId: region.id,
      kind: "bone",
      name: `${region.semanticRole} tip`,
      anchor: tip,
      parentHandleId: rootId,
      semantic: "tip",
      radiusPx,
      constraints: movingConstraints,
      acceptedMotionHandle,
    },
  ];
}

function createVersionedMaskFingerprint(
  value: string,
): `sha256:v1:${string}` | null {
  const match = /^sha256:([a-fA-F0-9]{64})$/.exec(value);
  return match ? `sha256:v1:${match[1]!.toLowerCase()}` : null;
}

function motionBudgetBucket(
  budget: MotionBudget,
): UserAcceptedMotionHandle["motionBudgetBucket"] {
  if (budget.strength <= 0) return "none";
  if (budget.strength < 0.34) return "low";
  if (budget.strength < 0.67) return "medium";
  return "high";
}

function createGate(
  id: LocalMotionQualityGateResult["id"],
  status: LocalMotionQualityGateResult["status"],
  value?: number,
  threshold?: number,
  affectedRegionIds?: readonly string[],
): LocalMotionQualityGateResult {
  return {
    id,
    status,
    ...(value === undefined ? {} : { value }),
    ...(threshold === undefined ? {} : { threshold }),
    ...(affectedRegionIds?.length ? { affectedRegionIds } : {}),
  };
}

function hasMotionSuggestionWarning(
  suggestion: MotionHandleSuggestionResult | undefined,
  warning: string,
): boolean {
  return (suggestion?.warnings as readonly string[] | undefined)?.includes(warning) ?? false;
}

function createLocalMotionQualityReport(
  regions: readonly LocalMotionRegion[],
): LocalMotionQualityReport {
  const protectedWarnings = regions.filter((region) =>
    hasMotionSuggestionWarning(region.handleSuggestion, "protectedFaceAdjacent"),
  );
  const contourWarnings = regions.filter((region) =>
    ((region.handleSuggestion?.warnings as readonly string[] | undefined) ?? []).some(
      (warning) => warning === "multiLobeMask" || warning === "weakAdjacency",
    ),
  );
  const hiddenRevealWarnings = regions.filter(
    (region) =>
      region.handleSuggestion?.status === "apply" &&
      region.underpaintCoverage?.coveredRevealRatio !== 1,
  );
  const rejectedRegions = regions.filter(
    (region) => region.handleSuggestion?.status === "rejected",
  );
  const gates = [
    createGate("runtime_profile_scan", "pass"),
    createGate("provider_boundary_scan", "pass"),
    createGate(
      "protected_crop_delta",
      protectedWarnings.length > 0 ? "warning" : "pass",
      protectedWarnings.length / Math.max(1, regions.length),
      0,
      protectedWarnings.map((region) => region.id),
    ),
    createGate(
      "duplicate_contour_score",
      contourWarnings.length > 0 ? "warning" : "pass",
      contourWarnings.length / Math.max(1, regions.length),
      0,
      contourWarnings.map((region) => region.id),
    ),
    createGate(
      "hidden_reveal_score",
      hiddenRevealWarnings.length > 0 ? "warning" : "pass",
      hiddenRevealWarnings.length / Math.max(1, regions.length),
      0,
      hiddenRevealWarnings.map((region) => region.id),
    ),
    createGate(
      "rest_recompose_delta",
      rejectedRegions.length > 0 ? "warning" : "pass",
      rejectedRegions.length / Math.max(1, regions.length),
      0,
      rejectedRegions.map((region) => region.id),
    ),
  ];
  return {
    status: gates.some((gate) => gate.status === "fail")
      ? "blocked"
      : gates.some((gate) => gate.status === "warning")
        ? "warning"
        : "pass",
    gates,
    lastEvaluatedGeneration: 0,
  };
}

function createAcceptedMotionHandleFromSuggestion(
  region: LocalMotionRegion,
  suggestion: Extract<MotionHandleSuggestionResult, { status: "apply" }>,
): UserAcceptedMotionHandle | null {
  const sourceMaskFingerprint = createVersionedMaskFingerprint(
    region.sourceFingerprint,
  );
  if (
    !sourceMaskFingerprint ||
    !region.acceptedMaskAlphaHash ||
    !region.acceptedMaskPlacementHash ||
    !region.sourceMaskBytesHash ||
    !region.protectedRegionSetHash
  ) {
    return null;
  }
  const semanticPolicy = getMotionSemanticPolicy(region.semanticRole);
  return {
    kind: "userAcceptedMotionHandle",
    id: `accepted:${sanitizeIdPart(region.id)}:${suggestion.status}`,
    regionId: region.id,
    role: region.semanticRole,
    root: suggestion.root,
    tip: suggestion.tip,
    acceptedAt: "auto-apply",
    sourceMaskFingerprint,
    sourceMaskBytesHash: region.sourceMaskBytesHash,
    acceptedMaskAlphaHash: region.acceptedMaskAlphaHash,
    acceptedMaskPlacementHash: region.acceptedMaskPlacementHash,
    protectedRegionSetHash: region.protectedRegionSetHash,
    acceptedMaskFingerprint: region.acceptedMaskAlphaFingerprintHint,
    semanticPolicyId: semanticPolicy.policyId,
    semanticPolicyVersion: semanticPolicy.policyVersion,
    motionBudgetBucket: motionBudgetBucket(region.motionBudget),
    acceptedFromSuggestionStatus: suggestion.status,
  };
}

function isCompileAcceptedHandle(
  handle: LocalMotionHandle,
  region: LocalMotionRegion,
): boolean {
  const accepted = handle.acceptedMotionHandle;
  const expectedFingerprint = createVersionedMaskFingerprint(region.sourceFingerprint);
  const semanticPolicy = getMotionSemanticPolicy(region.semanticRole);
  return (
    accepted?.kind === "userAcceptedMotionHandle" &&
    expectedFingerprint != null &&
    region.acceptedMaskAlphaHash != null &&
    region.acceptedMaskPlacementHash != null &&
    region.sourceMaskBytesHash != null &&
    region.protectedRegionSetHash != null &&
    accepted.regionId === region.id &&
    accepted.role === region.semanticRole &&
    accepted.sourceMaskFingerprint === expectedFingerprint &&
    VERSIONED_SHA256_FINGERPRINT_PATTERN.test(accepted.sourceMaskFingerprint) &&
    accepted.sourceMaskBytesHash === region.sourceMaskBytesHash &&
    validateScopedSha256(accepted.sourceMaskBytesHash, "maskSourceCanonical") &&
    accepted.acceptedMaskAlphaHash === region.acceptedMaskAlphaHash &&
    validateScopedSha256(accepted.acceptedMaskAlphaHash, "maskAlphaCanonical.v2") &&
    accepted.acceptedMaskPlacementHash === region.acceptedMaskPlacementHash &&
    validateScopedSha256(accepted.acceptedMaskPlacementHash, "maskPlacementCanonical.v2") &&
    accepted.protectedRegionSetHash === region.protectedRegionSetHash &&
    validateScopedSha256(accepted.protectedRegionSetHash, "protectedRegionsCanonical") &&
    (accepted.acceptedMaskFingerprint === undefined ||
      (accepted.acceptedMaskFingerprint === region.acceptedMaskAlphaFingerprintHint &&
        ACCEPTED_MASK_FINGERPRINT_PATTERN.test(accepted.acceptedMaskFingerprint))) &&
    accepted.semanticPolicyId === semanticPolicy.policyId &&
    accepted.semanticPolicyVersion === semanticPolicy.policyVersion &&
    semanticPolicy.requireUserOptIn !== true &&
    (accepted.acceptedFromSuggestionStatus === "review" ||
      accepted.acceptedFromSuggestionStatus === "apply")
  );
}

function getLayerManualSplitMetadata(layer: LayerNode):
  | {
      manualSplitLayerId: string;
      manualSplitSourceLayerId: string;
      manualSplitSourceFingerprint: string;
      manualSplitMaskId: string;
    }
  | undefined {
  const metadata = layer.manualSplitOutputMetadata;
  if (metadata?.kind !== "maskExtractedLayer") return undefined;
  return {
    manualSplitLayerId: metadata.manualSplitLayerId,
    manualSplitSourceLayerId: metadata.manualSplitSourceLayerId,
    manualSplitSourceFingerprint: metadata.manualSplitSourceFingerprint,
    manualSplitMaskId: metadata.manualSplitMaskId,
  };
}

function inferLocalMotionRiggingHint(role: LayerSemanticRole): LocalMotionRiggingHint {
  const policy = getMotionSemanticPolicy(role);
  if (policy.protected) return "rigid";
  if (policy.defaultMotionKind === "secondaryMotion") return "localBones";
  if (policy.defaultMotionKind === "skinned") return "skinned";
  return "rigid";
}

function createMaskForRegionBounds(
  region: LocalMotionRegion,
): MotionHandleSuggestionMask | null {
  const width = Math.ceil(region.bounds.width);
  const height = Math.ceil(region.bounds.height);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MOTION_HANDLE_SUGGESTION_LIMITS.maxWidth ||
    height > MOTION_HANDLE_SUGGESTION_LIMITS.maxHeight ||
    width * height > MOTION_HANDLE_SUGGESTION_LIMITS.maxPixels
  ) {
    return null;
  }
  const alpha = new Uint8Array(width * height);
  alpha.fill(255);
  return { width, height, alpha };
}

function acceptedMaskKeysForRegion(region: LocalMotionRegion): string[] {
  return [
    region.layerId,
    region.manualSplitLayerId,
    region.sourceManualSplitMaskId,
    region.maskId,
  ].filter((value): value is string => typeof value === "string" && value !== "");
}

function findAcceptedManualMaskForRegion(
  region: LocalMotionRegion,
  acceptedManualMasks?: LocalMotionAcceptedManualMaskMap,
): LocalMotionAcceptedManualMask | undefined {
  if (!acceptedManualMasks) return undefined;
  for (const key of acceptedMaskKeysForRegion(region)) {
    const mask = acceptedManualMasks[key];
    if (mask) return mask;
  }
  return undefined;
}

function createAcceptedMaskForRegion(
  region: LocalMotionRegion,
  acceptedManualMasks?: LocalMotionAcceptedManualMaskMap,
):
  | { status: "missing" }
  | { status: "invalid" }
  | {
      status: "ready";
      mask: MotionHandleSuggestionMask;
      acceptedMaskAlphaHash: AcceptedMaskAlphaHash;
      acceptedMaskPlacementHash: AcceptedMaskPlacementHash;
      sourceMaskBytesHash: SourceMaskBytesHash;
      protectedRegionSetHash: ProtectedRegionSetHash;
      fingerprintHint?: MotionHandleAcceptedMaskFingerprint;
    } {
  const mask = findAcceptedManualMaskForRegion(region, acceptedManualMasks);
  if (!mask) return { status: "missing" };
  if (
    mask.width <= 0 ||
    mask.height <= 0 ||
    !Number.isSafeInteger(mask.width) ||
    !Number.isSafeInteger(mask.height) ||
    mask.width > MOTION_HANDLE_SUGGESTION_LIMITS.maxWidth ||
    mask.height > MOTION_HANDLE_SUGGESTION_LIMITS.maxHeight ||
    mask.width * mask.height > MOTION_HANDLE_SUGGESTION_LIMITS.maxPixels
  ) {
    return { status: "invalid" };
  }
  if (
    !(mask.alpha instanceof Uint8Array) &&
    !(mask.alpha instanceof Uint8ClampedArray)
  ) {
    return { status: "invalid" };
  }
  if (mask.alpha.byteLength !== mask.width * mask.height) {
    return { status: "invalid" };
  }
  const fingerprintHint = createLocalMotionAcceptedMaskFingerprint(
    mask.width,
    mask.height,
    mask.alpha,
  );
  if (
    !fingerprintHint ||
    (mask.fingerprint !== undefined && mask.fingerprint !== fingerprintHint) ||
    !ACCEPTED_MASK_FINGERPRINT_PATTERN.test(fingerprintHint)
  ) {
    return { status: "invalid" };
  }
  const hashes = createAcceptedMaskHashesForRegion(region, mask);
  if (!hashes) return { status: "invalid" };
  return {
    status: "ready",
    mask: {
      width: mask.width,
      height: mask.height,
      alpha: mask.alpha,
    },
    ...hashes,
    fingerprintHint,
  };
}

function createAcceptedMaskHashesForRegion(
  region: LocalMotionRegion,
  mask: LocalMotionAcceptedManualMask,
):
  | {
      acceptedMaskAlphaHash: AcceptedMaskAlphaHash;
      acceptedMaskPlacementHash: AcceptedMaskPlacementHash;
      sourceMaskBytesHash: SourceMaskBytesHash;
      protectedRegionSetHash: ProtectedRegionSetHash;
    }
  | null {
  const computed = computeAcceptedMaskHashesForRegion(region, mask);
  if (!computed) return null;
  if (
    mask.acceptedMaskAlphaHash &&
    mask.acceptedMaskPlacementHash &&
    mask.sourceMaskBytesHash &&
    mask.protectedRegionSetHash
  ) {
    return mask.acceptedMaskAlphaHash === computed.acceptedMaskAlphaHash &&
      mask.acceptedMaskPlacementHash === computed.acceptedMaskPlacementHash &&
      validateScopedSha256(mask.sourceMaskBytesHash, "maskSourceCanonical") &&
      mask.protectedRegionSetHash === computed.protectedRegionSetHash
      ? {
          ...computed,
          sourceMaskBytesHash: mask.sourceMaskBytesHash,
          protectedRegionSetHash: mask.protectedRegionSetHash,
        }
      : null;
  }
  return computed;
}

function computeAcceptedMaskHashesForRegion(
  region: LocalMotionRegion,
  mask: LocalMotionAcceptedManualMask,
):
  | {
      acceptedMaskAlphaHash: AcceptedMaskAlphaHash;
      acceptedMaskPlacementHash: AcceptedMaskPlacementHash;
      sourceMaskBytesHash: SourceMaskBytesHash;
      protectedRegionSetHash: ProtectedRegionSetHash;
    }
  | null {
  try {
    if (!region.manualSplitLayerId || !region.manualSplitSourceLayerId) return null;
    const placement = createDefaultAcceptedMaskPlacement({
      layerBounds: region.bounds,
      maskWidth: mask.width,
      maskHeight: mask.height,
    });
    const semanticPolicy = getMotionSemanticPolicy(region.semanticRole);
    return {
      acceptedMaskAlphaHash: createAcceptedMaskAlphaHash({
        width: mask.width,
        height: mask.height,
        semanticRole: region.semanticRole,
        manualSplitMaskId: region.sourceManualSplitMaskId,
        sourceLayerId: region.manualSplitSourceLayerId,
        sourceTextureId: region.layerId,
        layerPath: [region.layerId],
        alpha: mask.alpha instanceof Uint8Array ? mask.alpha : new Uint8Array(mask.alpha),
      }),
      acceptedMaskPlacementHash: createAcceptedMaskPlacementHash({
        manualSplitLayerId: region.manualSplitLayerId,
        sourceLayerId: region.manualSplitSourceLayerId,
        layerPath: [region.layerId],
        placement,
      }),
      sourceMaskBytesHash: createSourceMaskBytesHash({
        sourceLayerId: region.manualSplitSourceLayerId,
        sourceTextureId: region.layerId,
        width: mask.width,
        height: mask.height,
        sourceFingerprint: region.sourceFingerprint,
      }),
      protectedRegionSetHash: createProtectedRegionSetHash({
        semanticPolicyId: semanticPolicy.policyId,
        semanticPolicyVersion: semanticPolicy.policyVersion,
        protectedRegionSetRevision: mask.protectedRegionSetRevision ?? "unversioned",
        regions: mask.protectedRegions ?? [],
      }),
    };
  } catch {
    return null;
  }
}

function createSuggestionMaskForRegion(
  region: LocalMotionRegion,
  acceptedManualMasks?: LocalMotionAcceptedManualMaskMap,
):
  | {
      status: "ready";
      inputSource: MotionHandleSuggestionInputSource;
      mask: MotionHandleSuggestionMask;
      acceptedMaskAlphaHash?: AcceptedMaskAlphaHash;
      acceptedMaskPlacementHash?: AcceptedMaskPlacementHash;
      sourceMaskBytesHash?: SourceMaskBytesHash;
      protectedRegionSetHash?: ProtectedRegionSetHash;
      acceptedMaskAlphaFingerprintHint?: MotionHandleAcceptedMaskFingerprint;
    }
  | { status: "rejected" }
  | null {
  const acceptedMask = createAcceptedMaskForRegion(region, acceptedManualMasks);
  if (acceptedMask.status === "ready") {
    return {
      status: "ready",
      inputSource: "acceptedManualMask",
      mask: acceptedMask.mask,
      acceptedMaskAlphaHash: acceptedMask.acceptedMaskAlphaHash,
      acceptedMaskPlacementHash: acceptedMask.acceptedMaskPlacementHash,
      sourceMaskBytesHash: acceptedMask.sourceMaskBytesHash,
      protectedRegionSetHash: acceptedMask.protectedRegionSetHash,
      acceptedMaskAlphaFingerprintHint: acceptedMask.fingerprintHint,
    };
  }
  if (acceptedMask.status === "invalid") return { status: "rejected" };
  const fallbackMask = createMaskForRegionBounds(region);
  return fallbackMask
    ? {
        status: "ready",
        inputSource: "regionBoundsPseudoMask",
        mask: fallbackMask,
      }
    : null;
}

function contextKindForRegion(
  region: LocalMotionRegion,
): MotionHandleSuggestionContextKind | null {
  switch (region.semanticRole) {
    case "head":
    case "hair":
    case "hairBack":
    case "hairFront":
    case "hairSide":
      return "head";
    case "face":
    case "eyeLeft":
    case "eyeRight":
    case "eyebrowLeft":
    case "eyebrowRight":
    case "mouth":
    case "nose":
      return "face";
    case "body":
    case "armLeft":
    case "armRight":
    case "handLeft":
    case "handRight":
    case "legLeft":
    case "legRight":
      return "body";
    case "tail":
    case "ear":
    case "accessory":
    case "unknown":
      return null;
  }
}

function createSuggestionContextRects(
  region: LocalMotionRegion,
  regions: readonly LocalMotionRegion[],
  mask: MotionHandleSuggestionMask,
): MotionHandleSuggestionContextRect[] {
  if (region.bounds.width <= 0 || region.bounds.height <= 0) return [];
  const scaleX = mask.width / region.bounds.width;
  const scaleY = mask.height / region.bounds.height;
  return regions.flatMap((candidate) => {
    if (candidate.id === region.id) return [];
    const kind = contextKindForRegion(candidate);
    if (!kind) return [];
    return [{
      kind,
      x: (candidate.bounds.x - region.bounds.x) * scaleX,
      y: (candidate.bounds.y - region.bounds.y) * scaleY,
      width: candidate.bounds.width * scaleX,
      height: candidate.bounds.height * scaleY,
    }];
  });
}

function offsetSuggestionPoint(
  point: SuggestedHandlePoint,
  region: LocalMotionRegion,
  mask: MotionHandleSuggestionMask,
): SuggestedHandlePoint {
  const scaleX = region.bounds.width / mask.width;
  const scaleY = region.bounds.height / mask.height;
  return {
    ...point,
    x: point.x * scaleX + region.bounds.x,
    y: point.y * scaleY + region.bounds.y,
  };
}

function offsetHandleSuggestion(
  suggestion: MotionHandleSuggestionResult,
  region: LocalMotionRegion,
  mask: MotionHandleSuggestionMask,
): MotionHandleSuggestionResult {
  if (suggestion.status === "rejected") return suggestion;
  if (suggestion.status === "apply") {
    return {
      ...suggestion,
      root: offsetSuggestionPoint(suggestion.root, region, mask),
      tip: offsetSuggestionPoint(suggestion.tip, region, mask),
    };
  }
  return {
    ...suggestion,
    root: offsetSuggestionPoint(suggestion.root, region, mask),
    tip: suggestion.tip ? offsetSuggestionPoint(suggestion.tip, region, mask) : null,
  };
}

function suggestHandlesForRegion(
  region: LocalMotionRegion,
  regions: readonly LocalMotionRegion[],
  acceptedManualMasks?: LocalMotionAcceptedManualMaskMap,
):
  | {
      suggestion: MotionHandleSuggestionResult | undefined;
      acceptedMaskAlphaHash?: AcceptedMaskAlphaHash;
      acceptedMaskPlacementHash?: AcceptedMaskPlacementHash;
      sourceMaskBytesHash?: SourceMaskBytesHash;
      protectedRegionSetHash?: ProtectedRegionSetHash;
      acceptedMaskAlphaFingerprintHint?: MotionHandleAcceptedMaskFingerprint;
    }
  | undefined {
  const suggestionMask = createSuggestionMaskForRegion(region, acceptedManualMasks);
  if (!suggestionMask || suggestionMask.status === "rejected") {
    return {
      suggestion: {
        status: "rejected",
        regionId: region.id,
        role: region.semanticRole,
        confidence: "low",
        autoApplicable: false,
        warnings: ["manualReviewRequired", "lowConfidence"],
        reasons: ["inputRejected", "manualReviewRecommended"],
      },
    };
  }
  return {
    suggestion: offsetHandleSuggestion(
      suggestMotionHandles({
        regionId: region.id,
        role: region.semanticRole,
        inputSource: suggestionMask.inputSource,
        mask: suggestionMask.mask,
        semanticPolicy: getMotionSemanticPolicy(region.semanticRole),
        contextRects: createSuggestionContextRects(region, regions, suggestionMask.mask),
      }),
      region,
      suggestionMask.mask,
    ),
    acceptedMaskAlphaHash: suggestionMask.acceptedMaskAlphaHash,
    acceptedMaskPlacementHash: suggestionMask.acceptedMaskPlacementHash,
    sourceMaskBytesHash: suggestionMask.sourceMaskBytesHash,
    protectedRegionSetHash: suggestionMask.protectedRegionSetHash,
    acceptedMaskAlphaFingerprintHint: suggestionMask.acceptedMaskAlphaFingerprintHint,
  };
}

function createRegionForLayer(
  layer: LayerNode,
  layerPath: readonly string[],
  options: Required<
    Pick<
      LocalMotionDraftOptions,
      "sourceLayerRevisions" | "sourceTextureRevisions"
    >
  >,
  fallbackFingerprint: string,
): { region: LocalMotionRegion; source: LocalMotionSourceBinding } | null {
  if (!isViviMesh(layer) || isBone(layer)) return null;
  const split = getLayerManualSplitMetadata(layer);
  if (!split) return null;
  const semanticRole = layer.semanticRole ?? "unknown";
  const semanticPolicy = getMotionSemanticPolicy(semanticRole);
  const sourceFingerprint = split.manualSplitSourceFingerprint || fallbackFingerprint;
  const sourceLayerPath = createLayerPath(layerPath, layer.id);
  return {
    source: {
      sourceLayerId: layer.id,
      sourceLayerPath,
      sourceLayerSemanticRole: layer.semanticRole,
      manualSplitSourceLayerId: split.manualSplitSourceLayerId,
      manualSplitSourceFingerprint: sourceFingerprint,
      sourceLayerRevision: options.sourceLayerRevisions[layer.id] ?? "unversioned",
      sourceTextureId: layer.id,
      sourceTextureRevision: options.sourceTextureRevisions[layer.id] ?? "unversioned",
    },
    region: {
      id: `motionRegion:${layer.id}`,
      layerId: layer.id,
      manualSplitLayerId: split.manualSplitLayerId,
      manualSplitSourceLayerId: split.manualSplitSourceLayerId,
      semanticRole,
      riggingHint: inferLocalMotionRiggingHint(semanticRole),
      maskId: `mask:${split.manualSplitMaskId}`,
      sourceManualSplitMaskId: split.manualSplitMaskId,
      sourceFingerprint,
      bounds: {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      },
      protected: semanticPolicy.protected,
      motionBudget: {
        ...DEFAULT_MOTION_BUDGET,
        maxStressDeltaPx: Math.max(
          0,
          Math.min(layer.width, layer.height) * semanticPolicy.maxDisplacementPxRatio,
        ),
        maxProtectedDisplacementPx: semanticPolicy.protected ? 0 : 2,
        strength:
          semanticPolicy.protected || semanticPolicy.defaultMotionKind === "manualOnly"
            ? 0
            : DEFAULT_MOTION_BUDGET.strength,
      },
    },
  };
}

export function createLocalMotionDraftFromProject(
  project: ProjectData,
  options: LocalMotionDraftOptions = {},
): LocalMotionDraft {
  const sourceFingerprint =
    options.sourceFingerprint ?? defaultSourceFingerprint(project);
  const sourceLayerRevisions = options.sourceLayerRevisions ?? {};
  const sourceTextureRevisions = options.sourceTextureRevisions ?? {};
  const { acceptedManualMasks } = options;
  const regions: LocalMotionRegion[] = [];
  const sources: LocalMotionSourceBinding[] = [];

  const visit = (layers: readonly LayerNode[], parentPath: readonly string[]): void => {
    for (const layer of layers) {
      const result = createRegionForLayer(
        layer,
        parentPath,
        { sourceLayerRevisions, sourceTextureRevisions },
        sourceFingerprint,
      );
      if (result) {
        regions.push(result.region);
        sources.push(result.source);
      }
      if (layer.children.length > 0) visit(layer.children, createLayerPath(parentPath, layer.id));
    }
  };

  visit(project.layers, []);
  const regionsWithSuggestions = regions.map((region) => {
    const suggestionState = suggestHandlesForRegion(
      region,
      regions,
      acceptedManualMasks,
    );
    return {
      ...region,
      acceptedMaskAlphaHash: suggestionState?.acceptedMaskAlphaHash,
      acceptedMaskPlacementHash: suggestionState?.acceptedMaskPlacementHash,
      sourceMaskBytesHash: suggestionState?.sourceMaskBytesHash,
      protectedRegionSetHash: suggestionState?.protectedRegionSetHash,
      acceptedMaskAlphaFingerprintHint:
        suggestionState?.acceptedMaskAlphaFingerprintHint,
      handleSuggestion: suggestionState?.suggestion,
    };
  });
  const handles = regionsWithSuggestions.flatMap(createDefaultHandlesForRegion);
  const quality = createLocalMotionQualityReport(regionsWithSuggestions);

  const draft: LocalMotionDraft = {
    id: options.id ?? `motionHandleDraft:${project.name || "project"}`,
    projectId: options.projectId ?? project.name,
    baseProjectRevision: options.baseProjectRevision ?? "unversioned",
    baseTextureStoreRevision: options.baseTextureStoreRevision ?? "unversioned",
    sourceFingerprint,
    manualSplitSources: sources,
    managedRigBackReferenceRevisions:
      options.managedRigBackReferenceRevisions ??
      collectManagedRigBackReferenceRevisions(project),
    generation: 0,
    regions: regionsWithSuggestions,
    handles,
    previewSolvers: [],
    quality,
    undoStackIds: [],
    redoStackIds: [],
  };

  const validation = validateLocalMotionDraft(draft);
  if (!validation.ok) {
    throw new Error(
      validation.diagnostics[0]?.message ?? "Local motion draft is invalid.",
    );
  }
  return draft;
}

function validateRect(
  rect: unknown,
  path: string,
  diagnostics: LocalMotionValidationDiagnostic[],
): void {
  if (!isRecord(rect)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidRegion",
      path,
      message: "Region bounds must be an object.",
    });
    return;
  }
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!isFiniteNumber(rect[key])) {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "invalidRegion",
        path: `${path}.${key}`,
        message: "Region bounds must be finite.",
      });
    }
  }
  if ((rect.width as number) <= 0 || (rect.height as number) <= 0) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidRegion",
      path,
      message: "Region bounds must have positive size.",
    });
  }
}

function validateMotionBudget(
  budget: unknown,
  path: string,
  diagnostics: LocalMotionValidationDiagnostic[],
): void {
  if (!isRecord(budget)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidBudget",
      path,
      message: "Motion budget must be an object.",
    });
    return;
  }
  for (const key of [
    "maxRestDeltaPx",
    "maxStressDeltaPx",
    "maxProtectedDisplacementPx",
    "maxHiddenRevealRatio",
    "maxDuplicateContourRatio",
    "strength",
  ] as const) {
    if (!isFiniteNumber(budget[key])) {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "invalidBudget",
        path: `${path}.${key}`,
        message: "Motion budget values must be finite.",
      });
    }
  }
  if ((budget.strength as number) < 0 || (budget.strength as number) > 1) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidBudget",
      path: `${path}.strength`,
      message: "Motion budget strength must be in [0, 1].",
    });
  }
  for (const key of ["maxHiddenRevealRatio", "maxDuplicateContourRatio"] as const) {
    if ((budget[key] as number) < 0 || (budget[key] as number) > 1) {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "invalidBudget",
        path: `${path}.${key}`,
        message: `${key} must be in [0, 1].`,
      });
    }
  }
}

function validateVec2(
  value: unknown,
  path: string,
  diagnostics: LocalMotionValidationDiagnostic[],
): void {
  if (!isRecord(value)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path,
      message: "Handle point must be an object.",
    });
    return;
  }
  for (const key of ["x", "y"] as const) {
    if (!isFiniteNumber(value[key])) {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "invalidHandle",
        path: `${path}.${key}`,
        message: "Handle point coordinates must be finite.",
      });
    }
  }
}

function validateHandleConstraints(
  constraints: unknown,
  path: string,
  diagnostics: LocalMotionValidationDiagnostic[],
): void {
  if (!isRecord(constraints)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path,
      message: "Handle constraints must be an object.",
    });
    return;
  }
  for (const key of [
    "maxTranslationPx",
    "maxRotationDeg",
    "minScale",
    "maxScale",
    "maxShear",
    "preserveAreaRatio",
    "pinnedBoundaryPx",
  ] as const) {
    if (!isFiniteNumber(constraints[key])) {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "invalidHandle",
        path: `${path}.${key}`,
        message: "Handle constraint values must be finite.",
      });
    }
  }
  if ((constraints.maxTranslationPx as number) < 0) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path: `${path}.maxTranslationPx`,
      message: "Handle max translation must be non-negative.",
    });
  }
  if ((constraints.maxRotationDeg as number) < 0) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path: `${path}.maxRotationDeg`,
      message: "Handle max rotation must be non-negative.",
    });
  }
  if ((constraints.minScale as number) <= 0 || (constraints.maxScale as number) <= 0) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path,
      message: "Handle scale constraints must be positive.",
    });
  }
  if ((constraints.minScale as number) > (constraints.maxScale as number)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path,
      message: "Handle minimum scale cannot exceed maximum scale.",
    });
  }
  if ((constraints.maxShear as number) < 0) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path: `${path}.maxShear`,
      message: "Handle max shear must be non-negative.",
    });
  }
  if ((constraints.preserveAreaRatio as number) <= 0) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path: `${path}.preserveAreaRatio`,
      message: "Handle preserve area ratio must be positive.",
    });
  }
  if ((constraints.pinnedBoundaryPx as number) < 0) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path: `${path}.pinnedBoundaryPx`,
      message: "Handle pinned boundary must be non-negative.",
    });
  }
}

function validateHandle(
  handle: LocalMotionHandle,
  regionIds: ReadonlySet<string>,
  handleIds: ReadonlySet<string>,
  path: string,
  diagnostics: LocalMotionValidationDiagnostic[],
): void {
  if (!regionIds.has(handle.regionId)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "danglingReference",
      path: `${path}.regionId`,
      message: "Handle references a missing region.",
    });
  }
  if (handle.parentHandleId && !handleIds.has(handle.parentHandleId)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "danglingReference",
      path: `${path}.parentHandleId`,
      message: "Handle references a missing parent handle.",
    });
  }
  validateVec2(handle.anchor, `${path}.anchor`, diagnostics);
  if (handle.tip !== undefined) {
    validateVec2(handle.tip, `${path}.tip`, diagnostics);
  }
  if (handle.radiusPx <= 0 || !Number.isFinite(handle.radiusPx)) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "invalidHandle",
      path: `${path}.radiusPx`,
      message: "Handle radius must be positive and finite.",
    });
  }
  validateHandleConstraints(handle.constraints, `${path}.constraints`, diagnostics);
}

export function validateLocalMotionDraft(
  draft: LocalMotionDraft,
): LocalMotionValidationResult {
  const diagnostics: LocalMotionValidationDiagnostic[] = [];
  if (!isRecord(draft)) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "invalidDraftShape",
          path: "$",
          message: "Local motion draft must be an object.",
        },
      ],
    };
  }

  const regionIds = new Set<string>();
  for (const [index, region] of draft.regions.entries()) {
    const path = `regions[${index}]`;
    regionIds.add(region.id);
    validateRect(region.bounds, `${path}.bounds`, diagnostics);
    validateMotionBudget(region.motionBudget, `${path}.motionBudget`, diagnostics);
    if (region.protected !== isProtectedMotionSemantic(region.semanticRole)) {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "protectedInvariantMismatch",
        path: `${path}.protected`,
        message: "Region protected flag must match protected semantic policy.",
      });
    }
  }

  const handleIds = new Set(draft.handles.map((handle) => handle.id));
  draft.handles.forEach((handle, index) =>
    validateHandle(handle, regionIds, handleIds, `handles[${index}]`, diagnostics),
  );

  for (const [index, solver] of draft.previewSolvers.entries()) {
    const path = `previewSolvers[${index}]`;
    if (solver.status === PREVIEW_ONLY_STATUS && !regionIds.has(solver.regionId)) {
      pushDiagnostic(diagnostics, {
        severity: "error",
        code: "danglingReference",
        path: `${path}.regionId`,
        message: "Preview solver references a missing region.",
      });
    }
    for (const handleId of [...solver.handleIds, ...solver.pinHandleIds]) {
      if (!handleIds.has(handleId)) {
        pushDiagnostic(diagnostics, {
          severity: "error",
          code: "danglingReference",
          path,
          message: `Preview solver references missing handle ${handleId}.`,
        });
      }
    }
  }

  if (
    draft.activePreviewSolverId &&
    !draft.previewSolvers.some(
      (solver) =>
        solver.id === draft.activePreviewSolverId &&
        solver.status === PREVIEW_ONLY_STATUS,
    )
  ) {
    pushDiagnostic(diagnostics, {
      severity: "error",
      code: "unsafePreviewSolver",
      path: "activePreviewSolverId",
      message: "Active preview solver must exist with the editor-only preview status.",
    });
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
  };
}

function findViviMeshById(
  layers: readonly LayerNode[],
  layerId: string,
): ViviMeshNode | null {
  for (const layer of layers) {
    if (layer.id === layerId && isViviMesh(layer)) return layer;
    const found = findViviMeshById(layer.children, layerId);
    if (found) return found;
  }
  return null;
}

function findLayerByPath(
  layers: readonly LayerNode[],
  path: readonly string[],
): LayerNode | null {
  let currentLayers = layers;
  let current: LayerNode | null = null;
  for (const id of path) {
    current = currentLayers.find((layer) => layer.id === id) ?? null;
    if (!current) return null;
    currentLayers = current.children;
  }
  return current;
}

function validateDraftBaseAgainstProject(
  project: ProjectData,
  draft: LocalMotionDraft,
): SafeAutoSetupDiagnostic[] {
  const diagnostics: SafeAutoSetupDiagnostic[] = [];

  for (const [index, source] of draft.manualSplitSources.entries()) {
    const path = `manualSplitSources[${index}]`;
    const layer = findLayerByPath(project.layers, source.sourceLayerPath);
    if (!layer || layer.id !== source.sourceLayerId || !isViviMesh(layer)) {
      diagnostics.push({
        severity: "error",
        code: "sourceFingerprintMismatch",
        message: `Motion handle source layer changed or disappeared: ${source.sourceLayerId}`,
        path,
      });
      continue;
    }
    if (layer.semanticRole !== source.sourceLayerSemanticRole) {
      diagnostics.push({
        severity: "error",
        code: "sourceFingerprintMismatch",
        message: `Motion handle source semantic changed: ${source.sourceLayerId}`,
        path: `${path}.sourceLayerSemanticRole`,
      });
    }
    if (source.sourceTextureId !== layer.id) {
      diagnostics.push({
        severity: "error",
        code: "sourceFingerprintMismatch",
        message: `Motion handle source texture changed: ${source.sourceLayerId}`,
        path: `${path}.sourceTextureId`,
      });
    }
    const split = getLayerManualSplitMetadata(layer);
    if (
      !split ||
      split.manualSplitSourceLayerId !== source.manualSplitSourceLayerId ||
      split.manualSplitSourceFingerprint !==
        source.manualSplitSourceFingerprint
    ) {
      diagnostics.push({
        severity: "error",
        code: "sourceFingerprintMismatch",
        message: `Motion handle manual split source changed: ${source.sourceLayerId}`,
        path: `${path}.manualSplitSourceFingerprint`,
      });
    }
  }

  const currentRevisions = collectManagedRigBackReferenceRevisions(project);
  const baseKeys = Object.keys(draft.managedRigBackReferenceRevisions).sort();
  const currentKeys = Object.keys(currentRevisions).sort();
  if (baseKeys.join("\n") !== currentKeys.join("\n")) {
    diagnostics.push({
      severity: "error",
      code: "userModified",
      message:
        "Managed rig references changed after the motion handle draft was created.",
      path: "managedRigBackReferenceRevisions",
    });
    return diagnostics;
  }
  for (const key of baseKeys) {
    const typedKey = key as ManagedRigReferenceKey;
    if (
      draft.managedRigBackReferenceRevisions[typedKey] !==
      currentRevisions[typedKey]
    ) {
      diagnostics.push({
        severity: "error",
        code: "userModified",
        message: `Managed rig reference changed: ${key}`,
        path: `managedRigBackReferenceRevisions.${key}`,
      });
    }
  }

  return diagnostics;
}

function withManagedSignature<T extends SafeAutoSetupOperation>(
  operation: T,
): T {
  const managedSignature = createSafeAutoSetupOperationSignature(operation);
  if (!managedSignature) return operation;
  switch (operation.kind) {
    case "addBone":
    case "createMesh":
    case "createSkin":
    case "createBinding":
      return { ...operation, managedSignature };
    case "createParameter":
      return {
        ...operation,
        parameter: { ...operation.parameter, managedSignature },
      };
    case "createPhysicsGroup":
      return {
        ...operation,
        group: { ...operation.group, managedSignature },
      };
    case "parentBone":
      return operation;
  }
}

function createTempBoneId(regionId: string, handle: LocalMotionHandle): string {
  const safeRegionId = regionId.replace(/^localMotionRegion:|^motionRegion:/, "");
  return `motion_${sanitizeIdPart(safeRegionId)}_${sanitizeIdPart(handle.semantic)}`;
}

function createSecondaryWeights(
  layer: ViviMeshNode,
  rootHandle: LocalMotionHandle,
  tipHandle: LocalMotionHandle,
): SkinWeight[][] {
  const vertices = layer.mesh.vertices;
  const axisX = tipHandle.anchor.x - rootHandle.anchor.x;
  const axisY = tipHandle.anchor.y - rootHandle.anchor.y;
  const axisLengthSq = axisX * axisX + axisY * axisY;
  const rootBoneId = createTempBoneId(rootHandle.regionId, rootHandle);
  const tipBoneId = createTempBoneId(tipHandle.regionId, tipHandle);

  return Array.from({ length: Math.floor(vertices.length / 2) }, (_, index) => {
    if (axisLengthSq <= 1e-6) {
      return [{ boneId: rootBoneId, weight: 1 }];
    }
    const x = layer.x + (vertices[index * 2] ?? 0);
    const y = layer.y + (vertices[index * 2 + 1] ?? 0);
    const rawT =
      ((x - rootHandle.anchor.x) * axisX + (y - rootHandle.anchor.y) * axisY) /
      axisLengthSq;
    const clamped = Math.max(0, Math.min(1, rawT));
    const smooth = clamped * clamped * (3 - 2 * clamped);
    const rootWeight = Math.max(0, Math.min(1, 1 - smooth));
    const tipWeight = Math.max(0, Math.min(1, smooth));
    return [
      { boneId: rootBoneId, weight: rootWeight },
      { boneId: tipBoneId, weight: tipWeight },
    ].filter((weight) => weight.weight > 0.001);
  });
}

function handleAxisLengthSq(
  rootHandle: LocalMotionHandle,
  tipHandle: LocalMotionHandle,
): number {
  const axisX = tipHandle.anchor.x - rootHandle.anchor.x;
  const axisY = tipHandle.anchor.y - rootHandle.anchor.y;
  return axisX * axisX + axisY * axisY;
}

export function compileLocalMotionDraftToSafeAutoSetupOperations(
  project: ProjectData,
  draft: LocalMotionDraft,
  options: CompileLocalMotionDraftOptions = {},
): CompileLocalMotionDraftResult {
  const operations: SafeAutoSetupOperation[] = [];
  const diagnostics: SafeAutoSetupDiagnostic[] = [];
  const skippedRegionIds: string[] = [];
  const validation = validateLocalMotionDraft(draft);
  if (!validation.ok) {
    return {
      operations,
      skippedRegionIds: draft.regions.map((region) => region.id),
      diagnostics: validation.diagnostics.map((diagnostic) => ({
        severity: "error",
        code: "invalidOperationShape",
        message: `Motion handle draft is invalid: ${diagnostic.message}`,
        path: diagnostic.path,
      })),
    };
  }
  const baseDiagnostics = validateDraftBaseAgainstProject(project, draft);
  if (baseDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      operations,
      skippedRegionIds: draft.regions.map((region) => region.id),
      diagnostics: baseDiagnostics,
    };
  }

  const excludedLayerIds = options.excludedLayerIds ?? new Set<string>();
  for (const region of draft.regions) {
    if (excludedLayerIds.has(region.layerId)) {
      skippedRegionIds.push(region.id);
      continue;
    }
    if (
      region.protected ||
      (region.riggingHint !== "localBones" &&
        region.riggingHint !== "skinned" &&
        region.riggingHint !== "physics")
    ) {
      skippedRegionIds.push(region.id);
      continue;
    }

    const layer = findViviMeshById(project.layers, region.layerId);
    if (!layer) {
      skippedRegionIds.push(region.id);
      diagnostics.push({
        severity: "warning",
        code: "sourceFingerprintMismatch",
        message: `Motion region source layer is missing: ${region.layerId}`,
        path: `regions.${region.id}`,
      });
      continue;
    }

    const handles = draft.handles
      .filter(
        (handle) =>
          handle.regionId === region.id &&
          handle.kind === "bone" &&
          isCompileAcceptedHandle(handle, region),
      )
      .sort((a, b) => {
        if (!a.parentHandleId && b.parentHandleId) return -1;
        if (a.parentHandleId && !b.parentHandleId) return 1;
        return a.id.localeCompare(b.id);
      });
    const rootHandle = handles.find((handle) => !handle.parentHandleId);
    const tipHandle =
      handles.find((handle) => handle.parentHandleId === rootHandle?.id) ??
      handles.find((handle) => handle.id !== rootHandle?.id);
    if (!rootHandle || !tipHandle) {
      skippedRegionIds.push(region.id);
      diagnostics.push({
        severity: "warning",
        code: "invalidOperationShape",
        message: `Motion region requires user-accepted root and tip handles: ${region.id}`,
        path: `regions.${region.id}.handles`,
      });
      continue;
    }

    const hasDegenerateAxis = handleAxisLengthSq(rootHandle, tipHandle) <= 1e-6;
    const emittedHandles = hasDegenerateAxis ? [rootHandle] : [rootHandle, tipHandle];

    for (const handle of emittedHandles) {
      operations.push(withManagedSignature({
        kind: "addBone",
        tempId: createTempBoneId(region.id, handle),
        name: `${layer.name} ${handle.semantic}`,
        x: handle.anchor.x,
        y: handle.anchor.y,
        partCategory: region.semanticRole,
        managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:motionHandle:${region.layerId}:${handle.semantic}`,
      }));
    }
    if (!hasDegenerateAxis) {
      operations.push({
        kind: "parentBone",
        childTempId: createTempBoneId(region.id, tipHandle),
        parentTempId: createTempBoneId(region.id, rootHandle),
      });
    }

    operations.push(withManagedSignature({
      kind: "createSkin",
      layerId: region.layerId,
      weights: createSecondaryWeights(layer, rootHandle, tipHandle),
      boneIds: emittedHandles.map((handle) => createTempBoneId(region.id, handle)),
      solver: "secondaryMotion",
      managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:motionSkin:${region.layerId}`,
    }));

    if (region.riggingHint === "physics") {
      operations.push(withManagedSignature({
        kind: "createPhysicsGroup",
        group: {
          name: `${layer.name} motion`,
          partCategory: region.semanticRole,
          layerIds: [region.layerId],
          stiffness: 0.34,
          gravity: 0.45,
          damping: 0.42,
          managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:motionPhysics:${region.layerId}`,
        },
      }));
    }
  }

  return { operations, diagnostics, skippedRegionIds };
}

export const createMotionHandleDraftFromProject =
  createLocalMotionDraftFromProject;

export const compileMotionHandleDraftToSafeAutoSetupOperations =
  compileLocalMotionDraftToSafeAutoSetupOperations;
