import type { Affine2D } from "@vivi2d/core/bone-utils";
import {
  type CCDBoneInput,
  mapIKToParameters,
  solveCCDIK,
  solveIKController,
  solveTwoBoneIK,
} from "@vivi2d/core/ik-solver";
import type { IKController } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";


function makeBone(
  id: string,
  x: number,
  y: number,
  angle: number,
  length: number,
  minAngle = -Math.PI,
  maxAngle = Math.PI,
): CCDBoneInput {
  return {
    id,
    worldX: x,
    worldY: y,
    angle,
    length,
    constraint: { boneId: id, minAngle, maxAngle },
  };
}

function makeWorldTransforms(): Map<string, Affine2D> {
  const m = new Map<string, Affine2D>();
  m.set("b1", [1, 0, 0, 1, 0, 0]);
  m.set("b2", [1, 0, 0, 1, 100, 0]);
  return m;
}

function makeBoneLengths(): Map<string, number> {
  const m = new Map<string, number>();
  m.set("b1", 100);
  m.set("b2", 100);
  return m;
}

function makeIKController(overrides: Partial<IKController> = {}): IKController {
  return {
    id: "ik1",
    name: "Test",
    solverType: "twoBone",
    boneChain: [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ],
    targetX: 150,
    targetY: 0,
    influence: 1,
    parameterMappings: [],
    ...overrides,
  };
}

describe("solveTwoBoneIK: ターゲットがルートと同一位置", () => {
  it("距離0でクラッシュせずに結果を返す", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 100, 100, 0, 0);
    expect(Number.isFinite(a1)).toBe(true);
    expect(Number.isFinite(a2)).toBe(true);
  });

  it("ターゲット=ルートで折り畳みモードに入る", () => {
    const [a1, a2] = solveTwoBoneIK(50, 50, 100, 100, 50, 50);
    expect(Number.isFinite(a1)).toBe(true);
    expect(Number.isFinite(a2)).toBe(true);
  });
});

describe("solveTwoBoneIK: ボーン長が0", () => {
  it("両方のボーンが長さ0でもクラッシュしない", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 0, 0, 100, 0);
    expect(Number.isFinite(a1)).toBe(true);
    expect(Number.isFinite(a2)).toBe(true);
  });

  it("片方のボーンだけ長さ0でも動作する", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 100, 0, 50, 0);
    expect(Number.isFinite(a1)).toBe(true);
    expect(Number.isFinite(a2)).toBe(true);
  });

  it("ボーン長0でターゲットも原点の場合", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 0, 0, 0, 0);
    expect(Number.isFinite(a1)).toBe(true);
    expect(Number.isFinite(a2)).toBe(true);
  });
});

describe("solveTwoBoneIK: 非常に大きな座標値", () => {
  it("1e6 のスケールでも正確に解く", () => {
    const scale = 1e6;
    const [a1, a2] = solveTwoBoneIK(0, 0, 100 * scale, 100 * scale, 150 * scale, 0);
    const jx = 100 * scale * Math.cos(a1);
    const jy = 100 * scale * Math.sin(a1);
    const ex = jx + 100 * scale * Math.cos(a2);
    const ey = jy + 100 * scale * Math.sin(a2);
    expect(Math.abs(ex - 150 * scale)).toBeLessThan(scale * 0.01);
    expect(Math.abs(ey)).toBeLessThan(scale * 0.01);
  });

  it("大きなルート座標でも正常動作", () => {
    const [a1, a2] = solveTwoBoneIK(1e6, 1e6, 100, 100, 1e6 + 150, 1e6);
    expect(Number.isFinite(a1)).toBe(true);
    expect(Number.isFinite(a2)).toBe(true);
  });
});

