import type { BindingTarget, ParameterBinding } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer } from "@/stores/historyStore";
import {
  evaluateBindingsAdditive,
  interpolateBindingPoints,
  useParameterBindingStore,
} from "@/stores/parameterBindingStore";
import { createBoneNode, createProject } from "@/test/fixtures";
import { resetEditorStore, resetHistoryStore } from "@/test/store-reset";


function setupProject() {
  const bone = createBoneNode({ name: "テストボーン" });
  const project = createProject({ layers: [bone], parameterBindings: [] });
  project.parameters.push({
    id: "param-x",
    name: "角度X",
    minValue: -30,
    maxValue: 30,
    defaultValue: 0,
  });
  project.parameters.push({
    id: "param-y",
    name: "角度Y",
    minValue: -30,
    maxValue: 30,
    defaultValue: 0,
  });
  useEditorStore.setState({ project });
  return { boneId: bone.id };
}

const boneAngleTarget = (boneId: string): BindingTarget => ({
  type: "bone",
  boneId,
  property: "angle",
});


describe("parameterBindingStore", () => {
  beforeEach(() => {
    _resetMergeTimer();
    resetHistoryStore();
    resetEditorStore();
  });

  // ========================================
  // CRUD
  // ========================================
  describe("addBinding", () => {
    it("バインディングが追加される", () => {
      const { boneId } = setupProject();
      const store = useParameterBindingStore.getState();

      const id = store.addBinding("param-x", boneAngleTarget(boneId));

      const bindings = useEditorStore.getState().project!.parameterBindings!;
      expect(bindings).toHaveLength(1);
      expect(bindings[0]).toMatchObject({
        id,
        parameterId: "param-x",
        target: { type: "bone", boneId, property: "angle" },
        bindingPoints: [],
      });
    });

    it("parameterBindings が undefined でも安全に追加される", () => {
      const bone = createBoneNode();
      const project = createProject({ layers: [bone] });
      delete (project as any).parameterBindings;
      useEditorStore.setState({ project });

      const store = useParameterBindingStore.getState();
      store.addBinding("param-x", boneAngleTarget(bone.id));

      expect(useEditorStore.getState().project!.parameterBindings).toHaveLength(1);
    });

    it("returns an empty id when no project is loaded", () => {
      const store = useParameterBindingStore.getState();

      const id = store.addBinding("param-x", boneAngleTarget("bone-a"));

      expect(id).toBe("");
      expect(useEditorStore.getState().project).toBeNull();
    });
  });

  describe("removeBinding", () => {
    it("バインディングが削除される", () => {
      const { boneId } = setupProject();
      const store = useParameterBindingStore.getState();
      const id = store.addBinding("param-x", boneAngleTarget(boneId));

      store.removeBinding(id);

      expect(useEditorStore.getState().project!.parameterBindings).toHaveLength(0);
    });

    it("存在しないIDは無視される", () => {
      setupProject();
      const store = useParameterBindingStore.getState();

      store.removeBinding("non-existent");
    });
  });

  describe("removeBindingsByParameter", () => {
    it("特定パラメータの全バインディングが削除される", () => {
      const { boneId } = setupProject();
      const store = useParameterBindingStore.getState();
      store.addBinding("param-x", boneAngleTarget(boneId));
      store.addBinding("param-x", { type: "bone", boneId, property: "scaleX" });
      store.addBinding("param-y", boneAngleTarget(boneId));

      store.removeBindingsByParameter("param-x");

      const bindings = useEditorStore.getState().project!.parameterBindings!;
      expect(bindings).toHaveLength(1);
      expect(bindings[0]!.parameterId).toBe("param-y");
    });
  });

  describe("setBindingPoint", () => {
    it("バインディングポイントが追加される", () => {
      const { boneId } = setupProject();
      const store = useParameterBindingStore.getState();
      const id = store.addBinding("param-x", boneAngleTarget(boneId));

      store.setBindingPoint(id, 0, 0);
      store.setBindingPoint(id, 30, 0.5);
      store.setBindingPoint(id, -30, -0.5);

      const binding = useEditorStore.getState().project!.parameterBindings![0]!;
      expect(binding.bindingPoints).toHaveLength(3);
      expect(binding.bindingPoints.map((k) => k.paramValue)).toEqual([-30, 0, 30]);
    });

    it("同一 paramValue は上書きされる", () => {
      const { boneId } = setupProject();
      const store = useParameterBindingStore.getState();
      const id = store.addBinding("param-x", boneAngleTarget(boneId));

      store.setBindingPoint(id, 0, 0.1);
      store.setBindingPoint(id, 0, 0.9);

      const binding = useEditorStore.getState().project!.parameterBindings![0]!;
      expect(binding.bindingPoints).toHaveLength(1);
      expect(binding.bindingPoints[0]!.targetValue).toBe(0.9);
    });

    it("存在しないバインディングIDは無視される", () => {
      setupProject();
      const store = useParameterBindingStore.getState();

      store.setBindingPoint("non-existent", 0, 0);
    });
  });

  describe("removeBindingPoint", () => {
    it("バインディングポイントが削除される", () => {
      const { boneId } = setupProject();
      const store = useParameterBindingStore.getState();
      const id = store.addBinding("param-x", boneAngleTarget(boneId));
      store.setBindingPoint(id, 0, 0);
      store.setBindingPoint(id, 30, 0.5);

      store.removeBindingPoint(id, 0);

      const binding = useEditorStore.getState().project!.parameterBindings![0]!;
      expect(binding.bindingPoints).toHaveLength(1);
      expect(binding.bindingPoints[0]!.paramValue).toBe(30);
    });

    it("存在しないバインディングIDは無視される", () => {
      setupProject();
      const store = useParameterBindingStore.getState();

      store.removeBindingPoint("non-existent", 0);
    });

    it("存在しないparamValueは無視される", () => {
      const { boneId } = setupProject();
      const store = useParameterBindingStore.getState();
      const id = store.addBinding("param-x", boneAngleTarget(boneId));
      store.setBindingPoint(id, 0, 0.5);

      store.removeBindingPoint(id, 999);

      const binding = useEditorStore.getState().project!.parameterBindings![0]!;
      expect(binding.bindingPoints).toHaveLength(1);
    });
  });

  describe("エッジケース", () => {
    it("同じパラメータ・ターゲットで複数バインディングを追加できる", () => {
      const { boneId } = setupProject();
      const store = useParameterBindingStore.getState();
      const target = boneAngleTarget(boneId);

      const id1 = store.addBinding("param-x", target);
      const id2 = store.addBinding("param-x", target);

      const bindings = useEditorStore.getState().project!.parameterBindings!;
      expect(bindings).toHaveLength(2);
      expect(id1).not.toBe(id2);
    });

    it("parameterBindings undefined でも removeBinding は安全", () => {
      const bone = createBoneNode();
      const project = createProject({ layers: [bone] });
      delete (project as any).parameterBindings;
      useEditorStore.setState({ project });

      const store = useParameterBindingStore.getState();
      store.removeBinding("non-existent");

      expect(useEditorStore.getState().project!.parameterBindings).toHaveLength(0);
    });

    it("parameterBindings undefined でも setBindingPoint は安全", () => {
      const bone = createBoneNode();
      const project = createProject({ layers: [bone] });
      delete (project as any).parameterBindings;
      useEditorStore.setState({ project });

      const store = useParameterBindingStore.getState();
      store.setBindingPoint("non-existent", 0, 0);

      expect(useEditorStore.getState().project!.parameterBindings).toHaveLength(0);
    });
  });
});


