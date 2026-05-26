import {
  VIVI2D_MANIFEST_SCHEMA_VERSION,
  type ViviSeeThroughManifest,
} from "@vivi2d/provider-comfyui";
import type { ProjectData } from "@vivi2d/core/types";
import {
  applySeeThroughImportContext as applyEditorCoreSeeThroughImportContext,
  SEE_THROUGH_ROLE_CONFIDENCE_THRESHOLD,
  type SeeThroughImportManifest,
  type SeeThroughImportAnnotationResult,
} from "@vivi2d/editor-core/see-through-import-context";

export { SEE_THROUGH_ROLE_CONFIDENCE_THRESHOLD };
export type { SeeThroughImportAnnotationResult };

function toEditorCoreSeeThroughManifest(
  manifest: ViviSeeThroughManifest,
): SeeThroughImportManifest {
  return {
    schemaVersion: manifest.schema_version,
    layers: manifest.layers.map((layer) => ({
      name: layer.name,
      label: layer.label,
      order: layer.order,
      leafToken: layer.psd_leaf_token,
      bbox: layer.bbox,
      confidence: layer.confidence,
      leftRightSplit: layer.left_right_split,
      frontBackSplit: layer.front_back_split,
      depthStats: {
        min: layer.depth_stats.min,
        max: layer.depth_stats.max,
        mean: layer.depth_stats.mean,
      },
    })),
  };
}

export function applySeeThroughImportContext(
  project: ProjectData,
  manifest: ViviSeeThroughManifest,
): SeeThroughImportAnnotationResult {
  return applyEditorCoreSeeThroughImportContext(
    project,
    toEditorCoreSeeThroughManifest(manifest),
    { expectedSchemaVersion: VIVI2D_MANIFEST_SCHEMA_VERSION },
  );
}
