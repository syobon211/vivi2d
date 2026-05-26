import { describe, expect, it } from "vitest";
import {
  createStateMachineRuntime,
  evaluateBlendTree,
  evaluateConditions,
  findTriggeredTransition,
  stepStateMachine,
} from "../state-machine";
import type {
  AnimationClip,
  AnimationStateMachine,
  BlendTree1D,
  TransitionCondition,
} from "../types";


function createTestMachine(): AnimationStateMachine {
  return {
    id: "sm-1",
    name: "テストステートマシン",
    states: [
      { id: "idle", name: "待機", clipId: "idleClip", loop: true },
      { id: "talk", name: "トーク", clipId: "talkClip", loop: true },
    ],
    transitions: [
      {
        id: "t-idle-to-talk",
        fromStateId: "idle",
        toStateId: "talk",
        conditions: [{ parameterId: "mouthOpen", operator: ">", threshold: 0.3 }],
        transitionDuration: 0.5,
        priority: 1,
      },
      {
        id: "t-talk-to-idle",
        fromStateId: "talk",
        toStateId: "idle",
        conditions: [{ parameterId: "mouthOpen", operator: "<=", threshold: 0.1 }],
        transitionDuration: 0.3,
        priority: 1,
      },
    ],
    initialStateId: "idle",
    enabled: true,
  };
}

function createTestClip(id: string, parameterId: string): AnimationClip {
  return {
    id,
    name: `テストクリップ_${id}`,
    duration: 30,
    fps: 30,
    tracks: [
      {
        parameterId,
        keyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 30, value: 1, interpolation: "linear" },
        ],
      },
    ],
  };
}

function createTestClips(): ReadonlyMap<string, AnimationClip> {
  return new Map([
    ["idleClip", createTestClip("idleClip", "idleParam")],
    ["talkClip", createTestClip("talkClip", "talkParam")],
  ]);
}


describe("evaluateConditions", () => {
  it("空条件 → true（無条件遷移）", () => {
    const result = evaluateConditions([], {});
    expect(result).toBe(true);
  });

  it("単一条件 '>' 成立 → true", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: ">", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.8 })).toBe(true);
  });

  it("単一条件 '>' 不成立 → false", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: ">", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.3 })).toBe(false);
  });

  it("単一条件 '>' 境界値（等しい場合）→ false", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: ">", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.5 })).toBe(false);
  });

  it("複数条件AND 全成立 → true", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "a", operator: ">", threshold: 0.3 },
      { parameterId: "b", operator: "<", threshold: 0.8 },
    ];
    expect(evaluateConditions(conditions, { a: 0.5, b: 0.2 })).toBe(true);
  });

  it("複数条件AND 1つ不成立 → false", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "a", operator: ">", threshold: 0.3 },
      { parameterId: "b", operator: "<", threshold: 0.8 },
    ];
    expect(evaluateConditions(conditions, { a: 0.5, b: 0.9 })).toBe(false);
  });

  it("'==' 演算子: 値が等しい場合 → true", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "state", operator: "==", threshold: 1.0 },
    ];
    expect(evaluateConditions(conditions, { state: 1.0 })).toBe(true);
  });

  it("'==' 演算子: 値が異なる場合 → false", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "state", operator: "==", threshold: 1.0 },
    ];
    expect(evaluateConditions(conditions, { state: 0.5 })).toBe(false);
  });

  it("'==' 演算子: 微小差（1e-7）は等しいと判定される", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "state", operator: "==", threshold: 1.0 },
    ];
    expect(evaluateConditions(conditions, { state: 1.0 + 1e-7 })).toBe(true);
  });

  it("'!=' 演算子: 値が異なる場合 → true", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "state", operator: "!=", threshold: 0 },
    ];
    expect(evaluateConditions(conditions, { state: 1.0 })).toBe(true);
  });

  it("'!=' 演算子: 値が等しい場合 → false", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "state", operator: "!=", threshold: 1.0 },
    ];
    expect(evaluateConditions(conditions, { state: 1.0 })).toBe(false);
  });

  it("'<=' 演算子: 境界値（等しい場合）→ true", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: "<=", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.5 })).toBe(true);
  });

  it("'<=' 演算子: 値が小さい場合 → true", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: "<=", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.3 })).toBe(true);
  });

  it("'<=' 演算子: 値が大きい場合 → false", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: "<=", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.8 })).toBe(false);
  });

  it("パラメータ未定義 → 0として扱う", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "missing", operator: ">", threshold: -1 },
    ];
    expect(evaluateConditions(conditions, {})).toBe(true);
  });

  it("パラメータ未定義 → 0 なので threshold=0 で '>' は false", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "missing", operator: ">", threshold: 0 },
    ];
    expect(evaluateConditions(conditions, {})).toBe(false);
  });
});


