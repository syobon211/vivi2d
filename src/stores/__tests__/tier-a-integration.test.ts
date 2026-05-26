import {
  mergeVertices,
  mirrorMesh,
  retriangulateMesh,
} from "@vivi2d/core/mesh-operations";
import type { MeshData } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import {
  DEFAULT_KEYMAP,
  matchesBinding,
  type ShortcutBinding,
  useShortcutStore,
} from "@/stores/shortcutStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";


function _fireKey(type: "keydown" | "keyup", init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent(type, { ...init, bubbles: true }));
}

function createSquareMesh(): MeshData {
  return {
    vertices: [0, 0, 100, 0, 100, 100, 0, 100],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 3, 1, 1, 3, 2],
    divisionsX: 0,
    divisionsY: 0,
  };
}


describe("ショートカット → キーボードハンドラ 統合", () => {
  beforeEach(() => {
    resetAllStores();
    _resetMergeTimer();
  });
  afterEach(resetAllStores);

  it("デフォルトキーマップで matchesBinding が正しく判定される", () => {
    const keymap = useShortcutStore.getState().keymap;

    const undoEvent = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
    });
    expect(matchesBinding(undoEvent, keymap.undo)).toBe(true);
    expect(matchesBinding(undoEvent, keymap.redo)).toBe(false);

    const redoEvent = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
    });
    expect(matchesBinding(redoEvent, keymap.redo)).toBe(true);
    expect(matchesBinding(redoEvent, keymap.undo)).toBe(false);
  });

  it("setShortcut でキーを変更すると matchesBinding が新バインディングに一致する", () => {
    const newBinding: ShortcutBinding = {
      key: "y",
      ctrl: true,
      shift: false,
      alt: false,
    };
    useShortcutStore.getState().setShortcut("undo", newBinding);

    const keymap = useShortcutStore.getState().keymap;

    const oldEvent = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
    });
    expect(matchesBinding(oldEvent, keymap.undo)).toBe(false);

    const newEvent = new KeyboardEvent("keydown", {
      key: "y",
      ctrlKey: true,
    });
    expect(matchesBinding(newEvent, keymap.undo)).toBe(true);
  });

  it("resetShortcut で個別アクションがデフォルトに戻る", () => {
    useShortcutStore.getState().setShortcut("save", {
      key: "w",
      ctrl: true,
      shift: false,
      alt: false,
    });
    expect(useShortcutStore.getState().keymap.save.key).toBe("w");

    useShortcutStore.getState().resetShortcut("save");
    expect(useShortcutStore.getState().keymap.save).toEqual(DEFAULT_KEYMAP.save);
  });

  it("importKeymap で部分的にキーマップを上書きできる", () => {
    const partial = {
      undo: { key: "q", ctrl: true, shift: false, alt: false } as ShortcutBinding,
    };
    useShortcutStore.getState().importKeymap(partial);

    const keymap = useShortcutStore.getState().keymap;
    expect(keymap.undo.key).toBe("q");
    expect(keymap.redo).toEqual(DEFAULT_KEYMAP.redo);
    expect(keymap.save).toEqual(DEFAULT_KEYMAP.save);
  });
});


