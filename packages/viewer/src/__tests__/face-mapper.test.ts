import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRACKING_MAP,
  type FaceTrackingResult,
  type Landmark,
  mapLandmarksToParams,
  trackingResultToParams,
} from "../tracking/face-mapper";


const LM = {
  LEFT_EYE_UPPER: 159,
  LEFT_EYE_LOWER: 145,
  RIGHT_EYE_UPPER: 386,
  RIGHT_EYE_LOWER: 374,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 362,
  MOUTH_UPPER: 13,
  MOUTH_LOWER: 14,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  NOSE_TIP: 1,
  CHIN: 152,
  FOREHEAD: 10,
  LEFT_BROW: 105,
  RIGHT_BROW: 334,
  FACE_LEFT: 234,
  FACE_RIGHT: 454,
} as const;

function createLandmarks(
  overrides: Partial<Record<number, Partial<Landmark>>> = {},
): Landmark[] {
  const base: Landmark[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));

  base[LM.FOREHEAD] = { x: 0.5, y: 0.25, z: 0 };
  base[LM.CHIN] = { x: 0.5, y: 0.75, z: 0 };

  base[LM.FACE_LEFT] = { x: 0.3, y: 0.5, z: 0 };
  base[LM.FACE_RIGHT] = { x: 0.7, y: 0.5, z: 0 };

  base[LM.NOSE_TIP] = { x: 0.5, y: 0.5, z: 0 };

  base[LM.LEFT_EYE_OUTER] = { x: 0.35, y: 0.4, z: 0 };
  base[LM.LEFT_EYE_INNER] = { x: 0.41, y: 0.4, z: 0 };
  base[LM.LEFT_EYE_UPPER] = { x: 0.38, y: 0.385, z: 0 };
  base[LM.LEFT_EYE_LOWER] = { x: 0.38, y: 0.415, z: 0 };

  base[LM.RIGHT_EYE_OUTER] = { x: 0.65, y: 0.4, z: 0 };
  base[LM.RIGHT_EYE_INNER] = { x: 0.59, y: 0.4, z: 0 };
  base[LM.RIGHT_EYE_UPPER] = { x: 0.62, y: 0.385, z: 0 };
  base[LM.RIGHT_EYE_LOWER] = { x: 0.62, y: 0.415, z: 0 };

  base[LM.MOUTH_UPPER] = { x: 0.5, y: 0.6, z: 0 };
  base[LM.MOUTH_LOWER] = { x: 0.5, y: 0.605, z: 0 };
  base[LM.MOUTH_LEFT] = { x: 0.46, y: 0.6, z: 0 };
  base[LM.MOUTH_RIGHT] = { x: 0.54, y: 0.6, z: 0 };

  base[LM.LEFT_BROW] = { x: 0.38, y: 0.34, z: 0 };
  base[LM.RIGHT_BROW] = { x: 0.62, y: 0.34, z: 0 };

  for (const [idx, patch] of Object.entries(overrides)) {
    const i = Number(idx);
    base[i] = { ...base[i], ...patch };
  }

  return base;
}