describe("findTriggeredTransition", () => {
  it("条件成立 → 遷移を返す", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);
    const result = findTriggeredTransition(machine, runtime, {
      mouthOpen: 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("t-idle-to-talk");
    expect(result!.toStateId).toBe("talk");
  });

  it("条件不成立 → null", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);
    const result = findTriggeredTransition(machine, runtime, {
      mouthOpen: 0.1,
    });
    expect(result).toBeNull();
  });

  it("'*' からの遷移: 任意の状態からマッチする", () => {
    const machine = createTestMachine();
    machine.transitions.push({
      id: "t-any-to-idle",
      fromStateId: "*",
      toStateId: "idle",
      conditions: [{ parameterId: "reset", operator: "==", threshold: 1 }],
      transitionDuration: 0.2,
      priority: 10,
    });
    const runtime = createStateMachineRuntime(machine);
    runtime.currentStateId = "talk";

    const result = findTriggeredTransition(machine, runtime, {
      reset: 1,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("t-any-to-idle");
  });

  it("優先度の高い遷移が先に選ばれる", () => {
    const machine = createTestMachine();
    machine.states.push({
      id: "special",
      name: "特殊",
      clipId: "idleClip",
      loop: true,
    });
    machine.transitions.push({
      id: "t-idle-to-special",
      fromStateId: "idle",
      toStateId: "special",
      conditions: [{ parameterId: "mouthOpen", operator: ">", threshold: 0.3 }],
      transitionDuration: 0.5,
      priority: 10,
    });

    const runtime = createStateMachineRuntime(machine);
    const result = findTriggeredTransition(machine, runtime, {
      mouthOpen: 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("t-idle-to-special");
  });

  it("遷移中は新たな遷移をトリガーしない", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);
    runtime.activeTransition = {
      transitionId: "t-idle-to-talk",
      fromStateId: "idle",
      toStateId: "talk",
      toFrame: 0,
      elapsed: 0.1,
      duration: 0.5,
    };
    const result = findTriggeredTransition(machine, runtime, {
      mouthOpen: 0.5,
    });
    expect(result).toBeNull();
  });

  it("自分自身への遷移はスキップされる", () => {
    const machine = createTestMachine();
    machine.transitions.push({
      id: "t-idle-self",
      fromStateId: "idle",
      toStateId: "idle",
      conditions: [],
      transitionDuration: 0.1,
      priority: 100,
    });

    const runtime = createStateMachineRuntime(machine);
    const result = findTriggeredTransition(machine, runtime, {
      mouthOpen: 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("t-idle-to-talk");
  });

  it("'*' からの自己遷移もスキップされる", () => {
    const machine: AnimationStateMachine = {
      id: "sm-2",
      name: "自己遷移テスト",
      states: [{ id: "only", name: "唯一", loop: true }],
      transitions: [
        {
          id: "t-any-to-only",
          fromStateId: "*",
          toStateId: "only",
          conditions: [],
          transitionDuration: 0.1,
          priority: 1,
        },
      ],
      initialStateId: "only",
      enabled: true,
    };
    const runtime = createStateMachineRuntime(machine);
    const result = findTriggeredTransition(machine, runtime, {});
    expect(result).toBeNull();
  });
});


describe("stepStateMachine", () => {
  it("アイドル→トーク遷移（mouthOpen > 0.3）", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();

    stepStateMachine(machine, runtime, { mouthOpen: 0.5 }, clips, 1 / 30);

    expect(runtime.activeTransition).not.toBeNull();
    expect(runtime.activeTransition!.fromStateId).toBe("idle");
    expect(runtime.activeTransition!.toStateId).toBe("talk");
  });

  it("クロスフェード中のブレンド（t=0.5で中間値）", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();

    stepStateMachine(machine, runtime, { mouthOpen: 0.5 }, clips, 0);
    expect(runtime.activeTransition).not.toBeNull();

    runtime.activeTransition!.elapsed = 0;
    runtime.activeTransition!.duration = 0.5;
    runtime.currentFrame = 15;
    runtime.activeTransition!.toFrame = 15;

    const result = stepStateMachine(machine, runtime, { mouthOpen: 0.5 }, clips, 0.25);

    //          talkParam = 0*0.5 + 0.75*0.5 = 0.375
    expect(result.idleParam).toBeCloseTo(0.375, 5);
    expect(result.talkParam).toBeCloseTo(0.375, 5);
  });

  it("クロスフェード完了で状態切り替え", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();

    stepStateMachine(machine, runtime, { mouthOpen: 0.5 }, clips, 0);
    expect(runtime.activeTransition).not.toBeNull();

    runtime.activeTransition!.elapsed = 0.49;
    runtime.activeTransition!.duration = 0.5;

    stepStateMachine(machine, runtime, { mouthOpen: 0.5 }, clips, 0.02);

    expect(runtime.currentStateId).toBe("talk");
    expect(runtime.activeTransition).toBeNull();
  });

  it("ループクリップのフレーム巻き戻し", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();

    stepStateMachine(machine, runtime, { mouthOpen: 0 }, clips, 1.5);
    expect(runtime.currentFrame).toBeCloseTo(15, 5);
  });

  it("disabled ステートマシン → 空のRecord", () => {
    const machine = createTestMachine();
    machine.enabled = false;
    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();

    const result = stepStateMachine(machine, runtime, { mouthOpen: 0.5 }, clips, 1 / 30);
    expect(result).toEqual({});
  });

  it("通常再生（遷移なし）でクリップの値が返る", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();

    const result = stepStateMachine(machine, runtime, { mouthOpen: 0 }, clips, 0.5);
    expect(result.idleParam).toBeCloseTo(0.5, 5);
  });

  it("clipIdが未設定の状態では空のRecordが返る", () => {
    const machine: AnimationStateMachine = {
      id: "sm-3",
      name: "クリップなしテスト",
      states: [{ id: "empty", name: "空状態", loop: true }],
      transitions: [],
      initialStateId: "empty",
      enabled: true,
    };
    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();

    const result = stepStateMachine(machine, runtime, {}, clips, 1 / 30);
    expect(result).toEqual({});
  });
});


