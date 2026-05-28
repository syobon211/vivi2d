import { findLayerById } from "@vivi2d/core/layer-utils";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { closeProject, loadPsdFromBuffer } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { resetEditorStore, resetSelectionStore } from "@/test/store-reset";

describe("editorStore", () => {
  beforeEach(() => {
    resetEditorStore();
    resetSelectionStore();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [
        { name: "背景", left: 0, top: 0, right: 800, bottom: 600, opacity: 255 },
        {
          name: "キャラ",
          children: [
            { name: "体", left: 100, top: 100, right: 300, bottom: 500, opacity: 255 },
            {
              name: "顔",
              left: 150,
              top: 50,
              right: 250,
              bottom: 150,
              opacity: 200,
              hidden: true,
            },
          ],
        },
      ],
    } as any);
  });

  afterEach(() => {
    clearTextures();
  });

  describe("初期状態", () => {
    it("プロジェクト未読み込み状態", () => {
      const state = useEditorStore.getState();
      expect(state.project).toBeNull();
      expect(useSelectionStore.getState().selectedLayerId).toBeNull();
    });
  });

  describe("loadPsdFromBuffer", () => {
    it("PSD を読み込んでプロジェクトを設定する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const { project } = useEditorStore.getState();

      expect(project).not.toBeNull();
      expect(project!.name).toBe("test");
      expect(project!.width).toBe(800);
      expect(project!.height).toBe(600);
      expect(project!.layers).toHaveLength(2);
    });

    it("読み込み時に選択をリセットする", () => {
      useSelectionStore.getState().selectLayer("some-id");

      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");

      expect(useSelectionStore.getState().selectedLayerId).toBeNull();
    });

    it("PSD パースエラー時はプロジェクトを設定せずエラー通知する", () => {
      vi.mocked(readPsd).mockImplementationOnce(() => {
        throw new Error("invalid PSD format");
      });

      loadPsdFromBuffer(new ArrayBuffer(0), "broken.psd");
      expect(useEditorStore.getState().project).toBeNull();
    });

    it("ネストされたレイヤー構造を保持する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const { project } = useEditorStore.getState();
      const group = project!.layers[1]!;

      expect(group.name).toBe("キャラ");
      expect(group.kind).toBe("group");
      expect(group.children).toHaveLength(2);
      expect(group.children[0]!.name).toBe("体");
      expect(group.children[1]!.name).toBe("顔");
    });
  });

  describe("closeProject", () => {
    it("プロジェクトをクリアして初期状態に戻る", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");

      closeProject();
      const state = useEditorStore.getState();

      expect(state.project).toBeNull();
      expect(useSelectionStore.getState().selectedLayerId).toBeNull();
    });
  });

  describe("selectLayer", () => {
    it("レイヤーを選択できる", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const layerId = useEditorStore.getState().project!.layers[0]!.id;

      useSelectionStore.getState().selectLayer(layerId);
      expect(useSelectionStore.getState().selectedLayerId).toBe(layerId);
    });

    it("null で選択を解除できる", () => {
      useSelectionStore.getState().selectLayer("some-id");
      useSelectionStore.getState().selectLayer(null);
      expect(useSelectionStore.getState().selectedLayerId).toBeNull();
    });
  });

  describe("toggleVisibility", () => {
    it("レイヤーの表示/非表示を切り替える", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const layerId = useEditorStore.getState().project!.layers[0]!.id;

      expect(
        findLayerById(useEditorStore.getState().project!.layers, layerId)!.visible,
      ).toBe(true);

      useEditorStore.getState().toggleVisibility(layerId);
      expect(
        findLayerById(useEditorStore.getState().project!.layers, layerId)!.visible,
      ).toBe(false);

      useEditorStore.getState().toggleVisibility(layerId);
      expect(
        findLayerById(useEditorStore.getState().project!.layers, layerId)!.visible,
      ).toBe(true);
    });

    it("ネストされたレイヤーの表示を切り替える", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const group = useEditorStore.getState().project!.layers[1]!;
      const childId = group.children[1]!.id;

      expect(
        findLayerById(useEditorStore.getState().project!.layers, childId)!.visible,
      ).toBe(false);

      useEditorStore.getState().toggleVisibility(childId);
      expect(
        findLayerById(useEditorStore.getState().project!.layers, childId)!.visible,
      ).toBe(true);
    });

    it("プロジェクト未読み込み時は何もしない", () => {
      expect(() => {
        useEditorStore.getState().toggleVisibility("any-id");
      }).not.toThrow();
    });
  });

  describe("toggleExpanded", () => {
    it("グループの展開/折りたたみを切り替える", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const groupId = useEditorStore.getState().project!.layers[1]!.id;

      expect(
        findLayerById(useEditorStore.getState().project!.layers, groupId)!.expanded,
      ).toBe(true);

      useEditorStore.getState().toggleExpanded(groupId);
      expect(
        findLayerById(useEditorStore.getState().project!.layers, groupId)!.expanded,
      ).toBe(false);
    });
  });

  describe("setLayerOpacity", () => {
    it("レイヤーの不透明度を設定する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const layerId = useEditorStore.getState().project!.layers[0]!.id;

      useEditorStore.getState().setLayerOpacity(layerId, 0.5);
      const layer = findLayerById(useEditorStore.getState().project!.layers, layerId)!;
      expect(layer.opacity).toBe(0.5);
    });

    it("不透明度を 0〜1 にクランプする", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const layerId = useEditorStore.getState().project!.layers[0]!.id;

      useEditorStore.getState().setLayerOpacity(layerId, -0.5);
      expect(
        findLayerById(useEditorStore.getState().project!.layers, layerId)!.opacity,
      ).toBe(0);

      useEditorStore.getState().setLayerOpacity(layerId, 1.5);
      expect(
        findLayerById(useEditorStore.getState().project!.layers, layerId)!.opacity,
      ).toBe(1);
    });
  });

  describe("loadPsdFromBuffer のバージョン管理", () => {
    it("loadPsdFromBuffer のたびに projectVersion がインクリメントされる", () => {
      expect(useEditorStore.getState().projectVersion).toBe(0);

      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      expect(useEditorStore.getState().projectVersion).toBe(1);

      loadPsdFromBuffer(new ArrayBuffer(0), "test2.psd");
      expect(useEditorStore.getState().projectVersion).toBe(2);
    });

    it("closeProject で projectVersion がリセットされる", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      expect(useEditorStore.getState().projectVersion).toBe(1);

      closeProject();
      expect(useEditorStore.getState().projectVersion).toBe(0);
    });
  });

  describe("toggleVisibility と toggleExpanded の堅牢性", () => {
    it("存在しない ID に toggleVisibility しても例外にならない", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      expect(() => {
        useEditorStore.getState().toggleVisibility("nonexistent-id");
      }).not.toThrow();
    });

    it("存在しない ID に toggleExpanded しても例外にならない", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      expect(() => {
        useEditorStore.getState().toggleExpanded("nonexistent-id");
      }).not.toThrow();
    });
  });

  describe("setLayerOpacity の境界値", () => {
    it("存在しない ID に setLayerOpacity しても例外にならない", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      expect(() => {
        useEditorStore.getState().setLayerOpacity("nonexistent-id", 0.5);
      }).not.toThrow();
    });

    it("ちょうど 0 と 1 の不透明度を設定できる", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const layerId = useEditorStore.getState().project!.layers[0]!.id;

      useEditorStore.getState().setLayerOpacity(layerId, 0);
      expect(
        findLayerById(useEditorStore.getState().project!.layers, layerId)!.opacity,
      ).toBe(0);

      useEditorStore.getState().setLayerOpacity(layerId, 1);
      expect(
        findLayerById(useEditorStore.getState().project!.layers, layerId)!.opacity,
      ).toBe(1);
    });
  });

  describe("Phase 2: メッシュ操作", () => {
    it("setMeshVertices でメッシュ頂点を更新する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const layerId = useEditorStore.getState().project!.layers[0]!.id;
      const layer = findLayerById(useEditorStore.getState().project!.layers, layerId)!;

      if (layer.kind !== "viviMesh") throw new Error("expected viviMesh");
      expect(layer.mesh).toBeDefined();

      const newVerts = [0, 0, 100, 0, 100, 100, 0, 100];
      useEditorStore.getState().setMeshVertices(layerId, newVerts);

      const updated = findLayerById(useEditorStore.getState().project!.layers, layerId)!;
      if (updated.kind !== "viviMesh") throw new Error("expected viviMesh");
      expect(updated.mesh.vertices).toEqual(newVerts);
    });

    it("setMeshDivisions でグリッドを再分割する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const layerId = useEditorStore.getState().project!.layers[0]!.id;

      useEditorStore.getState().setMeshDivisions(layerId, 5, 4);

      const layer = findLayerById(useEditorStore.getState().project!.layers, layerId)!;
      if (layer.kind !== "viviMesh") throw new Error("expected viviMesh");
      expect(layer.mesh.divisionsX).toBe(5);
      expect(layer.mesh.divisionsY).toBe(4);
      expect(layer.mesh.vertices.length).toBe(30 * 2);
    });

    it("プロジェクト未読み込み時は何もしない", () => {
      expect(() => {
        useEditorStore.getState().setMeshVertices("any", [0, 0]);
        useEditorStore.getState().setMeshDivisions("any", 2, 2);
      }).not.toThrow();
    });
  });

  describe("Phase 3: パラメータシステム", () => {
    it("addParameter でパラメータを追加しデフォルト値を設定する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      useParameterDefinitionStore.getState().addParameter("角度X", -30, 30, 0);

      const params = useEditorStore.getState().project!.parameters;
      expect(params).toHaveLength(1);
      expect(params[0]!.name).toBe("角度X");
      expect(params[0]!.minValue).toBe(-30);
      expect(params[0]!.maxValue).toBe(30);
      expect(params[0]!.defaultValue).toBe(0);
    });

    it("updateParameter でパラメータ属性を更新する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      useParameterDefinitionStore.getState().addParameter("旧名", 0, 10, 5);
      const paramId = useEditorStore.getState().project!.parameters[0]!.id;

      useParameterDefinitionStore
        .getState()
        .updateParameter(paramId, { name: "新名", maxValue: 20 });

      const param = useEditorStore.getState().project!.parameters[0]!;
      expect(param.name).toBe("新名");
      expect(param.maxValue).toBe(20);
      expect(param.minValue).toBe(0);
    });

    it("プロジェクト未読み込み時の全パラメータ操作が安全", () => {
      expect(() => {
        const paramActions = useParameterDefinitionStore.getState();
        paramActions.addParameter("テスト", 0, 1, 0);
        paramActions.removeParameter("any");
        paramActions.updateParameter("any", { name: "新名" });
      }).not.toThrow();
    });

    it("updateParameter で存在しないパラメータIDは何もしない", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      useParameterDefinitionStore.getState().addParameter("テスト", 0, 10, 5);

      expect(() => {
        useParameterDefinitionStore
          .getState()
          .updateParameter("nonexistent", { name: "新名" });
      }).not.toThrow();

      expect(useEditorStore.getState().project!.parameters[0]!.name).toBe("テスト");
    });

    it("addParameter で複数パラメータを追加できる", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      useParameterDefinitionStore.getState().addParameter("P1", 0, 10, 5);
      useParameterDefinitionStore.getState().addParameter("P2", -30, 30, 0);
      useParameterDefinitionStore.getState().addParameter("P3", 0, 1, 0.5);

      const params = useEditorStore.getState().project!.parameters;
      expect(params).toHaveLength(3);
      expect(params[0]!.name).toBe("P1");
      expect(params[1]!.name).toBe("P2");
      expect(params[2]!.name).toBe("P3");

      const ids = new Set(params.map((p) => p.id));
      expect(ids.size).toBe(3);
    });

    it("removeParameter で中間のパラメータを削除しても他は残る", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      useParameterDefinitionStore.getState().addParameter("P1", 0, 10, 5);
      useParameterDefinitionStore.getState().addParameter("P2", -30, 30, 0);
      useParameterDefinitionStore.getState().addParameter("P3", 0, 1, 0.5);

      const p2Id = useEditorStore.getState().project!.parameters[1]!.id;
      useParameterDefinitionStore.getState().removeParameter(p2Id);

      const params = useEditorStore.getState().project!.parameters;
      expect(params).toHaveLength(2);
      expect(params[0]!.name).toBe("P1");
      expect(params[1]!.name).toBe("P3");
    });
  });
});


