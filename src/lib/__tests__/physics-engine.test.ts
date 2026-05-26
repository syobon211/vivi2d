import { PHYSICS_DEFAULTS } from "@vivi2d/core/constants";
import {
  computeInputForces,
  computeOutputValues,
  createDefaultPendulum,
  createPhysicsRuntimeState,
  resetPendulumStates,
  runPhysicsFrame,
  stepPhysicsGroup,
} from "@vivi2d/core/physics-engine";
import type {
  ParameterDefinition,
  PendulumState,
  PhysicsGroup,
  PhysicsInput,
  PhysicsOutput,
} from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";


function createTestGroup(overrides: Partial<PhysicsGroup> = {}): PhysicsGroup {
  return {
    id: "test-group",
    name: "テスト物理グループ",
    enabled: true,
    pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
    inputs: [],
    outputs: [],
    gravityDirection: 0,
    gravityStrength: 9.8,
    wind: 0,
    ...overrides,
  };
}

// ============================================================
// createPhysicsRuntimeState
// ============================================================

describe("createPhysicsRuntimeState", () => {
  it("振り子の数だけ状態を生成する", () => {
    const group = createTestGroup({
      pendulums: [
        { length: 1, mass: 1, damping: 0.05 },
        { length: 0.8, mass: 0.5, damping: 0.1 },
        { length: 0.6, mass: 0.3, damping: 0.15 },
      ],
    });
    const states = createPhysicsRuntimeState(group);
    expect(states).toHaveLength(3);
  });

  it("初期状態は angle=0, angularVelocity=0", () => {
    const group = createTestGroup();
    const states = createPhysicsRuntimeState(group);
    expect(states[0]!).toEqual({ angle: 0, angularVelocity: 0 });
  });

  it("振り子がない場合は空配列を返す", () => {
    const group = createTestGroup({ pendulums: [] });
    const states = createPhysicsRuntimeState(group);
    expect(states).toEqual([]);
  });
});

// ============================================================
// computeInputForces
// ============================================================

