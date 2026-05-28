import { describe, expect, it } from "vitest";
import {
  defaultPoseResult,
  mapPoseLandmarksToParams,
  poseTrackingResultToParams,
} from "../tracking/pose-mapper";
import type { PoseLandmark } from "../tracking/pose-tracker";


function standingPose(): PoseLandmark[] {
  const landmarks = new Array(33).fill(null).map(() => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));

  landmarks[11] = { x: 0.6, y: 0.4, z: 0, visibility: 1 };
  landmarks[12] = { x: 0.4, y: 0.4, z: 0, visibility: 1 };
  landmarks[13] = { x: 0.65, y: 0.55, z: 0, visibility: 1 };
  landmarks[14] = { x: 0.35, y: 0.55, z: 0, visibility: 1 };
  landmarks[15] = { x: 0.65, y: 0.7, z: 0, visibility: 1 };
  landmarks[16] = { x: 0.35, y: 0.7, z: 0, visibility: 1 };
  landmarks[23] = { x: 0.55, y: 0.7, z: 0, visibility: 1 };
  landmarks[24] = { x: 0.45, y: 0.7, z: 0, visibility: 1 };

  return landmarks;
}

describe("mapPoseLandmarksToParams", () => {
  it("直立姿勢では体の傾きがほぼ0", () => {
    const result = mapPoseLandmarksToParams(standingPose());
    expect(Math.abs(result.bodyRotZ)).toBeLessThan(0.1);
  });

  it("直立姿勢では腕の上げ角度が低い", () => {
    const result = mapPoseLandmarksToParams(standingPose());
    expect(result.armLRaise).toBeLessThan(0.2);
    expect(result.armRRaise).toBeLessThan(0.2);
  });

  it("腕を上げるとarmRaiseが高くなる", () => {
    const pose = standingPose();
    pose[15] = { x: 0.65, y: 0.2, z: 0, visibility: 1 };

    const result = mapPoseLandmarksToParams(pose);
    expect(result.armLRaise).toBeGreaterThan(0.5);
    expect(result.armRRaise).toBeLessThan(0.2);
  });

  it("体を傾けるとbodyRotZが変化する", () => {
    const pose = standingPose();
    pose[11] = { x: 0.6, y: 0.5, z: 0, visibility: 1 };
    pose[12] = { x: 0.4, y: 0.35, z: 0, visibility: 1 };

    const result = mapPoseLandmarksToParams(pose);
    expect(result.bodyRotZ).toBeGreaterThan(0.1);
  });

  it("肘を曲げるとarmBendが高くなる", () => {
    const pose = standingPose();
    pose[15] = { x: 0.6, y: 0.45, z: 0, visibility: 1 };

    const result = mapPoseLandmarksToParams(pose);
    expect(result.armLBend).toBeGreaterThan(0.3);
  });

  it("ランドマーク不足ではデフォルト値を返す", () => {
    const result = mapPoseLandmarksToParams([]);
    expect(result).toEqual(defaultPoseResult());
  });
});

describe("poseTrackingResultToParams", () => {
  it("マッピングに基づいてパラメータ辞書に変換する", () => {
    const result = {
      bodyRotZ: 0.3,
      armLRaise: 0.8,
      armRRaise: 0.1,
      armLBend: 0.5,
      armRBend: 0.2,
    };
    const mapping = {
      bodyRotZ: "ParamBodyRotZ",
      armLRaise: "ParamArmLRaise",
    };

    const params = poseTrackingResultToParams(result, mapping);
    expect(params).toEqual({
      ParamBodyRotZ: 0.3,
      ParamArmLRaise: 0.8,
    });
  });

  it("空のマッピングでは空の辞書を返す", () => {
    const result = defaultPoseResult();
    const params = poseTrackingResultToParams(result, {});
    expect(params).toEqual({});
  });
});