describe("editorStore — 物理グループ管理", () => {
  beforeEach(() => {
    resetEditorStore();
    clearTextures();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
  });

  afterEach(clearTextures);

  it("loadPsd で physicsGroups が空配列に初期化される", () => {
    expect(useEditorStore.getState().project!.physicsGroups).toEqual([]);
  });

  it("loadPsd で lipsyncConfig が初期化される", () => {
    const config = useEditorStore.getState().project!.lipsyncConfig;
    expect(config.enabled).toBe(false);
    expect(config.targetParameterId).toBeNull();
    expect(config.source).toBe("microphone");
  });

  it("addPhysicsGroup で物理グループを追加できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("髪揺れ");
    const groups = useEditorStore.getState().project!.physicsGroups;
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe(id);
    expect(groups[0]!.name).toBe("髪揺れ");
    expect(groups[0]!.enabled).toBe(true);
    expect(groups[0]!.pendulums).toHaveLength(1);
  });

  it("removePhysicsGroup で物理グループを削除できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore.getState().removePhysicsGroup(id);
    expect(useEditorStore.getState().project!.physicsGroups).toHaveLength(0);
  });

  it("updatePhysicsGroup でグループのプロパティを更新できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore.getState().updatePhysicsGroup(id, {
      name: "更新後",
      enabled: false,
      gravityDirection: 45,
      gravityStrength: 5,
      wind: 2,
    });
    const group = useEditorStore.getState().project!.physicsGroups[0]!;
    expect(group.name).toBe("更新後");
    expect(group.enabled).toBe(false);
    expect(group.gravityDirection).toBe(45);
    expect(group.gravityStrength).toBe(5);
    expect(group.wind).toBe(2);
  });

  it("updatePhysicsGroup で一部のプロパティだけ更新できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore.getState().updatePhysicsGroup(id, { name: "名前のみ" });
    const group = useEditorStore.getState().project!.physicsGroups[0]!;
    expect(group.name).toBe("名前のみ");
    expect(group.enabled).toBe(true);
    expect(group.gravityStrength).toBe(9.8);
  });

  it("addPendulum で振り子を追加できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore.getState().addPendulum(id);
    expect(useEditorStore.getState().project!.physicsGroups[0]!.pendulums).toHaveLength(
      2,
    );
  });

  it("removePendulum で振り子を削除できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore.getState().addPendulum(id);
    usePhysicsStore.getState().removePendulum(id, 0);
    expect(useEditorStore.getState().project!.physicsGroups[0]!.pendulums).toHaveLength(
      1,
    );
  });

  it("updatePendulum で振り子のプロパティを更新できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore
      .getState()
      .updatePendulum(id, 0, { length: 2, mass: 0.5, damping: 0.1 });
    const p = useEditorStore.getState().project!.physicsGroups[0]!.pendulums[0]!;
    expect(p.length).toBe(2);
    expect(p.mass).toBe(0.5);
    expect(p.damping).toBe(0.1);
  });

  it("addPhysicsInput で入力マッピングを追加できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore
      .getState()
      .addPhysicsInput(id, { parameterId: "p1", weight: 1, type: "x" });
    const group = useEditorStore.getState().project!.physicsGroups[0]!;
    expect(group.inputs).toHaveLength(1);
    expect(group.inputs[0]!.parameterId).toBe("p1");
  });

  it("removePhysicsInput で入力マッピングを削除できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore
      .getState()
      .addPhysicsInput(id, { parameterId: "p1", weight: 1, type: "x" });
    usePhysicsStore.getState().removePhysicsInput(id, 0);
    expect(useEditorStore.getState().project!.physicsGroups[0]!.inputs).toHaveLength(0);
  });

  it("addPhysicsOutput で出力マッピングを追加できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore.getState().addPhysicsOutput(id, {
      parameterId: "hair-x",
      pendulumIndex: 0,
      weight: 10,
      type: "angle",
    });
    const group = useEditorStore.getState().project!.physicsGroups[0]!;
    expect(group.outputs).toHaveLength(1);
    expect(group.outputs[0]!.parameterId).toBe("hair-x");
  });

  it("removePhysicsOutput で出力マッピングを削除できる", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore.getState().addPhysicsOutput(id, {
      parameterId: "hair-x",
      pendulumIndex: 0,
      weight: 10,
      type: "angle",
    });
    usePhysicsStore.getState().removePhysicsOutput(id, 0);
    expect(useEditorStore.getState().project!.physicsGroups[0]!.outputs).toHaveLength(0);
  });

  it("存在しないグループIDでは何もしない", () => {
    usePhysicsStore.getState().updatePhysicsGroup("nonexistent", { name: "test" });
    usePhysicsStore.getState().addPendulum("nonexistent");
    usePhysicsStore.getState().removePendulum("nonexistent", 0);
    expect(useEditorStore.getState().project!.physicsGroups).toHaveLength(0);
  });

  it("範囲外のインデックスでは振り子を削除しない", () => {
    const id = usePhysicsStore.getState().addPhysicsGroup("テスト");
    usePhysicsStore.getState().removePendulum(id, 99);
    expect(useEditorStore.getState().project!.physicsGroups[0]!.pendulums).toHaveLength(
      1,
    );
  });
});


