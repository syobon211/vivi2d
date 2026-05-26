import type { ComfyUIWorkflow } from "../types";
import { VIVI2D_COMPAT_NODE_TYPES, type ViviCompatExportOptions } from "../vivi2d-compat";

export function buildManifestToPsdWorkflow(
  manifestPath: string,
  options?: ViviCompatExportOptions,
): ComfyUIWorkflow {
  return {
    "1": {
      class_type: VIVI2D_COMPAT_NODE_TYPES.exportPsd,
      inputs: {
        manifest_path: manifestPath,
        filename_prefix: options?.filenamePrefix ?? "vivi2d_export",
      },
    },
  };
}