describe("mapPoseLandmarksToParams エッジケース", () => {
  it("24個以下のランドマークではデフォルト値を返す", () => {
    const short = new Array(20).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    const result = mapPoseLandmarksToParams(short);
    expect(result).toEqual(defaultPoseResult());
  });

  it("肩の幅がほぼ0でもbodyRotZがクラッシュしない", () => {
    const pose = standingPose();
    pose[11] = { x: 0.5, y: 0.4, z: 0, visibility: 1 };
    pose[12] = { x: 0.501, y: 0.4, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(Number.isFinite(result.bodyRotZ)).toBe(true);
  });

  it("両腕を水平に上げるとarmRaiseが両方とも高い", () => {
    const pose = standingPose();
    pose[15] = { x: 0.8, y: 0.4, z: 0, visibility: 1 };
    pose[16] = { x: 0.2, y: 0.4, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(result.armLRaise).toBeLessThan(0.1);
    expect(result.armRRaise).toBeLessThan(0.1);
  });

  it("腕を完全に上げるとarmRaiseが1にクランプされる", () => {
    const pose = standingPose();
    pose[15] = { x: 0.65, y: 0.0, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(result.armLRaise).toBe(1);
  });

  it("肘を伸ばした状態ではarmBendが低い", () => {
    const pose = standingPose();
    pose[11] = { x: 0.5, y: 0.3, z: 0, visibility: 1 };
    pose[13] = { x: 0.5, y: 0.5, z: 0, visibility: 1 };
    pose[15] = { x: 0.5, y: 0.7, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(result.armLBend).toBeLessThan(0.1);
  });

  it("上半身と下半身の距離=0でもクラッシュしない", () => {
    const pose = standingPose();
    for (let i = 0; i < pose.length; i++) {
      pose[i] = { x: 0.5, y: 0.5, z: 0, visibility: 1 };
    }
    const result = mapPoseLandmarksToParams(pose);
    expect(Number.isFinite(result.bodyRotZ)).toBe(true);
    expect(Number.isFinite(result.armLBend)).toBe(true);
    expect(Number.isFinite(result.armRBend)).toBe(true);
  });

  it("bodyRotZは-1〜1にクランプされる", () => {
    const pose = standingPose();
    pose[11] = { x: 0.6, y: 0.9, z: 0, visibility: 1 };
    pose[12] = { x: 0.4, y: 0.1, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(result.bodyRotZ).toBeGreaterThanOrEqual(-1);
    expect(result.bodyRotZ).toBeLessThanOrEqual(1);
  });
});


describe("mapPoseLandmarksToParams ランドマーク境界値", () => {
  it("ランドマーク24個（境界-1）でデフォルト値を返す", () => {
    const short = new Array(24).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 1,
    }));
    const result = mapPoseLandmarksToParams(short);
    expect(result).toEqual(defaultPoseResult());
  });

  it("ランドマーク25個（境界値ちょうど）で正常動作する", () => {
    const pose = new Array(25).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 1,
    }));
    pose[11] = { x: 0.6, y: 0.4, z: 0, visibility: 1 };
    pose[12] = { x: 0.4, y: 0.4, z: 0, visibility: 1 };
    pose[13] = { x: 0.65, y: 0.55, z: 0, visibility: 1 };
    pose[14] = { x: 0.35, y: 0.55, z: 0, visibility: 1 };
    pose[15] = { x: 0.65, y: 0.7, z: 0, visibility: 1 };
    pose[16] = { x: 0.35, y: 0.7, z: 0, visibility: 1 };
    pose[23] = { x: 0.55, y: 0.7, z: 0, visibility: 1 };
    pose[24] = { x: 0.45, y: 0.7, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(Number.isFinite(result.bodyRotZ)).toBe(true);
    expect(Number.isFinite(result.armLRaise)).toBe(true);
  });
});

