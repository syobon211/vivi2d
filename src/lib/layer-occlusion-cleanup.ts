export {
  applyLayerOcclusionCleanupToCanvases,
  applyLayerOcclusionCleanupToTextures,
  applyProjectLayerOcclusionCleanupToTextures,
} from "./layer-occlusion-cleanup/apply";
export { decontaminateForegroundEdges } from "./layer-occlusion-cleanup/foreground-edge";
export { cleanupLowerLayerImageDataByForegroundMask } from "./layer-occlusion-cleanup/lower-layer-cleanup";
export {
  applyLayerOcclusionCleanupPlan,
  createLayerOcclusionCleanupPlan,
} from "./layer-occlusion-cleanup/plan";
export type {
  LayerOcclusionCleanupPlan,
  LayerOcclusionCleanupPlanExecutor,
  LayerOcclusionCleanupPlanProvenance,
  LayerOcclusionCleanupPlanStep,
  LayerOcclusionCleanupRollbackMetadata,
} from "./layer-occlusion-cleanup/plan";
export {
  buildLayerOcclusionCleanupPreviewReport,
  buildProjectLayerOcclusionCleanupPreviewReport,
} from "./layer-occlusion-cleanup/preview";
export type {
  LayerOcclusionCleanupLayerReport,
  LayerOcclusionCleanupOperation,
  LayerOcclusionCleanupOptions,
  LayerOcclusionCleanupPairReport,
  LayerOcclusionCleanupPreviewReport,
  LayerOcclusionCleanupResult,
  LayerTextureCanvas,
  LayerTextureImageData,
} from "./layer-occlusion-cleanup/types";