describe("mapLandmarksToParams", () => {
  it("正面を向いた標準的な顔 → 目が開き、口が閉じ、回転ほぼ0", () => {
    const landmarks = createLandmarks();
    const result = mapLandmarksToParams(landmarks);

    expect(result.eyeOpenLeft).toBeGreaterThan(0.5);
    expect(result.eyeOpenRight).toBeGreaterThan(0.5);

    expect(result.mouthOpen).toBeLessThan(0.2);

    expect(result.headRotationX).toBeCloseTo(0, 0);
    expect(result.headRotationY).toBeCloseTo(0, 1);
    expect(result.headRotationZ).toBeCloseTo(0, 1);
  });

  it("目を閉じた状態（上瞼と下瞼が近い）→ eyeOpen ≈ 0", () => {
    const landmarks = createLandmarks({
      [LM.LEFT_EYE_UPPER]: { x: 0.38, y: 0.4, z: 0 },
      [LM.LEFT_EYE_LOWER]: { x: 0.38, y: 0.403, z: 0 },
      [LM.RIGHT_EYE_UPPER]: { x: 0.62, y: 0.4, z: 0 },
      [LM.RIGHT_EYE_LOWER]: { x: 0.62, y: 0.403, z: 0 },
    });
    const result = mapLandmarksToParams(landmarks);

    expect(result.eyeOpenLeft).toBeLessThan(0.15);
    expect(result.eyeOpenRight).toBeLessThan(0.15);
  });

  it("口を大きく開けた状態 → mouthOpen ≈ 1", () => {
    const landmarks = createLandmarks({
      [LM.MOUTH_UPPER]: { x: 0.5, y: 0.55, z: 0 },
      [LM.MOUTH_LOWER]: { x: 0.5, y: 0.7, z: 0 },
    });
    const result = mapLandmarksToParams(landmarks);

    expect(result.mouthOpen).toBeCloseTo(1, 0);
  });

  it("顔の高さが0に近い（異常値）→ デフォルト値を返す", () => {
    const landmarks = createLandmarks({
      [LM.FOREHEAD]: { x: 0.5, y: 0.5, z: 0 },
      [LM.CHIN]: { x: 0.5, y: 0.5005, z: 0 },
    });
    const result = mapLandmarksToParams(landmarks);

    expect(result.eyeOpenLeft).toBe(1);
    expect(result.eyeOpenRight).toBe(1);
    expect(result.mouthOpen).toBe(0);
    expect(result.mouthWidth).toBe(0.5);
    expect(result.headRotationX).toBe(0);
    expect(result.headRotationY).toBe(0);
    expect(result.headRotationZ).toBe(0);
    expect(result.browLeftY).toBe(0);
    expect(result.browRightY).toBe(0);
  });

  it("全ランドマークが同一位置（退化ケース）→ クラッシュしない", () => {
    const landmarks = Array.from({ length: 478 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    const result = mapLandmarksToParams(landmarks);

    expect(result).toBeDefined();
    expect(result.eyeOpenLeft).toBe(1);
    expect(result.eyeOpenRight).toBe(1);
    expect(result.mouthOpen).toBe(0);
  });
});


const SAMPLE_RESULT: FaceTrackingResult = {
  eyeOpenLeft: 0.8,
  eyeOpenRight: 0.9,
  mouthOpen: 0.5,
  mouthWidth: 0.6,
  headRotationX: 0.1,
  headRotationY: -0.2,
  headRotationZ: 0.05,
  browLeftY: 0.3,
  browRightY: -0.1,
};

describe("trackingResultToParams", () => {
  it("デフォルトマッピング → 正しいパラメータ名で値が返る", () => {
    const params = trackingResultToParams(SAMPLE_RESULT);

    expect(params["vivi.eye.leftOpen"]).toBe(0.8);
    expect(params["vivi.eye.rightOpen"]).toBe(0.9);
    expect(params["vivi.mouth.open"]).toBe(0.5);
    expect(params["vivi.mouth.width"]).toBe(0.6);
    expect(params["vivi.head.pitch"]).toBe(0.1);
    expect(params["vivi.head.yaw"]).toBe(-0.2);
    expect(params["vivi.head.roll"]).toBe(0.05);
    expect(params["vivi.brow.leftY"]).toBe(0.3);
    expect(params["vivi.brow.rightY"]).toBe(-0.1);
  });

  it("カスタムマッピング → カスタム名で返る", () => {
    const customMap = {
      eyeOpenLeft: "CustomEyeL",
      mouthOpen: "CustomMouth",
    };
    const params = trackingResultToParams(SAMPLE_RESULT, customMap);

    expect(params.CustomEyeL).toBe(0.8);
    expect(params.CustomMouth).toBe(0.5);
    expect(params["vivi.eye.rightOpen"]).toBeUndefined();
    expect(params["vivi.head.pitch"]).toBeUndefined();
  });

  it("マッピングにundefinedがある → そのキーはスキップ", () => {
    const partialMap = {
      eyeOpenLeft: "ParamEyeL",
      eyeOpenRight: undefined,
      mouthOpen: "ParamMouth",
    };
    const params = trackingResultToParams(SAMPLE_RESULT, partialMap);

    expect(params.ParamEyeL).toBe(0.8);
    expect(params.ParamMouth).toBe(0.5);
    expect(Object.keys(params)).not.toContain("undefined");
    expect(Object.keys(params)).toHaveLength(2);
  });

  it("空のマッピング → 空のRecord", () => {
    const params = trackingResultToParams(SAMPLE_RESULT, {});

    expect(Object.keys(params)).toHaveLength(0);
  });
});


describe("DEFAULT_TRACKING_MAP", () => {
  it("期待するすべてのキーが存在する", () => {
    const expectedKeys = [
      "eyeOpenLeft",
      "eyeOpenRight",
      "mouthOpen",
      "mouthWidth",
      "headRotationX",
      "headRotationY",
      "headRotationZ",
      "browLeftY",
      "browRightY",
    ];
    for (const key of expectedKeys) {
      expect(DEFAULT_TRACKING_MAP).toHaveProperty(key);
      expect(typeof DEFAULT_TRACKING_MAP[key as keyof typeof DEFAULT_TRACKING_MAP]).toBe(
        "string",
      );
    }
  });
});


describe("mapLandmarksToParams ブランチカバレッジ", () => {
  it("eyeWidth < 0.001 で 1 を返す（computeEyeOpen ゼロ除算防止）", () => {
    const landmarks = createLandmarks({
      [LM.LEFT_EYE_OUTER]: { x: 0.38, y: 0.4, z: 0 },
      [LM.LEFT_EYE_INNER]: { x: 0.38, y: 0.4, z: 0 },
      [LM.RIGHT_EYE_OUTER]: { x: 0.62, y: 0.4, z: 0 },
      [LM.RIGHT_EYE_INNER]: { x: 0.62, y: 0.4, z: 0 },
    });
    const result = mapLandmarksToParams(landmarks);

    expect(result.eyeOpenLeft).toBe(1);
    expect(result.eyeOpenRight).toBe(1);
  });

  it("faceWidth < 0.001 で headRotationY = 0 になる", () => {
    const landmarks = createLandmarks({
      [LM.FACE_LEFT]: { x: 0.5, y: 0.5, z: 0 },
      [LM.FACE_RIGHT]: { x: 0.5, y: 0.5, z: 0 },
    });
    const result = mapLandmarksToParams(landmarks);

    expect(result.headRotationY).toBe(0);
  });

  it("faceHeight < 0.001 でデフォルト結果を返す（ゼロ除算防止）", () => {
    const landmarks = createLandmarks({
      [LM.FOREHEAD]: { x: 0.5, y: 0.5, z: 0 },
      [LM.CHIN]: { x: 0.5, y: 0.5, z: 0 },
    });
    const result = mapLandmarksToParams(landmarks);

    expect(result.eyeOpenLeft).toBe(1);
    expect(result.eyeOpenRight).toBe(1);
    expect(result.mouthOpen).toBe(0);
    expect(result.mouthWidth).toBe(0.5);
    expect(result.headRotationX).toBe(0);
    expect(result.headRotationY).toBe(0);
    expect(result.headRotationZ).toBe(0);
    expect(result.browLeftY).toBe(0);
    expect(result.browRightY).toBe(0);
  });
});


describe("trackingResultToParams 存在しないキー", () => {
  it("マッピングに結果オブジェクトに存在しないキーがあってもクラッシュしない", () => {
    const result: FaceTrackingResult = {
      eyeOpenLeft: 0.8,
      eyeOpenRight: 0.9,
      mouthOpen: 0.5,
      mouthWidth: 0.6,
      headRotationX: 0.1,
      headRotationY: -0.2,
      headRotationZ: 0.05,
      browLeftY: 0.3,
      browRightY: -0.1,
    };
    const mapping = { nonExistentKey: "ParamX" } as any;
    const params = trackingResultToParams(result, mapping);
    expect(Object.keys(params).length).toBe(0);
  });

  it("パラメータ名が空文字の場合もスキップされる", () => {
    const result: FaceTrackingResult = {
      eyeOpenLeft: 0.8,
      eyeOpenRight: 0.9,
      mouthOpen: 0.5,
      mouthWidth: 0.6,
      headRotationX: 0.1,
      headRotationY: -0.2,
      headRotationZ: 0.05,
      browLeftY: 0.3,
      browRightY: -0.1,
    };
    const mapping = { eyeOpenLeft: "" };
    const params = trackingResultToParams(result, mapping);
    expect(Object.keys(params).length).toBe(0);
  });
});
