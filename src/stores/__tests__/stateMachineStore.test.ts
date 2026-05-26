import { act } from "@testing-library/react";
import type { AnimationStateMachine } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useStateMachineStore } from "@/stores/stateMachineStore";
import { createProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";


function setupProject(machines: AnimationStateMachine[] = []) {
  const project = createProject({ stateMachines: machines });
  useEditorStore.setState({ project });
  return project;
}

function getMachines(): AnimationStateMachine[] {
  return useEditorStore.getState().project?.stateMachines ?? [];
}


describe("stateMachineStore", () => {
  beforeEach(() => {
    resetEditorStore();
  });

  describe("addStateMachine", () => {
    it("新しいステートマシンを追加する", () => {
      setupProject();
      const store = useStateMachineStore.getState();

      act(() => {
        store.addStateMachine("テストマシン");
      });

      const machines = getMachines();
      expect(machines).toHaveLength(1);
      expect(machines[0]!.name).toBe("テストマシン");
      expect(machines[0]!.enabled).toBe(true);
      expect(machines[0]!.states).toHaveLength(1);
      expect(machines[0]!.states[0]!.name).toBe("idle");
      expect(machines[0]!.initialStateId).toBe(machines[0]!.states[0]!.id);
    });

    it("IDを返す", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useStateMachineStore.getState().addStateMachine("テスト");
      });
      expect(id!).toMatch(/\S/);
      expect(getMachines()[0]!.id).toBe(id!);
    });
  });

  describe("removeStateMachine", () => {
    it("ステートマシンを削除する", () => {
      setupProject();
      const store = useStateMachineStore.getState();
      let id: string;
      act(() => {
        id = store.addStateMachine("削除対象");
      });
      expect(getMachines()).toHaveLength(1);

      act(() => {
        store.removeStateMachine(id!);
      });
      expect(getMachines()).toHaveLength(0);
    });

    it("存在しないIDは無視する", () => {
      setupProject();
      act(() => {
        useStateMachineStore.getState().removeStateMachine("nonexistent");
      });
      expect(getMachines()).toHaveLength(0);
    });
  });

  describe("toggleStateMachine", () => {
    it("有効/無効を切り替える", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useStateMachineStore.getState().addStateMachine("テスト");
      });
      expect(getMachines()[0]!.enabled).toBe(true);

      act(() => {
        useStateMachineStore.getState().toggleStateMachine(id!);
      });
      expect(getMachines()[0]!.enabled).toBe(false);

      act(() => {
        useStateMachineStore.getState().toggleStateMachine(id!);
      });
      expect(getMachines()[0]!.enabled).toBe(true);
    });
  });

  describe("renameStateMachine", () => {
    it("名前を変更する", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useStateMachineStore.getState().addStateMachine("旧名");
      });
      act(() => {
        useStateMachineStore.getState().renameStateMachine(id!, "新名");
      });
      expect(getMachines()[0]!.name).toBe("新名");
    });
  });

  describe("状態管理", () => {
    it("状態を追加する", () => {
      setupProject();
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
      });

      act(() => {
        useStateMachineStore.getState().addState(machineId!, "walk", undefined, true);
      });

      const states = getMachines()[0]!.states;
      expect(states).toHaveLength(2);
      expect(states[1]!.name).toBe("walk");
      expect(states[1]!.loop).toBe(true);
    });

    it("状態を削除すると関連する遷移も削除される", () => {
      setupProject();
      const store = useStateMachineStore.getState();
      let machineId: string;
      let stateId: string;

      act(() => {
        machineId = store.addStateMachine("テスト");
        stateId = store.addState(machineId!, "walk");
      });

      const initialStateId = getMachines()[0]!.states[0]!.id;
      act(() => {
        store.addTransition(machineId!, initialStateId, stateId!);
      });
      expect(getMachines()[0]!.transitions).toHaveLength(1);

      act(() => {
        store.removeState(machineId!, stateId!);
      });
      expect(getMachines()[0]!.states).toHaveLength(1);
      expect(getMachines()[0]!.transitions).toHaveLength(0);
    });

    it("初期状態を削除すると先頭が新しい初期状態になる", () => {
      setupProject();
      const store = useStateMachineStore.getState();
      let machineId: string;

      act(() => {
        machineId = store.addStateMachine("テスト");
        store.addState(machineId!, "walk");
      });

      const initialId = getMachines()[0]!.initialStateId;
      act(() => {
        store.removeState(machineId!, initialId);
      });

      const machine = getMachines()[0]!;
      expect(machine.states).toHaveLength(1);
      expect(machine.initialStateId).toBe(machine.states[0]!.id);
    });

    it("状態を更新する", () => {
      setupProject();
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
      });
      const stateId = getMachines()[0]!.states[0]!.id;

      act(() => {
        useStateMachineStore
          .getState()
          .updateState(machineId!, stateId, { name: "更新済み", loop: true });
      });

      const state = getMachines()[0]!.states[0]!;
      expect(state.name).toBe("更新済み");
      expect(state.loop).toBe(true);
    });

    it("初期状態を変更する", () => {
      setupProject();
      const store = useStateMachineStore.getState();
      let machineId: string;
      let newStateId: string;

      act(() => {
        machineId = store.addStateMachine("テスト");
        newStateId = store.addState(machineId!, "walk");
      });

      act(() => {
        store.setInitialState(machineId!, newStateId!);
      });

      expect(getMachines()[0]!.initialStateId).toBe(newStateId!);
    });
  });

  describe("遷移管理", () => {
    let machineId: string;
    let stateAId: string;
    let stateBId: string;

    beforeEach(() => {
      setupProject();
      const store = useStateMachineStore.getState();
      act(() => {
        machineId = store.addStateMachine("テスト");
        stateAId = getMachines()[0]!.states[0]!.id;
        stateBId = store.addState(machineId!, "walk");
      });
    });

    it("遷移を追加する", () => {
      act(() => {
        useStateMachineStore.getState().addTransition(machineId!, stateAId, stateBId);
      });

      const t = getMachines()[0]!.transitions[0]!;
      expect(t.fromStateId).toBe(stateAId);
      expect(t.toStateId).toBe(stateBId);
      expect(t.transitionDuration).toBe(0.3);
      expect(t.priority).toBe(0);
      expect(t.conditions).toEqual([]);
    });

    it("遷移を削除する", () => {
      let transitionId: string;
      act(() => {
        transitionId = useStateMachineStore
          .getState()
          .addTransition(machineId!, stateAId, stateBId);
      });

      act(() => {
        useStateMachineStore.getState().removeTransition(machineId!, transitionId!);
      });
      expect(getMachines()[0]!.transitions).toHaveLength(0);
    });

    it("遷移を更新する", () => {
      let transitionId: string;
      act(() => {
        transitionId = useStateMachineStore
          .getState()
          .addTransition(machineId!, stateAId, stateBId);
      });

      act(() => {
        useStateMachineStore.getState().updateTransition(machineId!, transitionId!, {
          priority: 5,
          transitionDuration: 0.5,
        });
      });

      const t = getMachines()[0]!.transitions[0]!;
      expect(t.priority).toBe(5);
      expect(t.transitionDuration).toBe(0.5);
    });
  });

  describe("遷移条件管理", () => {
    let machineId: string;
    let transitionId: string;

    beforeEach(() => {
      setupProject();
      const store = useStateMachineStore.getState();
      act(() => {
        machineId = store.addStateMachine("テスト");
        const stateA = getMachines()[0]!.states[0]!.id;
        const stateB = store.addState(machineId!, "walk");
        transitionId = store.addTransition(machineId!, stateA, stateB);
      });
    });

    it("条件を追加する", () => {
      act(() => {
        useStateMachineStore.getState().addCondition(machineId!, transitionId!, {
          parameterId: "param-1",
          operator: ">",
          threshold: 0.5,
        });
      });

      const conds = getMachines()[0]!.transitions[0]!.conditions;
      expect(conds).toHaveLength(1);
      expect(conds[0]!.parameterId).toBe("param-1");
      expect(conds[0]!.operator).toBe(">");
      expect(conds[0]!.threshold).toBe(0.5);
    });

    it("条件を削除する", () => {
      act(() => {
        const store = useStateMachineStore.getState();
        store.addCondition(machineId!, transitionId!, {
          parameterId: "p1",
          operator: ">",
          threshold: 0,
        });
        store.addCondition(machineId!, transitionId!, {
          parameterId: "p2",
          operator: "<",
          threshold: 1,
        });
      });
      expect(getMachines()[0]!.transitions[0]!.conditions).toHaveLength(2);

      act(() => {
        useStateMachineStore.getState().removeCondition(machineId!, transitionId!, 0);
      });

      const conds = getMachines()[0]!.transitions[0]!.conditions;
      expect(conds).toHaveLength(1);
      expect(conds[0]!.parameterId).toBe("p2");
    });

    it("条件を更新する", () => {
      act(() => {
        useStateMachineStore.getState().addCondition(machineId!, transitionId!, {
          parameterId: "p1",
          operator: ">",
          threshold: 0,
        });
      });

      act(() => {
        useStateMachineStore.getState().updateCondition(machineId!, transitionId!, 0, {
          operator: "<=",
          threshold: 1.5,
        });
      });

      const cond = getMachines()[0]!.transitions[0]!.conditions[0]!;
      expect(cond.operator).toBe("<=");
      expect(cond.threshold).toBe(1.5);
    });

    it("範囲外のインデックスは無視する", () => {
      act(() => {
        useStateMachineStore.getState().addCondition(machineId!, transitionId!, {
          parameterId: "p1",
          operator: ">",
          threshold: 0,
        });
      });

      act(() => {
        useStateMachineStore.getState().removeCondition(machineId!, transitionId!, 99);
      });
      expect(getMachines()[0]!.transitions[0]!.conditions).toHaveLength(1);

      act(() => {
        useStateMachineStore.getState().updateCondition(machineId!, transitionId!, -1, {
          threshold: 999,
        });
      });
      expect(getMachines()[0]!.transitions[0]!.conditions[0]!.threshold).toBe(0);
    });
  });


  describe("エッジケース: 存在しないIDへの操作", () => {
    beforeEach(() => setupProject());

    it("存在しないマシンIDでtoggleしてもクラッシュしない", () => {
      act(() => {
        useStateMachineStore.getState().addStateMachine("テスト");
      });
      act(() => {
        useStateMachineStore.getState().toggleStateMachine("nonexistent");
      });
      expect(getMachines()[0]!.enabled).toBe(true);
    });

    it("存在しないマシンIDでrenameしてもクラッシュしない", () => {
      act(() => {
        useStateMachineStore.getState().addStateMachine("テスト");
      });
      act(() => {
        useStateMachineStore.getState().renameStateMachine("nonexistent", "新名");
      });
      expect(getMachines()[0]!.name).toBe("テスト");
    });

    it("存在しないマシンIDでaddStateしてもクラッシュしない", () => {
      setupProject();
      act(() => {
        useStateMachineStore.getState().addState("nonexistent", "walk");
      });
      expect(getMachines()).toHaveLength(0);
    });

    it("存在しないマシンIDでremoveStateしてもクラッシュしない", () => {
      act(() => {
        useStateMachineStore.getState().addStateMachine("テスト");
      });
      act(() => {
        useStateMachineStore.getState().removeState("nonexistent", "state-id");
      });
      expect(getMachines()[0]!.states).toHaveLength(1);
    });

    it("存在しない遷移IDでremoveTransitionしてもクラッシュしない", () => {
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
      });
      act(() => {
        useStateMachineStore.getState().removeTransition(machineId!, "nonexistent");
      });
      expect(getMachines()[0]!.transitions).toHaveLength(0);
    });

    it("存在しない遷移IDでaddConditionしてもクラッシュしない", () => {
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
      });
      act(() => {
        useStateMachineStore.getState().addCondition(machineId!, "nonexistent", {
          parameterId: "p",
          operator: ">",
          threshold: 0,
        });
      });
    });
  });

  describe("エッジケース: 最後の状態は削除不可", () => {
    it("状態が1つしかない場合は削除されない", () => {
      setupProject();
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
      });

      const stateId = getMachines()[0]!.states[0]!.id;
      act(() => {
        useStateMachineStore.getState().removeState(machineId!, stateId);
      });

      expect(getMachines()[0]!.states).toHaveLength(1);
      expect(getMachines()[0]!.states[0]!.id).toBe(stateId);
    });
  });

  describe("エッジケース: ワイルドカード遷移", () => {
    it("fromStateId='*' の遷移を追加できる", () => {
      setupProject();
      let machineId: string;
      let stateBId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
        stateBId = useStateMachineStore.getState().addState(machineId!, "walk");
      });

      act(() => {
        useStateMachineStore.getState().addTransition(machineId!, "*", stateBId!);
      });

      const t = getMachines()[0]!.transitions[0]!;
      expect(t.fromStateId).toBe("*");
      expect(t.toStateId).toBe(stateBId!);
    });

    it("状態削除時にワイルドカード遷移は影響されない", () => {
      setupProject();
      let machineId: string;
      let stateBId: string;
      let stateCId: string;
      act(() => {
        const store = useStateMachineStore.getState();
        machineId = store.addStateMachine("テスト");
        stateBId = store.addState(machineId!, "walk");
        stateCId = store.addState(machineId!, "run");
        store.addTransition(machineId!, "*", stateBId!);
      });

      act(() => {
        useStateMachineStore.getState().removeState(machineId!, stateCId!);
      });

      expect(getMachines()[0]!.transitions).toHaveLength(1);
      expect(getMachines()[0]!.transitions[0]!.fromStateId).toBe("*");
    });

    it("toState削除時にワイルドカード遷移も削除される", () => {
      setupProject();
      let machineId: string;
      let stateBId: string;
      act(() => {
        const store = useStateMachineStore.getState();
        machineId = store.addStateMachine("テスト");
        stateBId = store.addState(machineId!, "walk");
        store.addState(machineId!, "run");
        store.addTransition(machineId!, "*", stateBId!);
      });

      act(() => {
        useStateMachineStore.getState().removeState(machineId!, stateBId!);
      });

      expect(getMachines()[0]!.transitions).toHaveLength(0);
    });
  });

  describe("エッジケース: setInitialState", () => {
    it("存在しないstateIdでは変更されない", () => {
      setupProject();
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
      });

      const originalInitial = getMachines()[0]!.initialStateId;
      act(() => {
        useStateMachineStore.getState().setInitialState(machineId!, "nonexistent");
      });

      expect(getMachines()[0]!.initialStateId).toBe(originalInitial);
    });
  });

  describe("エッジケース: addState with clipId", () => {
    it("clipId付きで状態を追加する", () => {
      setupProject();
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
        useStateMachineStore.getState().addState(machineId!, "anim", "clip-1", true);
      });

      const state = getMachines()[0]!.states[1]!;
      expect(state.name).toBe("anim");
      expect(state.clipId).toBe("clip-1");
      expect(state.loop).toBe(true);
    });

    it("clipId未指定の状態にはclipIdプロパティが存在しない", () => {
      setupProject();
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
        useStateMachineStore.getState().addState(machineId!, "idle2");
      });

      const state = getMachines()[0]!.states[1]!;
      expect(state.clipId).toBeUndefined();
    });
  });

  describe("エッジケース: updateState", () => {
    it("存在しないstateIdでは何もしない", () => {
      setupProject();
      let machineId: string;
      act(() => {
        machineId = useStateMachineStore.getState().addStateMachine("テスト");
      });

      act(() => {
        useStateMachineStore
          .getState()
          .updateState(machineId!, "nonexistent", { name: "新名" });
      });

      expect(getMachines()[0]!.states[0]!.name).toBe("idle");
    });
  });

  describe("エッジケース: updateTransition", () => {
    it("transitionDurationを0に設定できる（即座遷移）", () => {
      setupProject();
      let machineId: string;
      let transitionId: string;
      act(() => {
        const store = useStateMachineStore.getState();
        machineId = store.addStateMachine("テスト");
        const stateA = getMachines()[0]!.states[0]!.id;
        const stateB = store.addState(machineId!, "walk");
        transitionId = store.addTransition(machineId!, stateA, stateB);
      });

      act(() => {
        useStateMachineStore.getState().updateTransition(machineId!, transitionId!, {
          transitionDuration: 0,
        });
      });

      expect(getMachines()[0]!.transitions[0]!.transitionDuration).toBe(0);
    });

    it("負の優先度を設定できる", () => {
      setupProject();
      let machineId: string;
      let transitionId: string;
      act(() => {
        const store = useStateMachineStore.getState();
        machineId = store.addStateMachine("テスト");
        const stateA = getMachines()[0]!.states[0]!.id;
        const stateB = store.addState(machineId!, "walk");
        transitionId = store.addTransition(machineId!, stateA, stateB);
      });

      act(() => {
        useStateMachineStore.getState().updateTransition(machineId!, transitionId!, {
          priority: -5,
        });
      });

      expect(getMachines()[0]!.transitions[0]!.priority).toBe(-5);
    });
  });

  describe("エッジケース: 複数マシンの独立性", () => {
    it("マシンAの操作がマシンBに影響しない", () => {
      setupProject();
      let machineA: string;
      let machineB: string;
      act(() => {
        const store = useStateMachineStore.getState();
        machineA = store.addStateMachine("マシンA");
        machineB = store.addStateMachine("マシンB");
        store.addState(machineA!, "walk-A");
        store.addState(machineB!, "walk-B");
      });

      const stateToRemove = getMachines()[0]!.states[1]!.id;
      act(() => {
        useStateMachineStore.getState().removeState(machineA!, stateToRemove);
      });

      expect(getMachines()[0]!.states).toHaveLength(1);
      expect(getMachines()[1]!.states).toHaveLength(2);
    });
  });
});
