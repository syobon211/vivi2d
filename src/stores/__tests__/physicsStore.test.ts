import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer } from "@/stores/historyStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { createPhysicsGroup, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetPhysicsStore,
} from "@/test/store-reset";

describe("physicsStore", () => {
  beforeEach(resetPhysicsStore);



  // --- initialize ---

  it("initializes both groups and clears stale runtime, accumulators and parameter history", () => {
    const first = createPhysicsGroup({ id: "first" });
    const second = createPhysicsGroup({
      id: "second",
      pendulums: [
        { length: 1, mass: 1, damping: 0.05 },
        { length: 0.5, mass: 0.3, damping: 0.1 },
        { length: 0.3, mass: 0.2, damping: 0.15 },
      ],
    });
    usePhysicsStore.getState().initialize([createPhysicsGroup({ id: "stale" })]);
    usePhysicsStore.getState().setAccumulator("stale", 0.01);
    usePhysicsStore.getState().snapshotParamValues({ p1: 5 });
    usePhysicsStore.getState().initialize([first, second]);
    const state = usePhysicsStore.getState();
    expect(state.runtimeStates).toEqual({
      first: [{ angle: 0, angularVelocity: 0 }],
      second: [
        { angle: 0, angularVelocity: 0 },
        { angle: 0, angularVelocity: 0 },
        { angle: 0, angularVelocity: 0 },
      ],
    });
    expect(state.accumulators).toEqual({ first: 0, second: 0 });
    expect(state.previousParamValues).toEqual({});
  });



  // --- reset ---

  it("全振り子状態をゼロにリセットする", () => {
    const group = createPhysicsGroup();
    usePhysicsStore.getState().initialize([group]);

    const states = usePhysicsStore.getState().runtimeStates[group.id]!;
    states[0]!.angle = 1.5;
    states[0]!.angularVelocity = 3.2;

    usePhysicsStore.getState().setAccumulator(group.id, 0.005);
    usePhysicsStore.getState().snapshotParamValues({ p1: 10 });
    usePhysicsStore.getState().reset();

    const resetStates = usePhysicsStore.getState().runtimeStates[group.id]!;
    expect(resetStates).toEqual([{ angle: 0, angularVelocity: 0 }]);
    expect(usePhysicsStore.getState().accumulators).toEqual({ [group.id]: 0 });
    expect(usePhysicsStore.getState().previousParamValues).toEqual({});
  });



  // --- setActive ---


  it("シミュレーションを再有効化できる", () => {
    usePhysicsStore.getState().setActive(false);
    expect(usePhysicsStore.getState().isActive).toBe(false);
    usePhysicsStore.getState().setActive(true);
    expect(usePhysicsStore.getState().isActive).toBe(true);
  });

  // --- snapshotParamValues ---

  it("パラメータ値のスナップショットを保存する", () => {
    const values = { p1: 5, p2: 10 };
    usePhysicsStore.getState().snapshotParamValues(values);
    expect(usePhysicsStore.getState().previousParamValues).toEqual(values);
    expect(usePhysicsStore.getState().previousParamValues).not.toBe(values);
    values.p1 = 999;
    expect(usePhysicsStore.getState().previousParamValues).toEqual({ p1: 5, p2: 10 });
  });


  // --- setAccumulator ---


  it("他のグループのアキュムレータに影響しない", () => {
    usePhysicsStore.getState().setAccumulator("g1", 0.005);
    usePhysicsStore.getState().setAccumulator("g2", 0.01);
    expect(usePhysicsStore.getState().accumulators.g1).toBe(0.005);
    expect(usePhysicsStore.getState().accumulators.g2).toBe(0.01);
  });
});