describe("interpolateBindingPoints", () => {
  it("空配列はデフォルト値を返す", () => {
    expect(interpolateBindingPoints([], 0, 42)).toBe(42);
  });

  it("1つだけのバインディングポイントはその値を返す", () => {
    expect(interpolateBindingPoints([{ paramValue: 0, targetValue: 10 }], 5, 0)).toBe(10);
  });

  it("範囲外（左）はクランプされる", () => {
    const kfs = [
      { paramValue: 0, targetValue: 0 },
      { paramValue: 10, targetValue: 1 },
    ];
    expect(interpolateBindingPoints(kfs, -5, 0)).toBe(0);
  });

  it("範囲外（右）はクランプされる", () => {
    const kfs = [
      { paramValue: 0, targetValue: 0 },
      { paramValue: 10, targetValue: 1 },
    ];
    expect(interpolateBindingPoints(kfs, 15, 0)).toBe(1);
  });

  it("中間値を線形補間する", () => {
    const kfs = [
      { paramValue: 0, targetValue: 0 },
      { paramValue: 10, targetValue: 1 },
    ];
    expect(interpolateBindingPoints(kfs, 5, 0)).toBeCloseTo(0.5);
  });

  it("3つのバインディングポイントで区間ごとに補間する", () => {
    const kfs = [
      { paramValue: -30, targetValue: -0.5 },
      { paramValue: 0, targetValue: 0 },
      { paramValue: 30, targetValue: 0.5 },
    ];
    expect(interpolateBindingPoints(kfs, -15, 0)).toBeCloseTo(-0.25);
    expect(interpolateBindingPoints(kfs, 0, 0)).toBeCloseTo(0);
    expect(interpolateBindingPoints(kfs, 15, 0)).toBeCloseTo(0.25);
  });

  it("バインディングポイント端点で正確な値を返す", () => {
    const kfs = [
      { paramValue: 0, targetValue: 0 },
      { paramValue: 10, targetValue: 1 },
    ];
    expect(interpolateBindingPoints(kfs, 0, 0)).toBe(0);
    expect(interpolateBindingPoints(kfs, 10, 0)).toBe(1);
  });
});


