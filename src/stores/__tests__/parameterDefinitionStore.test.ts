import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer } from "@/stores/historyStore";
import { useParameterBindingStore } from "@/stores/parameterBindingStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetEditorStore, resetHistoryStore } from "@/test/store-reset";


function setupProjectWithViviMesh(): { meshId: string } {
  const mesh = createViviMesh({ name: "テスト用メッシュ" });
  const project = createProject({ layers: [mesh] });
  useEditorStore.setState({ project });
  return { meshId: mesh.id };
}

function addParameterAndGetId(
  name = "テストパラメータ",
  min = 0,
  max = 1,
  def = 0.5,
): string {
  useParameterDefinitionStore.getState().addParameter(name, min, max, def);
  const project = useEditorStore.getState().project!;
  return project.parameters[project.parameters.length - 1]!.id;
}


describe("parameterDefinitionStore", () => {
  beforeEach(() => {
    _resetMergeTimer();
    resetHistoryStore();
    resetEditorStore();
  });

  // ========================================
  // 1. addParameter
  // ========================================
  describe("addParameter", () => {
    it("parameters に追加される", () => {
      setupProjectWithViviMesh();
      useParameterDefinitionStore.getState().addParameter("目X", -30, 30, 0);

      const project = useEditorStore.getState().project!;
      expect(project.parameters).toHaveLength(1);
      expect(project.parameters[0]).toMatchObject({
        name: "目X",
        minValue: -30,
        maxValue: 30,
        defaultValue: 0,
      });
      expect(project.parameters[0]!.id).toMatch(/\S/);
    });

    it("複数のパラメータを順次追加できる", () => {
      setupProjectWithViviMesh();
      const store = useParameterDefinitionStore.getState();
      store.addParameter("目X", -30, 30, 0);
      store.addParameter("目Y", -30, 30, 0);
      store.addParameter("口開き", 0, 1, 0);

      const project = useEditorStore.getState().project!;
      expect(project.parameters).toHaveLength(3);
      expect(project.parameters.map((p) => p.name)).toEqual(["目X", "目Y", "口開き"]);
    });
  });

  // ========================================
  // 2. removeParameter
  // ========================================
  describe("removeParameter", () => {
    it("parameters から削除される", () => {
      setupProjectWithViviMesh();
      const paramId = addParameterAndGetId("削除対象", 0, 1, 0.5);

      expect(useEditorStore.getState().project!.parameters).toHaveLength(1);

      useParameterDefinitionStore.getState().removeParameter(paramId);

      expect(useEditorStore.getState().project!.parameters).toHaveLength(0);
    });
  });

  // ========================================
  // 3. updateParameter
  // ========================================
  describe("updateParameter", () => {
    it("指定フィールドのみ更新される", () => {
      setupProjectWithViviMesh();
      const paramId = addParameterAndGetId("元の名前", -10, 10, 0);

      useParameterDefinitionStore
        .getState()
        .updateParameter(paramId, { name: "新しい名前" });

      const param = useEditorStore.getState().project!.parameters[0]!;
      expect(param.name).toBe("新しい名前");
      expect(param.minValue).toBe(-10);
      expect(param.maxValue).toBe(10);
      expect(param.defaultValue).toBe(0);
    });

    it("複数フィールドを同時に更新できる", () => {
      setupProjectWithViviMesh();
      const paramId = addParameterAndGetId("テスト", 0, 1, 0.5);

      useParameterDefinitionStore
        .getState()
        .updateParameter(paramId, { minValue: -100, maxValue: 100, defaultValue: 0 });

      const param = useEditorStore.getState().project!.parameters[0]!;
      expect(param.minValue).toBe(-100);
      expect(param.maxValue).toBe(100);
      expect(param.defaultValue).toBe(0);
      expect(param.name).toBe("テスト");
    });

    it("存在しないパラメータ ID は無視される", () => {
      setupProjectWithViviMesh();
      addParameterAndGetId("テスト", 0, 1, 0.5);

      useParameterDefinitionStore
        .getState()
        .updateParameter("non-existent-id", { name: "変更されない" });

      const param = useEditorStore.getState().project!.parameters[0]!;
      expect(param.name).toBe("テスト");
    });
  });

  // ========================================
  // 4. pairParameters
  // ========================================
  describe("pairParameters", () => {
    it("2つのパラメータを結合できる", () => {
      setupProjectWithViviMesh();
      const idA = addParameterAndGetId("角度X", -30, 30, 0);
      const idB = addParameterAndGetId("角度Y", -30, 30, 0);

      useParameterDefinitionStore.getState().pairParameters(idA, idB);

      const params = useEditorStore.getState().project!.parameters;
      expect(params.find((p) => p.id === idA)!.pairedParameterId).toBe(idB);
      expect(params.find((p) => p.id === idB)!.pairedParameterId).toBe(idA);
    });

    it("同じIDを指定した場合は無視される", () => {
      setupProjectWithViviMesh();
      const id = addParameterAndGetId("角度X", -30, 30, 0);

      useParameterDefinitionStore.getState().pairParameters(id, id);

      const param = useEditorStore.getState().project!.parameters[0]!;
      expect(param.pairedParameterId).toBeUndefined();
    });

    it("既存のペアがある場合は先に解除される", () => {
      setupProjectWithViviMesh();
      const idA = addParameterAndGetId("角度X", -30, 30, 0);
      const idB = addParameterAndGetId("角度Y", -30, 30, 0);
      const idC = addParameterAndGetId("体X", -10, 10, 0);

      useParameterDefinitionStore.getState().pairParameters(idA, idB);
      useParameterDefinitionStore.getState().pairParameters(idA, idC);

      const params = useEditorStore.getState().project!.parameters;
      expect(params.find((p) => p.id === idA)!.pairedParameterId).toBe(idC);
      expect(params.find((p) => p.id === idB)!.pairedParameterId).toBeUndefined();
      expect(params.find((p) => p.id === idC)!.pairedParameterId).toBe(idA);
    });
  });

  // ========================================
  // 5. unpairParameters
  // ========================================
  describe("unpairParameters", () => {
    it("結合を解除できる", () => {
      setupProjectWithViviMesh();
      const idA = addParameterAndGetId("角度X", -30, 30, 0);
      const idB = addParameterAndGetId("角度Y", -30, 30, 0);

      useParameterDefinitionStore.getState().pairParameters(idA, idB);
      useParameterDefinitionStore.getState().unpairParameters(idA);

      const params = useEditorStore.getState().project!.parameters;
      expect(params.find((p) => p.id === idA)!.pairedParameterId).toBeUndefined();
      expect(params.find((p) => p.id === idB)!.pairedParameterId).toBeUndefined();
    });

    it("ペア相手側からも解除できる", () => {
      setupProjectWithViviMesh();
      const idA = addParameterAndGetId("角度X", -30, 30, 0);
      const idB = addParameterAndGetId("角度Y", -30, 30, 0);

      useParameterDefinitionStore.getState().pairParameters(idA, idB);
      useParameterDefinitionStore.getState().unpairParameters(idB);

      const params = useEditorStore.getState().project!.parameters;
      expect(params.find((p) => p.id === idA)!.pairedParameterId).toBeUndefined();
      expect(params.find((p) => p.id === idB)!.pairedParameterId).toBeUndefined();
    });

    it("未結合パラメータに対しては何もしない", () => {
      setupProjectWithViviMesh();
      const id = addParameterAndGetId("テスト", 0, 1, 0.5);

      useParameterDefinitionStore.getState().unpairParameters(id);

      const param = useEditorStore.getState().project!.parameters[0]!;
      expect(param.pairedParameterId).toBeUndefined();
    });
  });

  describe("removeParameter（ペア連動）", () => {
    it("ペア済みパラメータを削除すると相手の結合も解除される", () => {
      setupProjectWithViviMesh();
      const idA = addParameterAndGetId("角度X", -30, 30, 0);
      const idB = addParameterAndGetId("角度Y", -30, 30, 0);

      useParameterDefinitionStore.getState().pairParameters(idA, idB);
      useParameterDefinitionStore.getState().removeParameter(idA);

      const params = useEditorStore.getState().project!.parameters;
      expect(params).toHaveLength(1);
      expect(params[0]!.id).toBe(idB);
      expect(params[0]!.pairedParameterId).toBeUndefined();
    });
  });

  describe("removeParameter（バインディング連動削除）", () => {
    it("パラメータ削除時に該当パラメータのバインディングも削除される", () => {
      setupProjectWithViviMesh();
      const paramId = addParameterAndGetId("角度X", -30, 30, 0);
      const otherId = addParameterAndGetId("角度Y", -30, 30, 0);

      const bindStore = useParameterBindingStore.getState();
      bindStore.addBinding(paramId, {
        type: "bone",
        boneId: "bone-1",
        property: "angle",
      });
      bindStore.addBinding(otherId, {
        type: "bone",
        boneId: "bone-1",
        property: "scaleX",
      });

      expect(useEditorStore.getState().project!.parameterBindings).toHaveLength(2);

      useParameterDefinitionStore.getState().removeParameter(paramId);

      const bindings = useEditorStore.getState().project!.parameterBindings!;
      expect(bindings).toHaveLength(1);
      expect(bindings[0]!.parameterId).toBe(otherId);
    });

    it("バインディングがない場合もエラーにならない", () => {
      setupProjectWithViviMesh();
      const paramId = addParameterAndGetId("テスト", 0, 1, 0.5);

      useParameterDefinitionStore.getState().removeParameter(paramId);

      expect(useEditorStore.getState().project!.parameters).toHaveLength(0);
    });

    it("parameterBindings が undefined でもエラーにならない", () => {
      const mesh = createViviMesh({ name: "テスト" });
      const project = createProject({ layers: [mesh] });
      delete (project as any).parameterBindings;
      project.parameters.push({
        id: "p1",
        name: "テスト",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0.5,
      });
      useEditorStore.setState({ project });

      useParameterDefinitionStore.getState().removeParameter("p1");

      expect(useEditorStore.getState().project!.parameters).toHaveLength(0);
    });
  });
});
