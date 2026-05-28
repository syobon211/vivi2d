import type { LayerNode } from "@vivi2d/core/types";
import { mapSeeThroughLabelToRole } from "@vivi2d/editor-core/see-through-role-map";
import { describe, expect, it } from "vitest";
import {
  detectPartByName,
  detectParts,
  filterDetectedParts,
  refineByPosition,
} from "@/lib/ai-part-detector";

function makeLayer(
  id: string,
  name: string,
  x = 0,
  y = 0,
  w = 100,
  h = 100,
  overrides: Partial<LayerNode> = {},
): LayerNode {
  return {
    id,
    name,
    kind: "viviMesh",
    visible: true,
    opacity: 1,
    x,
    y,
    width: w,
    height: h,
    blendMode: "normal",
    expanded: false,
    children: [],
    mesh: { vertices: [], uvs: [], indices: [], vertexCount: 0, indexCount: 0 },
    ...overrides,
  } as unknown as LayerNode;
}

describe("detectPartByName", () => {
  it("日本語の目パーツ名を検出する", () => {
    expect(detectPartByName("左目").category).toBe("eyeLeft");
    expect(detectPartByName("右目").category).toBe("eyeRight");
  });

  it("英語の目パーツ名を検出する", () => {
    expect(detectPartByName("left eye").category).toBe("eyeLeft");
    expect(detectPartByName("right_eye").category).toBe("eyeRight");
    expect(detectPartByName("L.eye").category).toBe("eyeLeft");
  });

  it("口を検出する", () => {
    expect(detectPartByName("口").category).toBe("mouth");
    expect(detectPartByName("mouth").category).toBe("mouth");
    expect(detectPartByName("lip").category).toBe("mouth");
  });

  it("髪パーツを種別ごとに検出する", () => {
    expect(detectPartByName("前髪").category).toBe("hairFront");
    expect(detectPartByName("後ろ髪").category).toBe("hairBack");
    expect(detectPartByName("横髪").category).toBe("hairSide");
    expect(detectPartByName("hair").category).toBe("hair");
  });

  it("体のパーツを検出する", () => {
    expect(detectPartByName("体").category).toBe("body");
    expect(detectPartByName("左腕").category).toBe("armLeft");
    expect(detectPartByName("right arm").category).toBe("armRight");
  });

  it("尻尾を検出する", () => {
    expect(detectPartByName("尻尾").category).toBe("tail");
    expect(detectPartByName("tail").category).toBe("tail");
  });

  it("不明なレイヤー名は unknown を返す", () => {
    expect(detectPartByName("背景").category).toBe("unknown");
    expect(detectPartByName("レイヤー1").category).toBe("unknown");
  });

  it("確信度が 0 より大きい", () => {
    const result = detectPartByName("左目");
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe("detectParts", () => {
  it("レイヤーツリーから全パーツを検出する", () => {
    const layers: LayerNode[] = [
      makeLayer("1", "顔"),
      makeLayer("2", "左目"),
      makeLayer("3", "口"),
    ];
    const results = detectParts(layers);
    expect(results).toHaveLength(3);
    expect(results[0]!.category).toBe("face");
    expect(results[1]!.category).toBe("eyeLeft");
    expect(results[2]!.category).toBe("mouth");
  });

  it("各結果にバウンディングボックスが含まれる", () => {
    const layers = [makeLayer("1", "目", 10, 20, 50, 30)];
    const results = detectParts(layers);
    expect(results[0]!.bounds).toEqual({ x: 10, y: 20, width: 50, height: 30 });
  });
});

describe("filterDetectedParts", () => {
  it("確信度が閾値未満のパーツを除外する", () => {
    const parts = detectParts([
      makeLayer("1", "左目"),
      makeLayer("2", "背景"), // unknown = 0
    ]);
    const filtered = filterDetectedParts(parts, 0.3);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.category).toBe("eyeLeft");
  });
});

describe("refineByPosition", () => {
  it("上部の unknown パーツを head に補正する", () => {
    const parts = detectParts([
      makeLayer("1", "レイヤー1", 400, 50, 100, 100),
    ]);
    const refined = refineByPosition(parts, 1000, 1000);
    expect(refined[0]!.category).toBe("head");
  });

  it("中部の unknown パーツを body に補正する", () => {
    const parts = detectParts([
      makeLayer("1", "レイヤー1", 400, 450, 100, 100),
    ]);
    const refined = refineByPosition(parts, 1000, 1000);
    expect(refined[0]!.category).toBe("body");
  });

  it("既に検出済みのパーツは変更しない", () => {
    const parts = detectParts([makeLayer("1", "左目", 400, 50, 50, 50)]);
    const refined = refineByPosition(parts, 1000, 1000);
    expect(refined[0]!.category).toBe("eyeLeft");
  });
});


describe("detectPartByName — See-through ラベル", () => {
  it("st:プレフィックスで顔パーツを検出する (confidence: 1.0)", () => {
    const result = detectPartByName("st:face");
    expect(result.category).toBe("face");
    expect(result.confidence).toBe(1.0);
  });

  it("st:プレフィックスで目パーツを検出する", () => {
    expect(detectPartByName("st:iris_left").category).toBe("eyeLeft");
    expect(detectPartByName("st:iris_right").category).toBe("eyeRight");
    expect(detectPartByName("st:eyelash_left").category).toBe("eyeLeft");
    expect(detectPartByName("st:eye_white_right").category).toBe("eyeRight");
  });

  it("st:プレフィックスで眉パーツを検出する", () => {
    expect(detectPartByName("st:eyebrow_left").category).toBe("eyebrowLeft");
    expect(detectPartByName("st:eyebrow_right").category).toBe("eyebrowRight");
  });

  it("st:プレフィックスで髪パーツを検出する", () => {
    expect(detectPartByName("st:hair_front").category).toBe("hairFront");
    expect(detectPartByName("st:hair_back").category).toBe("hairBack");
  });

  it("normalizes upstream See-through labels", () => {
    expect(mapSeeThroughLabelToRole("front hair")).toBe("hairFront");
    expect(mapSeeThroughLabelToRole("back hair")).toBe("hairBack");
    expect(mapSeeThroughLabelToRole("eyelash-l")).toBe("eyeLeft");
    expect(mapSeeThroughLabelToRole("eyewhite-r")).toBe("eyeRight");
    expect(mapSeeThroughLabelToRole("irides-l")).toBe("eyeLeft");
    expect(mapSeeThroughLabelToRole("handwear-r")).toBe("handRight");
    expect(mapSeeThroughLabelToRole("topwear")).toBe("body");
  });

  it("st:プレフィックスで体パーツを検出する", () => {
    expect(detectPartByName("st:neck").category).toBe("body");
    expect(detectPartByName("st:torso_wear").category).toBe("body");
  });

  it("st:プレフィックスでアクセサリを検出する", () => {
    expect(detectPartByName("st:headwear").category).toBe("accessory");
    expect(detectPartByName("st:wings").category).toBe("accessory");
  });

  it("st:プレフィックスで尻尾を検出する", () => {
    expect(detectPartByName("st:tail").category).toBe("tail");
    expect(detectPartByName("st:tail").confidence).toBe(1.0);
  });

  it("st:プレフィックスで未知のラベルは通常のパターンマッチにフォールバック", () => {
    const result = detectPartByName("st:unknown_part");
    expect(result.category).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("st:なしの通常レイヤー名は従来通り動作する", () => {
    expect(detectPartByName("左目").category).toBe("eyeLeft");
    expect(detectPartByName("hair_front").category).not.toBe("unknown");
  });
});