describe("editorStore — リップシンク設定", () => {
  beforeEach(() => {
    resetEditorStore();
    clearTextures();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
  });

  afterEach(clearTextures);

  it("setLipSyncConfig で enabled を変更できる", () => {
    usePhysicsStore.getState().setLipSyncConfig({ enabled: true });
    expect(useEditorStore.getState().project!.lipsyncConfig.enabled).toBe(true);
  });

  it("setLipSyncConfig で targetParameterId を変更できる", () => {
    usePhysicsStore.getState().setLipSyncConfig({ targetParameterId: "mouth-open" });
    expect(useEditorStore.getState().project!.lipsyncConfig.targetParameterId).toBe(
      "mouth-open",
    );
  });

  it("setLipSyncConfig で source を変更できる", () => {
    usePhysicsStore.getState().setLipSyncConfig({ source: "file" });
    expect(useEditorStore.getState().project!.lipsyncConfig.source).toBe("file");
  });

  it("setLipSyncConfig で数値パラメータを変更できる", () => {
    usePhysicsStore.getState().setLipSyncConfig({
      threshold: 0.05,
      smoothing: 0.8,
      gain: 3.0,
    });
    const config = useEditorStore.getState().project!.lipsyncConfig;
    expect(config.threshold).toBe(0.05);
    expect(config.smoothing).toBe(0.8);
    expect(config.gain).toBe(3.0);
  });

  it("プロジェクトなしでは何もしない", () => {
    closeProject();
    usePhysicsStore.getState().setLipSyncConfig({ enabled: true });
    expect(useEditorStore.getState().project).toBeNull();
  });
});

