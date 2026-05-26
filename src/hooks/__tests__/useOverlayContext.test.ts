
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { useOverlayContext } from "../useOverlayContext";

describe("useOverlayContext", () => {
  beforeEach(() => {
    resetAllStores();
  });
  afterEach(() => {
    resetAllStores();
  });

  it("初期状態のデフォルト shape を返す", () => {
    const { result } = renderHook(() => useOverlayContext());

    expect(result.current.project).toBeNull();
    expect(result.current.selectedLayerId).toBeNull();
    expect(result.current.selectedLayerIds).toEqual([]);
    expect(result.current.zoom).toBe(1);
    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);
    expect(typeof result.current.notify).toBe("function");
  });

  it("editorStore の project 変更が反映される", () => {
    const { result } = renderHook(() => useOverlayContext());

    const project = createProject({ name: "ctxテスト" });
    act(() => {
      useEditorStore.setState({ project, projectVersion: 1 });
    });

    expect(result.current.project?.name).toBe("ctxテスト");
  });

  it("selectionStore の選択変更が反映される", () => {
    const { result } = renderHook(() => useOverlayContext());

    act(() => {
      useSelectionStore.setState({
        selectedLayerId: "layer-1",
        selectedLayerIds: ["layer-1", "layer-2"],
        soloLayerIds: [],
      });
    });

    expect(result.current.selectedLayerId).toBe("layer-1");
    expect(result.current.selectedLayerIds).toEqual(["layer-1", "layer-2"]);
  });

  it("viewportStore の zoom/pan 変更が反映される", () => {
    const { result } = renderHook(() => useOverlayContext());

    act(() => {
      useViewportStore.setState({ zoom: 2.5, panX: 100, panY: -50 });
    });

    expect(result.current.zoom).toBe(2.5);
    expect(result.current.panX).toBe(100);
    expect(result.current.panY).toBe(-50);
  });

  it("notify は module-level closure で identity が安定", () => {
    const { result, rerender } = renderHook(() => useOverlayContext());
    const firstNotify = result.current.notify;

    act(() => {
      useViewportStore.setState({ zoom: 3 });
    });
    rerender();

    expect(result.current.notify).toBe(firstNotify);
  });

  it("notify は notificationStore に項目を追加する", () => {
    const { result } = renderHook(() => useOverlayContext());
    expect(useNotificationStore.getState().notifications).toEqual([]);

    act(() => {
      result.current.notify("warning", "テスト警告");
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("warning");
    expect(notifications[0]!.message).toBe("テスト警告");
  });

  it("ctx のフィールドに非購読の store が影響しない", () => {
    const { result } = renderHook(() => useOverlayContext());
    const initialSelectedLayerIds = result.current.selectedLayerIds;

    act(() => {
      useSelectionStore.setState({ soloLayerIds: ["s1", "s2"] });
    });

    expect(result.current.selectedLayerIds).toBe(initialSelectedLayerIds);
  });
});
