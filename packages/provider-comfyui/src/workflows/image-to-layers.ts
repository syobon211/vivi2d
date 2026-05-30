import type { ComfyUIWorkflow, DecomposeOptions } from "../types";
import {
  DEFAULT_SEETHROUGH_DEPTH_MODEL,
  DEFAULT_SEETHROUGH_LAYERDIFF_MODEL,
} from "./seethrough-models";

export function buildImageToLayersWorkflow(
  uploadedFilename: string,
  options?: DecomposeOptions,
): ComfyUIWorkflow {
  const seed = options?.seed ?? 42;
  const resolution = options?.resolution ?? 1280;
  const numSteps = options?.numSteps ?? 30;
  const tblrSplit = options?.tblrSplit ?? true;
  const useLama = options?.useLama ?? true;
  const quantMode = options?.quantMode ?? "none";
  const groupOffload = options?.groupOffload ?? false;

  return {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: uploadedFilename,
      },
    },

    "2": {
      class_type: "SeeThrough_LoadLayerDiffModel",
      inputs: {
        model: DEFAULT_SEETHROUGH_LAYERDIFF_MODEL,
        quant_mode: quantMode,
        cache_tag_embeds: true,
        group_offload: groupOffload,
      },
    },

    "3": {
      class_type: "SeeThrough_LoadDepthModel",
      inputs: {
        model: DEFAULT_SEETHROUGH_DEPTH_MODEL,
        quant_mode: quantMode,
        cache_tag_embeds: true,
        group_offload: groupOffload,
      },
    },

    "4": {
      class_type: "SeeThrough_GenerateLayers",
      inputs: {
        image: ["1", 0],
        layerdiff_model: ["2", 0],
        seed,
        resolution,
        num_inference_steps: numSteps,
      },
    },

    "5": {
      class_type: "SeeThrough_GenerateDepth",
      inputs: {
        layers: ["4", 0],
        depth_model: ["3", 0],
        seed,
        resolution_depth: -1,
      },
    },

    "6": {
      class_type: "SeeThrough_PostProcess",
      inputs: {
        layers_depth: ["5", 0],
        tblr_split: tblrSplit,
        use_lama: useLama,
      },
    },

    "7": {
      class_type: "SeeThrough_SavePSD",
      inputs: {
        parts: ["6", 0],
        filename_prefix: "vivi2d_seethrough",
      },
    },
  };
}
