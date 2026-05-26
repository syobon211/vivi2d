import { renderHook } from "@testing-library/react";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useEditorStore } from "@/stores/editorStore";
import { useExpressionPresetStore } from "@/stores/expressionPresetStore";
import * as projectIO from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createExpressionPreset, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetSelectionStore,
  resetViewportStore,
} from "@/test/store-reset";


function fireKey(type: "keydown" | "keyup", init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent(type, { ...init, bubbles: true }));
}


describe("useKeyboardShortcuts — 追加ブランチ", () => {
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

  it("Ctrl+S でプロジェクトが null の場合は保存しない", () => {
    useEditorStore.setState({ project: null });
    const spy = vi.spyOn(projectIO, "saveProject").mockResolvedValue(true);
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "s", ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("Ctrl+Shift+S でプロジェクトが null の場合は保存しない", () => {
    useEditorStore.setState({ project: null });
    const spy = vi.spyOn(projectIO, "saveProject").mockResolvedValue(true);
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "s", ctrlKey: true, shiftKey: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("Ctrl+↑ でレイヤー未選択の場合は moveLayer しない", () => {
    const layerA = createViviMesh({ id: "a", name: "A" });
    useEditorStore.setState({
      project: createProject({ layers: [layerA] }),
      projectVersion: 1,
    });
    // selectedLayerId = null
    useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
    const spy = vi.spyOn(useEditorStore.getState(), "moveLayer");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "ArrowUp", ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("Ctrl+↓ でレイヤー未選択の場合は moveLayer しない", () => {
    const layerA = createViviMesh({ id: "a", name: "A" });
    useEditorStore.setState({
      project: createProject({ layers: [layerA] }),
      projectVersion: 1,
    });
    useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
    const spy = vi.spyOn(useEditorStore.getState(), "moveLayer");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "ArrowDown", ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("metaKey で Ctrl 代用できる（macOS対応）", () => {
    const layerA = createViviMesh({ id: "a", name: "A" });
    const layerB = createViviMesh({ id: "b", name: "B" });
    useEditorStore.setState({
      project: createProject({ layers: [layerA, layerB] }),
      projectVersion: 1,
    });
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "a", metaKey: true });
    const state = useSelectionStore.getState();
    expect(state.selectedLayerIds.length).toBeGreaterThanOrEqual(2);
  });

  it("keyup で tempPan 以外のキーは何もしない", () => {
    renderHook(() => useKeyboardShortcuts());
    useViewportStore.getState().setTool("pan");

    fireKey("keyup", { key: "h" });
    expect(useViewportStore.getState().activeTool).toBe("pan");
  });
});


describe("useKeyboardShortcuts — 表情プリセットホットキー", () => {
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

  it("数字キー 1-9 で applyByHotkey が呼ばれる", () => {
    const preset = createExpressionPreset({
      name: "笑顔",
      hotkey: 1,
      values: { p1: 0.5 },
    });
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [preset],
        parameters: [
          { id: "p1", name: "テスト", minValue: 0, maxValue: 1, defaultValue: 0 },
        ],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "1" });
    expect(spy).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  it("Ctrl+数字キーでは applyByHotkey が呼ばれない", () => {
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [createExpressionPreset({ hotkey: 1 })],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "1", ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("Meta+数字キーでは applyByHotkey が呼ばれない", () => {
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [createExpressionPreset({ hotkey: 2 })],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "2", metaKey: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("Alt+数字キーでは applyByHotkey が呼ばれない", () => {
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [createExpressionPreset({ hotkey: 3 })],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "3", altKey: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("Shift+数字キーでは applyByHotkey が呼ばれない", () => {
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [createExpressionPreset({ hotkey: 4 })],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "4", shiftKey: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("INPUT要素にフォーカス中は applyByHotkey が呼ばれない", () => {
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [createExpressionPreset({ hotkey: 1 })],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const event = new KeyboardEvent("keydown", {
      key: "1",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });
    window.dispatchEvent(event);

    expect(spy).not.toHaveBeenCalled();
    document.body.removeChild(input);
    spy.mockRestore();
  });

  it("TEXTAREA要素にフォーカス中は applyByHotkey が呼ばれない", () => {
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [createExpressionPreset({ hotkey: 1 })],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    const event = new KeyboardEvent("keydown", {
      key: "1",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: textarea });
    window.dispatchEvent(event);

    expect(spy).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
    spy.mockRestore();
  });

  it("数字キー 9 で applyByHotkey(9) が呼ばれる", () => {
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [createExpressionPreset({ hotkey: 9 })],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "9" });
    expect(spy).toHaveBeenCalledWith(9);
    spy.mockRestore();
  });

  it("数字キー 0 では applyByHotkey が呼ばれない（範囲外）", () => {
    useEditorStore.setState({
      project: createProject({
        expressionPresets: [createExpressionPreset({ hotkey: 1 })],
      }),
      projectVersion: 1,
    });

    const spy = vi.spyOn(useExpressionPresetStore.getState(), "applyByHotkey");
    renderHook(() => useKeyboardShortcuts());

    fireKey("keydown", { key: "0" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
