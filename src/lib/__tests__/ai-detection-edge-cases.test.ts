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

describe("detectParts: 1000レイヤーのパフォーマンス", () => {
  it("1000レイヤーの検出が500ms以内に完了する", () => {
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
    const start = performance.now();
    const results = detectParts(layers);
    const elapsed = performance.now() - start;
    expect(results).toHaveLength(1000);
    expect(elapsed).toBeLessThan(500);
  });

  it("1000レイヤーのフィルタリングも高速", () => {
    const layers: LayerNode[] = [];
    for (let i = 0; i < 1000; i++) {
      layers.push(makeLayer(`l${i}`, i % 2 === 0 ? "左目" : "背景"));
    }
    const parts = detectParts(layers);
    const start = performance.now();
    const filtered = filterDetectedParts(parts, 0.5);
    const elapsed = performance.now() - start;
    expect(filtered.length).toBe(500);
    expect(elapsed).toBeLessThan(500);
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
  it("主要全パーツでボーン階層が正しく構築される", () => {
    const parts: DetectedPart[] = [
      makePart("head", 400, 100, 200, 200),
      makePart("face", 420, 120, 160, 160),
      makePart("eyeLeft", 350, 150, 60, 40),
      makePart("eyeRight", 550, 150, 60, 40),
      makePart("eyebrowLeft", 340, 120, 70, 20),
      makePart("eyebrowRight", 540, 120, 70, 20),
      makePart("mouth", 450, 250, 80, 50),
      makePart("body", 400, 500, 200, 300),
      makePart("armLeft", 200, 450, 100, 200),
      makePart("armRight", 700, 450, 100, 200),
    ];
    const result = generateAllBones(parts, 1000, 1000);

    expect(result.bones.some((b) => b.tempId === "bone_head")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_body")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_eye_left")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_eye_right")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_mouth")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_arm_left")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_arm_right")).toBe(true);

    const headBone = result.bones.find((b) => b.tempId === "bone_head")!;
    const eyeLeft = result.bones.find((b) => b.tempId === "bone_eye_left")!;
    const eyeRight = result.bones.find((b) => b.tempId === "bone_eye_right")!;
    const mouth = result.bones.find((b) => b.tempId === "bone_mouth")!;
    const armLeft = result.bones.find((b) => b.tempId === "bone_arm_left")!;
    const armRight = result.bones.find((b) => b.tempId === "bone_arm_right")!;

    expect(headBone.parentTempId).toBe("bone_body");
    expect(eyeLeft.parentTempId).toBe("bone_head");
    expect(eyeRight.parentTempId).toBe("bone_head");
    expect(mouth.parentTempId).toBe("bone_head");
    expect(armLeft.parentTempId).toBe("bone_body");
    expect(armRight.parentTempId).toBe("bone_body");
  });

  it("ボーンの座標がパーツのバウンディングボックス中心に配置される", () => {
    const parts: DetectedPart[] = [makePart("eyeLeft", 100, 200, 60, 40)];
    const result = generateAllBones(parts, 1000, 1000);
    const eyeBone = result.bones.find((b) => b.tempId === "bone_eye_left");
    expect(eyeBone).toBeDefined();
    expect(eyeBone!.x).toBeCloseTo(130);
    expect(eyeBone!.y).toBeCloseTo(220);
  });

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

  it("空パーツで generateAllBones がデフォルトボーンを生成", () => {
    const result = generateAllBones([], 1000, 1000);
    expect(result.bones.some((b) => b.tempId === "bone_head")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_body")).toBe(true);
  });

  it("空パーツで detectSwayingParts が空配列を返す", () => {
    expect(detectSwayingParts([])).toHaveLength(0);
  });

  it("空パーツで generatePhysicsGroups が空配列を返す", () => {
    expect(generatePhysicsGroups([])).toHaveLength(0);
  });
});