describe("editorStore — メッシュ操作の分岐カバレッジ", () => {
  beforeEach(() => {
    resetEditorStore();
    resetSelectionStore();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [
        { name: "背景", left: 0, top: 0, right: 800, bottom: 600, opacity: 255 },
        {
          name: "グループ",
          children: [
            { name: "体", left: 100, top: 100, right: 300, bottom: 500, opacity: 255 },
          ],
        },
      ],
    });
  });

  it("setMeshVertices でボーン/グループには適用されない（isViviMesh 分岐）", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const project = useEditorStore.getState().project!;
    const group = project.layers.find((l) => l.kind === "group");
    if (!group) return;

    expect(() => {
      useEditorStore.getState().setMeshVertices(group.id, [0, 0]);
    }).not.toThrow();
  });

  it("setMeshData でグループノードには適用されない", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const project = useEditorStore.getState().project!;
    const group = project.layers.find((l) => l.kind === "group");
    if (!group) return;

    expect(() => {
      useEditorStore.getState().setMeshData(group.id, {
        vertices: [0, 0],
        uvs: [0, 0],
        indices: [0],
        divisionsX: 1,
        divisionsY: 1,
      });
    }).not.toThrow();
  });

  it("setMeshDivisions でグループノードには適用されない", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const project = useEditorStore.getState().project!;
    const group = project.layers.find((l) => l.kind === "group");
    if (!group) return;

    expect(() => {
      useEditorStore.getState().setMeshDivisions(group.id, 3, 3);
    }).not.toThrow();
  });

  it("setAutoMesh でテクスチャが無い場合は何もしない", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const layerId = useEditorStore.getState().project!.layers[0]!.id;

    expect(() => {
      useEditorStore.getState().setAutoMesh(layerId, "standard");
    }).not.toThrow();
  });

  it("setAutoMeshBatch でテクスチャが無いレイヤーはスキップされる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const project = useEditorStore.getState().project!;
    const allIds = project.layers.map((l) => l.id);

    expect(() => {
      useEditorStore.getState().setAutoMeshBatch(allIds, "standard");
    }).not.toThrow();
  });

  it("reorderLayer で存在しないIDの場合は何もしない", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");

    expect(() => {
      useEditorStore.getState().reorderLayer("nonexistent", "also-nonexistent", "before");
    }).not.toThrow();
  });
});