describe("createStateMachineRuntime", () => {
  it("初期状態が正しく設定される", () => {
    const machine = createTestMachine();
    const runtime = createStateMachineRuntime(machine);

    expect(runtime.currentStateId).toBe("idle");
    expect(runtime.currentFrame).toBe(0);
    expect(runtime.activeTransition).toBeNull();
  });

  it("異なる初期状態のマシンでも正しく初期化される", () => {
    const machine = createTestMachine();
    machine.initialStateId = "talk";
    const runtime = createStateMachineRuntime(machine);

    expect(runtime.currentStateId).toBe("talk");
    expect(runtime.currentFrame).toBe(0);
    expect(runtime.activeTransition).toBeNull();
  });
});


describe("evaluateBlendTree", () => {
  const walkClip: AnimationClip = {
    id: "walk",
    name: "Walk",
    duration: 30,
    fps: 30,
    tracks: [{ parameterId: "legAngle", keyframes: [{ frame: 0, value: 10 }] }],
  };
  const runClip: AnimationClip = {
    id: "run",
    name: "Run",
    duration: 30,
    fps: 30,
    tracks: [{ parameterId: "legAngle", keyframes: [{ frame: 0, value: 40 }] }],
  };
  const clips = new Map<string, AnimationClip>([
    ["walk", walkClip],
    ["run", runClip],
  ]);

  const tree: BlendTree1D = {
    parameterId: "speed",
    entries: [
      { threshold: 0, clipId: "walk" },
      { threshold: 1, clipId: "run" },
    ],
  };

  it("パラメータ値が下端のとき最初のクリップを返す", () => {
    const result = evaluateBlendTree(tree, { speed: 0 }, clips, 0);
    expect(result.legAngle).toBe(10);
  });

  it("パラメータ値が上端のとき最後のクリップを返す", () => {
    const result = evaluateBlendTree(tree, { speed: 1 }, clips, 0);
    expect(result.legAngle).toBe(40);
  });

  it("パラメータ値が中間のとき線形ブレンドする", () => {
    const result = evaluateBlendTree(tree, { speed: 0.5 }, clips, 0);
    expect(result.legAngle).toBe(25); // (10 + 40) / 2
  });

  it("パラメータ値が範囲外下のとき端のクリップを返す", () => {
    const result = evaluateBlendTree(tree, { speed: -1 }, clips, 0);
    expect(result.legAngle).toBe(10);
  });

  it("パラメータ値が範囲外上のとき端のクリップを返す", () => {
    const result = evaluateBlendTree(tree, { speed: 5 }, clips, 0);
    expect(result.legAngle).toBe(40);
  });

  it("エントリが空なら空オブジェクトを返す", () => {
    const emptyTree: BlendTree1D = { parameterId: "speed", entries: [] };
    const result = evaluateBlendTree(emptyTree, { speed: 0.5 }, clips, 0);
    expect(result).toEqual({});
  });
});

