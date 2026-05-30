import type { ComfyUIWorkflow, PromptGenerateOptions } from "../types";
import {
  DEFAULT_SEETHROUGH_DEPTH_MODEL,
  DEFAULT_SEETHROUGH_LAYERDIFF_MODEL,
} from "./seethrough-models";

export function buildPromptToLayersWorkflow(
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
      class_type: "SeeThrough_LoadLayerDiffModel",
      inputs: {
        model: DEFAULT_SEETHROUGH_LAYERDIFF_MODEL,
        quant_mode: quantMode,
        cache_tag_embeds: true,
        group_offload: groupOffload,
      },
    },

    "7": {
      class_type: "SeeThrough_LoadDepthModel",
      inputs: {
        model: DEFAULT_SEETHROUGH_DEPTH_MODEL,
        quant_mode: quantMode,
        cache_tag_embeds: true,
        group_offload: groupOffload,
      },
    },

    "8": {
      class_type: "SeeThrough_GenerateLayers",
      inputs: {
        image: ["5", 0],
        layerdiff_model: ["6", 0],
        seed,
        resolution,
        num_inference_steps: numSteps,
      },
    },

    "9": {
      class_type: "SeeThrough_GenerateDepth",
      inputs: {
        layers: ["8", 0],
        depth_model: ["7", 0],
        seed,
        resolution_depth: -1,
      },
    },

    "11": {
      class_type: "SeeThrough_PostProcess",
      inputs: {
        layers_depth: ["9", 0],
        tblr_split: tblrSplit,
        use_lama: useLama,
      },
    },

    "12": {
      class_type: "SeeThrough_SavePSD",
      inputs: {
        parts: ["11", 0],
        filename_prefix: "vivi2d_prompt",
      },
    },
  };
}
