import type { Affine2D } from "@vivi2d/core/bone-utils";
import {
  buildCCDBoneInputs,
  type CCDBoneInput,
  mapIKToParameters,
  solveCCDIK,
  solveIKController,
  solveTwoBoneIK,
} from "@vivi2d/core/ik-solver";
import type { IKBoneConstraint, IKController } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

describe("solveTwoBoneIK", () => {
  it("到達可能な場合、エンドエフェクタがターゲットに近づく", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 100, 100, 150, 0);
    const jx = 100 * Math.cos(a1);
    const jy = 100 * Math.sin(a1);
    const ex = jx + 100 * Math.cos(a2);
    const ey = jy + 100 * Math.sin(a2);
    expect(ex).toBeCloseTo(150, 0);
    expect(ey).toBeCloseTo(0, 0);
  });

  it("完全に伸ばした場合（ターゲットが最大距離）", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 100, 100, 200, 0);
    expect(a1).toBeCloseTo(0, 3);
    expect(a2).toBeCloseTo(0, 3);
  });

  it("到達不能な場合（遠すぎ）、チェーンを伸ばす", () => {
    const [a1, a2] = solveTwoBoneIK(0, 0, 100, 100, 500, 0);
    expect(a1).toBeCloseTo(0, 3);
    expect(a2).toBeCloseTo(0, 3);
  });

  it("ポールターゲットで曲がる方向が変わる", () => {
    const [a1Up] = solveTwoBoneIK(0, 0, 100, 100, 150, 0, 0, -100);
    const [a1Down] = solveTwoBoneIK(0, 0, 100, 100, 150, 0, 0, 100);
    expect(a1Up).not.toBeCloseTo(a1Down, 1);
  });

  it("角度制約が適用される", () => {
    const constraints: [IKBoneConstraint, IKBoneConstraint] = [
      { boneId: "b1", minAngle: -0.1, maxAngle: 0.1 },
      { boneId: "b2", minAngle: -0.1, maxAngle: 0.1 },
    ];
    const [a1, a2] = solveTwoBoneIK(
      0,
      0,
      100,
      100,
      0,
      150,
      undefined,
      undefined,
      constraints,
    );
    expect(a1).toBeGreaterThanOrEqual(-0.1);
    expect(a1).toBeLessThanOrEqual(0.1);
    expect(a2).toBeGreaterThanOrEqual(-0.1);
    expect(a2).toBeLessThanOrEqual(0.1);
  });
});

describe("solveCCDIK", () => {
  function makeBone(
    id: string,
    x: number,
    y: number,
    angle: number,
    length: number,
  ): CCDBoneInput {
    return {
      id,
      worldX: x,
      worldY: y,
      angle,
      length,
      constraint: { boneId: id, minAngle: -Math.PI, maxAngle: Math.PI },
    };
  }

  it("単一ボーンでターゲットに向ける", () => {
    const bones = [makeBone("b1", 0, 0, 0, 100)];
    const result = solveCCDIK(bones, 100, 0);
    expect(result.reached).toBe(true);
    expect(result.solvedAngles.get("b1")).toBeCloseTo(0, 3);
  });

  it("2本チェーンで到達可能なターゲットに到達する", () => {
    const bones = [makeBone("b1", 0, 0, 0, 100), makeBone("b2", 100, 0, 0, 100)];
    const result = solveCCDIK(bones, 150, 50, 20);
    expect(result.reached).toBe(true);
  });

  it("3本チェーンでも動作する", () => {
    const bones = [
      makeBone("b1", 0, 0, 0, 80),
      makeBone("b2", 80, 0, 0, 80),
      makeBone("b3", 160, 0, 0, 80),
    ];
    const result = solveCCDIK(bones, 100, 100, 30);
    expect(result.solvedAngles.size).toBe(3);
  });

  it("到達不能なターゲットでは reached=false", () => {
    const bones = [makeBone("b1", 0, 0, 0, 50)];
    const result = solveCCDIK(bones, 1000, 1000, 5);
    expect(result.reached).toBe(false);
  });

  it("空のボーン配列で空の結果を返す", () => {
    const result = solveCCDIK([], 100, 100);
    expect(result.solvedAngles.size).toBe(0);
    expect(result.reached).toBe(false);
  });

  it("角度制約が適用される", () => {
    const bones: CCDBoneInput[] = [
      {
        id: "b1",
        worldX: 0,
        worldY: 0,
        angle: 0,
        length: 100,
        constraint: { boneId: "b1", minAngle: -0.2, maxAngle: 0.2 },
      },
    ];
    const result = solveCCDIK(bones, 0, 100, 10);
    const angle = result.solvedAngles.get("b1")!;
    expect(angle).toBeGreaterThanOrEqual(-0.2 - 0.001);
    expect(angle).toBeLessThanOrEqual(0.2 + 0.001);
  });
});

