import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createLayerTree } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("selectionStore", () => {
  beforeEach(() => resetAllStores());

  describe("初期状態", () => {
    it("デフォルト値が正しい", () => {
      const state = useSelectionStore.getState();
      expect(state.selectedLayerId).toBeNull();
      expect(state.selectedLayerIds).toEqual([]);
    });
  });

  describe("selectLayer", () => {
    it("レイヤーを単一選択する", () => {
      useSelectionStore.getState().selectLayer("layer-1");
      const state = useSelectionStore.getState();
      expect(state.selectedLayerId).toBe("layer-1");
      expect(state.selectedLayerIds).toEqual(["layer-1"]);
    });

    it("nullで選択を解除する", () => {
      useSelectionStore.getState().selectLayer("layer-1");
      useSelectionStore.getState().selectLayer(null);
      const state = useSelectionStore.getState();
      expect(state.selectedLayerId).toBeNull();
      expect(state.selectedLayerIds).toEqual([]);
    });

    it("別のレイヤーを選択すると前の選択が上書きされる", () => {
      useSelectionStore.getState().selectLayer("layer-1");
      useSelectionStore.getState().selectLayer("layer-2");
      const state = useSelectionStore.getState();
      expect(state.selectedLayerId).toBe("layer-2");
      expect(state.selectedLayerIds).toEqual(["layer-2"]);
    });
  });

  describe("toggleLayerSelection", () => {
    it("未選択のレイヤーをトグルすると追加される", () => {
      useSelectionStore.getState().selectLayer("layer-1");
      useSelectionStore.getState().toggleLayerSelection("layer-2");
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual(["layer-1", "layer-2"]);
      expect(state.selectedLayerId).toBe("layer-2");
    });

    it("選択済みのレイヤーをトグルすると除外される", () => {
      useSelectionStore.getState().selectLayer("layer-1");
      useSelectionStore.getState().toggleLayerSelection("layer-2");
      useSelectionStore.getState().toggleLayerSelection("layer-1");
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual(["layer-2"]);
      expect(state.selectedLayerId).toBe("layer-2");
    });

    it("最後の1つを除外するとselectedLayerIdがnullになる", () => {
      useSelectionStore.getState().selectLayer("layer-1");
      useSelectionStore.getState().toggleLayerSelection("layer-1");
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual([]);
      expect(state.selectedLayerId).toBeNull();
    });

    it("空の状態からトグルすると1件追加される", () => {
      useSelectionStore.getState().toggleLayerSelection("layer-1");
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual(["layer-1"]);
      expect(state.selectedLayerId).toBe("layer-1");
    });
  });

  describe("rangeSelectLayer", () => {
    function setupProjectWithLayers() {
      const { root, ids } = createLayerTree();
      useEditorStore.setState({
        project: {
          name: "テスト",
          width: 800,
          height: 600,
          layers: root,
          parameters: [],
          clips: [],
          scenes: [],
          physicsGroups: [],
          lipsyncConfig: {
            enabled: false,
            targetParameterId: null,
            source: "microphone",
            threshold: 0.01,
            smoothing: 0.3,
            gain: 1,
          },
          skins: {},
          colliders: [],
          stateMachines: [],
        },
        projectVersion: 1,
      });
      return ids;
    }

    it("起点と終点の間のレイヤーを範囲選択する", () => {
      const ids = setupProjectWithLayers();
      useSelectionStore.getState().selectLayer(ids.childA);
      useSelectionStore.getState().rangeSelectLayer(ids.childB);
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual([ids.childA, ids.childB]);
      expect(state.selectedLayerId).toBe(ids.childB);
    });

    it("逆方向の範囲選択も動作する", () => {
      const ids = setupProjectWithLayers();
      useSelectionStore.getState().selectLayer(ids.childB);
      useSelectionStore.getState().rangeSelectLayer(ids.childA);
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual([ids.childA, ids.childB]);
      expect(state.selectedLayerId).toBe(ids.childA);
    });

    it("複数階層をまたぐ範囲選択ができる", () => {
      const ids = setupProjectWithLayers();
      useSelectionStore.getState().selectLayer(ids.group);
      useSelectionStore.getState().rangeSelectLayer(ids.standalone);
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toHaveLength(6);
      expect(state.selectedLayerIds).toContain(ids.group);
      expect(state.selectedLayerIds).toContain(ids.standalone);
    });

    it("起点が未設定の場合は単一選択になる", () => {
      const ids = setupProjectWithLayers();
      useSelectionStore.getState().rangeSelectLayer(ids.childA);
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual([ids.childA]);
      expect(state.selectedLayerId).toBe(ids.childA);
    });

    it("プロジェクトがない場合は何もしない", () => {
      useSelectionStore.getState().rangeSelectLayer("any-id");
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual([]);
    });
  });

  describe("selectAllLayers", () => {
    it("全レイヤーを選択する", () => {
      const { root, ids } = createLayerTree();
      useEditorStore.setState({
        project: {
          name: "テスト",
          width: 800,
          height: 600,
          layers: root,
          parameters: [],
          clips: [],
          scenes: [],
          physicsGroups: [],
          lipsyncConfig: {
            enabled: false,
            targetParameterId: null,
            source: "microphone",
            threshold: 0.01,
            smoothing: 0.3,
            gain: 1,
          },
          skins: {},
          colliders: [],
          stateMachines: [],
        },
        projectVersion: 1,
      });
      useSelectionStore.getState().selectAllLayers();
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toHaveLength(6);
      expect(state.selectedLayerId).toBe(ids.group);
    });

    it("プロジェクトがない場合は何もしない", () => {
      useSelectionStore.getState().selectAllLayers();
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual([]);
    });

    it("レイヤーが空のプロジェクトでは空配列のまま", () => {
      useEditorStore.setState({
        project: {
          name: "空",
          width: 800,
          height: 600,
          layers: [],
          parameters: [],
          clips: [],
          scenes: [],
          physicsGroups: [],
          lipsyncConfig: {
            enabled: false,
            targetParameterId: null,
            source: "microphone",
            threshold: 0.01,
            smoothing: 0.3,
            gain: 1,
          },
          skins: {},
          colliders: [],
          stateMachines: [],
        },
        projectVersion: 1,
      });
      useSelectionStore.getState().selectAllLayers();
      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual([]);
      expect(state.selectedLayerId).toBeNull();
    });
  });

  describe("clearSelection", () => {
    it("選択を全解除する", () => {
      useSelectionStore.getState().selectLayer("layer-1");
      useSelectionStore.getState().toggleLayerSelection("layer-2");
      useSelectionStore.getState().clearSelection();
      const state = useSelectionStore.getState();
      expect(state.selectedLayerId).toBeNull();
      expect(state.selectedLayerIds).toEqual([]);
    });
  });

  describe("ソロ表示", () => {
    it("初期状態でsoloLayerIdsが空", () => {
      expect(useSelectionStore.getState().soloLayerIds).toEqual([]);
    });

    describe("toggleSolo", () => {
      it("レイヤーをソロにする", () => {
        useSelectionStore.getState().toggleSolo("layer-1");
        expect(useSelectionStore.getState().soloLayerIds).toEqual(["layer-1"]);
      });

      it("同じレイヤーを再度トグルするとソロ解除", () => {
        useSelectionStore.getState().toggleSolo("layer-1");
        useSelectionStore.getState().toggleSolo("layer-1");
        expect(useSelectionStore.getState().soloLayerIds).toEqual([]);
      });

      it("別のレイヤーをトグルすると切り替わる", () => {
        useSelectionStore.getState().toggleSolo("layer-1");
        useSelectionStore.getState().toggleSolo("layer-2");
        expect(useSelectionStore.getState().soloLayerIds).toEqual(["layer-2"]);
      });
    });

    describe("addToSolo", () => {
      it("ソロ群にレイヤーを追加する", () => {
        useSelectionStore.getState().toggleSolo("layer-1");
        useSelectionStore.getState().addToSolo("layer-2");
        expect(useSelectionStore.getState().soloLayerIds).toEqual(["layer-1", "layer-2"]);
      });

      it("既にソロ中のレイヤーを追加すると除外される", () => {
        useSelectionStore.getState().toggleSolo("layer-1");
        useSelectionStore.getState().addToSolo("layer-2");
        useSelectionStore.getState().addToSolo("layer-1");
        expect(useSelectionStore.getState().soloLayerIds).toEqual(["layer-2"]);
      });

      it("最後の1つを除外すると空になる", () => {
        useSelectionStore.getState().toggleSolo("layer-1");
        useSelectionStore.getState().addToSolo("layer-1");
        expect(useSelectionStore.getState().soloLayerIds).toEqual([]);
      });
    });

    describe("clearSolo", () => {
      it("ソロ表示を全解除する", () => {
        useSelectionStore.getState().toggleSolo("layer-1");
        useSelectionStore.getState().addToSolo("layer-2");
        useSelectionStore.getState().clearSolo();
        expect(useSelectionStore.getState().soloLayerIds).toEqual([]);
      });
    });
  });
});