describe("evaluateBindingsAdditive", () => {
  it("単一バインディングは通常の補間と同じ", () => {
    const bindings: ParameterBinding[] = [
      {
        id: "b1",
        parameterId: "px",
        target: { type: "bone", boneId: "bone1", property: "angle" },
        bindingPoints: [
          { paramValue: -30, targetValue: -0.5 },
          { paramValue: 0, targetValue: 0 },
          { paramValue: 30, targetValue: 0.5 },
        ],
      },
    ];
    const result = evaluateBindingsAdditive(bindings, { px: 15 }, 0);
    expect(result).toBeCloseTo(0.25);
  });

  it("2つのバインディングを加算合成する（四隅）", () => {
    const bindings: ParameterBinding[] = [
      {
        id: "bx",
        parameterId: "px",
        target: { type: "bone", boneId: "bone1", property: "angle" },
        bindingPoints: [
          { paramValue: 0, targetValue: 0 },
          { paramValue: 30, targetValue: 0.5 },
        ],
      },
      {
        id: "by",
        parameterId: "py",
        target: { type: "bone", boneId: "bone1", property: "angle" },
        bindingPoints: [
          { paramValue: 0, targetValue: 0 },
          { paramValue: 30, targetValue: 0.3 },
        ],
      },
    ];
    const result = evaluateBindingsAdditive(bindings, { px: 30, py: 30 }, 0);
    expect(result).toBeCloseTo(0.8);
  });

  it("デフォルト以外の基準値でも正しく合成される", () => {
    // 1 + (1.5-1) + (1.2-1) = 1.7
    const bindings: ParameterBinding[] = [
      {
        id: "bx",
        parameterId: "px",
        target: { type: "bone", boneId: "bone1", property: "scaleX" },
        bindingPoints: [
          { paramValue: 0, targetValue: 1 },
          { paramValue: 30, targetValue: 1.5 },
        ],
      },
      {
        id: "by",
        parameterId: "py",
        target: { type: "bone", boneId: "bone1", property: "scaleX" },
        bindingPoints: [
          { paramValue: 0, targetValue: 1 },
          { paramValue: 30, targetValue: 1.2 },
        ],
      },
    ];
    const result = evaluateBindingsAdditive(bindings, { px: 30, py: 30 }, 1);
    expect(result).toBeCloseTo(1.7);
  });

  it("パラメータ値が未設定の場合は0として評価される", () => {
    const bindings: ParameterBinding[] = [
      {
        id: "b1",
        parameterId: "missing-param",
        target: { type: "bone", boneId: "bone1", property: "angle" },
        bindingPoints: [
          { paramValue: -30, targetValue: -1 },
          { paramValue: 0, targetValue: 0 },
          { paramValue: 30, targetValue: 1 },
        ],
      },
    ];
    const result = evaluateBindingsAdditive(bindings, {}, 0);
    expect(result).toBeCloseTo(0);
  });

  it("四隅の全組み合わせが正しく計算される", () => {
    const bindings: ParameterBinding[] = [
      {
        id: "bx",
        parameterId: "px",
        target: { type: "bone", boneId: "bone1", property: "angle" },
        bindingPoints: [
          { paramValue: -30, targetValue: -0.5 },
          { paramValue: 0, targetValue: 0 },
          { paramValue: 30, targetValue: 0.5 },
        ],
      },
      {
        id: "by",
        parameterId: "py",
        target: { type: "bone", boneId: "bone1", property: "angle" },
        bindingPoints: [
          { paramValue: -30, targetValue: -0.3 },
          { paramValue: 0, targetValue: 0 },
          { paramValue: 30, targetValue: 0.3 },
        ],
      },
    ];
    expect(evaluateBindingsAdditive(bindings, { px: -30, py: -30 }, 0)).toBeCloseTo(-0.8);
    expect(evaluateBindingsAdditive(bindings, { px: 30, py: -30 }, 0)).toBeCloseTo(0.2);
    expect(evaluateBindingsAdditive(bindings, { px: -30, py: 30 }, 0)).toBeCloseTo(-0.2);
    expect(evaluateBindingsAdditive(bindings, { px: 30, py: 30 }, 0)).toBeCloseTo(0.8);
    expect(evaluateBindingsAdditive(bindings, { px: 0, py: 0 }, 0)).toBeCloseTo(0);
  });
});