describe("solveIKController", () => {
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

  it("influence=0 の場合は空の解を返す", () => {
    const controller: IKController = {
      id: "ik1",
      name: "Test",
      solverType: "twoBone",
      boneChain: [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 150,
      targetY: 0,
      influence: 0,
      parameterMappings: [],
    };
    const result = solveIKController(
      controller,
      makeWorldTransforms(),
      makeBoneLengths(),
    );
    expect(result.solvedAngles.size).toBe(0);
  });

  it("twoBone ソルバーで正しく解く", () => {
    const controller: IKController = {
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
    };
    const result = solveIKController(
      controller,
      makeWorldTransforms(),
      makeBoneLengths(),
    );
    expect(result.solvedAngles.size).toBe(2);
    expect(result.solvedAngles.has("b1")).toBe(true);
    expect(result.solvedAngles.has("b2")).toBe(true);
  });

  it("CCD ソルバーにフォールバックする（3本以上のチェーン）", () => {
    const wt = makeWorldTransforms();
    wt.set("b3", [1, 0, 0, 1, 200, 0]);
    const bl = makeBoneLengths();
    bl.set("b3", 100);

    const controller: IKController = {
      id: "ik1",
      name: "Test",
      solverType: "ccd",
      boneChain: [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b3", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 200,
      targetY: 50,
      influence: 1,
      maxIterations: 15,
      parameterMappings: [],
    };
    const result = solveIKController(controller, wt, bl);
    expect(result.solvedAngles.size).toBe(3);
  });

  it("influence が部分的な場合、FK角度とブレンドされる", () => {
    const controller: IKController = {
      id: "ik1",
      name: "Test",
      solverType: "twoBone",
      boneChain: [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 0,
      targetY: 150,
      influence: 0.5,
      parameterMappings: [],
    };
    const full = solveIKController(
      { ...controller, influence: 1 },
      makeWorldTransforms(),
      makeBoneLengths(),
    );
    const half = solveIKController(controller, makeWorldTransforms(), makeBoneLengths());

    const fullAngle1 = full.solvedAngles.get("b1")!;
    const halfAngle1 = half.solvedAngles.get("b1")!;
    expect(Math.abs(halfAngle1)).toBeLessThan(Math.abs(fullAngle1) + 0.01);
  });
});

describe("buildCCDBoneInputs", () => {
  it("ボーンチェーンからCCDBoneInput配列を構築する", () => {
    const controller: IKController = {
      id: "ik1",
      name: "Test",
      solverType: "ccd",
      boneChain: [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -1, maxAngle: 1 },
      ],
      targetX: 0,
      targetY: 0,
      influence: 1,
      parameterMappings: [],
    };
    const wt = new Map<string, Affine2D>();
    wt.set("b1", [1, 0, 0, 1, 10, 20]);
    wt.set("b2", [0, 1, -1, 0, 30, 40]);

    const bl = new Map<string, number>();
    bl.set("b1", 100);
    bl.set("b2", 50);

    const inputs = buildCCDBoneInputs(controller, wt, bl);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.id).toBe("b1");
    expect(inputs[0]!.worldX).toBe(10);
    expect(inputs[0]!.worldY).toBe(20);
    expect(inputs[0]!.length).toBe(100);
    expect(inputs[1]!.id).toBe("b2");
    expect(inputs[1]!.worldX).toBe(30);
    expect(inputs[1]!.worldY).toBe(40);
    expect(inputs[1]!.angle).toBeCloseTo(Math.PI / 2, 3);
    expect(inputs[1]!.length).toBe(50);
  });

  it("worldTransforms にないボーンIDは座標0/角度0にフォールバックする", () => {
    const controller: IKController = {
      id: "ik1",
      name: "Test",
      solverType: "ccd",
      boneChain: [{ boneId: "missing", minAngle: -Math.PI, maxAngle: Math.PI }],
      targetX: 0,
      targetY: 0,
      influence: 1,
      parameterMappings: [],
    };
    const wt = new Map<string, Affine2D>();
    const bl = new Map<string, number>();

    const inputs = buildCCDBoneInputs(controller, wt, bl);
    expect(inputs[0]!.worldX).toBe(0);
    expect(inputs[0]!.worldY).toBe(0);
    expect(inputs[0]!.angle).toBe(0);
    expect(inputs[0]!.length).toBe(0);
  });
});

describe("mapIKToParameters", () => {
  it("IK解角度をパラメータ値にマッピングする", () => {
    const controller: IKController = {
      id: "ik1",
      name: "Test",
      solverType: "twoBone",
      boneChain: [],
      targetX: 0,
      targetY: 0,
      influence: 1,
      parameterMappings: [
        {
          boneId: "b1",
          parameterId: "param_head_x",
          angleMin: -Math.PI / 2,
          angleMax: Math.PI / 2,
          paramMin: -30,
          paramMax: 30,
        },
      ],
    };

    const solution = {
      solvedAngles: new Map([["b1", 0]]),
      reached: true,
    };

    const params = mapIKToParameters(controller, solution);
    expect(params.param_head_x).toBeCloseTo(0, 3);
  });

  it("角度が最小値のときparamMinを返す", () => {
    const controller: IKController = {
      id: "ik1",
      name: "Test",
      solverType: "twoBone",
      boneChain: [],
      targetX: 0,
      targetY: 0,
      influence: 1,
      parameterMappings: [
        {
          boneId: "b1",
          parameterId: "p1",
          angleMin: -1,
          angleMax: 1,
          paramMin: 0,
          paramMax: 100,
        },
      ],
    };

    const solution = {
      solvedAngles: new Map([["b1", -1]]),
      reached: true,
    };

    const params = mapIKToParameters(controller, solution);
    expect(params.p1).toBeCloseTo(0, 3);
  });

  it("対応するボーンIDがない場合はスキップする", () => {
    const controller: IKController = {
      id: "ik1",
      name: "Test",
      solverType: "twoBone",
      boneChain: [],
      targetX: 0,
      targetY: 0,
      influence: 1,
      parameterMappings: [
        {
          boneId: "nonexistent",
          parameterId: "p1",
          angleMin: -1,
          angleMax: 1,
          paramMin: 0,
          paramMax: 100,
        },
      ],
    };

    const solution = {
      solvedAngles: new Map<string, number>(),
      reached: false,
    };

    const params = mapIKToParameters(controller, solution);
    expect(params.p1).toBeUndefined();
  });
});