describe("computeInputForces", () => {
  it("パラメータ変化なしではゼロ力を返す", () => {
    const inputs: PhysicsInput[] = [{ parameterId: "p1", weight: 1, type: "x" }];
    const values = { p1: 5 };
    const result = computeInputForces(inputs, values, values);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("X方向の入力を正しく計算する", () => {
    const inputs: PhysicsInput[] = [{ parameterId: "p1", weight: 2, type: "x" }];
    const result = computeInputForces(inputs, { p1: 10 }, { p1: 5 });
    expect(result).toEqual({ x: 10, y: 0 });
  });

  it("Y方向の入力を正しく計算する", () => {
    const inputs: PhysicsInput[] = [{ parameterId: "p1", weight: 3, type: "y" }];
    const result = computeInputForces(inputs, { p1: 4 }, { p1: 2 });
    expect(result).toEqual({ x: 0, y: 6 });
  });

  it("angle タイプはX方向に変換される", () => {
    const inputs: PhysicsInput[] = [{ parameterId: "p1", weight: 1, type: "angle" }];
    const result = computeInputForces(inputs, { p1: 3 }, { p1: 1 });
    expect(result).toEqual({ x: 2, y: 0 });
  });

  it("複数入力を合算する", () => {
    const inputs: PhysicsInput[] = [
      { parameterId: "p1", weight: 1, type: "x" },
      { parameterId: "p2", weight: 1, type: "x" },
      { parameterId: "p3", weight: 1, type: "y" },
    ];
    const current = { p1: 5, p2: 3, p3: 7 };
    const previous = { p1: 2, p2: 1, p3: 4 };
    const result = computeInputForces(inputs, current, previous);
    expect(result).toEqual({ x: 5, y: 3 });
  });

  it("存在しないパラメータはゼロとして扱う", () => {
    const inputs: PhysicsInput[] = [{ parameterId: "missing", weight: 1, type: "x" }];
    const result = computeInputForces(inputs, {}, {});
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("weight がゼロだと力もゼロ", () => {
    const inputs: PhysicsInput[] = [{ parameterId: "p1", weight: 0, type: "x" }];
    const result = computeInputForces(inputs, { p1: 100 }, { p1: 0 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("負の weight で逆方向の力を生成する", () => {
    const inputs: PhysicsInput[] = [{ parameterId: "p1", weight: -2, type: "x" }];
    const result = computeInputForces(inputs, { p1: 5 }, { p1: 3 });
    expect(result).toEqual({ x: -4, y: 0 });
  });

  it("空の入力リストではゼロ力を返す", () => {
    const result = computeInputForces([], { p1: 100 }, { p1: 0 });
    expect(result).toEqual({ x: 0, y: 0 });
  });
});

// ============================================================
// stepPhysicsGroup
// ============================================================

describe("stepPhysicsGroup", () => {
  it("重力下で振り子が動く", () => {
    const group = createTestGroup({ gravityStrength: 9.8, gravityDirection: 0 });
    const states: PendulumState[] = [{ angle: 0.1, angularVelocity: 0 }];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 120);
    expect(states[0]!.angularVelocity).not.toBe(0);
  });

  it("角度ゼロ・外力なしでは静止を維持する", () => {
    const group = createTestGroup({ gravityStrength: 0, wind: 0 });
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 0 }];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 120);
    expect(states[0]!.angle).toBe(0);
    expect(states[0]!.angularVelocity).toBe(0);
  });

  it("外力が最初の振り子にトルクを与える", () => {
    const group = createTestGroup({ gravityStrength: 0 });
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 0 }];
    stepPhysicsGroup(group, states, { x: 10, y: 0 }, 1 / 120);
    expect(states[0]!.angularVelocity).not.toBe(0);
  });

  it("減衰により角速度が低下する", () => {
    const group = createTestGroup({ gravityStrength: 0 });
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 10 }];
    const initialVelocity = states[0]!.angularVelocity;
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 120);
    expect(Math.abs(states[0]!.angularVelocity)).toBeLessThan(Math.abs(initialVelocity));
  });

  it("高い減衰でより速く減速する", () => {
    const groupLow = createTestGroup({
      gravityStrength: 0,
      pendulums: [{ length: 1, mass: 1, damping: 0.01 }],
    });
    const groupHigh = createTestGroup({
      gravityStrength: 0,
      pendulums: [{ length: 1, mass: 1, damping: 0.5 }],
    });
    const statesLow: PendulumState[] = [{ angle: 0, angularVelocity: 10 }];
    const statesHigh: PendulumState[] = [{ angle: 0, angularVelocity: 10 }];

    stepPhysicsGroup(groupLow, statesLow, { x: 0, y: 0 }, 1 / 120);
    stepPhysicsGroup(groupHigh, statesHigh, { x: 0, y: 0 }, 1 / 120);

    expect(Math.abs(statesHigh[0]!.angularVelocity)).toBeLessThan(
      Math.abs(statesLow[0]!.angularVelocity),
    );
  });

  it("風が振り子に力を加える", () => {
    const group = createTestGroup({ gravityStrength: 0, wind: 5 });
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 0 }];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 120);
    expect(states[0]!.angularVelocity).not.toBe(0);
  });

  it("角度がMAX_ANGLEでクランプされる", () => {
    const group = createTestGroup({ gravityStrength: 0 });
    const states: PendulumState[] = [
      { angle: PHYSICS_DEFAULTS.MAX_ANGLE + 1, angularVelocity: 100 },
    ];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 120);
    expect(states[0]!.angle).toBe(PHYSICS_DEFAULTS.MAX_ANGLE);
    expect(states[0]!.angularVelocity).toBe(0);
  });

  it("負方向でもMAX_ANGLEでクランプされる", () => {
    const group = createTestGroup({ gravityStrength: 0 });
    const states: PendulumState[] = [
      { angle: -(PHYSICS_DEFAULTS.MAX_ANGLE + 1), angularVelocity: -100 },
    ];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 120);
    expect(states[0]!.angle).toBe(-PHYSICS_DEFAULTS.MAX_ANGLE);
    expect(states[0]!.angularVelocity).toBe(0);
  });

  it("マルチ振り子チェーンで親の運動が子に伝播する", () => {
    const group = createTestGroup({
      gravityStrength: 0,
      pendulums: [
        { length: 1, mass: 1, damping: 0 },
        { length: 0.8, mass: 0.5, damping: 0 },
      ],
    });
    const states: PendulumState[] = [
      { angle: 0, angularVelocity: 5 },
      { angle: 0, angularVelocity: 0 },
    ];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 120);
    expect(states[1]!.angularVelocity).not.toBe(0);
  });

  it("質量ゼロの振り子は加速しない（ゼロ除算保護）", () => {
    const group = createTestGroup({
      pendulums: [{ length: 1, mass: 0, damping: 0 }],
    });
    const states: PendulumState[] = [{ angle: 0.5, angularVelocity: 0 }];
    stepPhysicsGroup(group, states, { x: 10, y: 0 }, 1 / 120);
    expect(states[0]!.angularVelocity).toBe(0);
  });

  it("長さゼロの振り子は加速しない（ゼロ除算保護）", () => {
    const group = createTestGroup({
      pendulums: [{ length: 0, mass: 1, damping: 0 }],
    });
    const states: PendulumState[] = [{ angle: 0.5, angularVelocity: 0 }];
    stepPhysicsGroup(group, states, { x: 10, y: 0 }, 1 / 120);
    expect(states[0]!.angularVelocity).toBe(0);
  });

  it("states をインプレースで変異させる", () => {
    const group = createTestGroup();
    const states: PendulumState[] = [{ angle: 0.1, angularVelocity: 0 }];
    const ref = states[0]!;
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 120);
    expect(states[0]!).toBe(ref);
    expect(ref.angularVelocity).not.toBe(0);
  });
});


