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
    const result = generateFaceBones([], 500, 400);
    expect(result.bones).toHaveLength(1);
    expect(result.bones[0]).toMatchObject({
      tempId: "bone_head",
      parentTempId: null,
      x: 250,
      y: 100,
    });
    expect(
      result.parameters.filter((p) => p.group === "Face").map((p) => p.name),
    ).toEqual(["Face X", "Face Y", "Face Z"]);
    expect(result.parameters.length).toBeGreaterThan(0);
    expect(result.parameters.some((p) => p.name === "Face X")).toBe(true);
  });

  it("目パーツがあるとき目ボーンを生成する", () => {
    const parts = [makePart("eyeLeft", 400, 200), makePart("eyeRight", 600, 200)];
    const result = generateFaceBones(parts, 1000, 1000);
    expect(result.bones).toHaveLength(3);
    expect(result.bones.find((b) => b.tempId === "bone_eye_left")?.parentTempId).toBe(
      "bone_head",
    );
    expect(result.bones.find((b) => b.tempId === "bone_eye_right")?.parentTempId).toBe(
      "bone_head",
    );
  });

  it("口パーツがあるとき口ボーンを生成する", () => {
    const parts = [makePart("mouth", 500, 400)];
    const result = generateFaceBones(parts, 1000, 1000);
    expect(result.bones.find((b) => b.tempId === "bone_mouth")?.parentTempId).toBe(
      "bone_head",
    );
  });

  it("目ボーンは頭ボーンの子になる", () => {
    const parts = [makePart("eyeLeft", 400, 200)];
    const result = generateFaceBones(parts, 1000, 1000);
    expect(result.bones.map((b) => b.tempId)).toEqual(["bone_head", "bone_eye_left"]);
    const eyeBone = result.bones.find((b) => b.tempId === "bone_eye_left");
    expect(eyeBone?.parentTempId).toBe("bone_head");
  });
});

describe("generateBodyBones", () => {
  it("体幹ボーンを生成する", () => {
    const result = generateBodyBones([], 600, 800);
    expect(result.bones).toHaveLength(1);
    expect(result.bones[0]).toMatchObject({
      tempId: "bone_body",
      parentTempId: null,
      x: 300,
      y: 400,
    });
  });

  it("腕パーツがあるとき腕ボーンを生成する", () => {
    const parts = [makePart("armLeft", 200, 400), makePart("armRight", 800, 400)];
    const result = generateBodyBones(parts, 1000, 1000);
    expect(result.bones).toHaveLength(3);
    expect(result.bones.find((b) => b.tempId === "bone_arm_left")?.parentTempId).toBe(
      "bone_body",
    );
    expect(result.bones.find((b) => b.tempId === "bone_arm_right")?.parentTempId).toBe(
      "bone_body",
    );
  });

  it("腕ボーンは体ボーンの子になる", () => {
    const parts = [makePart("armLeft", 200, 400)];
    const result = generateBodyBones(parts, 1000, 1000);
    expect(result.bones.map((b) => b.tempId)).toEqual(["bone_body", "bone_arm_left"]);
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
    const result = generateAllBones([], 800, 600);
    expect(result.bones.map((b) => [b.tempId, b.parentTempId, b.x, b.y])).toEqual([
      ["bone_body", null, 400, 300],
      ["bone_head", "bone_body", 400, 150],
    ]);
    const headBone = result.bones.find((b) => b.tempId === "bone_head");
    expect(headBone?.parentTempId).toBe("bone_body");
    expect(result.parameters.length).toBeGreaterThan(0);
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

    expect(result.bones).toHaveLength(9);
    expect(new Set(result.bones.map((b) => b.tempId)).size).toBe(9);
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
  it("眉ボーンは頭ボーンの子になる", () => {
    const parts = [makePart("eyebrowLeft", 400, 120), makePart("eyebrowRight", 600, 120)];
    const result = generateFaceBones(parts, 1000, 1000);
    const browL = result.bones.find((b) => b.tempId === "bone_eyebrow_left")!;
    const browR = result.bones.find((b) => b.tempId === "bone_eyebrow_right")!;
    expect(browL.parentTempId).toBe("bone_head");
    expect(browR.parentTempId).toBe("bone_head");
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