describe("physicsStore — CRUD", () => {
  beforeEach(() => {
    resetEditorStore();
    resetHistoryStore();
    _resetMergeTimer();
    useEditorStore.setState({ project: createProject() });
  });

  // --- addPhysicsGroup ---

  describe("addPhysicsGroup", () => {
    it("物理グループを追加してIDを返す", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("髪揺れ");

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id);
      expect(group).toBeDefined();
      expect(group!.name).toBe("髪揺れ");
      expect(group!.enabled).toBe(true);
      expect(group!.gravityStrength).toBe(9.8);
      expect(group!.pendulums).toHaveLength(1);
      expect(group!.inputs).toEqual([]);
      expect(group!.outputs).toEqual([]);
      expect(usePhysicsStore.getState().runtimeStates[id]).toEqual([{ angle: 0, angularVelocity: 0 }]);
      expect(usePhysicsStore.getState().accumulators[id]).toBe(0);
    });

    it("複数回呼び出すと異なるIDのグループが追加される", () => {
      const id1 = usePhysicsStore.getState().addPhysicsGroup("A");
      const id2 = usePhysicsStore.getState().addPhysicsGroup("B");

      expect(id1).not.toBe(id2);
      const project = useEditorStore.getState().project!;
      expect(project.physicsGroups).toHaveLength(2);
    });

  });

  // --- removePhysicsGroup ---

  describe("removePhysicsGroup", () => {
    it("指定IDのグループを削除する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("削除対象");
      const retained = usePhysicsStore.getState().addPhysicsGroup("残留");
      usePhysicsStore.getState().setAccumulator(retained, 0.01);

      usePhysicsStore.getState().removePhysicsGroup(id);

      const project = useEditorStore.getState().project!;
      expect(project.physicsGroups).toHaveLength(1);
      expect(project.physicsGroups[0]!.name).toBe("残留");
      expect(project.physicsGroups[0]!.id).toBe(retained);
      const state = usePhysicsStore.getState();
      expect(state.runtimeStates[id]).toBeUndefined();
      expect(state.accumulators[id]).toBeUndefined();
      expect(state.runtimeStates[retained]).toEqual([{ angle: 0, angularVelocity: 0 }]);
      expect(state.accumulators[retained]).toBe(0.01);
      usePhysicsStore.getState().removePhysicsGroup(retained);
      expect(useEditorStore.getState().project!.physicsGroups).toEqual([]);
      expect(usePhysicsStore.getState().runtimeStates[retained]).toBeUndefined();
      expect(usePhysicsStore.getState().accumulators[retained]).toBeUndefined();
    });

    it("存在しないIDでは何もしない", () => {
      usePhysicsStore.getState().addPhysicsGroup("テスト");
      expect(() =>
        usePhysicsStore.getState().removePhysicsGroup("nonexistent"),
      ).not.toThrow();

      const project = useEditorStore.getState().project!;
      expect(project.physicsGroups).toHaveLength(1);
    });

  });

  // --- updatePhysicsGroup ---

  describe("updatePhysicsGroup", () => {





    it("updates all group fields then preserves them during a name-only change", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("旧名");
      const values = { name: "更新済み", enabled: false, gravityDirection: 90, gravityStrength: 20, wind: 5 };
      usePhysicsStore.getState().updatePhysicsGroup(id, values);
      const read = () => useEditorStore.getState().project!.physicsGroups.find((g) => g.id === id)!;
      expect(read()).toMatchObject(values);
      const beforePartial = structuredClone(read());
      usePhysicsStore.getState().updatePhysicsGroup(id, { name: "部分更新" });
      expect(read()).toEqual({ ...beforePartial, name: "部分更新" });
    });

    it("存在しないグループIDでは何もしない", () => {
      expect(() =>
        usePhysicsStore.getState().updatePhysicsGroup("nonexistent", { name: "X" }),
      ).not.toThrow();
    });
  });

  // --- addPendulum / removePendulum / updatePendulum ---

  describe("addPendulum", () => {
    it("振り子を追加する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().addPendulum(id);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.pendulums).toHaveLength(2);
      expect(usePhysicsStore.getState().runtimeStates[id]).toHaveLength(2);
    });

    it("存在しないグループIDでは何もしない", () => {
      expect(() => usePhysicsStore.getState().addPendulum("nonexistent")).not.toThrow();
    });
  });

  describe("removePendulum", () => {
    it("指定インデックスの振り子を削除する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().addPendulum(id);

      usePhysicsStore.getState().removePendulum(id, 0);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.pendulums).toHaveLength(1);
      expect(usePhysicsStore.getState().runtimeStates[id]).toHaveLength(1);
    });

    it("負のインデックスでは何もしない", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().removePendulum(id, -1);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.pendulums).toHaveLength(1);
    });

    it("範囲外のインデックスでは何もしない", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().removePendulum(id, 999);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.pendulums).toHaveLength(1);
    });

    it("存在しないグループIDでは何もしない", () => {
      expect(() =>
        usePhysicsStore.getState().removePendulum("nonexistent", 0),
      ).not.toThrow();
    });
  });

  describe("updatePendulum", () => {
    it("振り子のパラメータを更新する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().updatePendulum(id, 0, {
        length: 2,
        mass: 3,
        damping: 0.1,
      });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.pendulums[0]!.length).toBe(2);
      expect(group.pendulums[0]!.mass).toBe(3);
      expect(group.pendulums[0]!.damping).toBe(0.1);
    });

    it("部分的に更新できる", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().updatePendulum(id, 0, { mass: 5 });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.pendulums[0]!.mass).toBe(5);
      expect(group.pendulums[0]!.length).toBe(1);
    });

    it("負のインデックスでは何もしない", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      expect(() =>
        usePhysicsStore.getState().updatePendulum(id, -1, { mass: 5 }),
      ).not.toThrow();
    });

    it("範囲外のインデックスでは何もしない", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      expect(() =>
        usePhysicsStore.getState().updatePendulum(id, 999, { mass: 5 }),
      ).not.toThrow();
    });

    it("存在しないグループIDでは何もしない", () => {
      expect(() =>
        usePhysicsStore.getState().updatePendulum("nonexistent", 0, { mass: 5 }),
      ).not.toThrow();
    });
  });

  // --- addPhysicsInput / removePhysicsInput ---

  describe("addPhysicsInput", () => {
    it("物理入力を追加する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().addPhysicsInput(id, {
        type: "x",
        parameterId: "p1",
        weight: 1,
      });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.inputs).toHaveLength(1);
      expect(group.inputs[0]!.parameterId).toBe("p1");
    });

    it("存在しないグループIDでは何もしない", () => {
      expect(() =>
        usePhysicsStore.getState().addPhysicsInput("nonexistent", {
          type: "x",
          parameterId: "p1",
          weight: 1,
        }),
      ).not.toThrow();
    });
  });

  describe("removePhysicsInput", () => {
    it("指定インデックスの入力を削除する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().addPhysicsInput(id, {
        type: "x",
        parameterId: "p1",
        weight: 1,
      });
      usePhysicsStore.getState().addPhysicsInput(id, {
        type: "angle",
        parameterId: "p2",
        weight: 0.5,
      });

      usePhysicsStore.getState().removePhysicsInput(id, 0);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.inputs).toHaveLength(1);
      expect(group.inputs[0]!.parameterId).toBe("p2");
      usePhysicsStore.getState().removePhysicsInput(id, 0);
      expect(useEditorStore.getState().project!.physicsGroups.find((g) => g.id === id)!.inputs).toEqual([]);
    });

    it("負のインデックスでは何もしない", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().addPhysicsInput(id, {
        type: "x",
        parameterId: "p1",
        weight: 1,
      });

      usePhysicsStore.getState().removePhysicsInput(id, -1);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.inputs).toHaveLength(1);
    });

    it("範囲外のインデックスでは何もしない", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().removePhysicsInput(id, 999);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.inputs).toHaveLength(0);
    });

    it("存在しないグループIDでは何もしない", () => {
      expect(() =>
        usePhysicsStore.getState().removePhysicsInput("nonexistent", 0),
      ).not.toThrow();
    });
  });

  // --- addPhysicsOutput / removePhysicsOutput ---

  describe("addPhysicsOutput", () => {
    it("物理出力を追加する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().addPhysicsOutput(id, {
        type: "angle",
        parameterId: "p1",
        pendulumIndex: 0,
        weight: 1,
      });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.outputs).toHaveLength(1);
      expect(group.outputs[0]!.parameterId).toBe("p1");
    });

    it("存在しないグループIDでは何もしない", () => {
      expect(() =>
        usePhysicsStore.getState().addPhysicsOutput("nonexistent", {
          type: "angle",
          parameterId: "p1",
          pendulumIndex: 0,
          weight: 1,
        }),
      ).not.toThrow();
    });
  });

  describe("removePhysicsOutput", () => {
    it("指定インデックスの出力を削除する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().addPhysicsOutput(id, {
        type: "angle",
        parameterId: "p1",
        pendulumIndex: 0,
        weight: 1,
      });
      usePhysicsStore.getState().addPhysicsOutput(id, {
        type: "angle",
        parameterId: "p2",
        pendulumIndex: 0,
        weight: 0.5,
      });

      usePhysicsStore.getState().removePhysicsOutput(id, 0);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.outputs).toHaveLength(1);
      expect(group.outputs[0]!.parameterId).toBe("p2");
      usePhysicsStore.getState().removePhysicsOutput(id, 0);
      expect(useEditorStore.getState().project!.physicsGroups.find((g) => g.id === id)!.outputs).toEqual([]);
    });

    it("負のインデックスでは何もしない", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().addPhysicsOutput(id, {
        type: "angle",
        parameterId: "p1",
        pendulumIndex: 0,
        weight: 1,
      });

      usePhysicsStore.getState().removePhysicsOutput(id, -1);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.outputs).toHaveLength(1);
    });

    it("範囲外のインデックスでは何もしない", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().removePhysicsOutput(id, 999);

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.outputs).toHaveLength(0);
    });

    it("存在しないグループIDでは何もしない", () => {
      expect(() =>
        usePhysicsStore.getState().removePhysicsOutput("nonexistent", 0),
      ).not.toThrow();
    });
  });

  // --- setLipSyncConfig ---

  describe("setLipSyncConfig", () => {






    it("updates all lipsync fields then preserves the others during a gain-only change", () => {
      const values = { enabled: true, targetParameterId: "p1", source: "file" as const, threshold: 0.1, smoothing: 0.8, gain: 3 };
      usePhysicsStore.getState().setLipSyncConfig(values);
      expect(useEditorStore.getState().project!.lipsyncConfig).toMatchObject(values);
      const beforePartial = structuredClone(useEditorStore.getState().project!.lipsyncConfig);
      usePhysicsStore.getState().setLipSyncConfig({ gain: 4 });
      expect(useEditorStore.getState().project!.lipsyncConfig).toEqual({ ...beforePartial, gain: 4 });
    });
  });

  describe("applyHairStrandHelper", () => {
    function createHairProject() {
      const root = {
        id: "bone-root",
        name: "Root",
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        children: [],
        blendMode: "normal" as const,
        expanded: true,
        kind: "bone" as const,
        bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
      };
      const tip = {
        id: "bone-tip",
        name: "Tip",
        visible: true,
        opacity: 1,
        x: 0,
        y: 50,
        width: 0,
        height: 0,
        children: [],
        blendMode: "normal" as const,
        expanded: true,
        kind: "bone" as const,
        parentBoneId: root.id,
        bone: { angle: 0, length: 40, scaleX: 1, scaleY: 1 },
      };
      return createProject({ layers: [root, tip], physicsGroups: [] });
    }

    it("valid tip bone selection creates a managed helper group", () => {
      useEditorStore.setState({ project: createHairProject() });

      const result = usePhysicsStore.getState().applyHairStrandHelper("bone-tip", "side");

      expect(result.status).toBe("created");
      const group = useEditorStore.getState().project?.physicsGroups[0];
      expect(group?.managedTag).toBe("hairStrandHelper:v1:tip=bone-tip");
      expect(group?.managedSignature).toBe("bone-root>bone-tip");
      expect(group?.gravityStrength).toBe(9);
    });

    it("returns noProject when there is no project loaded", () => {
      useEditorStore.setState({ project: null });

      const result = usePhysicsStore
        .getState()
        .applyHairStrandHelper("bone-tip", "generic");

      expect(result).toEqual({ status: "rejected", reason: "noProject" });
    });
  });
});
