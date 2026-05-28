import { act } from "@testing-library/react";
import {
  createStateMachineRuntime,
  evaluateConditions,
  findTriggeredTransition,
  stepStateMachine,
} from "@vivi2d/core/state-machine";
import type { AnimationClip, AnimationStateMachine } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useStateMachineStore } from "@/stores/stateMachineStore";
import { createProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";


describe("stateMachineStore → core state-machine engine 統合", () => {
  beforeEach(() => {
    resetEditorStore();
    const project = createProject({ stateMachines: [] });
    useEditorStore.setState({ project });
  });

  function getMachines(): AnimationStateMachine[] {
    return useEditorStore.getState().project!.stateMachines;
  }

  it("ストアで作成したマシンから正しいランタイムが生成される", () => {
    let _machineId: string;
    act(() => {
      _machineId = useStateMachineStore.getState().addStateMachine("テスト");
    });

    const machine = getMachines()[0]!;
    const runtime = createStateMachineRuntime(machine);

    expect(runtime.currentStateId).toBe(machine.initialStateId);
    expect(runtime.currentFrame).toBe(0);
    expect(runtime.activeTransition).toBeNull();
  });

  it("ストアで追加した遷移条件が evaluateConditions で正しく評価される", () => {
    let machineId: string;
    let transitionId: string;
    act(() => {
      const store = useStateMachineStore.getState();
      machineId = store.addStateMachine("テスト");
      const stateA = getMachines()[0]!.states[0]!.id;
      const stateB = store.addState(machineId!, "walk");
      transitionId = store.addTransition(machineId!, stateA, stateB);
      store.addCondition(machineId!, transitionId!, {
        parameterId: "speed",
        operator: ">",
        threshold: 0.5,
      });
    });

    const machine = getMachines()[0]!;
    const conditions = machine.transitions[0]!.conditions;

    expect(evaluateConditions(conditions, { speed: 0.6 })).toBe(true);
    expect(evaluateConditions(conditions, { speed: 0.3 })).toBe(false);
    expect(evaluateConditions(conditions, {})).toBe(false);
  });

  it("ストアで構築したマシンで遷移がトリガーされる", () => {
    let machineId: string;
    act(() => {
      const store = useStateMachineStore.getState();
      machineId = store.addStateMachine("移動");
      const idleId = getMachines()[0]!.states[0]!.id;
      const walkId = store.addState(machineId!, "walk");
      const tid = store.addTransition(machineId!, idleId, walkId);
      store.addCondition(machineId!, tid, {
        parameterId: "speed",
        operator: ">",
        threshold: 0,
      });
    });

    const machine = getMachines()[0]!;
    const runtime = createStateMachineRuntime(machine);
    const walkState = machine.states.find((s) => s.name === "walk")!;

    expect(findTriggeredTransition(machine, runtime, { speed: 0 })).toBeNull();

    const triggered = findTriggeredTransition(machine, runtime, { speed: 1 });
    expect(triggered).not.toBeNull();
    expect(triggered!.toStateId).toBe(walkState.id);
  });

  it("ストアで構築したワイルドカード遷移が任意状態から発火する", () => {
    let machineId: string;
    act(() => {
      const store = useStateMachineStore.getState();
      machineId = store.addStateMachine("テスト");
      const damageId = store.addState(machineId!, "damage");
      const tid = store.addTransition(machineId!, "*", damageId);
      store.addCondition(machineId!, tid, {
        parameterId: "hit",
        operator: "==",
        threshold: 1,
      });
    });

    const machine = getMachines()[0]!;
    const runtime = createStateMachineRuntime(machine);

    const triggered = findTriggeredTransition(machine, runtime, { hit: 1 });
    expect(triggered).not.toBeNull();
    expect(triggered!.fromStateId).toBe("*");
  });

  it("ストアで設定した優先度が遷移選択に反映される", () => {
    let machineId: string;
    act(() => {
      const store = useStateMachineStore.getState();
      machineId = store.addStateMachine("テスト");
      const idleId = getMachines()[0]!.states[0]!.id;
      const walkId = store.addState(machineId!, "walk");
      const runId = store.addState(machineId!, "run");

      const t1 = store.addTransition(machineId!, idleId, walkId);
      store.updateTransition(machineId!, t1, { priority: 1 });

      const t2 = store.addTransition(machineId!, idleId, runId);
      store.updateTransition(machineId!, t2, { priority: 10 });

    });

    const machine = getMachines()[0]!;
    const runtime = createStateMachineRuntime(machine);
    const runState = machine.states.find((s) => s.name === "run")!;

    const triggered = findTriggeredTransition(machine, runtime, {});
    expect(triggered).not.toBeNull();
    expect(triggered!.toStateId).toBe(runState.id);
  });

  it("stepStateMachine がクロスフェード遷移を正しく処理する", () => {
    let machineId: string;
    act(() => {
      const store = useStateMachineStore.getState();
      machineId = store.addStateMachine("テスト");
      const idleId = getMachines()[0]!.states[0]!.id;
      const walkId = store.addState(machineId!, "walk");
      const tid = store.addTransition(machineId!, idleId, walkId);
      store.updateTransition(machineId!, tid, { transitionDuration: 0.5 });
    });

    const machine = getMachines()[0]!;
    const runtime = createStateMachineRuntime(machine);
    const emptyClips = new Map<string, AnimationClip>();

    stepStateMachine(machine, runtime, {}, emptyClips, 0.016);
    expect(runtime.activeTransition).not.toBeNull();
    expect(runtime.activeTransition!.duration).toBe(0.5);

    stepStateMachine(machine, runtime, {}, emptyClips, 0.2);
    expect(runtime.activeTransition).not.toBeNull();
    expect(runtime.activeTransition!.elapsed).toBeCloseTo(0.216, 2);

    stepStateMachine(machine, runtime, {}, emptyClips, 0.4);
    expect(runtime.activeTransition).toBeNull();

    const walkState = machine.states.find((s) => s.name === "walk")!;
    expect(runtime.currentStateId).toBe(walkState.id);
  });

  it("disabled マシンは stepStateMachine で空のパラメータを返す", () => {
    let machineId: string;
    act(() => {
      const store = useStateMachineStore.getState();
      machineId = store.addStateMachine("テスト");
      store.toggleStateMachine(machineId!);
    });

    const machine = getMachines()[0]!;
    expect(machine.enabled).toBe(false);

    const runtime = createStateMachineRuntime(machine);
    const result = stepStateMachine(machine, runtime, {}, new Map(), 0.016);
    expect(result).toEqual({});
  });

  it("複数条件のAND論理がストアデータで正しく機能する", () => {
    let machineId: string;
    let transitionId: string;
    act(() => {
      const store = useStateMachineStore.getState();
      machineId = store.addStateMachine("テスト");
      const idleId = getMachines()[0]!.states[0]!.id;
      const angryId = store.addState(machineId!, "angry");
      transitionId = store.addTransition(machineId!, idleId, angryId);
      store.addCondition(machineId!, transitionId!, {
        parameterId: "anger",
        operator: ">",
        threshold: 0.5,
      });
      store.addCondition(machineId!, transitionId!, {
        parameterId: "calm",
        operator: "<",
        threshold: 0.3,
      });
    });

    const conditions = getMachines()[0]!.transitions[0]!.conditions;

    expect(evaluateConditions(conditions, { anger: 0.8, calm: 0.1 })).toBe(true);
    expect(evaluateConditions(conditions, { anger: 0.8, calm: 0.5 })).toBe(false);
    expect(evaluateConditions(conditions, { anger: 0.3, calm: 0.1 })).toBe(false);
    expect(evaluateConditions(conditions, { anger: 0.2, calm: 0.8 })).toBe(false);
  });
});
