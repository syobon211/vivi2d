import { describe, expect, it } from "vitest";
import { buildImageToLayersWorkflow } from "../workflows/image-to-layers";
import { buildPromptToLayersWorkflow } from "../workflows/prompt-to-layers";
import {
  DEFAULT_SEETHROUGH_DEPTH_MODEL,
  DEFAULT_SEETHROUGH_LAYERDIFF_MODEL,
} from "../workflows/seethrough-models";

describe("buildImageToLayersWorkflow", () => {
  it("builds the seven-node legacy image decomposition workflow", () => {
    const wf = buildImageToLayersWorkflow("test.png");

    expect(Object.keys(wf)).toHaveLength(7);
    expect(wf["1"]!.class_type).toBe("LoadImage");
    expect(wf["2"]!.class_type).toBe("SeeThrough_LoadLayerDiffModel");
    expect(wf["3"]!.class_type).toBe("SeeThrough_LoadDepthModel");
    expect(wf["4"]!.class_type).toBe("SeeThrough_GenerateLayers");
    expect(wf["5"]!.class_type).toBe("SeeThrough_GenerateDepth");
    expect(wf["6"]!.class_type).toBe("SeeThrough_PostProcess");
    expect(wf["7"]!.class_type).toBe("SeeThrough_SavePSD");
    expect(wf["1"]!.inputs.image).toBe("test.png");
    expect(wf["4"]!.inputs.image).toEqual(["1", 0]);
    expect(wf["4"]!.inputs.layerdiff_model).toEqual(["2", 0]);
    expect(wf["5"]!.inputs.layers).toEqual(["4", 0]);
    expect(wf["5"]!.inputs.depth_model).toEqual(["3", 0]);
    expect(wf["6"]!.inputs.layers_depth).toEqual(["5", 0]);
    expect(wf["7"]!.inputs.parts).toEqual(["6", 0]);
    expect(wf["2"]!.inputs.model).toBe(DEFAULT_SEETHROUGH_LAYERDIFF_MODEL);
    expect(wf["3"]!.inputs.model).toBe(DEFAULT_SEETHROUGH_DEPTH_MODEL);
  });


  it("applies custom decomposition options", () => {
    const wf = buildImageToLayersWorkflow("test.png", {
      seed: 123,
      resolution: 1024,
      numSteps: 50,
      tblrSplit: false,
      useLama: false,
      quantMode: "nf4",
      groupOffload: true,
    });

    expect(wf["4"]!.inputs.seed).toBe(123);
    expect(wf["4"]!.inputs.resolution).toBe(1024);
    expect(wf["4"]!.inputs.num_inference_steps).toBe(50);
    expect(wf["6"]!.inputs.tblr_split).toBe(false);
    expect(wf["6"]!.inputs.use_lama).toBe(false);
    expect(wf["2"]!.inputs.quant_mode).toBe("nf4");
    expect(wf["2"]!.inputs.group_offload).toBe(true);
  });


});

describe("buildPromptToLayersWorkflow", () => {


  it("passes prompt text to CLIPTextEncode", () => {
    const wf = buildPromptToLayersWorkflow({
      prompt: "anime girl, full body",
      negativePrompt: "bad quality",
    });

    expect(Object.keys(wf)).toHaveLength(12);
    expect(wf["8"]!.inputs.image).toEqual(["5", 0]);
    expect(wf["6"]!.inputs.model).toBe(DEFAULT_SEETHROUGH_LAYERDIFF_MODEL);
    expect(wf["7"]!.inputs.model).toBe(DEFAULT_SEETHROUGH_DEPTH_MODEL);
    expect(wf["2"]!.inputs.text).toBe("anime girl, full body");
    expect(wf["3"]!.inputs.text).toBe("bad quality");
  });


  it("passes resolution to EmptyLatentImage", () => {
    const wf = buildPromptToLayersWorkflow({ prompt: "test", resolution: 1024 });

    expect(wf["10"]!.inputs.width).toBe(1024);
    expect(wf["10"]!.inputs.height).toBe(1024);
  });


});
