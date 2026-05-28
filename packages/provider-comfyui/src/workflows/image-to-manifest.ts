import type { ComfyUIWorkflow } from "../types";
import {
  VIVI2D_COMPAT_CAPABILITY,
  VIVI2D_COMPAT_NODE_TYPES,
  VIVI2D_COMPAT_PLUGIN_VERSION,
  VIVI2D_MANIFEST_SCHEMA_VERSION,
  type ViviCompatDecomposeOptions,
} from "../vivi2d-compat";

export function buildImageToManifestWorkflow(
  uploadedFilename: string,
  options?: ViviCompatDecomposeOptions,
): ComfyUIWorkflow {
  const seed = options?.seed ?? 42;
  const resolution = options?.resolution ?? 1280;
  const numSteps = options?.numSteps ?? 30;
  const tblrSplit = options?.tblrSplit ?? true;
  const useLama = options?.useLama ?? true;
  const quantMode = options?.quantMode ?? "none";
  const groupOffload = options?.groupOffload ?? false;
  const filenamePrefix = options?.filenamePrefix ?? "vivi2d_seethrough";

  return {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: uploadedFilename,
      },
    },
    "2": {
      class_type: VIVI2D_COMPAT_NODE_TYPES.decompose,
      inputs: {
        image: ["1", 0],
        seed,
        resolution,
        num_inference_steps: numSteps,
        tblr_split: tblrSplit,
        use_lama: useLama,
        quant_mode: quantMode,
        group_offload: groupOffload,
        filename_prefix: filenamePrefix,
        schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
        plugin_version: VIVI2D_COMPAT_PLUGIN_VERSION,
        capability: VIVI2D_COMPAT_CAPABILITY,
      },
    },
  };
}
