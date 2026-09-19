import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createLayerTree } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("selectionStore", () => {
  beforeEach(() => resetAllStores());


  describe("selectLayer", () => {
    it("単一選択・置換・トグル追加と最後の解除を一連で検証する", () => {
      const { selectLayer, toggleLayerSelection } = useSelectionStore.getState();
      const assertSelection = (ids: string[], primary: string | null) => {
        expect(useSelectionStore.getState().selectedLayerIds).toEqual(ids);
        expect(useSelectionStore.getState().selectedLayerId).toBe(primary);
      };
      selectLayer("layer-1");
      assertSelection(["layer-1"], "layer-1");
      selectLayer("layer-2");
      assertSelection(["layer-2"], "layer-2");
      selectLayer(null);
      assertSelection([], null);
      toggleLayerSelection("layer-1");
      assertSelection(["layer-1"], "layer-1");
      toggleLayerSelection("layer-2");
      assertSelection(["layer-1", "layer-2"], "layer-2");
      toggleLayerSelection("layer-1");
      assertSelection(["layer-2"], "layer-2");
      toggleLayerSelection("layer-2");
      assertSelection([], null);
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
      expect(state.selectedLayerIds).toEqual([
        ids.group, ids.childA, ids.childB, ids.nested, ids.nestedChild, ids.standalone,
      ]);
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
      expect(state.selectedLayerIds).toEqual([
        ids.group, ids.childA, ids.childB, ids.nested, ids.nestedChild, ids.standalone,
      ]);
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

    describe("toggleSolo", () => {
      it("ソロの切替・追加・除外・全解除を一連で検証する", () => {
        const { toggleSolo, addToSolo, clearSolo } = useSelectionStore.getState();
        toggleSolo("layer-1");
        expect(useSelectionStore.getState().soloLayerIds).toEqual(["layer-1"]);
        toggleSolo("layer-1");
        expect(useSelectionStore.getState().soloLayerIds).toEqual([]);
        toggleSolo("layer-1");
        toggleSolo("layer-2");
        expect(useSelectionStore.getState().soloLayerIds).toEqual(["layer-2"]);
        addToSolo("layer-1");
        expect(useSelectionStore.getState().soloLayerIds).toEqual(["layer-2", "layer-1"]);
        addToSolo("layer-2");
        expect(useSelectionStore.getState().soloLayerIds).toEqual(["layer-1"]);
        addToSolo("layer-1");
        expect(useSelectionStore.getState().soloLayerIds).toEqual([]);
        toggleSolo("layer-1");
        addToSolo("layer-2");
        clearSolo();
        expect(useSelectionStore.getState().soloLayerIds).toEqual([]);
      });




    });


  });
});