describe("メッシュ編集フロー 統合", () => {
  let meshLayerId: string;

  beforeEach(() => {
    resetAllStores();
    _resetMergeTimer();

    const viviMesh = createViviMesh({
      id: "mesh-layer-1",
      mesh: createSquareMesh(),
    });
    meshLayerId = viviMesh.id;

    useEditorStore.setState({
      project: createProject({ layers: [viviMesh] }),
      projectVersion: 1,
    });
  });
  afterEach(resetAllStores);

  it("投げ縄選択 → 頂点マージ → editorStore 反映の一連フロー", () => {
    const store = useMeshEditStore.getState();

    store.selectVertices([0, 3]);
    expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 3]);

    const project = useEditorStore.getState().project!;
    const layer = project.layers[0]!;
    expect(layer.kind).toBe("viviMesh");
    const mesh = (layer as { mesh: MeshData }).mesh;

    const merged = mergeVertices(mesh, [0, 3]);
    expect(merged).not.toBeNull();
    expect(merged!.vertices.length / 2).toBe(3);

    useEditorStore.getState().setMeshData(meshLayerId, merged!);

    const updated = useEditorStore.getState().project!.layers[0]! as { mesh: MeshData };
    expect(updated.mesh.vertices.length / 2).toBe(3);
    expect(updated.mesh.vertices[0]).toBe(0);
    expect(updated.mesh.vertices[1]).toBe(50);
  });

  it("ミラー → editorStore 反映 → Undo で元に戻る", () => {
    const project = useEditorStore.getState().project!;
    const originalMesh = (project.layers[0] as { mesh: MeshData }).mesh;
    const originalVerts = [...originalMesh.vertices];

    const mirrored = mirrorMesh(originalMesh, "x", 100, 100);
    useEditorStore.getState().setMeshData(meshLayerId, mirrored);

    const afterMirror = (
      useEditorStore.getState().project!.layers[0] as { mesh: MeshData }
    ).mesh;
    expect(afterMirror.vertices[0]).toBe(100);
    expect(afterMirror.vertices[1]).toBe(0);

    // Undo
    useHistoryStore.getState().undo();

    const afterUndo = (useEditorStore.getState().project!.layers[0] as { mesh: MeshData })
      .mesh;
    for (let i = 0; i < originalVerts.length; i++) {
      expect(afterUndo.vertices[i]).toBe(originalVerts[i]);
    }
  });

  it("再三角分割 → editorStore 反映 → Undo → Redo", () => {
    const project = useEditorStore.getState().project!;
    const originalMesh = (project.layers[0] as { mesh: MeshData }).mesh;
    const originalIndices = [...originalMesh.indices];

    const retriangulated = retriangulateMesh(originalMesh, 100, 100);
    useEditorStore.getState().setMeshData(meshLayerId, retriangulated);

    const afterRetri = (
      useEditorStore.getState().project!.layers[0] as { mesh: MeshData }
    ).mesh;
    for (const idx of afterRetri.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
    }

    useHistoryStore.getState().undo();
    const afterUndo = (useEditorStore.getState().project!.layers[0] as { mesh: MeshData })
      .mesh;
    expect(afterUndo.indices).toEqual(originalIndices);

    useHistoryStore.getState().redo();
    const afterRedo = (useEditorStore.getState().project!.layers[0] as { mesh: MeshData })
      .mesh;
    expect(afterRedo.indices).toEqual(retriangulated.indices);
  });

  it("meshEditStore の選択状態が editorStore と独立している", () => {
    useMeshEditStore.getState().selectVertices([0, 1, 2]);
    expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 1, 2]);

    const mesh = (useEditorStore.getState().project!.layers[0] as { mesh: MeshData })
      .mesh;
    const mirrored = mirrorMesh(mesh, "x", 100, 100);
    useEditorStore.getState().setMeshData(meshLayerId, mirrored);
    useHistoryStore.getState().undo();

    expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 1, 2]);
  });

  it("複数操作の連続適用で履歴が正しく積まれる", () => {
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);

    const getMesh = () =>
      (useEditorStore.getState().project!.layers[0] as { mesh: MeshData }).mesh;

    const m1 = mirrorMesh(getMesh(), "x", 100, 100);
    useEditorStore.getState().setMeshData(meshLayerId, m1);
    _resetMergeTimer();

    const m2 = mirrorMesh(getMesh(), "y", 100, 100);
    useEditorStore.getState().setMeshData(meshLayerId, m2);
    _resetMergeTimer();

    const m3 = retriangulateMesh(getMesh(), 100, 100);
    useEditorStore.getState().setMeshData(meshLayerId, m3);

    expect(useHistoryStore.getState().undoStack).toHaveLength(3);

    useHistoryStore.getState().undo();
    useHistoryStore.getState().undo();
    useHistoryStore.getState().undo();

    const restored = getMesh();
    expect(restored.vertices).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
  });
});


describe("投げ縄ワークフロー 統合", () => {
  beforeEach(() => {
    resetAllStores();
  });
  afterEach(resetAllStores);

  it("startLasso → addLassoPoint → endLasso → selectVertices の完全フロー", () => {
    const store = useMeshEditStore.getState();

    store.startLasso();
    expect(useMeshEditStore.getState().lassoActive).toBe(true);

    store.addLassoPoint(0, 0);
    store.addLassoPoint(60, 0);
    store.addLassoPoint(60, 60);
    store.addLassoPoint(0, 60);
    expect(useMeshEditStore.getState().lassoPoints).toHaveLength(8);

    store.endLasso();
    expect(useMeshEditStore.getState().lassoActive).toBe(false);
    expect(useMeshEditStore.getState().lassoPoints).toEqual([]);

    useMeshEditStore.getState().selectVertices([0, 1]);
    expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 1]);
  });

  it("投げ縄選択後に Shift+toggleVertex で追加選択できる", () => {
    useMeshEditStore.getState().selectVertices([0, 2]);

    useMeshEditStore.getState().toggleVertex(3);
    expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 2, 3]);

    useMeshEditStore.getState().toggleVertex(0);
    expect(useMeshEditStore.getState().selectedVertices).toEqual([2, 3]);
  });

  it("selectVertex（単一選択）で投げ縄選択がクリアされる", () => {
    useMeshEditStore.getState().selectVertices([0, 1, 2, 3]);
    expect(useMeshEditStore.getState().selectedVertices).toHaveLength(4);

    useMeshEditStore.getState().selectVertex(1);
    expect(useMeshEditStore.getState().selectedVertices).toEqual([1]);
  });
});
