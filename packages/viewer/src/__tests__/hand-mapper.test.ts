import { describe, expect, it } from "vitest";
import {
  defaultHandResult,
  handTrackingResultToParams,
  mapHandDetectionsToParams,
} from "../tracking/hand-mapper";
import type { HandTrackingParameterMap } from "../tracking/hand-mapper";
import type { HandDetection } from "../tracking/hand-tracker";


function openHandLandmarks(): { x: number; y: number; z: number }[] {
  const wrist = { x: 0.5, y: 0.7, z: 0 };
  const landmarks = new Array(21).fill(null).map(() => ({ ...wrist }));

  landmarks[0] = { ...wrist };
  landmarks[1] = { x: 0.42, y: 0.65, z: 0 };
  landmarks[2] = { x: 0.38, y: 0.58, z: 0 };
  landmarks[3] = { x: 0.35, y: 0.5, z: 0 };
  landmarks[4] = { x: 0.32, y: 0.42, z: 0 }; // TIP
  landmarks[5] = { x: 0.45, y: 0.55, z: 0 };
  landmarks[6] = { x: 0.44, y: 0.45, z: 0 };
  landmarks[7] = { x: 0.43, y: 0.38, z: 0 };
  landmarks[8] = { x: 0.42, y: 0.3, z: 0 }; // TIP
  landmarks[9] = { x: 0.5, y: 0.53, z: 0 }; // MCP
  landmarks[10] = { x: 0.5, y: 0.43, z: 0 };
  landmarks[11] = { x: 0.5, y: 0.35, z: 0 };
  landmarks[12] = { x: 0.5, y: 0.27, z: 0 }; // TIP
  landmarks[13] = { x: 0.55, y: 0.55, z: 0 };
  landmarks[14] = { x: 0.56, y: 0.45, z: 0 };
  landmarks[15] = { x: 0.57, y: 0.38, z: 0 };
  landmarks[16] = { x: 0.58, y: 0.3, z: 0 }; // TIP
  landmarks[17] = { x: 0.6, y: 0.58, z: 0 };
  landmarks[18] = { x: 0.62, y: 0.5, z: 0 };
  landmarks[19] = { x: 0.63, y: 0.45, z: 0 };
  landmarks[20] = { x: 0.64, y: 0.38, z: 0 }; // TIP

  return landmarks;
}

function closedHandLandmarks(): { x: number; y: number; z: number }[] {
  const wrist = { x: 0.5, y: 0.7, z: 0 };
  const landmarks = new Array(21).fill(null).map(() => ({ ...wrist }));

  landmarks[0] = { ...wrist };
  landmarks[9] = { x: 0.5, y: 0.55, z: 0 };
  landmarks[4] = { x: 0.48, y: 0.62, z: 0 };
  landmarks[8] = { x: 0.47, y: 0.6, z: 0 };
  landmarks[12] = { x: 0.5, y: 0.58, z: 0 };
  landmarks[16] = { x: 0.53, y: 0.6, z: 0 };
  landmarks[20] = { x: 0.55, y: 0.62, z: 0 };

  return landmarks;
}

