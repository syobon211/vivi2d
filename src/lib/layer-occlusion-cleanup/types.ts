import type { LayerSemanticRole } from "@vivi2d/core/types";

export interface LayerOcclusionCleanupOptions {
  alphaThreshold?: number;
  expandRadius?: number;
  featherRadius?: number;
  underpaintRadius?: number;
  holdoutStrength?: number;
  underpaintStrength?: number;
  motionSweepRadiusX?: number;
  motionSweepRadiusY?: number;
  motionSweepStrength?: number;
  edgeDecontaminationRadius?: number;
  edgeDecontaminationStrength?: number;
  edgeAlphaTrimStrength?: number;
  contextUnderpaintPasses?: number;
  contextUnderpaintStrength?: number;
  duplicateContourRadius?: number;
  duplicateContourStrength?: number;
}

export interface LayerTextureImageData {
  layerId: string;
  imageData: ImageData;
}

export interface LayerTextureCanvas {
  layerId: string;
  canvas: HTMLCanvasElement;
}

export interface LayerOcclusionCleanupResult {
  processedLayerIds: string[];
  foregroundProcessedLayerIds: string[];
  pairCount: number;
  affectedPixels: number;
}

export type LayerOcclusionCleanupOperation =
  | "foreground-edge"
  | "lower-holdout"
  | "underpaint"
  | "motion-sweep"
  | "duplicate-contour";

export interface LayerOcclusionCleanupPairReport {
  foregroundLayerId: string;
  foregroundLayerName: string;
  foregroundRole: LayerSemanticRole;
  lowerLayerId: string;
  lowerLayerName: string;
  lowerRole: LayerSemanticRole;
  overlapArea: number;
  sweptArea: number;
  overlapRatio: number;
  sweptOverlapRatio: number;
  cleanupScore: number;
  operations: LayerOcclusionCleanupOperation[];
}

export interface LayerOcclusionCleanupLayerReport {
  layerId: string;
  layerName: string;
  role: LayerSemanticRole;
  kind: "foreground" | "lower";
  pairCount: number;
  estimatedAffectedArea: number;
  cleanupScore: number;
  operations: LayerOcclusionCleanupOperation[];
}

export interface LayerOcclusionCleanupPreviewReport {
  isEligible: boolean;
  foregroundLayerCount: number;
  lowerLayerCount: number;
  pairCount: number;
  estimatedAffectedArea: number;
  maxCleanupScore: number;
  pairReports: LayerOcclusionCleanupPairReport[];
  layerReports: LayerOcclusionCleanupLayerReport[];
}

/** @internal */
export interface ResolvedOptions {
  alphaThreshold: number;
  expandRadius: number;
  featherRadius: number;
  underpaintRadius: number;
  holdoutStrength: number;
  underpaintStrength: number;
  motionSweepRadiusX: number;
  motionSweepRadiusY: number;
  motionSweepStrength: number;
  edgeDecontaminationRadius: number;
  edgeDecontaminationStrength: number;
  edgeAlphaTrimStrength: number;
  contextUnderpaintPasses: number;
  contextUnderpaintStrength: number;
  duplicateContourRadius: number;
  duplicateContourStrength: number;
}

/** @internal */
export interface LayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** @internal */
export interface CleanupPairResult {
  imageData: ImageData;
  affectedPixels: number;
}

/** @internal */
export type FloatMask = Float32Array<ArrayBufferLike>;

/** @internal */
export interface ContextualUnderpaintBuffer {
  r: FloatMask;
  g: FloatMask;
  b: FloatMask;
  confidence: FloatMask;
}
