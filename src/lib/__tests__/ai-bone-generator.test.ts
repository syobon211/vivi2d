import { describe, expect, it } from "vitest";
import {
  generateAllBones,
  generateBodyBones,
  generateFaceBones,
} from "@/lib/ai-bone-generator";
import type { DetectedPart } from "@/lib/ai-part-detector";

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

describe("generateFaceBones", () => {
  it("最低限のヘッドボーンとパラメータを生成する", () => {
    const result = generateFaceBones([], 1000, 1000);
    expect(result.bones.some((b) => b.tempId === "bone_head")).toBe(true);
    expect(result.parameters.length).toBeGreaterThan(0);
    expect(result.parameters.some((p) => p.name === "Face X")).toBe(true);
  });

  it("目パーツがあるとき目ボーンを生成する", () => {
    const parts = [makePart("eyeLeft", 400, 200), makePart("eyeRight", 600, 200)];
    const result = generateFaceBones(parts, 1000, 1000);
    expect(result.bones.some((b) => b.tempId === "bone_eye_left")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_eye_right")).toBe(true);
  });

  it("口パーツがあるとき口ボーンを生成する", () => {
    const parts = [makePart("mouth", 500, 400)];
    const result = generateFaceBones(parts, 1000, 1000);
    expect(result.bones.some((b) => b.tempId === "bone_mouth")).toBe(true);
  });

  it("目ボーンは頭ボーンの子になる", () => {
    const parts = [makePart("eyeLeft", 400, 200)];
    const result = generateFaceBones(parts, 1000, 1000);
    const eyeBone = result.bones.find((b) => b.tempId === "bone_eye_left");
    expect(eyeBone?.parentTempId).toBe("bone_head");
  });

  it("顔パラメータにX/Y/Zが含まれる", () => {
    const result = generateFaceBones([], 1000, 1000);
    const faceParams = result.parameters.filter((p) => p.group === "Face");
    expect(faceParams).toHaveLength(3);
  });
});

describe("generateBodyBones", () => {
  it("体幹ボーンを生成する", () => {
    const result = generateBodyBones([], 1000, 1000);
    expect(result.bones.some((b) => b.tempId === "bone_body")).toBe(true);
  });

  it("腕パーツがあるとき腕ボーンを生成する", () => {
    const parts = [makePart("armLeft", 200, 400), makePart("armRight", 800, 400)];
    const result = generateBodyBones(parts, 1000, 1000);
    expect(result.bones.some((b) => b.tempId === "bone_arm_left")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_arm_right")).toBe(true);
  });

  it("腕ボーンは体ボーンの子になる", () => {
    const parts = [makePart("armLeft", 200, 400)];
    const result = generateBodyBones(parts, 1000, 1000);
    const armBone = result.bones.find((b) => b.tempId === "bone_arm_left");
    expect(armBone?.parentTempId).toBe("bone_body");
  });
});

describe("generateAllBones", () => {
  it("顔と体のボーンを統合する", () => {
    const parts = [
      makePart("head", 400, 100),
      makePart("body", 400, 500),
      makePart("eyeLeft", 350, 150),
      makePart("mouth", 400, 250),
    ];
    const result = generateAllBones(parts, 1000, 1000);
    expect(result.bones.some((b) => b.tempId === "bone_head")).toBe(true);
    expect(result.bones.some((b) => b.tempId === "bone_body")).toBe(true);
  });

  it("頭ボーンが体ボーンの子として接続される", () => {
    const result = generateAllBones([], 1000, 1000);
    const headBone = result.bones.find((b) => b.tempId === "bone_head");
    expect(headBone?.parentTempId).toBe("bone_body");
  });

  it("パラメータが重複なく統合される", () => {
    const result = generateAllBones([], 1000, 1000);
    expect(result.parameters.length).toBeGreaterThan(0);
  });

  it("全てのtempIdが一意である", () => {
    const parts = [
      makePart("head", 400, 100),
      makePart("body", 400, 500),
      makePart("eyeLeft", 350, 150),
      makePart("eyeRight", 450, 150),
      makePart("eyebrowLeft", 350, 120),
      makePart("eyebrowRight", 450, 120),
      makePart("mouth", 400, 250),
      makePart("armLeft", 200, 400),
      makePart("armRight", 600, 400),
    ];
    const result = generateAllBones(parts, 1000, 1000);
    const ids = result.bones.map((b) => b.tempId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ボーン配列の先頭がbodyグループである", () => {
    const result = generateAllBones([], 1000, 1000);
    expect(result.bones[0]!.tempId).toBe("bone_body");
  });

  it("ルートボーンがbone_bodyのみになる", () => {
    const result = generateAllBones([], 1000, 1000);
    const roots = result.bones.filter((b) => b.parentTempId === null);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.tempId).toBe("bone_body");
  });

  it("全パーツがある場合のボーン総数", () => {
    const parts = [
      makePart("head", 400, 100),
      makePart("body", 400, 500),
      makePart("eyeLeft", 350, 150),
      makePart("eyeRight", 450, 150),
      makePart("eyebrowLeft", 350, 120),
      makePart("eyebrowRight", 450, 120),
      makePart("mouth", 400, 250),
      makePart("armLeft", 200, 400),
      makePart("armRight", 600, 400),
    ];
    const result = generateAllBones(parts, 1000, 1000);
    // body, head, eye_left, eye_right, eyebrow_left, eyebrow_right, mouth, arm_left, arm_right
    expect(result.bones).toHaveLength(9);
  });

  it("全パーツの親子関係が正しい階層を形成する", () => {
    const parts = [
      makePart("head", 400, 100),
      makePart("body", 400, 500),
      makePart("eyeLeft", 350, 150),
      makePart("eyeRight", 450, 150),
      makePart("eyebrowLeft", 350, 120),
      makePart("eyebrowRight", 450, 120),
      makePart("mouth", 400, 250),
      makePart("armLeft", 200, 400),
      makePart("armRight", 600, 400),
    ];
    const result = generateAllBones(parts, 1000, 1000);

    const body = result.bones.find((b) => b.tempId === "bone_body")!;
    expect(body.parentTempId).toBeNull();

    const head = result.bones.find((b) => b.tempId === "bone_head")!;
    expect(head.parentTempId).toBe("bone_body");

    for (const id of [
      "bone_eye_left",
      "bone_eye_right",
      "bone_eyebrow_left",
      "bone_eyebrow_right",
      "bone_mouth",
    ]) {
      const bone = result.bones.find((b) => b.tempId === id)!;
      expect(bone.parentTempId).toBe("bone_head");
    }

    for (const id of ["bone_arm_left", "bone_arm_right"]) {
      const bone = result.bones.find((b) => b.tempId === id)!;
      expect(bone.parentTempId).toBe("bone_body");
    }
  });

  it("パーツ座標がボーン座標に反映される", () => {
    const parts = [
      makePart("head", 100, 50, 80, 60),
      makePart("body", 200, 300, 100, 200),
      makePart("eyeLeft", 110, 60, 20, 15),
    ];
    const result = generateAllBones(parts, 1000, 1000);

    const head = result.bones.find((b) => b.tempId === "bone_head")!;
    expect(head.x).toBe(140);
    expect(head.y).toBe(80);

    const body = result.bones.find((b) => b.tempId === "bone_body")!;
    expect(body.x).toBe(250);
    expect(body.y).toBe(400);

    const eyeL = result.bones.find((b) => b.tempId === "bone_eye_left")!;
    expect(eyeL.x).toBe(120);
    expect(eyeL.y).toBe(67.5);
  });

  it("パーツなしの場合キャンバス中心がデフォルト座標になる", () => {
    const result = generateAllBones([], 800, 600);

    const head = result.bones.find((b) => b.tempId === "bone_head")!;
    expect(head.x).toBe(400); // canvasWidth/2
    expect(head.y).toBe(150); // canvasHeight*0.25

    const body = result.bones.find((b) => b.tempId === "bone_body")!;
    expect(body.x).toBe(400);
    expect(body.y).toBe(300); // canvasHeight*0.5
  });

  it("左右対称のボーンがパーツに基づく正しいX座標を持つ", () => {
    const parts = [
      makePart("eyeLeft", 300, 100, 50, 30),
      makePart("eyeRight", 600, 100, 50, 30),
      makePart("armLeft", 100, 400, 80, 150),
      makePart("armRight", 700, 400, 80, 150),
    ];
    const result = generateAllBones(parts, 1000, 1000);

    const eyeL = result.bones.find((b) => b.tempId === "bone_eye_left")!;
    const eyeR = result.bones.find((b) => b.tempId === "bone_eye_right")!;
    expect(eyeL.x).toBeLessThan(eyeR.x);

    const armL = result.bones.find((b) => b.tempId === "bone_arm_left")!;
    const armR = result.bones.find((b) => b.tempId === "bone_arm_right")!;
    expect(armL.x).toBeLessThan(armR.x);
  });
});

describe("generateFaceBones — 追加テスト", () => {
  it("口ボーンは頭ボーンの子になる", () => {
    const parts = [makePart("mouth", 500, 400)];
    const result = generateFaceBones(parts, 1000, 1000);
    const mouth = result.bones.find((b) => b.tempId === "bone_mouth")!;
    expect(mouth.parentTempId).toBe("bone_head");
  });

  it("眉ボーンは頭ボーンの子になる", () => {
    const parts = [makePart("eyebrowLeft", 400, 120), makePart("eyebrowRight", 600, 120)];
    const result = generateFaceBones(parts, 1000, 1000);
    const browL = result.bones.find((b) => b.tempId === "bone_eyebrow_left")!;
    const browR = result.bones.find((b) => b.tempId === "bone_eyebrow_right")!;
    expect(browL.parentTempId).toBe("bone_head");
    expect(browR.parentTempId).toBe("bone_head");
  });

  it("頭ボーンのparentTempIdはnull（単体では）", () => {
    const result = generateFaceBones([], 1000, 1000);
    const head = result.bones.find((b) => b.tempId === "bone_head")!;
    expect(head.parentTempId).toBeNull();
  });

  it("パーツなしでもヘッドボーンはデフォルト座標で生成される", () => {
    const result = generateFaceBones([], 500, 400);
    const head = result.bones.find((b) => b.tempId === "bone_head")!;
    expect(head.x).toBe(250);
    expect(head.y).toBe(100);
  });

  it("目のみの場合、ボーン数はhead+目2個=最大3個", () => {
    const parts = [makePart("eyeLeft", 400, 200), makePart("eyeRight", 600, 200)];
    const result = generateFaceBones(parts, 1000, 1000);
    expect(result.bones).toHaveLength(3);
  });

  it("全顔パーツがある場合のボーン数", () => {
    const parts = [
      makePart("head", 400, 100),
      makePart("eyeLeft", 350, 150),
      makePart("eyeRight", 450, 150),
      makePart("eyebrowLeft", 350, 120),
      makePart("eyebrowRight", 450, 120),
      makePart("mouth", 400, 250),
    ];
    const result = generateFaceBones(parts, 1000, 1000);
    // head + eye_left + eye_right + eyebrow_left + eyebrow_right + mouth = 6
    expect(result.bones).toHaveLength(6);
  });

  it("パラメータはパーツの有無に関わらず常に生成される", () => {
    const resultEmpty = generateFaceBones([], 1000, 1000);
    const resultFull = generateFaceBones(
      [makePart("eyeLeft", 400, 200), makePart("mouth", 500, 400)],
      1000,
      1000,
    );
    expect(resultEmpty.parameters.length).toBe(resultFull.parameters.length);
  });
});

describe("generateBodyBones — 追加テスト", () => {
  it("体ボーンのparentTempIdはnull", () => {
    const result = generateBodyBones([], 1000, 1000);
    const body = result.bones.find((b) => b.tempId === "bone_body")!;
    expect(body.parentTempId).toBeNull();
  });

  it("パーツなしでも体ボーンはデフォルト座標で生成される", () => {
    const result = generateBodyBones([], 600, 800);
    const body = result.bones.find((b) => b.tempId === "bone_body")!;
    expect(body.x).toBe(300);
    expect(body.y).toBe(400);
  });

  it("腕なしの場合ボーン数は1（体のみ）", () => {
    const result = generateBodyBones([], 1000, 1000);
    expect(result.bones).toHaveLength(1);
  });

  it("両腕ありの場合ボーン数は3", () => {
    const parts = [makePart("armLeft", 200, 400), makePart("armRight", 800, 400)];
    const result = generateBodyBones(parts, 1000, 1000);
    expect(result.bones).toHaveLength(3);
  });

  it("片腕のみの場合ボーン数は2", () => {
    const parts = [makePart("armLeft", 200, 400)];
    const result = generateBodyBones(parts, 1000, 1000);
    expect(result.bones).toHaveLength(2);
  });

  it("パラメータはパーツの有無に関わらず常に生成される", () => {
    const resultEmpty = generateBodyBones([], 1000, 1000);
    const resultFull = generateBodyBones(
      [makePart("armLeft", 200, 400), makePart("armRight", 800, 400)],
      1000,
      1000,
    );
    expect(resultEmpty.parameters.length).toBe(resultFull.parameters.length);
  });
});
