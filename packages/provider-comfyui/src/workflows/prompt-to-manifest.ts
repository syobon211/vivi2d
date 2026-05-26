import type { ComfyUIWorkflow, PromptGenerateOptions } from "../types";
import {
  VIVI2D_COMPAT_CAPABILITY,
  VIVI2D_COMPAT_NODE_TYPES,
  VIVI2D_COMPAT_PLUGIN_VERSION,
  VIVI2D_MANIFEST_SCHEMA_VERSION,
} from "../vivi2d-compat";

export function buildPromptToManifestWorkflow(
  options: PromptGenerateOptions,
): ComfyUIWorkflow {
  const seed = options.seed ?? 42;
  const resolution = options.resolution ?? 1280;
  const numSteps = options.numSteps ?? 30;
  const imageSteps = options.imageSteps ?? 25;
  const cfg = options.cfg ?? 7.0;
  const tblrSplit = options.tblrSplit ?? true;
  const useLama = options.useLama ?? true;
  const quantMode = options.quantMode ?? "none";
  const groupOffload = options.groupOffload ?? false;
  const filenamePrefix = "vivi2d_prompt";
  const negativePrompt =
    options.negativePrompt ?? "low quality, worst quality, blurry, bad anatomy";

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "sd_xl_base_1.0.safetensors",
      },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: options.prompt,
        clip: ["1", 1],
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: negativePrompt,
        clip: ["1", 1],
      },
    },
    "4": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        seed,
        steps: imageSteps,
        cfg,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1.0,
        latent_image: ["10", 0],
      },
    },
    "5": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["4", 0],
        vae: ["1", 2],
      },
    },
    "10": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: resolution,
        height: resolution,
        batch_size: 1,
      },
    },
    "6": {
      class_type: VIVI2D_COMPAT_NODE_TYPES.decompose,
      inputs: {
        image: ["5", 0],
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
