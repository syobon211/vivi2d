import type { IKSolution } from "@vivi2d/core/ik-solver";
import { beforeEach, describe, expect, it } from "vitest";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { resetIKRuntimeStore } from "@/test/store-reset";

beforeEach(() => {
  resetIKRuntimeStore();
});

function createSolution(angles: Record<string, number>, reached = true): IKSolution {
  return {
    solvedAngles: new Map(Object.entries(angles)),
    reached,
  };
}

describe("ikRuntimeStore", () => {
  describe("初期状態", () => {
    it("solutions と runtimeTargets が空のMapである", () => {
      const state = useIKRuntimeStore.getState();
      expect(state.solutions).toBeInstanceOf(Map);
      expect(state.solutions.size).toBe(0);
      expect(state.runtimeTargets).toBeInstanceOf(Map);
      expect(state.runtimeTargets.size).toBe(0);
    });
  });

  // ==============================================================
  // setSolution
  // ==============================================================
  describe("setSolution", () => {
    it("複数コントローラの保存・上書き・個別ターゲット削除・全消去", () => {
      const { setSolution, setRuntimeTarget, clearRuntimeTarget, clearAll } =
        useIKRuntimeStore.getState();
      const first = createSolution({ "bone-1": 0.5, "bone-2": 1.2 });
      const second = createSolution({ "bone-b": 0.2 });
      const third = createSolution({ "bone-c": 0.3 });
      setSolution("ctrl-1", first);
      expect(useIKRuntimeStore.getState().solutions.get("ctrl-1")).toBe(first);
      expect(useIKRuntimeStore.getState().solutions.size).toBe(1);
      const previous = useIKRuntimeStore.getState().solutions;
      setSolution("ctrl-2", second);
      setSolution("ctrl-3", third);
      expect([...useIKRuntimeStore.getState().solutions.entries()]).toEqual([
        ["ctrl-1", first], ["ctrl-2", second], ["ctrl-3", third],
      ]);
      expect(previous.size).toBe(1);
      const replacement = createSolution({ "bone-1": 1 }, false);
      setSolution("ctrl-1", replacement);
      const updated = useIKRuntimeStore.getState().solutions;
      expect(updated.size).toBe(3);
      expect(updated.get("ctrl-1")).toBe(replacement);
      expect(updated.get("ctrl-1")!.reached).toBe(false);
      expect(updated.get("ctrl-2")).toBe(second);
      expect(updated.get("ctrl-3")).toBe(third);
      setRuntimeTarget("ctrl-1", 100, 200);
      setRuntimeTarget("ctrl-2", 30, 40);
      expect(useIKRuntimeStore.getState().runtimeTargets.get("ctrl-1")).toEqual({ x: 100, y: 200 });
      clearRuntimeTarget("ctrl-1");
      expect([...useIKRuntimeStore.getState().runtimeTargets.entries()]).toEqual([
        ["ctrl-2", { x: 30, y: 40 }],
      ]);
      expect(useIKRuntimeStore.getState().solutions).toBe(updated);
      clearAll();
      expect(useIKRuntimeStore.getState().solutions.size).toBe(0);
      expect(useIKRuntimeStore.getState().runtimeTargets.size).toBe(0);
    });


  });

  // ==============================================================
  // setRuntimeTarget
  // ==============================================================

  // ==============================================================
  // clearRuntimeTarget
  // ==============================================================

  // ==============================================================
  // clearAll
  // ==============================================================

});