describe("stepStateMachine with blendTree", () => {
  it("ブレンドツリー状態のパラメータを正しく評価する", () => {
    const walkClip: AnimationClip = {
      id: "walk",
      name: "Walk",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "legAngle", keyframes: [{ frame: 0, value: 10 }] }],
    };
    const runClip: AnimationClip = {
      id: "run",
      name: "Run",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "legAngle", keyframes: [{ frame: 0, value: 40 }] }],
    };
    const clips = new Map([
      ["walk", walkClip],
      ["run", runClip],
    ]);

    const machine: AnimationStateMachine = {
      id: "locomotion",
      name: "Locomotion",
      states: [
        {
          id: "blend",
          name: "Walk-Run Blend",
          loop: true,
          blendTree: {
            parameterId: "speed",
            entries: [
              { threshold: 0, clipId: "walk" },
              { threshold: 1, clipId: "run" },
            ],
          },
        },
      ],
      transitions: [],
      initialStateId: "blend",
      enabled: true,
    };

    const runtime = createStateMachineRuntime(machine);
    const output = stepStateMachine(machine, runtime, { speed: 0.5 }, clips, 0.016);

    expect(output.legAngle).toBe(25);
  });
});

describe("evaluateBlendTree 3エントリ以上", () => {
  const idleClip: AnimationClip = {
    id: "idle",
    name: "Idle",
    duration: 30,
    fps: 30,
    tracks: [{ parameterId: "legAngle", keyframes: [{ frame: 0, value: 0 }] }],
  };
  const walkClip: AnimationClip = {
    id: "walk",
    name: "Walk",
    duration: 30,
    fps: 30,
    tracks: [{ parameterId: "legAngle", keyframes: [{ frame: 0, value: 20 }] }],
  };
  const runClip: AnimationClip = {
    id: "run",
    name: "Run",
    duration: 30,
    fps: 30,
    tracks: [{ parameterId: "legAngle", keyframes: [{ frame: 0, value: 60 }] }],
  };
  const clips = new Map([
    ["idle", idleClip],
    ["walk", walkClip],
    ["run", runClip],
  ]);

  const tree: BlendTree1D = {
    parameterId: "speed",
    entries: [
      { threshold: 0, clipId: "idle" },
      { threshold: 0.5, clipId: "walk" },
      { threshold: 1, clipId: "run" },
    ],
  };

  it("speed=0 でidle(0)を返す", () => {
    const r = evaluateBlendTree(tree, { speed: 0 }, clips, 0);
    expect(r.legAngle).toBe(0);
  });

  it("speed=0.25 でidle-walkの中間(10)を返す", () => {
    const r = evaluateBlendTree(tree, { speed: 0.25 }, clips, 0);
    expect(r.legAngle).toBe(10); // (0+20)/2
  });

  it("speed=0.5 でwalk(20)を返す", () => {
    const r = evaluateBlendTree(tree, { speed: 0.5 }, clips, 0);
    expect(r.legAngle).toBe(20);
  });

  it("speed=0.75 でwalk-runの中間(40)を返す", () => {
    const r = evaluateBlendTree(tree, { speed: 0.75 }, clips, 0);
    expect(r.legAngle).toBe(40); // (20+60)/2
  });

  it("speed=1 でrun(60)を返す", () => {
    const r = evaluateBlendTree(tree, { speed: 1 }, clips, 0);
    expect(r.legAngle).toBe(60);
  });

  it("パラメータ未設定(undefined)は0として扱う", () => {
    const r = evaluateBlendTree(tree, {}, clips, 0);
    expect(r.legAngle).toBe(0);
  });

  it("存在しないクリップIDは空オブジェクトとしてブレンドされる", () => {
    const badTree: BlendTree1D = {
      parameterId: "speed",
      entries: [
        { threshold: 0, clipId: "nonexistent" },
        { threshold: 1, clipId: "run" },
      ],
    };
    const r = evaluateBlendTree(badTree, { speed: 0.5 }, clips, 0);
    expect(r.legAngle).toBe(30);
  });
});