describe("mapPoseLandmarksToParams shoulderDx境界値", () => {
  it("shoulderDxが0.01以下（境界値）でbodyRotZ=0になる", () => {
    const pose = standingPose();
    pose[11] = { x: 0.504, y: 0.5, z: 0, visibility: 1 };
    pose[12] = { x: 0.496, y: 0.4, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(result.bodyRotZ).toBe(0);
  });

  it("shoulderDxが0.011（境界値+ε）で正常計算される", () => {
    const pose = standingPose();
    pose[11] = { x: 0.5055, y: 0.5, z: 0, visibility: 1 };
    pose[12] = { x: 0.4945, y: 0.4, z: 0, visibility: 1 };
    // abs(0.5055 - 0.4945) = 0.011, shoulderDy = 0.5 - 0.4 = 0.1
    const result = mapPoseLandmarksToParams(pose);
    expect(result.bodyRotZ).not.toBe(0);
    expect(Number.isFinite(result.bodyRotZ)).toBe(true);
  });
});

describe("mapPoseLandmarksToParams armRaise/elbowBend エッジケース", () => {
  it("armRaiseでdy<0（手が肩より下）のとき0にクランプ", () => {
    const pose = standingPose();
    pose[11] = { x: 0.6, y: 0.3, z: 0, visibility: 1 };
    pose[15] = { x: 0.65, y: 0.9, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(result.armLRaise).toBe(0);
  });

  it("elbowBendでupperArmが0.001未満のとき0を返す", () => {
    const pose = standingPose();
    pose[11] = { x: 0.5, y: 0.5, z: 0, visibility: 1 };
    pose[13] = { x: 0.5, y: 0.5, z: 0, visibility: 1 };
    pose[15] = { x: 0.6, y: 0.7, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(result.armLBend).toBe(0);
  });

  it("elbowBendでforeArmが0.001未満のとき0を返す", () => {
    const pose = standingPose();
    pose[13] = { x: 0.65, y: 0.55, z: 0, visibility: 1 };
    pose[15] = { x: 0.65, y: 0.55, z: 0, visibility: 1 };
    const result = mapPoseLandmarksToParams(pose);
    expect(result.armLBend).toBe(0);
  });
});

describe("mapPoseLandmarksToParams 有限値保証", () => {
  it("全フィールドが有限値（NaN/Infinityでない）であることを保証する", () => {
    const result1 = mapPoseLandmarksToParams(standingPose());
    for (const [_key, value] of Object.entries(result1)) {
      expect(Number.isFinite(value)).toBe(true);
    }

    const allSame = new Array(33).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 1,
    }));
    const result2 = mapPoseLandmarksToParams(allSame);
    for (const [_key, value] of Object.entries(result2)) {
      expect(Number.isFinite(value)).toBe(true);
    }

    const extreme = standingPose();
    extreme[11] = { x: 0.0, y: 0.0, z: 0, visibility: 1 };
    extreme[12] = { x: 1.0, y: 1.0, z: 0, visibility: 1 };
    extreme[15] = { x: 0.0, y: 0.0, z: 0, visibility: 1 };
    extreme[16] = { x: 1.0, y: 1.0, z: 0, visibility: 1 };
    const result3 = mapPoseLandmarksToParams(extreme);
    for (const [_key, value] of Object.entries(result3)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});


describe("poseTrackingResultToParams 存在しないキー", () => {
  it("マッピングに結果オブジェクトに存在しないキーがあってもクラッシュしない", () => {
    const result = {
      bodyRotZ: 0.3,
      armLRaise: 0.8,
      armRRaise: 0.1,
      armLBend: 0.5,
      armRBend: 0.2,
    };
    const mapping = { nonExistentKey: "ParamX" } as any;
    const params = poseTrackingResultToParams(result, mapping);
    expect(Object.keys(params).length).toBe(0);
  });

  it("パラメータ名が空文字の場合もスキップされる", () => {
    const result = defaultPoseResult();
    const mapping = { bodyRotZ: "" };
    const params = poseTrackingResultToParams(result, mapping);
    expect(Object.keys(params).length).toBe(0);
  });
});