describe("物理シミュレーションの安定性", () => {
  it("10000ステップ後に発散しない", () => {
    const group = createTestGroup({
      pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
    });
    const states: PendulumState[] = [{ angle: 1, angularVelocity: 0 }];
    const dt = PHYSICS_DEFAULTS.TIMESTEP;

    for (let i = 0; i < 10000; i++) {
      stepPhysicsGroup(group, states, { x: 0, y: 0 }, dt);
    }

    expect(Number.isFinite(states[0]!.angle)).toBe(true);
    expect(Number.isFinite(states[0]!.angularVelocity)).toBe(true);
    expect(Math.abs(states[0]!.angle)).toBeLessThanOrEqual(PHYSICS_DEFAULTS.MAX_ANGLE);
  });

  it("減衰ありなら振り子は最終的にほぼ静止する", () => {
    const group = createTestGroup({
      gravityStrength: 0,
      pendulums: [{ length: 1, mass: 1, damping: 0.1 }],
    });
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 10 }];
    const dt = PHYSICS_DEFAULTS.TIMESTEP;

    for (let i = 0; i < 5000; i++) {
      stepPhysicsGroup(group, states, { x: 0, y: 0 }, dt);
    }

    expect(Math.abs(states[0]!.angularVelocity)).toBeLessThan(0.01);
  });

  it("同じ入力からは決定論的な結果が得られる", () => {
    const group = createTestGroup();
    const dt = PHYSICS_DEFAULTS.TIMESTEP;
    const force = { x: 5, y: 0 };

    const run = () => {
      const states: PendulumState[] = [{ angle: 0, angularVelocity: 0 }];
      for (let i = 0; i < 100; i++) {
        stepPhysicsGroup(group, states, force, dt);
      }
      return { ...states[0]! };
    };

    const result1 = run();
    const result2 = run();
    expect(result1.angle).toBe(result2.angle);
    expect(result1.angularVelocity).toBe(result2.angularVelocity);
  });
});

// ============================================================
// computeOutputValues
// ============================================================

