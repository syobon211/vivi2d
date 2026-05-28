import { describe, expect, it } from "vitest";
import { buildImageToLayersWorkflow } from "../workflows/image-to-layers";
import { buildPromptToLayersWorkflow } from "../workflows/prompt-to-layers";


describe("buildImageToLayersWorkflow", () => {
  it("デフォルトオプションで7ノードのワークフローを生成する", () => {
    const wf = buildImageToLayersWorkflow("test.png");

    expect(Object.keys(wf)).toHaveLength(7);
    expect(wf["1"]!.class_type).toBe("LoadImage");
    expect(wf["2"]!.class_type).toBe("SeeThrough_LoadLayerDiffModel");
    expect(wf["3"]!.class_type).toBe("SeeThrough_LoadDepthModel");
    expect(wf["4"]!.class_type).toBe("SeeThrough_GenerateLayers");
    expect(wf["5"]!.class_type).toBe("SeeThrough_GenerateDepth");
    expect(wf["6"]!.class_type).toBe("SeeThrough_PostProcess");
    expect(wf["7"]!.class_type).toBe("SeeThrough_SavePSD");
  });

  it("アップロードファイル名がLoadImageノードに設定される", () => {
    const wf = buildImageToLayersWorkflow("my-character.png");
    expect(wf["1"]!.inputs.image).toBe("my-character.png");
  });

  it("カスタムオプションが反映される", () => {
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

  it("ノード間のリンクが正しい", () => {
    const wf = buildImageToLayersWorkflow("test.png");

    expect(wf["4"]!.inputs.image).toEqual(["1", 0]);
    expect(wf["4"]!.inputs.layerdiff_model).toEqual(["2", 0]);

    expect(wf["5"]!.inputs.layers).toEqual(["4", 0]);
    expect(wf["5"]!.inputs.depth_model).toEqual(["3", 0]);

    expect(wf["6"]!.inputs.layers_depth).toEqual(["5", 0]);

    expect(wf["7"]!.inputs.parts).toEqual(["6", 0]);
  });
});

describe("buildPromptToLayersWorkflow", () => {
  it("12ノードのワークフローを生成する", () => {
    const wf = buildPromptToLayersWorkflow({ prompt: "anime girl" });

    // Stage1: 1(Checkpoint) + 2(Positive) + 3(Negative) + 4(KSampler) + 5(VAEDecode) + 10(EmptyLatent)
    // Stage2: 6(LayerDiff) + 7(Depth) + 8(GenLayers) + 9(GenDepth) + 11(PostProcess) + 12(SavePSD)
    expect(Object.keys(wf)).toHaveLength(12);
  });

  it("プロンプトがCLIPTextEncodeに設定される", () => {
    const wf = buildPromptToLayersWorkflow({
      prompt: "anime girl, full body",
      negativePrompt: "bad quality",
    });

    expect(wf["2"]!.inputs.text).toBe("anime girl, full body");
    expect(wf["3"]!.inputs.text).toBe("bad quality");
  });

  it("画像生成→See-throughのリンクが正しい", () => {
    const wf = buildPromptToLayersWorkflow({ prompt: "test" });

    expect(wf["8"]!.inputs.image).toEqual(["5", 0]);
  });

  it("解像度がEmptyLatentImageに反映される", () => {
    const wf = buildPromptToLayersWorkflow({ prompt: "test", resolution: 1024 });
    expect(wf["10"]!.inputs.width).toBe(1024);
    expect(wf["10"]!.inputs.height).toBe(1024);
  });
});