describe("mapHandDetectionsToParams", () => {
  it("開いた右手を検出した場合、grip値が低い", () => {
    const hands: HandDetection[] = [
      {
        landmarks: openHandLandmarks(),
        handedness: "Left",
      },
    ];
    const result = mapHandDetectionsToParams(hands);

    expect(result.handRGrip).toBeLessThan(0.3);
    expect(result.handLX).toBe(0);
    expect(result.handLY).toBe(0);
    expect(result.handLGrip).toBe(0);
  });

  it("握った手を検出した場合、grip値が高い", () => {
    const hands: HandDetection[] = [
      {
        landmarks: closedHandLandmarks(),
        handedness: "Right",
      },
    ];
    const result = mapHandDetectionsToParams(hands);

    expect(result.handLGrip).toBeGreaterThan(0.5);
  });

  it("両手検出で左右に正しく振り分ける", () => {
    const hands: HandDetection[] = [
      {
        landmarks: openHandLandmarks(),
        handedness: "Left",
      },
      {
        landmarks: closedHandLandmarks(),
        handedness: "Right",
      },
    ];
    const result = mapHandDetectionsToParams(hands);

    expect(result.handRGrip).toBeLessThan(0.3);
    expect(result.handLGrip).toBeGreaterThan(0.5);
  });

  it("手が未検出の場合はデフォルト値を返す", () => {
    const result = mapHandDetectionsToParams([]);
    expect(result).toEqual(defaultHandResult());
  });

  it("手の位置が正規化座標に変換される", () => {
    const landmarks = openHandLandmarks();
    landmarks[0] = { x: 0.8, y: 0.2, z: 0 };

    const hands: HandDetection[] = [{ landmarks, handedness: "Left" }];
    const result = mapHandDetectionsToParams(hands);

    expect(result.handRX).toBeCloseTo(0.6, 1);
    expect(result.handRY).toBeCloseTo(0.6, 1);
  });
});

describe("handTrackingResultToParams", () => {
  it("マッピングに基づいてパラメータ辞書に変換する", () => {
    const result = {
      handLX: 0.5,
      handLY: -0.3,
      handLGrip: 0.8,
      handRX: -0.2,
      handRY: 0.1,
      handRGrip: 0.1,
    };
    const mapping = {
      handLX: "ParamHandLX",
      handLGrip: "ParamHandLGrip",
    };

    const params = handTrackingResultToParams(result, mapping);
    expect(params).toEqual({
      ParamHandLX: 0.5,
      ParamHandLGrip: 0.8,
    });
  });

  it("空のマッピングでは空の辞書を返す", () => {
    const result = defaultHandResult();
    const params = handTrackingResultToParams(result, {});
    expect(params).toEqual({});
  });
});

describe("mapHandDetectionsToParams エッジケース", () => {
  it("全ランドマークが同一位置でもクラッシュしない（palmSize≈0）", () => {
    const landmarks = new Array(21).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    const hands: HandDetection[] = [{ landmarks, handedness: "Left" }];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handRGrip).toBe(0);
    expect(Number.isFinite(result.handRX)).toBe(true);
    expect(Number.isFinite(result.handRY)).toBe(true);
  });

  it("手首が画面左端(x=0)の場合、座標が-1になる", () => {
    const landmarks = openHandLandmarks();
    landmarks[0] = { x: 0.0, y: 0.5, z: 0 };
    const hands: HandDetection[] = [{ landmarks, handedness: "Right" }];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handLX).toBeCloseTo(-1.0, 1);
  });

  it("手首が画面右端(x=1)の場合、座標が+1になる", () => {
    const landmarks = openHandLandmarks();
    landmarks[0] = { x: 1.0, y: 0.5, z: 0 };
    const hands: HandDetection[] = [{ landmarks, handedness: "Right" }];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handLX).toBeCloseTo(1.0, 1);
  });

  it("grip値は0〜1にクランプされる", () => {
    const landmarks = openHandLandmarks();
    landmarks[4] = { x: 0.1, y: 0.1, z: 0 };
    landmarks[8] = { x: 0.2, y: 0.0, z: 0 };
    landmarks[12] = { x: 0.5, y: 0.0, z: 0 };
    landmarks[16] = { x: 0.8, y: 0.0, z: 0 };
    landmarks[20] = { x: 0.9, y: 0.1, z: 0 };
    const hands: HandDetection[] = [{ landmarks, handedness: "Left" }];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handRGrip).toBeGreaterThanOrEqual(0);
    expect(result.handRGrip).toBeLessThanOrEqual(1);
  });
});