describe("computeOutputValues", () => {
  const paramDefs: ParameterDefinition[] = [
    { id: "hair-x", name: "髪揺れX", minValue: -30, maxValue: 30, defaultValue: 0 },
    { id: "hair-y", name: "髪揺れY", minValue: -20, maxValue: 20, defaultValue: 0 },
  ];

  it("振り子の角度を出力パラメータ値にマッピングする", () => {
    const outputs: PhysicsOutput[] = [
      { parameterId: "hair-x", pendulumIndex: 0, weight: 10, type: "angle" },
    ];
    const states: PendulumState[] = [{ angle: 0.5, angularVelocity: 0 }];
    const result = computeOutputValues(outputs, states, paramDefs);
    expect(result.parameters["hair-x"]).toBe(5); // 0.5 * 10 + 0 (defaultValue) = 5
  });

  it("パラメータの min/max でクランプする", () => {
    const outputs: PhysicsOutput[] = [
      { parameterId: "hair-x", pendulumIndex: 0, weight: 100, type: "angle" },
    ];
    const states: PendulumState[] = [{ angle: 1, angularVelocity: 0 }];
    const result = computeOutputValues(outputs, states, paramDefs);
    expect(result.parameters["hair-x"]).toBe(30);
  });

  it("デフォルト値を中心にオフセットする", () => {
    const defs: ParameterDefinition[] = [
      { id: "p1", name: "P1", minValue: -10, maxValue: 10, defaultValue: 5 },
    ];
    const outputs: PhysicsOutput[] = [
      { parameterId: "p1", pendulumIndex: 0, weight: 2, type: "angle" },
    ];
    const states: PendulumState[] = [{ angle: 1, angularVelocity: 0 }];
    const result = computeOutputValues(outputs, states, defs);
    expect(result.parameters.p1).toBe(7); // 1 * 2 + 5 = 7
  });

  it("無効な pendulumIndex はスキップする", () => {
    const outputs: PhysicsOutput[] = [
      { parameterId: "hair-x", pendulumIndex: 99, weight: 10, type: "angle" },
    ];
    const states: PendulumState[] = [{ angle: 0.5, angularVelocity: 0 }];
    const result = computeOutputValues(outputs, states, paramDefs);
    expect(result.parameters["hair-x"]).toBeUndefined();
  });

  it("負の pendulumIndex はスキップする", () => {
    const outputs: PhysicsOutput[] = [
      { parameterId: "hair-x", pendulumIndex: -1, weight: 10, type: "angle" },
    ];
    const states: PendulumState[] = [{ angle: 0.5, angularVelocity: 0 }];
    const result = computeOutputValues(outputs, states, paramDefs);
    expect(result.parameters["hair-x"]).toBeUndefined();
  });

  it("複数出力を独立に計算する", () => {
    const outputs: PhysicsOutput[] = [
      { parameterId: "hair-x", pendulumIndex: 0, weight: 10, type: "angle" },
      { parameterId: "hair-y", pendulumIndex: 1, weight: 5, type: "angle" },
    ];
    const states: PendulumState[] = [
      { angle: 0.3, angularVelocity: 0 },
      { angle: -0.2, angularVelocity: 0 },
    ];
    const result = computeOutputValues(outputs, states, paramDefs);
    expect(result.parameters["hair-x"]).toBe(3); // 0.3 * 10 + 0
    expect(result.parameters["hair-y"]).toBe(-1); // -0.2 * 5 + 0
  });

  it("パラメータ定義がない場合はクランプなし", () => {
    const outputs: PhysicsOutput[] = [
      { parameterId: "unknown", pendulumIndex: 0, weight: 100, type: "angle" },
    ];
    const states: PendulumState[] = [{ angle: 1, angularVelocity: 0 }];
    const result = computeOutputValues(outputs, states, []);
    expect(result.parameters.unknown).toBe(100);
  });

  it("空の出力リストでは空オブジェクトを返す", () => {
    const result = computeOutputValues([], [{ angle: 1, angularVelocity: 0 }], paramDefs);
    expect(result).toEqual({ parameters: {}, bones: {} });
  });

  it("boneAngle 出力がボーンマップに格納される", () => {
    const outputs: PhysicsOutput[] = [
      { boneId: "bone1", pendulumIndex: 0, weight: 2, type: "boneAngle" },
    ];
    const states: PendulumState[] = [{ angle: 0.5, angularVelocity: 0 }];
    const result = computeOutputValues(outputs, states, paramDefs);
    expect(result.bones.bone1).toBe(1); // 0.5 * 2
    expect(Object.keys(result.parameters)).toHaveLength(0);
  });

  it("パラメータ出力とボーン出力を同時に処理する", () => {
    const outputs: PhysicsOutput[] = [
      { parameterId: "hair-x", pendulumIndex: 0, weight: 10, type: "angle" },
      { boneId: "bone1", pendulumIndex: 0, weight: 3, type: "boneAngle" },
    ];
    const states: PendulumState[] = [{ angle: 0.5, angularVelocity: 0 }];
    const result = computeOutputValues(outputs, states, paramDefs);
    expect(result.parameters["hair-x"]).toBe(5);
    expect(result.bones.bone1).toBe(1.5);
  });
});