describe("stepStateMachine ブレンドツリー遷移", () => {
  it("ブレンドツリーでFPSが異なるクリップ混在時、getStateClipが最大FPSを選ぶ", () => {
    const walkClip30: AnimationClip = {
      id: "walk30",
      name: "Walk30",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 0 }] }],
    };
    const run60: AnimationClip = {
      id: "run60",
      name: "Run60",
      duration: 60,
      fps: 60,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 100 }] }],
    };
    const clips = new Map([
      ["walk30", walkClip30],
      ["run60", run60],
    ]);

    const machine: AnimationStateMachine = {
      id: "fps-test",
      name: "FPS Test",
      states: [
        {
          id: "blend",
          name: "Blend",
          loop: true,
          blendTree: {
            parameterId: "speed",
            entries: [
              { threshold: 0, clipId: "walk30" },
              { threshold: 1, clipId: "run60" },
            ],
          },
        },
      ],
      transitions: [],
      initialStateId: "blend",
      enabled: true,
    };

    const runtime = createStateMachineRuntime(machine);

    stepStateMachine(machine, runtime, { speed: 0.5 }, clips, 1.0);
    expect(runtime.currentFrame).toBeCloseTo(0, 5);
  });

  it("blendTreeとclipId両方指定時、blendTreeが優先される", () => {
    const clipA: AnimationClip = {
      id: "clipA",
      name: "ClipA",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "pA", keyframes: [{ frame: 0, value: 10 }] }],
    };
    const clipB: AnimationClip = {
      id: "clipB",
      name: "ClipB",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "pB", keyframes: [{ frame: 0, value: 99 }] }],
    };
    const clips = new Map([
      ["clipA", clipA],
      ["clipB", clipB],
    ]);

    const machine: AnimationStateMachine = {
      id: "priority-test",
      name: "Priority",
      states: [
        {
          id: "state1",
          name: "State1",
          clipId: "clipB",
          loop: true,
          blendTree: {
            parameterId: "speed",
            entries: [{ threshold: 0, clipId: "clipA" }],
          },
        },
      ],
      transitions: [],
      initialStateId: "state1",
      enabled: true,
    };

    const runtime = createStateMachineRuntime(machine);
    const out = stepStateMachine(machine, runtime, { speed: 0 }, clips, 0.016);
    expect(out.pA).toBe(10);
    expect(out.pB).toBeUndefined();
  });

  it("additiveブレンドモードのステートマシンが定義可能であること", () => {
    const machine: AnimationStateMachine = {
      id: "additive-test",
      name: "Additive",
      states: [{ id: "s1", name: "S1", clipId: "idleClip", loop: true }],
      transitions: [],
      initialStateId: "s1",
      enabled: true,
      blendMode: "additive",
    };
    expect(machine.blendMode).toBe("additive");

    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();
    const out = stepStateMachine(machine, runtime, {}, clips, 0.5);
    expect(out.idleParam).toBeCloseTo(0.5, 5);
  });

  it("weight=0.5のoverrideステートマシンが定義可能であること", () => {
    const machine: AnimationStateMachine = {
      id: "weight-test",
      name: "Weight",
      states: [{ id: "s1", name: "S1", clipId: "idleClip", loop: true }],
      transitions: [],
      initialStateId: "s1",
      enabled: true,
      blendMode: "override",
      weight: 0.5,
    };
    expect(machine.weight).toBe(0.5);

    const runtime = createStateMachineRuntime(machine);
    const clips = createTestClips();
    const out = stepStateMachine(machine, runtime, {}, clips, 0.5);
    expect(out.idleParam).toBeCloseTo(0.5, 5);
  });

  it("blendTree遷移中にパラメータ値が変化するケース", () => {
    const walkClip: AnimationClip = {
      id: "walk",
      name: "Walk",
      duration: 60,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 10 }] }],
    };
    const runClip: AnimationClip = {
      id: "run",
      name: "Run",
      duration: 60,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 90 }] }],
    };
    const idleClip: AnimationClip = {
      id: "idle",
      name: "Idle",
      duration: 60,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 0 }] }],
    };
    const clips = new Map([
      ["walk", walkClip],
      ["run", runClip],
      ["idle", idleClip],
    ]);

    const machine: AnimationStateMachine = {
      id: "sm-blend-transition",
      name: "Blend Transition",
      states: [
        { id: "idle", name: "Idle", clipId: "idle", loop: true },
        {
          id: "move",
          name: "Move",
          loop: true,
          blendTree: {
            parameterId: "speed",
            entries: [
              { threshold: 0, clipId: "walk" },
              { threshold: 1, clipId: "run" },
            ],
          },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStateId: "idle",
          toStateId: "move",
          conditions: [{ parameterId: "speed", operator: ">", threshold: 0 }],
          transitionDuration: 1.0,
          priority: 1,
        },
      ],
      initialStateId: "idle",
      enabled: true,
    };

    const runtime = createStateMachineRuntime(machine);

    let out = stepStateMachine(machine, runtime, { speed: 0.3 }, clips, 0.016);
    expect(runtime.activeTransition).not.toBeNull();

    out = stepStateMachine(machine, runtime, { speed: 0.8 }, clips, 0.3);
    expect(out.p).toBeGreaterThan(0);
    expect(out.p).toBeLessThan(74);
  });

  it("通常状態からブレンドツリー状態へクロスフェードできる", () => {
    const idleClip: AnimationClip = {
      id: "idle",
      name: "Idle",
      duration: 60,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 0 }] }],
    };
    const walkClip: AnimationClip = {
      id: "walk",
      name: "Walk",
      duration: 60,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 50 }] }],
    };
    const runClip: AnimationClip = {
      id: "run",
      name: "Run",
      duration: 60,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 100 }] }],
    };
    const clips = new Map([
      ["idle", idleClip],
      ["walk", walkClip],
      ["run", runClip],
    ]);

    const machine: AnimationStateMachine = {
      id: "sm",
      name: "SM",
      states: [
        { id: "idle", name: "Idle", clipId: "idle", loop: true },
        {
          id: "move",
          name: "Move",
          loop: true,
          blendTree: {
            parameterId: "speed",
            entries: [
              { threshold: 0, clipId: "walk" },
              { threshold: 1, clipId: "run" },
            ],
          },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStateId: "idle",
          toStateId: "move",
          conditions: [{ parameterId: "speed", operator: ">", threshold: 0 }],
          transitionDuration: 0.5,
          priority: 1,
        },
      ],
      initialStateId: "idle",
      enabled: true,
    };

    const runtime = createStateMachineRuntime(machine);

    let out = stepStateMachine(machine, runtime, { speed: 0 }, clips, 0.016);
    expect(runtime.currentStateId).toBe("idle");
    expect(out.p).toBe(0);

    out = stepStateMachine(machine, runtime, { speed: 0.5 }, clips, 0.016);
    expect(runtime.activeTransition).not.toBeNull();

    for (let i = 0; i < 60; i++) {
      out = stepStateMachine(machine, runtime, { speed: 0.5 }, clips, 0.016);
    }
    expect(runtime.currentStateId).toBe("move");
    expect(out.p).toBe(75);
  });
});