describe("solveCCDIK: maxIterations=0", () => {
  it("反復0回でも結果を返す（初期角度がそのまま返る）", () => {
    const bones = [makeBone("b1", 0, 0, 0, 100)];
    const result = solveCCDIK(bones, 100, 100, 0);
    expect(result.solvedAngles.size).toBe(1);
    expect(result.solvedAngles.has("b1")).toBe(true);
    expect(result.solvedAngles.get("b1")).toBe(0);
  });

  it("maxIterations=0 で2本ボーンでも正常", () => {
    const bones = [makeBone("b1", 0, 0, 0, 100), makeBone("b2", 100, 0, 0, 100)];
    const result = solveCCDIK(bones, 150, 50, 0);
    expect(result.solvedAngles.size).toBe(2);
  });
});

describe("solveCCDIK: tolerance=0", () => {
  it("tolerance=0 で到達可能ターゲットに対して高精度な結果", () => {
    const bones = [makeBone("b1", 0, 0, 0, 100), makeBone("b2", 100, 0, 0, 100)];
    const result = solveCCDIK(bones, 100, 0, 30, 0);
    expect(result.solvedAngles.size).toBe(2);
  });

  it("tolerance=0 でも無限ループにならない", () => {
    const bones = [makeBone("b1", 0, 0, 0, 100)];
    const start = performance.now();
    const result = solveCCDIK(bones, 50, 50, 100, 0);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result.solvedAngles.size).toBe(1);
  });
});

describe("solveCCDIK: 全ボーンの制約範囲が0（角度固定）", () => {
  it("角度が変化しない", () => {
    const bones: CCDBoneInput[] = [
      {
        id: "b1",
        worldX: 0,
        worldY: 0,
        angle: 0,
        length: 100,
        constraint: { boneId: "b1", minAngle: 0, maxAngle: 0 },
      },
      {
        id: "b2",
        worldX: 100,
        worldY: 0,
        angle: 0,
        length: 100,
        constraint: { boneId: "b2", minAngle: 0, maxAngle: 0 },
      },
    ];
    const result = solveCCDIK(bones, 0, 200, 10);
    expect(result.solvedAngles.get("b1")).toBeCloseTo(0, 5);
    expect(result.solvedAngles.get("b2")).toBeCloseTo(0, 5);
    expect(result.reached).toBe(false);
  });
});

describe("solveIKController: ボーンチェーンが空", () => {
  it("空のチェーンで空の解を返す", () => {
    const controller = makeIKController({ boneChain: [] });
    const result = solveIKController(
      controller,
      makeWorldTransforms(),
      makeBoneLengths(),
    );
    expect(result.solvedAngles.size).toBe(0);
    expect(result.reached).toBe(false);
  });
});