// ============================================================
// runPhysicsFrame
// ============================================================

describe("runPhysicsFrame", () => {
  it("アキュムレータを消費してシミュレーションする", () => {
    const group = createTestGroup({ gravityStrength: 0 });
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 5 }];
    const dt = 1 / 60;
    const newAcc = runPhysicsFrame(group, states, { x: 0, y: 0 }, dt, 0);
    expect(newAcc).toBeLessThan(PHYSICS_DEFAULTS.TIMESTEP);
    expect(states[0]!.angle).not.toBe(0);
  });

  it("MAX_SUBSTEPS を超えるとアキュムレータを制限する", () => {
    const group = createTestGroup({ gravityStrength: 0 });
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 0 }];
    const newAcc = runPhysicsFrame(group, states, { x: 0, y: 0 }, 1.0, 0);
    expect(newAcc).toBe(0);
  });

  it("アキュムレータの残りを次フレームに持ち越す", () => {
    const group = createTestGroup({ gravityStrength: 0 });
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 0 }];
    const timestep = PHYSICS_DEFAULTS.TIMESTEP;
    const dt = timestep * 1.5;
    const newAcc = runPhysicsFrame(group, states, { x: 0, y: 0 }, dt, 0);
    expect(newAcc).toBeCloseTo(timestep * 0.5, 10);
  });
});

// ============================================================
// resetPendulumStates
// ============================================================

describe("resetPendulumStates", () => {
  it("全状態をゼロにリセットする", () => {
    const states: PendulumState[] = [
      { angle: 1.5, angularVelocity: 3.2 },
      { angle: -0.8, angularVelocity: -1.1 },
    ];
    resetPendulumStates(states);
    expect(states[0]!).toEqual({ angle: 0, angularVelocity: 0 });
    expect(states[1]!).toEqual({ angle: 0, angularVelocity: 0 });
  });

  it("空配列でもエラーにならない", () => {
    expect(() => resetPendulumStates([])).not.toThrow();
  });
});

// ============================================================
// createDefaultPendulum
// ============================================================

describe("createDefaultPendulum", () => {
  it("デフォルト値の振り子設定を返す", () => {
    const p = createDefaultPendulum();
    expect(p.length).toBe(PHYSICS_DEFAULTS.PENDULUM_LENGTH);
    expect(p.mass).toBe(PHYSICS_DEFAULTS.PENDULUM_MASS);
    expect(p.damping).toBe(PHYSICS_DEFAULTS.DAMPING);
  });
});


describe("stepPhysicsGroup — 境界条件", () => {
  it("dt=0 の場合は状態が変化しない", () => {
    const group = createTestGroup();
    const states: PendulumState[] = [{ angle: 0.5, angularVelocity: 1.0 }];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 0);
    expect(states[0]!.angle).toBe(0.5);
    expect(states[0]!.angularVelocity).toBeCloseTo(
      1.0 * (1 - group.pendulums[0]!.damping),
    );
  });

  it("非常に大きな角度でも MAX_ANGLE でクランプされる", () => {
    const group = createTestGroup();
    const states: PendulumState[] = [{ angle: 100, angularVelocity: 0 }];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 60);
    expect(Math.abs(states[0]!.angle)).toBeLessThanOrEqual(Math.PI * 2);
  });

  it("damping=1.0 の場合は速度がゼロになる", () => {
    const group = createTestGroup();
    group.pendulums[0]!.damping = 1.0;
    const states: PendulumState[] = [{ angle: 0, angularVelocity: 10 }];
    stepPhysicsGroup(group, states, { x: 0, y: 0 }, 1 / 60);
    expect(states[0]!.angularVelocity).toBe(0);
  });
});
