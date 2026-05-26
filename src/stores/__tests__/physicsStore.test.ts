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


  it("初期状態が正しい", () => {
    const state = usePhysicsStore.getState();
    expect(state.runtimeStates).toEqual({});
    expect(state.previousParamValues).toEqual({});
    expect(state.accumulators).toEqual({});
    expect(state.isActive).toBe(true);
  });

  // --- initialize ---

  it("物理グループからランタイム状態を初期化する", () => {
    const group = createPhysicsGroup({
      pendulums: [
        { length: 1, mass: 1, damping: 0.05 },
        { length: 0.8, mass: 0.5, damping: 0.1 },
      ],
    });
    usePhysicsStore.getState().initialize([group]);

    const state = usePhysicsStore.getState();
    expect(state.runtimeStates[group.id]).toHaveLength(2);
    expect(state.runtimeStates[group.id]![0]).toEqual({ angle: 0, angularVelocity: 0 });
    expect(state.runtimeStates[group.id]![1]).toEqual({ angle: 0, angularVelocity: 0 });
    expect(state.accumulators[group.id]).toBe(0);
  });

  it("複数グループを初期化できる", () => {
    const g1 = createPhysicsGroup({ name: "髪" });
    const g2 = createPhysicsGroup({
      name: "リボン",
      pendulums: [
        { length: 1, mass: 1, damping: 0.05 },
        { length: 0.5, mass: 0.3, damping: 0.1 },
        { length: 0.3, mass: 0.2, damping: 0.15 },
      ],
    });
    usePhysicsStore.getState().initialize([g1, g2]);

    const state = usePhysicsStore.getState();
    expect(state.runtimeStates[g1.id]).toHaveLength(1);
    expect(state.runtimeStates[g2.id]).toHaveLength(3);
  });

  it("initialize は previousParamValues をクリアする", () => {
    usePhysicsStore.getState().snapshotParamValues({ p1: 5 });
    usePhysicsStore.getState().initialize([createPhysicsGroup()]);
    expect(usePhysicsStore.getState().previousParamValues).toEqual({});
  });

  // --- reset ---

  it("全振り子状態をゼロにリセットする", () => {
    const group = createPhysicsGroup();
    usePhysicsStore.getState().initialize([group]);

    const states = usePhysicsStore.getState().runtimeStates[group.id]!;
    states[0]!.angle = 1.5;
    states[0]!.angularVelocity = 3.2;

    usePhysicsStore.getState().reset();

    const resetStates = usePhysicsStore.getState().runtimeStates[group.id]!;
    expect(resetStates[0]!).toEqual({ angle: 0, angularVelocity: 0 });
  });

  it("reset はアキュムレータもゼロにする", () => {
    const group = createPhysicsGroup();
    usePhysicsStore.getState().initialize([group]);
    usePhysicsStore.getState().setAccumulator(group.id, 0.005);
    usePhysicsStore.getState().reset();
    expect(usePhysicsStore.getState().accumulators[group.id]).toBe(0);
  });

  it("reset は previousParamValues もクリアする", () => {
    usePhysicsStore.getState().snapshotParamValues({ p1: 10 });
    usePhysicsStore.getState().reset();
    expect(usePhysicsStore.getState().previousParamValues).toEqual({});
  });

  // --- setActive ---

  it("シミュレーションを無効にできる", () => {
    usePhysicsStore.getState().setActive(false);
    expect(usePhysicsStore.getState().isActive).toBe(false);
  });

  it("シミュレーションを再有効化できる", () => {
    usePhysicsStore.getState().setActive(false);
    usePhysicsStore.getState().setActive(true);
    expect(usePhysicsStore.getState().isActive).toBe(true);
  });

  // --- snapshotParamValues ---

  it("パラメータ値のスナップショットを保存する", () => {
    const values = { p1: 5, p2: 10 };
    usePhysicsStore.getState().snapshotParamValues(values);
    expect(usePhysicsStore.getState().previousParamValues).toEqual(values);
  });

  it("スナップショットは元のオブジェクトの参照を保持しない", () => {
    const values = { p1: 5 };
    usePhysicsStore.getState().snapshotParamValues(values);
    values.p1 = 999;
    expect(usePhysicsStore.getState().previousParamValues.p1).toBe(5);
  });

  // --- setAccumulator ---

  it("アキュムレータを更新する", () => {
    usePhysicsStore.getState().setAccumulator("g1", 0.005);
    expect(usePhysicsStore.getState().accumulators.g1).toBe(0.005);
  });

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
      expect(group!.pendulums).toHaveLength(1);
      expect(group!.inputs).toEqual([]);
      expect(group!.outputs).toEqual([]);
    });

    it("複数回呼び出すと異なるIDのグループが追加される", () => {
      const id1 = usePhysicsStore.getState().addPhysicsGroup("A");
      const id2 = usePhysicsStore.getState().addPhysicsGroup("B");

      expect(id1).not.toBe(id2);
      const project = useEditorStore.getState().project!;
      expect(project.physicsGroups).toHaveLength(2);
    });

    it("syncs runtime state when adding a physics group", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("runtime");

      const state = usePhysicsStore.getState();
      expect(state.runtimeStates[id]).toHaveLength(1);
      expect(state.runtimeStates[id]![0]).toEqual({ angle: 0, angularVelocity: 0 });
      expect(state.accumulators[id]).toBe(0);
    });
  });

  // --- removePhysicsGroup ---

  describe("removePhysicsGroup", () => {
    it("指定IDのグループを削除する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("削除対象");
      usePhysicsStore.getState().addPhysicsGroup("残留");

      usePhysicsStore.getState().removePhysicsGroup(id);

      const project = useEditorStore.getState().project!;
      expect(project.physicsGroups).toHaveLength(1);
      expect(project.physicsGroups[0]!.name).toBe("残留");
    });

    it("存在しないIDでは何もしない", () => {
      usePhysicsStore.getState().addPhysicsGroup("テスト");
      expect(() =>
        usePhysicsStore.getState().removePhysicsGroup("nonexistent"),
      ).not.toThrow();

      const project = useEditorStore.getState().project!;
      expect(project.physicsGroups).toHaveLength(1);
    });

    it("clears runtime state when removing a physics group", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("runtime");

      usePhysicsStore.getState().removePhysicsGroup(id);

      const state = usePhysicsStore.getState();
      expect(state.runtimeStates[id]).toBeUndefined();
      expect(state.accumulators[id]).toBeUndefined();
    });
  });

  // --- updatePhysicsGroup ---

  describe("updatePhysicsGroup", () => {
    it("名前を更新する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("旧名");
      usePhysicsStore.getState().updatePhysicsGroup(id, { name: "新名" });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.name).toBe("新名");
    });

    it("enabled を更新する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().updatePhysicsGroup(id, { enabled: false });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.enabled).toBe(false);
    });

    it("gravityDirection を更新する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().updatePhysicsGroup(id, { gravityDirection: 90 });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.gravityDirection).toBe(90);
    });

    it("gravityStrength を更新する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().updatePhysicsGroup(id, { gravityStrength: 20 });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.gravityStrength).toBe(20);
    });

    it("wind を更新する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().updatePhysicsGroup(id, { wind: 5 });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.wind).toBe(5);
    });

    it("複数フィールドを同時に更新する", () => {
      const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
      usePhysicsStore.getState().updatePhysicsGroup(id, {
        name: "更新済み",
        enabled: false,
        wind: 3,
      });

      const project = useEditorStore.getState().project!;
      const group = project.physicsGroups.find((g) => g.id === id)!;
      expect(group.name).toBe("更新済み");
      expect(group.enabled).toBe(false);
      expect(group.wind).toBe(3);
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
    it("enabled を更新する", () => {
      usePhysicsStore.getState().setLipSyncConfig({ enabled: true });

      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.enabled).toBe(true);
    });

    it("targetParameterId を更新する", () => {
      usePhysicsStore.getState().setLipSyncConfig({ targetParameterId: "p1" });

      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.targetParameterId).toBe("p1");
    });

    it("source を更新する", () => {
      usePhysicsStore.getState().setLipSyncConfig({ source: "file" });

      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.source).toBe("file");
    });

    it("threshold を更新する", () => {
      usePhysicsStore.getState().setLipSyncConfig({ threshold: 0.1 });

      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.threshold).toBe(0.1);
    });

    it("smoothing を更新する", () => {
      usePhysicsStore.getState().setLipSyncConfig({ smoothing: 0.8 });

      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.smoothing).toBe(0.8);
    });

    it("gain を更新する", () => {
      usePhysicsStore.getState().setLipSyncConfig({ gain: 2 });

      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.gain).toBe(2);
    });

    it("複数フィールドを同時に更新する", () => {
      usePhysicsStore.getState().setLipSyncConfig({
        enabled: true,
        threshold: 0.2,
        gain: 3,
      });

      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.enabled).toBe(true);
      expect(project.lipsyncConfig.threshold).toBe(0.2);
      expect(project.lipsyncConfig.gain).toBe(3);
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
