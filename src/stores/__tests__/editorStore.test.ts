import { findLayerById } from "@vivi2d/core/layer-utils";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as autoMesh from "@/lib/auto-mesh";
import { clearTextures, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { closeProject, loadPsdFromBuffer } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { createGroup, createProject, createViviMesh } from "@/test/fixtures";
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




    it("プロジェクト未読み込み時の全パラメータ操作が安全", () => {
      expect(() => {
        const paramActions = useParameterDefinitionStore.getState();
        paramActions.addParameter("テスト", 0, 1, 0);
        paramActions.removeParameter("any");
        paramActions.updateParameter("any", { name: "新名" });
      }).not.toThrow();
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























  it("存在しないグループIDでは何もしない", () => {
    usePhysicsStore.getState().updatePhysicsGroup("nonexistent", { name: "test" });
    usePhysicsStore.getState().addPendulum("nonexistent");
    usePhysicsStore.getState().removePendulum("nonexistent", 0);
    expect(useEditorStore.getState().project!.physicsGroups).toHaveLength(0);
  });


});


describe("editorStore — リップシンク設定", () => {
  beforeEach(() => {
    resetEditorStore();
    clearTextures();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
  });

  afterEach(clearTextures);









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

  it.each(["setMeshVertices", "setMeshData", "setMeshDivisions"] as const)("%s は既存グループとプロジェクト全体を変更しない", (operation) => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const project = useEditorStore.getState().project!;
    const group = project.layers.find((layer) => layer.kind === "group");
    expect(group).toBeDefined();
    if (!group) throw new Error("Expected fixture group");
    const before = structuredClone(project);
    const actions = useEditorStore.getState();
    if (operation === "setMeshVertices") actions.setMeshVertices(group.id, [0, 0]);
    else if (operation === "setMeshData") {
      actions.setMeshData(group.id, {
        vertices: [0, 0], uvs: [0, 0], indices: [0], divisionsX: 1, divisionsY: 1,
      });
    } else actions.setMeshDivisions(group.id, 3, 3);
    expect(useEditorStore.getState().project).toEqual(before);
  });






  it("setAutoMeshBatch はテクスチャありだけ更新し、欠落ID・グループ・テクスチャなしを保持する", () => {
    const textured = createViviMesh({ id: "textured", width: 20, height: 30 });
    const untextured = createViviMesh({ id: "untextured" });
    const group = createGroup({ id: "group", children: [untextured] });
    useEditorStore.setState({ project: createProject({ layers: [textured, group] }) });
    const before = structuredClone(useEditorStore.getState().project!);
    const canvas = document.createElement("canvas");
    setTexture(textured.id, canvas);
    const mesh = { vertices: [0, 0, 20, 0, 0, 30], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2], divisionsX: 1, divisionsY: 1 };
    // This checks store routing and resulting state, not the mesh generator algorithm.
    const generate = vi.spyOn(autoMesh, "generateAutoMesh").mockReturnValue(mesh);
    try {
      useEditorStore.getState().setAutoMeshBatch(
        ["missing", group.id, untextured.id, textured.id], "standard",
      );
      expect(generate).toHaveBeenCalledExactlyOnceWith(canvas, 20, 30, "standard");
      const expected = structuredClone(before);
      const expectedMesh = expected.layers[0]!;
      if (expectedMesh.kind !== "viviMesh") throw new Error("Expected fixture mesh");
      expectedMesh.mesh = mesh;
      expect(useEditorStore.getState().project).toEqual(expected);
    } finally {
      generate.mockRestore();
      clearTextures();
    }
  });

  it("reorderLayer で存在しないIDの場合はプロジェクト全体を変更しない", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const before = structuredClone(useEditorStore.getState().project);
    useEditorStore.getState().reorderLayer("nonexistent", "also-nonexistent", "before");
    expect(useEditorStore.getState().project).toEqual(before);
  });
});
