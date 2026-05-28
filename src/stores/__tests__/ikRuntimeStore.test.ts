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
    it("ソリューションが保存される", () => {
      const { setSolution } = useIKRuntimeStore.getState();
      const solution = createSolution({ "bone-1": 0.5, "bone-2": 1.2 });

      setSolution("ctrl-1", solution);

      const state = useIKRuntimeStore.getState();
      expect(state.solutions.get("ctrl-1")).toBe(solution);
      expect(state.solutions.size).toBe(1);
    });

    it("同じIDで上書きされる", () => {
      const { setSolution } = useIKRuntimeStore.getState();
      const solution1 = createSolution({ "bone-1": 0.5 });
      const solution2 = createSolution({ "bone-1": 1.0 }, false);

      setSolution("ctrl-1", solution1);
      setSolution("ctrl-1", solution2);

      const state = useIKRuntimeStore.getState();
      expect(state.solutions.size).toBe(1);
      expect(state.solutions.get("ctrl-1")).toBe(solution2);
      expect(state.solutions.get("ctrl-1")!.reached).toBe(false);
    });
  });

  // ==============================================================
  // setRuntimeTarget
  // ==============================================================
  describe("setRuntimeTarget", () => {
    it("ターゲットが保存される", () => {
      const { setRuntimeTarget } = useIKRuntimeStore.getState();

      setRuntimeTarget("ctrl-1", 100, 200);

      const state = useIKRuntimeStore.getState();
      expect(state.runtimeTargets.get("ctrl-1")).toEqual({ x: 100, y: 200 });
    });
  });

  // ==============================================================
  // clearRuntimeTarget
  // ==============================================================
  describe("clearRuntimeTarget", () => {
    it("指定IDのみ削除される", () => {
      const { setRuntimeTarget, clearRuntimeTarget } = useIKRuntimeStore.getState();
      setRuntimeTarget("ctrl-1", 10, 20);
      setRuntimeTarget("ctrl-2", 30, 40);

      clearRuntimeTarget("ctrl-1");

      const state = useIKRuntimeStore.getState();
      expect(state.runtimeTargets.has("ctrl-1")).toBe(false);
      expect(state.runtimeTargets.get("ctrl-2")).toEqual({ x: 30, y: 40 });
    });
  });

  // ==============================================================
  // clearAll
  // ==============================================================
  describe("clearAll", () => {
    it("全クリアされる", () => {
      const { setSolution, setRuntimeTarget, clearAll } = useIKRuntimeStore.getState();
      setSolution("ctrl-1", createSolution({ "bone-1": 0.5 }));
      setRuntimeTarget("ctrl-1", 10, 20);

      clearAll();

      const state = useIKRuntimeStore.getState();
      expect(state.solutions.size).toBe(0);
      expect(state.runtimeTargets.size).toBe(0);
    });
  });

  describe("複数コントローラの独立管理", () => {
    it("複数コントローラのソリューションを独立管理できる", () => {
      const { setSolution } = useIKRuntimeStore.getState();
      const sol1 = createSolution({ "bone-a": 0.1 });
      const sol2 = createSolution({ "bone-b": 0.2 });
      const sol3 = createSolution({ "bone-c": 0.3 });

      setSolution("ctrl-1", sol1);
      setSolution("ctrl-2", sol2);
      setSolution("ctrl-3", sol3);

      const state = useIKRuntimeStore.getState();
      expect(state.solutions.size).toBe(3);
      expect(state.solutions.get("ctrl-1")).toBe(sol1);
      expect(state.solutions.get("ctrl-2")).toBe(sol2);
      expect(state.solutions.get("ctrl-3")).toBe(sol3);
    });
  });
});