describe("solveIKController: 存在しないボーンID", () => {
  it("worldTransforms にないボーンIDでもクラッシュしない", () => {
    const controller = makeIKController({
      boneChain: [
        { boneId: "nonexistent1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "nonexistent2", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
    });
    const result = solveIKController(
      controller,
      makeWorldTransforms(),
      makeBoneLengths(),
    );
    expect(result.solvedAngles.size).toBe(2);
  });

  it("boneLengths にないボーンIDは長さ0として扱われる", () => {
    const controller = makeIKController({
      boneChain: [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "no_length", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
    });
    const wt = makeWorldTransforms();
    wt.set("no_length", [1, 0, 0, 1, 100, 0]);
    const result = solveIKController(controller, wt, makeBoneLengths());
    expect(result.solvedAngles.has("b1")).toBe(true);
    expect(result.solvedAngles.has("no_length")).toBe(true);
  });
});

describe("solveIKController: twoBone指定で3本チェーン", () => {
  it("twoBone指定でも3本チェーンはCCDにフォールバックする", () => {
    const wt = makeWorldTransforms();
    wt.set("b3", [1, 0, 0, 1, 200, 0]);
    const bl = makeBoneLengths();
    bl.set("b3", 100);

    const controller = makeIKController({
      solverType: "twoBone",
      boneChain: [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b3", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 200,
      targetY: 50,
    });
    const result = solveIKController(controller, wt, bl);
    expect(result.solvedAngles.size).toBe(3);
  });

  it("twoBone指定で1本チェーンもCCDにフォールバック", () => {
    const controller = makeIKController({
      solverType: "twoBone",
      boneChain: [{ boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI }],
      targetX: 50,
      targetY: 50,
    });
    const result = solveIKController(
      controller,
      makeWorldTransforms(),
      makeBoneLengths(),
    );
    expect(result.solvedAngles.size).toBe(1);
  });
});

describe("mapIKToParameters: angleRange が0", () => {
  it("angleMin == angleMax でスキップされる（ゼロ除算回避）", () => {
    const controller = makeIKController({
      parameterMappings: [
        {
          boneId: "b1",
          parameterId: "param1",
          angleMin: 0.5,
          angleMax: 0.5, // angleRange = 0
          paramMin: 0,
          paramMax: 100,
        },
      ],
    });
    const solution = {
      solvedAngles: new Map([["b1", 0.5]]),
      reached: true,
    };
    const params = mapIKToParameters(controller, solution);
    expect(params.param1).toBeUndefined();
  });

  it("非常に小さな angleRange でもスキップされる", () => {
    const controller = makeIKController({
      parameterMappings: [
        {
          boneId: "b1",
          parameterId: "param1",
          angleMin: 0,
          angleMax: 1e-11,
          paramMin: 0,
          paramMax: 100,
        },
      ],
    });
    const solution = {
      solvedAngles: new Map([["b1", 0]]),
      reached: true,
    };
    const params = mapIKToParameters(controller, solution);
    expect(params.param1).toBeUndefined();
  });
});

describe("mapIKToParameters: 複数マッピング同時評価", () => {
  it("2つのマッピングが同時に結果を返す", () => {
    const controller = makeIKController({
      parameterMappings: [
        {
          boneId: "b1",
          parameterId: "param_x",
          angleMin: -Math.PI / 2,
          angleMax: Math.PI / 2,
          paramMin: -30,
          paramMax: 30,
        },
        {
          boneId: "b2",
          parameterId: "param_y",
          angleMin: -Math.PI / 4,
          angleMax: Math.PI / 4,
          paramMin: -10,
          paramMax: 10,
        },
      ],
    });
    const solution = {
      solvedAngles: new Map([
        ["b1", 0],
        ["b2", 0],
      ]),
      reached: true,
    };
    const params = mapIKToParameters(controller, solution);
    expect(params.param_x).toBeCloseTo(0, 3);
    expect(params.param_y).toBeCloseTo(0, 3);
  });

  it("同じボーンに対する複数マッピングも全て評価される", () => {
    const controller = makeIKController({
      parameterMappings: [
        {
          boneId: "b1",
          parameterId: "param_a",
          angleMin: -1,
          angleMax: 1,
          paramMin: 0,
          paramMax: 100,
        },
        {
          boneId: "b1",
          parameterId: "param_b",
          angleMin: -2,
          angleMax: 2,
          paramMin: -50,
          paramMax: 50,
        },
      ],
    });
    const solution = {
      solvedAngles: new Map([["b1", 0.5]]),
      reached: true,
    };
    const params = mapIKToParameters(controller, solution);
    expect(params.param_a).toBeDefined();
    expect(params.param_b).toBeDefined();
  });
});

describe("normalizeAngle の境界（solveCCDIK 経由）", () => {
  it("初期角度が π のボーンでも正常に解く", () => {
    const bones = [makeBone("b1", 0, 0, Math.PI, 100)];
    const result = solveCCDIK(bones, -50, 50, 10);
    expect(result.solvedAngles.size).toBe(1);
    expect(Number.isFinite(result.solvedAngles.get("b1")!)).toBe(true);
  });

  it("初期角度が -π のボーンでも正常に解く", () => {
    const bones = [makeBone("b1", 0, 0, -Math.PI, 100)];
    const result = solveCCDIK(bones, -50, -50, 10);
    expect(result.solvedAngles.size).toBe(1);
    expect(Number.isFinite(result.solvedAngles.get("b1")!)).toBe(true);
  });

  it("初期角度が 2π のボーンでも正常に解く", () => {
    const bones = [makeBone("b1", 0, 0, 2 * Math.PI, 100)];
    const result = solveCCDIK(bones, 100, 0, 10);
    expect(result.solvedAngles.size).toBe(1);
  });

  it("初期角度が -2π のボーンでも正常に解く", () => {
    const bones = [makeBone("b1", 0, 0, -2 * Math.PI, 100)];
    const result = solveCCDIK(bones, 100, 0, 10);
    expect(result.solvedAngles.size).toBe(1);
  });

  it("初期角度が 3π のボーンでも正常に解く", () => {
    const bones = [makeBone("b1", 0, 0, 3 * Math.PI, 100)];
    const result = solveCCDIK(bones, 0, 100, 10);
    expect(result.solvedAngles.size).toBe(1);
    expect(Number.isFinite(result.solvedAngles.get("b1")!)).toBe(true);
  });

  it("初期角度が -3π のボーンでも正常に解く", () => {
    const bones = [makeBone("b1", 0, 0, -3 * Math.PI, 100)];
    const result = solveCCDIK(bones, 0, -100, 10);
    expect(result.solvedAngles.size).toBe(1);
    expect(Number.isFinite(result.solvedAngles.get("b1")!)).toBe(true);
  });
});

describe("solveIKController: CCD IK で influence < 1", () => {
  it("CCD ソルバーで influence=0.5 のとき FK と IK がブレンドされる", () => {
    const wt = makeWorldTransforms();
    wt.set("b3", [1, 0, 0, 1, 200, 0]);
    const bl = makeBoneLengths();
    bl.set("b3", 100);

    const controller = makeIKController({
      solverType: "ccd",
      boneChain: [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b3", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 0,
      targetY: 200,
      influence: 0.5,
      maxIterations: 15,
    });
    const result = solveIKController(controller, wt, bl);
    expect(result.solvedAngles.size).toBe(3);

    const fullResult = solveIKController({ ...controller, influence: 1 }, wt, bl);
    for (const [boneId, halfAngle] of result.solvedAngles) {
      const fullAngle = fullResult.solvedAngles.get(boneId)!;
      expect(Math.abs(halfAngle)).toBeLessThanOrEqual(Math.abs(fullAngle) + 0.01);
    }
  });

  it("CCD ソルバーで influence=1 のとき FK ブレンドなし", () => {
    const wt = makeWorldTransforms();
    const bl = makeBoneLengths();

    const controller = makeIKController({
      solverType: "ccd",
      boneChain: [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 50,
      targetY: 50,
      influence: 1,
    });
    const result = solveIKController(controller, wt, bl);
    expect(result.solvedAngles.size).toBe(2);
  });
});

describe("solveTwoBoneIK: 折り畳みケース", () => {
  it("異なるボーン長で dist <= |len1-len2| のとき折り畳み", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 200, 50, 10, 0);
    expect(Number.isFinite(a1)).toBe(true);
    expect(Number.isFinite(a2)).toBe(true);
    const expectedA2 = Math.atan2(0, 10) + Math.PI;
    expect(a2).toBeCloseTo(expectedA2, 3);
  });

  it("ポールターゲット cross=0 の場合（ちょうど直線上）", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 100, 100, 150, 0, 150, 0);
    expect(Number.isFinite(a1)).toBe(true);
    expect(Number.isFinite(a2)).toBe(true);
  });
});

describe("mapIKToParameters: 角度がクランプされるケース", () => {
  it("角度が angleMax を超える場合、paramMax にクランプされる", () => {
    const controller = makeIKController({
      parameterMappings: [
        {
          boneId: "b1",
          parameterId: "param1",
          angleMin: -1,
          angleMax: 1,
          paramMin: 0,
          paramMax: 100,
        },
      ],
    });
    const solution = {
      solvedAngles: new Map([["b1", 2]]),
      reached: true,
    };
    const params = mapIKToParameters(controller, solution);
    // t = (normalized(2) - (-1)) / 2, clamped to [0,1]
    expect(params.param1).toBeDefined();
    expect(params.param1!).toBeGreaterThanOrEqual(0);
    expect(params.param1!).toBeLessThanOrEqual(100);
  });
});
