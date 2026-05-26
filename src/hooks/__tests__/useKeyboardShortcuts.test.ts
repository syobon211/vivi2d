import { renderHook } from "@testing-library/react";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import * as projectIO from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetSelectionStore,
  resetViewportStore,
} from "@/test/store-reset";

function fireKey(type: "keydown" | "keyup", init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent(type, { ...init, bubbles: true }));
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as any);
    resetViewportStore();
    resetEditorStore();
    resetSelectionStore();
    resetHistoryStore();
  });
  afterEach(() => {
    resetViewportStore();
    resetEditorStore();
    resetSelectionStore();
    resetHistoryStore();
  });

  it("'v' キーで選択ツールに切り替わる", () => {
    renderHook(() => useKeyboardShortcuts());
    useViewportStore.getState().setTool("pan");

    fireKey("keydown", { key: "v" });
    expect(useViewportStore.getState().activeTool).toBe("select");
  });

  it("'V'（大文字）でも選択ツールに切り替わる", () => {
    renderHook(() => useKeyboardShortcuts());
    useViewportStore.getState().setTool("pan");

    fireKey("keydown", { key: "V" });
    expect(useViewportStore.getState().activeTool).toBe("select");
  });

  it("'h' キーでパンツールに切り替わる", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "h" });
    expect(useViewportStore.getState().activeTool).toBe("pan");
  });

  it("'H'（大文字）でもパンツールに切り替わる", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "H" });
    expect(useViewportStore.getState().activeTool).toBe("pan");
  });

  it("Space キー押下でパンツールに一時的に切り替わる", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { code: "Space", key: " " });
    expect(useViewportStore.getState().activeTool).toBe("pan");
  });

  it("Space キーリリースで選択ツールに戻る", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { code: "Space", key: " " });
    expect(useViewportStore.getState().activeTool).toBe("pan");

    fireKey("keyup", { code: "Space", key: " " });
    expect(useViewportStore.getState().activeTool).toBe("select");
  });

  it("Space のリピートイベントは無視する", () => {
    renderHook(() => useKeyboardShortcuts());
    useViewportStore.getState().setTool("select");

    fireKey("keydown", { code: "Space", key: " ", repeat: true });
    expect(useViewportStore.getState().activeTool).toBe("select");
  });

  it("'m' キーでメッシュ編集ツールに切り替わる", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "m" });
    expect(useViewportStore.getState().activeTool).toBe("meshEdit");
  });

  it("'M'（大文字）でもメッシュ編集ツールに切り替わる", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "M" });
    expect(useViewportStore.getState().activeTool).toBe("meshEdit");
  });

  it("登録外のキーは無視する", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "x" });
    expect(useViewportStore.getState().activeTool).toBe("select");

    fireKey("keydown", { key: "z" });
    expect(useViewportStore.getState().activeTool).toBe("select");
  });

  it("アンマウント時にイベントリスナーを解除する", () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();

    fireKey("keydown", { key: "h" });
    expect(useViewportStore.getState().activeTool).toBe("select");
  });


  it("Ctrl+Z で undo が呼ばれる", () => {
    const spy = vi.spyOn(useHistoryStore.getState(), "undo");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "z", ctrlKey: true });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("Ctrl+Shift+Z で redo が呼ばれる", () => {
    const spy = vi.spyOn(useHistoryStore.getState(), "redo");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("Ctrl+S でプロジェクト保存が呼ばれる", () => {
    const layerA = createViviMesh({ id: "a", name: "A" });
    useEditorStore.setState({
      project: createProject({ layers: [layerA] }),
      projectVersion: 1,
    });
    const spy = vi.spyOn(projectIO, "saveProject").mockResolvedValue(true);
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "s", ctrlKey: true });
    expect(spy).toHaveBeenCalledWith(false);
    spy.mockRestore();
  });

  it("Ctrl+Shift+S で名前を付けて保存が呼ばれる", () => {
    const layerA = createViviMesh({ id: "a", name: "A" });
    useEditorStore.setState({
      project: createProject({ layers: [layerA] }),
      projectVersion: 1,
    });
    const spy = vi.spyOn(projectIO, "saveProject").mockResolvedValue(true);
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "s", ctrlKey: true, shiftKey: true });
    expect(spy).toHaveBeenCalledWith(true);
    spy.mockRestore();
  });

  it("Ctrl+↑ でレイヤーが上に移動する", () => {
    const layerA = createViviMesh({ id: "a", name: "A" });
    const layerB = createViviMesh({ id: "b", name: "B" });
    useEditorStore.setState({
      project: createProject({ layers: [layerA, layerB] }),
      projectVersion: 1,
    });
    useSelectionStore.setState({ selectedLayerId: "b", selectedLayerIds: ["b"] });
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "ArrowUp", ctrlKey: true });

    const proj = useEditorStore.getState().project!;
    expect(proj.layers[0]!.id).toBe("b");
  });

  it("Ctrl+↓ でレイヤーが下に移動する", () => {
    const layerA = createViviMesh({ id: "a", name: "A" });
    const layerB = createViviMesh({ id: "b", name: "B" });
    useEditorStore.setState({
      project: createProject({ layers: [layerA, layerB] }),
      projectVersion: 1,
    });
    useSelectionStore.setState({ selectedLayerId: "a", selectedLayerIds: ["a"] });
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "ArrowDown", ctrlKey: true });

    const proj = useEditorStore.getState().project!;
    expect(proj.layers[0]!.id).toBe("b");
  });

  it("Ctrl+A で全レイヤーが選択される", () => {
    const layerA = createViviMesh({ id: "a", name: "A" });
    const layerB = createViviMesh({ id: "b", name: "B" });
    useEditorStore.setState({
      project: createProject({ layers: [layerA, layerB] }),
      projectVersion: 1,
    });
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "a", ctrlKey: true });

    const state = useSelectionStore.getState();
    expect(state.selectedLayerIds.length).toBeGreaterThanOrEqual(2);
  });

  it("修飾キー（Ctrl）が押されている場合、ツール切り替えが無効", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "h", ctrlKey: true });
    expect(useViewportStore.getState().activeTool).toBe("select");
  });

  it("修飾キー（Alt）が押されている場合、ツール切り替えが無効", () => {
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "h", altKey: true });
    expect(useViewportStore.getState().activeTool).toBe("select");
  });
});