describe("evaluateConditions '!=' 分岐カバレッジ", () => {
  it("'!=' 演算子: 微小差（1e-7）は等しいと判定されfalseを返す", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "state", operator: "!=", threshold: 1.0 },
    ];
    expect(evaluateConditions(conditions, { state: 1.0 + 1e-7 })).toBe(false);
  });

  it("'!=' 演算子: 十分な差がある場合trueを返す", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "val", operator: "!=", threshold: 0 },
    ];
    expect(evaluateConditions(conditions, { val: 0.5 })).toBe(true);
  });

  it("'!=' 演算子: 完全に同じ値でfalseを返す", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "val", operator: "!=", threshold: 5.0 },
    ];
    expect(evaluateConditions(conditions, { val: 5.0 })).toBe(false);
  });

  it("'>=' 演算子: 境界値（等しい場合）→ true", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: ">=", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.5 })).toBe(true);
  });

  it("'>=' 演算子: 値が大きい場合 → true", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: ">=", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.8 })).toBe(true);
  });

  it("'>=' 演算子: 値が小さい場合 → false", () => {
    const conditions: TransitionCondition[] = [
      { parameterId: "value", operator: ">=", threshold: 0.5 },
    ];
    expect(evaluateConditions(conditions, { value: 0.3 })).toBe(false);
  });
});

