import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createGroup, createProject } from "@/test/fixtures";
import { resetEditorStore, resetSelectionStore } from "@/test/store-reset";


const childA = createViviMesh({ id: "a", name: "A" });
const childB = createViviMesh({ id: "b", name: "B" });
const childC = createViviMesh({ id: "c", name: "C" });
const group = createGroup({
  id: "g1",
  name: "グループ",
  children: [childA, childB],
});

function setupProject() {
  useEditorStore.setState({
    project: createProject({
      layers: [group, childC],
    }),
    projectVersion: 1,
  });
  useSelectionStore.setState({
    selectedLayerId: null,
    selectedLayerIds: [],
  });
}

describe("editorStore レイヤー操作", () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as any);
    setupProject();
  });
  afterEach(() => {
    resetEditorStore();
    resetSelectionStore();
  });

  // ============================================================
  // moveLayer
  // ============================================================

  describe("moveLayer", () => {
    it("up でレイヤーを上に移動できる", () => {
      useEditorStore.getState().moveLayer("b", "up");

      const proj = useEditorStore.getState().project!;
      const g = proj.layers.find((l) => l.id === "g1")!;
      expect(g.children[0]!.id).toBe("b");
      expect(g.children[1]!.id).toBe("a");
    });

    it("down でレイヤーを下に移動できる", () => {
      useEditorStore.getState().moveLayer("a", "down");

      const proj = useEditorStore.getState().project!;
      const g = proj.layers.find((l) => l.id === "g1")!;
      expect(g.children[0]!.id).toBe("b");
      expect(g.children[1]!.id).toBe("a");
    });

    it("先頭レイヤーを up しても変化なし", () => {
      useEditorStore.getState().moveLayer("a", "up");

      const proj = useEditorStore.getState().project!;
      const g = proj.layers.find((l) => l.id === "g1")!;
      expect(g.children[0]!.id).toBe("a");
    });

    it("ルートレベルでも移動できる", () => {
      useEditorStore.getState().moveLayer("c", "up");

      const proj = useEditorStore.getState().project!;
      expect(proj.layers[0]!.id).toBe("c");
      expect(proj.layers[1]!.id).toBe("g1");
    });
  });

  // ============================================================
  // reorderLayer
  // ============================================================

  describe("reorderLayer", () => {
    it("before でターゲットの前に挿入できる", () => {
      useEditorStore.getState().reorderLayer("c", "g1", "before");

      const proj = useEditorStore.getState().project!;
      expect(proj.layers[0]!.id).toBe("c");
      expect(proj.layers[1]!.id).toBe("g1");
    });

    it("after でターゲットの後に挿入できる", () => {
      useEditorStore.getState().reorderLayer("c", "a", "after");

      const proj = useEditorStore.getState().project!;
      const g = proj.layers.find((l) => l.id === "g1")!;
      expect(g.children[0]!.id).toBe("a");
      expect(g.children[1]!.id).toBe("c");
    });

    it("after でルートレベルのターゲットの後に挿入できる", () => {
      useEditorStore.getState().reorderLayer("c", "g1", "after");

      const proj = useEditorStore.getState().project!;
      expect(proj.layers[0]!.id).toBe("g1");
      expect(proj.layers[1]!.id).toBe("c");
    });
  });


  describe("toggleLayerSelection", () => {
    it("レイヤーを選択に追加できる", () => {
      useSelectionStore.getState().toggleLayerSelection("a");

      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toContain("a");
      expect(state.selectedLayerId).toBe("a");
    });

    it("複数レイヤーを選択に追加できる", () => {
      useSelectionStore.getState().toggleLayerSelection("a");
      useSelectionStore.getState().toggleLayerSelection("b");

      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toContain("a");
      expect(state.selectedLayerIds).toContain("b");
      expect(state.selectedLayerId).toBe("b");
    });

    it("選択済みレイヤーをトグルで解除できる", () => {
      useSelectionStore.getState().toggleLayerSelection("a");
      useSelectionStore.getState().toggleLayerSelection("b");
      useSelectionStore.getState().toggleLayerSelection("a");

      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).not.toContain("a");
      expect(state.selectedLayerIds).toContain("b");
      expect(state.selectedLayerId).toBe("b");
    });

    it("最後の選択を解除すると selectedLayerId が null になる", () => {
      useSelectionStore.getState().toggleLayerSelection("a");
      useSelectionStore.getState().toggleLayerSelection("a");

      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toHaveLength(0);
      expect(state.selectedLayerId).toBeNull();
    });
  });

  describe("rangeSelectLayer", () => {
    it("起点から終点までの範囲選択ができる", () => {
      useSelectionStore.getState().selectLayer("a");
      useSelectionStore.getState().rangeSelectLayer("c");

      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds.length).toBeGreaterThanOrEqual(2);
      expect(state.selectedLayerId).toBe("c");
    });

    it("選択起点がない場合は単一選択になる", () => {
      useSelectionStore.getState().rangeSelectLayer("b");

      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds).toEqual(["b"]);
      expect(state.selectedLayerId).toBe("b");
    });
  });

  describe("selectAllLayers", () => {
    it("全レイヤーが選択される", () => {
      useSelectionStore.getState().selectAllLayers();

      const state = useSelectionStore.getState();
      expect(state.selectedLayerIds.length).toBeGreaterThanOrEqual(4);
      expect(state.selectedLayerId).not.toBeNull();
      expect(state.selectedLayerIds).toContain(state.selectedLayerId);
    });
  });

  // ============================================================
  // setClipMaskIds
  // ============================================================

  describe("setClipMaskIds", () => {
    it("クリッピングマスクIDを設定できる", () => {
      useEditorStore.getState().setClipMaskIds("a", ["b"]);

      const proj = useEditorStore.getState().project!;
      const g = proj.layers.find((l) => l.id === "g1")!;
      const node = g.children.find((c) => c.id === "a")!;
      expect(node.clipMaskIds).toEqual(["b"]);
    });

    it("クリッピングマスクをクリアできる", () => {
      useEditorStore.getState().setClipMaskIds("a", ["b"]);
      useEditorStore.getState().setClipMaskIds("a", []);

      const proj = useEditorStore.getState().project!;
      const g = proj.layers.find((l) => l.id === "g1")!;
      const node = g.children.find((c) => c.id === "a")!;
      expect(node.clipMaskIds).toEqual([]);
    });
  });
});
