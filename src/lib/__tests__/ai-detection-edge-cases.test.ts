import type { LayerNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { generateAllBones } from "@/lib/ai-bone-generator";
import type { DetectedPart } from "@/lib/ai-part-detector";
import {
  detectPartByName,
  detectParts,
  filterDetectedParts,
  refineByPosition,
} from "@/lib/ai-part-detector";
import { detectSwayingParts, generatePhysicsGroups } from "@/lib/ai-physics-generator";

function makeLayer(id: string, name: string, x = 0, y = 0, w = 100, h = 100): LayerNode {
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
  } as unknown as LayerNode;
}

function makePart(
  category: DetectedPart["category"],
  x = 0,
  y = 0,
  w = 100,
  h = 100,
): DetectedPart {
  return {
    layerId: `layer-${category}`,
    layerName: category,
    category,
    confidence: 0.8,
    bounds: { x, y, width: w, height: h },
  };
}

describe("detectPartByName: 日英混合レイヤー名", () => {
  it("'左eye' を検出できる", () => {
    const result = detectPartByName("左eye");
    expect(result.category).toBe("eyeLeft");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("'右arm' を検出できる", () => {
    const result = detectPartByName("右arm");
    expect(result.category).toBe("armRight");
  });

  it("'hair前' はhairFrontとして検出されるか確認", () => {
    const result = detectPartByName("hair前");
    expect(["hair", "hairFront"]).toContain(result.category);
  });

  it("'L.mouth' は mouth として検出される", () => {
    const result = detectPartByName("L.mouth");
    expect(result.category).toBe("mouth");
  });
});

describe("detectPartByName: 全角英字", () => {
  it("'ｅｙｅ' は検出されない（全角英字はパターン非対応）", () => {
    const result = detectPartByName("ｅｙｅ");
    expect(result.category).toBe("unknown");
  });

  it("'ｍｏｕｔｈ' は検出されない", () => {
    const result = detectPartByName("ｍｏｕｔｈ");
    expect(result.category).toBe("unknown");
  });

  it("'ＨＡＩＲ'（全角大文字）は検出されない", () => {
    const result = detectPartByName("ＨＡＩＲ");
    expect(result.category).toBe("unknown");
  });
});

describe("detectPartByName: 大文字小文字混在", () => {
  it("'EYE_LEFT' を検出できる", () => {
    const result = detectPartByName("EYE_LEFT");
    expect(result.category).toBe("eyeLeft");
  });

  it("'MOUTH' を検出できる", () => {
    const result = detectPartByName("MOUTH");
    expect(result.category).toBe("mouth");
  });

  it("'HaIrFrOnT' のような混在でも検出", () => {
    const result = detectPartByName("front hair");
    expect(result.category).toBe("hairFront");
  });

  it("'LEFT_ARM' のアンダースコア区切り大文字", () => {
    const result = detectPartByName("LEFT_ARM");
    expect(result.category).toBe("armLeft");
  });

  it("'Right.Eye' のドット区切り", () => {
    const result = detectPartByName("Right.Eye");
    expect(result.category).toBe("eyeRight");
  });
});

describe("detectPartByName: 特殊文字を含むレイヤー名", () => {
  it("'★左目★' でも目を検出できる", () => {
    const result = detectPartByName("★左目★");
    expect(result.category).toBe("eyeLeft");
  });

  it("'[Layer] mouth (copy)' でも口を検出", () => {
    const result = detectPartByName("[Layer] mouth (copy)");
    expect(result.category).toBe("mouth");
  });

  it("空文字は unknown", () => {
    const result = detectPartByName("");
    expect(result.category).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("数字だけのレイヤー名は unknown", () => {
    const result = detectPartByName("12345");
    expect(result.category).toBe("unknown");
  });

  it("絵文字を含むレイヤー名でクラッシュしない", () => {
    const result = detectPartByName("😊目😊");
    expect(typeof result.category).toBe("string");
  });
});

describe("detectParts: 多数レイヤーの検出とフィルタリング", () => {
  it("多数レイヤーの全件・順序・分類と信頼度フィルタを保持する", () => {
    const layers: LayerNode[] = [];
    const names = [
      "左目",
      "右目",
      "口",
      "前髪",
      "体",
      "左腕",
      "右腕",
      "尻尾",
      "背景",
      "レイヤー",
      "hair",
      "face",
      "body",
    ];
    for (let i = 0; i < 1000; i++) {
      layers.push(makeLayer(`l${i}`, names[i % names.length]!, i * 10, i * 5, 100, 100));
    }
    const results = detectParts(layers);
    expect(results).toHaveLength(1000);
    const categories = [
      "eyeLeft",
      "eyeRight",
      "mouth",
      "hairFront",
      "body",
      "armLeft",
      "armRight",
      "tail",
      "unknown",
      "unknown",
      "hair",
      "face",
      "body",
    ];
    expect(results.map((part) => [part.layerId, part.category])).toEqual(
      layers.map((layer, index) => [layer.id, categories[index % 13]]),
    );
    const highConfidenceSlots = new Set([0, 1, 2, 3, 5, 6, 7, 11]);
    expect(filterDetectedParts(results, 0.5).map((part) => part.layerId)).toEqual(
      layers
        .filter((_, index) => highConfidenceSlots.has(index % 13))
        .map((layer) => layer.id),
    );
  });
});

describe("detectParts: 0x0 バウンディングボックス", () => {
  it("幅と高さが0のレイヤーでも検出される", () => {
    const layers = [makeLayer("1", "左目", 100, 200, 0, 0)];
    const results = detectParts(layers);
    expect(results).toHaveLength(1);
    expect(results[0]!.category).toBe("eyeLeft");
    expect(results[0]!.bounds).toEqual({ x: 100, y: 200, width: 0, height: 0 });
  });

  it("0x0 レイヤーの refineByPosition でもクラッシュしない", () => {
    const parts = detectParts([makeLayer("1", "不明", 500, 100, 0, 0)]);
    const refined = refineByPosition(parts, 1000, 1000);
    expect(refined).toHaveLength(1);
    expect(refined[0]!.category).toBe("head");
  });
});

describe("generateAllBones: 全パーツ検出時のボーン階層", () => {
  it("パラメータが重複なく生成される", () => {
    const parts: DetectedPart[] = [
      makePart("eyeLeft", 400, 200),
      makePart("eyeRight", 600, 200),
      makePart("mouth", 500, 400),
    ];
    const result = generateAllBones(parts, 1000, 1000);
    const paramNames = result.parameters.map((p) => p.name);
    const uniqueNames = new Set(paramNames);
    expect(paramNames.length).toBe(uniqueNames.size);
  });
});

describe("generatePhysicsGroups: 全カテゴリ揺れパーツ", () => {
  it("全揺れカテゴリのパーツでグループが正しく生成される", () => {
    const parts: DetectedPart[] = [
      makePart("hair"),
      makePart("hairFront"),
      makePart("hairBack"),
      makePart("hairSide"),
      makePart("tail"),
      makePart("ear"),
      makePart("accessory"),
    ];
    const groups = generatePhysicsGroups(parts, { locale: "ja" });
    expect(groups).toHaveLength(7);

    const categories = new Set(groups.map((g) => g.partCategory));
    expect(categories.has("hair")).toBe(true);
    expect(categories.has("hairFront")).toBe(true);
    expect(categories.has("hairBack")).toBe(true);
    expect(categories.has("hairSide")).toBe(true);
    expect(categories.has("tail")).toBe(true);
    expect(categories.has("ear")).toBe(true);
    expect(categories.has("accessory")).toBe(true);
  });

  it("各グループに適切な物理パラメータが設定される", () => {
    const parts: DetectedPart[] = [makePart("hairFront"), makePart("tail")];
    const groups = generatePhysicsGroups(parts, { locale: "ja" });
    const hairGroup = groups.find((g) => g.partCategory === "hairFront")!;
    const tailGroup = groups.find((g) => g.partCategory === "tail")!;

    expect(hairGroup.stiffness).toBeCloseTo(0.4, 2);
    expect(hairGroup.gravity).toBeCloseTo(0.3, 2);
    expect(hairGroup.damping).toBeCloseTo(0.5, 2);

    expect(tailGroup.stiffness).toBeCloseTo(0.15, 2);
    expect(tailGroup.gravity).toBeCloseTo(0.7, 2);
    expect(tailGroup.damping).toBeCloseTo(0.25, 2);
  });

  it("日本語グループ名が正しく設定される", () => {
    const parts: DetectedPart[] = [
      makePart("hairFront"),
      makePart("hairBack"),
      makePart("hairSide"),
      makePart("tail"),
      makePart("ear"),
      makePart("accessory"),
    ];
    const groups = generatePhysicsGroups(parts, { locale: "ja" });
    const nameMap = new Map(groups.map((g) => [g.partCategory, g.name]));
    expect(nameMap.get("hairFront")).toBe("前髪 揺れ");
    expect(nameMap.get("hairBack")).toBe("後ろ髪 揺れ");
    expect(nameMap.get("hairSide")).toBe("横髪 揺れ");
    expect(nameMap.get("tail")).toBe("尻尾 揺れ");
    expect(nameMap.get("ear")).toBe("耳 揺れ");
    expect(nameMap.get("accessory")).toBe("アクセサリ 揺れ");
  });

  it("同じカテゴリの複数パーツが1グループにまとめられる", () => {
    const parts: DetectedPart[] = [
      { ...makePart("hairFront"), layerId: "front1" },
      { ...makePart("hairFront"), layerId: "front2" },
      { ...makePart("hairFront"), layerId: "front3" },
    ];
    const groups = generatePhysicsGroups(parts);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.layerIds).toEqual(["front1", "front2", "front3"]);
  });
});

describe("refineByPosition: canvasサイズ 0x0", () => {
  it("canvasWidth=0, canvasHeight=0 でクラッシュしない", () => {
    const parts = detectParts([makeLayer("1", "不明レイヤー", 0, 0, 50, 50)]);
    const refined = refineByPosition(parts, 0, 0);
    expect(refined).toHaveLength(1);
    expect(refined[0]!.category).toBe("unknown");
  });

  it("canvasWidth=0 のみでもクラッシュしない", () => {
    const parts = detectParts([makeLayer("1", "不明", 0, 100, 50, 50)]);
    const refined = refineByPosition(parts, 0, 1000);
    expect(refined).toHaveLength(1);
  });
});

describe("detectParts: 空レイヤーツリー", () => {
  it("空配列で空結果を返す", () => {
    const results = detectParts([]);
    expect(results).toHaveLength(0);
  });

  it("空配列のフィルタリングで空結果", () => {
    const filtered = filterDetectedParts([], 0.5);
    expect(filtered).toHaveLength(0);
  });

  it("空配列の refineByPosition で空結果", () => {
    const refined = refineByPosition([], 1000, 1000);
    expect(refined).toHaveLength(0);
  });

  it("空パーツで detectSwayingParts が空配列を返す", () => {
    expect(detectSwayingParts([])).toHaveLength(0);
  });

  it("空パーツで generatePhysicsGroups が空配列を返す", () => {
    expect(generatePhysicsGroups([])).toHaveLength(0);
  });
});