describe("mapHandDetectionsToParams ランドマーク不足", () => {
  it("ランドマーク10個（21未満）の場合、デフォルト値が返る", () => {
    const landmarks = new Array(10).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    const hands: HandDetection[] = [{ landmarks, handedness: "Left" }];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handRX).toBe(0);
    expect(result.handRY).toBe(0);
    expect(result.handRGrip).toBe(0);
  });

  it("ランドマーク0個（空配列）の場合もデフォルト値が返る", () => {
    const hands: HandDetection[] = [{ landmarks: [], handedness: "Right" }];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handLX).toBe(0);
    expect(result.handLY).toBe(0);
    expect(result.handLGrip).toBe(0);
  });
});

describe("mapHandDetectionsToParams palmSize境界値", () => {
  it("palmSizeが正確に0.001以下の境界値でgripが0になる", () => {
    const landmarks = new Array(21).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    landmarks[0] = { x: 0.5, y: 0.5, z: 0 };
    landmarks[9] = { x: 0.5005, y: 0.5, z: 0 };
    const hands: HandDetection[] = [{ landmarks, handedness: "Left" }];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handRGrip).toBe(0);
  });
});

describe("mapHandDetectionsToParams 座標中央", () => {
  it("手首が画面中央(0.5, 0.5)の場合、x=0, y=0になる", () => {
    const landmarks = openHandLandmarks();
    landmarks[0] = { x: 0.5, y: 0.5, z: 0 };
    const hands: HandDetection[] = [{ landmarks, handedness: "Left" }];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handRX).toBeCloseTo(0, 5);
    expect(result.handRY).toBeCloseTo(0, 5);
  });
});

describe("mapHandDetectionsToParams 同一handedness上書き", () => {
  it("同じhandednessの手が2つ渡された場合、後の手で上書きされる", () => {
    const landmarks1 = openHandLandmarks();
    landmarks1[0] = { x: 0.9, y: 0.5, z: 0 };
    const landmarks2 = openHandLandmarks();
    landmarks2[0] = { x: 0.1, y: 0.5, z: 0 };

    const hands: HandDetection[] = [
      { landmarks: landmarks1, handedness: "Left" },
      { landmarks: landmarks2, handedness: "Left" },
    ];
    const result = mapHandDetectionsToParams(hands);
    expect(result.handRX).toBeCloseTo(-0.8, 1);
  });
});

describe("handTrackingResultToParams undefinedスキップ", () => {
  it("マッピングのparamNameがundefinedの場合スキップされる", () => {
    const result = {
      handLX: 0.5,
      handLY: -0.3,
      handLGrip: 0.8,
      handRX: -0.2,
      handRY: 0.1,
      handRGrip: 0.1,
    };
    const mapping: HandTrackingParameterMap = {
      handLX: undefined,
      handLGrip: "ParamHandLGrip",
    };
    const params = handTrackingResultToParams(result, mapping);
    expect(params).toEqual({
      ParamHandLGrip: 0.8,
    });
    expect("undefined" in params).toBe(false);
  });
});


describe("handTrackingResultToParams 存在しないキー", () => {
  it("マッピングに結果オブジェクトに存在しないキーがあってもクラッシュしない", () => {
    const result = {
      handLX: 0.5,
      handLY: -0.3,
      handLGrip: 0.8,
      handRX: -0.2,
      handRY: 0.1,
      handRGrip: 0.1,
    };
    const mapping = { nonExistentKey: "ParamX" } as any;
    const params = handTrackingResultToParams(result, mapping);
    expect(Object.keys(params).length).toBe(0);
  });

  it("パラメータ名が空文字の場合もスキップされる", () => {
    const result = {
      handLX: 0.5,
      handLY: -0.3,
      handLGrip: 0.8,
      handRX: -0.2,
      handRY: 0.1,
      handRGrip: 0.1,
    };
    const mapping = { handLX: "" } as any;
    const params = handTrackingResultToParams(result, mapping);
    expect(Object.keys(params).length).toBe(0);
  });
});
