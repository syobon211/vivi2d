import type { LayerSemanticRole } from "@vivi2d/core/types";

export type ManualSplitQualitySeverity = "blocker" | "warning" | "info";

export type ManualSplitQualityCheckId =
  | "missingRequiredSemantic"
  | "sourceFingerprintMismatch"
  | "noNonEmptyMasks"
  | "highAlphaPixelsLost"
  | "unassignedOpaquePixels"
  | "maskOverlap"
  | "protectedSemanticContamination"
  | "applyWouldExceedTextureBudget"
  | "tinyIsland"
  | "thinFragment"
  | "jaggedEdge"
  | "lowMaskCoverage"
  | "ambiguousAccessoryNearFace"
  | "multiLobeMask";

export type ManualSplitRepairAction =
  | "assignToMask"
  | "resolveOverlap"
  | "removeIslands"
  | "fillHoles"
  | "featherEdge"
  | "splitMask"
  | "reviewProtectedRegion"
  | "reduceTextureBudget";

export interface ManualSplitQualityPolicy {
  sourceOpaqueAlphaThreshold: number;
  sourceHighAlphaThreshold: number;
  maskAlphaThreshold: number;
  maxHighAlphaPixelsLostRatio: number;
  maxUnassignedOpaquePixelsWarningRatio: number;
  maxOverlapRatioBlocker: number;
  tinyIslandMaxPixels: number;
  minMaskCoverageWarningRatio: number;
  thinFragmentMinSpanPx: number;
  jaggedEdgeBoundaryRatio: number;
  accessoryNearProtectedDistancePx: number;
}

export const DEFAULT_MANUAL_SPLIT_QUALITY_POLICY: ManualSplitQualityPolicy =
  Object.freeze({
    sourceOpaqueAlphaThreshold: 16,
    sourceHighAlphaThreshold: 192,
    maskAlphaThreshold: 16,
    maxHighAlphaPixelsLostRatio: 0.03,
    maxUnassignedOpaquePixelsWarningRatio: 0.005,
    maxOverlapRatioBlocker: 0.01,
    tinyIslandMaxPixels: 6,
    minMaskCoverageWarningRatio: 0.002,
    thinFragmentMinSpanPx: 2,
    jaggedEdgeBoundaryRatio: 2.6,
    accessoryNearProtectedDistancePx: 12,
  });

export const DEFAULT_MANUAL_SPLIT_PROTECTED_ROLES = Object.freeze([
  "face",
  "eyeLeft",
  "eyeRight",
  "mouth",
  "nose",
] satisfies LayerSemanticRole[]);
