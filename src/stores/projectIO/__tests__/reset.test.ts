
import { beforeEach, describe, expect, it } from "vitest";
import { useHistoryStore } from "@/stores/historyStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import { useMultiViewStore } from "@/stores/multiViewStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { resetAllStores } from "@/test/store-reset";
import {
  applyResetPlan,
  buildResetPlan,
  type ResetPlan,
  resetRelatedStores,
} from "../reset";

describe("buildResetPlan", () => {
  it("空でないプランを返す", () => {
    const plan = buildResetPlan();
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("各ステップは name と run を持つ", () => {
    const plan = buildResetPlan();
    for (const step of plan.steps) {
      expect(typeof step.name).toBe("string");
      expect(step.name.length).toBeGreaterThan(0);
      expect(typeof step.run).toBe("function");
    }
  });

  it("ステップ名はユニークである（重複は構築ミスを示す）", () => {
    const plan = buildResetPlan();
    const names = plan.steps.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("applyResetPlan (純粋検証: fake plan)", () => {
  it("プランの全ステップの run を宣言順に呼ぶ", () => {
    const calls: string[] = [];
    const fakePlan: ResetPlan = {
      steps: [
        { name: "a", run: () => calls.push("a") },
        { name: "b", run: () => calls.push("b") },
        { name: "c", run: () => calls.push("c") },
      ],
    };
    applyResetPlan(fakePlan);
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("ステップが throw したら残りは実行されず例外を伝播する", () => {
    const calls: string[] = [];
    const fakePlan: ResetPlan = {
      steps: [
        { name: "ok", run: () => calls.push("ok") },
        {
          name: "boom",
          run: () => {
            throw new Error("boom");
          },
        },
        { name: "unreached", run: () => calls.push("unreached") },
      ],
    };
    expect(() => applyResetPlan(fakePlan)).toThrow("boom");
    expect(calls).toEqual(["ok"]);
  });
});

describe("resetRelatedStores (結合: 代表 store の実リセット)", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("selectionStore の選択状態を clear する", () => {
    useSelectionStore.getState().selectLayer("layer-1");
    expect(useSelectionStore.getState().selectedLayerId).toBe("layer-1");

    resetRelatedStores();

    expect(useSelectionStore.getState().selectedLayerId).toBeNull();
    expect(useSelectionStore.getState().selectedLayerIds).toEqual([]);
  });

  it("meshEditStore の lasso / 頂点選択を clear する", () => {
    useMeshEditStore.setState({
      selectedVertices: [1, 2, 3],
      lassoActive: true,
      lassoPoints: [0, 0, 10, 10],
    });

    resetRelatedStores();

    expect(useMeshEditStore.getState().selectedVertices).toEqual([]);
    expect(useMeshEditStore.getState().lassoActive).toBe(false);
    expect(useMeshEditStore.getState().lassoPoints).toEqual([]);
  });

  it("ikRuntimeStore のランタイムターゲットを clear する", () => {
    useIKRuntimeStore.getState().setRuntimeTarget("controller-1", 100, 200);
    expect(useIKRuntimeStore.getState().runtimeTargets.size).toBeGreaterThan(0);

    resetRelatedStores();

    expect(useIKRuntimeStore.getState().runtimeTargets.size).toBe(0);
  });

  it("multiViewStore のマルチビューを無効化する", () => {
    useMultiViewStore.getState().enableMultiView("horizontal");
    expect(useMultiViewStore.getState().enabled).toBe(true);

    resetRelatedStores();

    expect(useMultiViewStore.getState().enabled).toBe(false);
  });

  it("historyStore の undo/redo を clear する", () => {
    resetRelatedStores();

    expect(useHistoryStore.getState().undoStack).toEqual([]);
    expect(useHistoryStore.getState().redoStack).toEqual([]);
  });
});
