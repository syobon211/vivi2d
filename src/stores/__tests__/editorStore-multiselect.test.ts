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