describe("stepStateMachine — 非ループクリップのフレームクランプ", () => {
  it("loop=false のクリップで duration を超えるフレームは duration にクランプされる", () => {
    const clip: AnimationClip = {
      id: "oneshot",
      name: "OneShot",
      duration: 30,
      fps: 30,
      tracks: [
        {
          parameterId: "p",
          keyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 30, value: 1, interpolation: "linear" },
          ],
        },
      ],
    };
    const clips = new Map([["oneshot", clip]]);

    const machine: AnimationStateMachine = {
      id: "sm-oneshot",
      name: "OneShotTest",
      states: [{ id: "play", name: "再生", clipId: "oneshot", loop: false }],
      transitions: [],
      initialStateId: "play",
      enabled: true,
    };

    const runtime = createStateMachineRuntime(machine);
    const result = stepStateMachine(machine, runtime, {}, clips, 2.0);
    expect(runtime.currentFrame).toBe(30);
    expect(result.p).toBe(1);
  });

  it("loop=false で既に duration を超えた後は値が固定される", () => {
    const clip: AnimationClip = {
      id: "oneshot",
      name: "OneShot",
      duration: 10,
      fps: 10,
      tracks: [
        {
          parameterId: "val",
          keyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 10, value: 100, interpolation: "linear" },
          ],
        },
      ],
    };
    const clips = new Map([["oneshot", clip]]);

    const machine: AnimationStateMachine = {
      id: "sm-clamp",
      name: "ClampTest",
      states: [{ id: "s", name: "S", clipId: "oneshot", loop: false }],
      transitions: [],
      initialStateId: "s",
      enabled: true,
    };

    const runtime = createStateMachineRuntime(machine);
    stepStateMachine(machine, runtime, {}, clips, 3.0);
    expect(runtime.currentFrame).toBe(10);

    const result = stepStateMachine(machine, runtime, {}, clips, 1.0);
    expect(runtime.currentFrame).toBe(10);
    expect(result.val).toBe(100);
  });


  it("遷移先状態が存在しない場合でもクラッシュしない", () => {
    const machine: AnimationStateMachine = {
      id: "sm-invalid",
      name: "Invalid",
      states: [{ id: "s1", name: "S1", clipId: "c1", loop: true }],
      transitions: [
        {
          id: "t1",
          fromStateId: "s1",
          toStateId: "nonexistent",
          conditions: [],
          transitionDuration: 0.5,
          priority: 1,
        },
      ],
      initialStateId: "s1",
      enabled: true,
    };
    const clip: AnimationClip = {
      id: "c1",
      name: "C1",
      duration: 30,
      fps: 30,
      tracks: [
        {
          parameterId: "p",
          keyframes: [
            { frame: 0, value: 0 },
            { frame: 30, value: 100 },
          ],
        },
      ],
    };
    const clips = new Map([["c1", clip]]);
    const runtime = createStateMachineRuntime(machine);

    stepStateMachine(machine, runtime, {}, clips, 0);
    expect(runtime.activeTransition).not.toBeNull();

    const result = stepStateMachine(machine, runtime, {}, clips, 0.25);
    expect(result).toBeDefined();
  });

  it("deltaTime=0 でも遷移判定が実行される", () => {
    const machine: AnimationStateMachine = {
      id: "sm-dt0",
      name: "DT0",
      states: [
        { id: "idle", name: "Idle", clipId: "c1", loop: true },
        { id: "talk", name: "Talk", clipId: "c2", loop: true },
      ],
      transitions: [
        {
          id: "t1",
          fromStateId: "idle",
          toStateId: "talk",
          conditions: [],
          transitionDuration: 0.5,
          priority: 1,
        },
      ],
      initialStateId: "idle",
      enabled: true,
    };
    const c1: AnimationClip = {
      id: "c1",
      name: "C1",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 0 }] }],
    };
    const c2: AnimationClip = {
      id: "c2",
      name: "C2",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 50 }] }],
    };
    const clips = new Map([
      ["c1", c1],
      ["c2", c2],
    ]);
    const runtime = createStateMachineRuntime(machine);

    const result = stepStateMachine(machine, runtime, {}, clips, 0);
    expect(runtime.activeTransition).not.toBeNull();
    expect(runtime.activeTransition!.elapsed).toBe(0);
    expect(result.p).toBeDefined();
  });

  it("ブレンドツリーで隣接エントリのthresholdが同じ場合", () => {
    const c1: AnimationClip = {
      id: "c1",
      name: "C1",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 10 }] }],
    };
    const c2: AnimationClip = {
      id: "c2",
      name: "C2",
      duration: 30,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 90 }] }],
    };
    const clips = new Map([
      ["c1", c1],
      ["c2", c2],
    ]);

    const tree: BlendTree1D = {
      parameterId: "speed",
      entries: [
        { threshold: 0.5, clipId: "c1" },
        { threshold: 0.5, clipId: "c2" },
      ],
    };

    const result = evaluateBlendTree(tree, { speed: 0.5 }, clips, 0);
    expect(result.p).toBeDefined();
  });

  it("ループクリップでduration=0の場合にゼロ除算が起きない", () => {
    const machine: AnimationStateMachine = {
      id: "sm-zero",
      name: "Zero",
      states: [{ id: "s1", name: "S1", clipId: "c0", loop: true }],
      transitions: [],
      initialStateId: "s1",
      enabled: true,
    };
    const c0: AnimationClip = {
      id: "c0",
      name: "C0",
      duration: 0,
      fps: 30,
      tracks: [{ parameterId: "p", keyframes: [{ frame: 0, value: 42 }] }],
    };
    const clips = new Map([["c0", c0]]);
    const runtime = createStateMachineRuntime(machine);

    const result = stepStateMachine(machine, runtime, {}, clips, 1.0);
    expect(result.p).toBe(42);
  });
});
