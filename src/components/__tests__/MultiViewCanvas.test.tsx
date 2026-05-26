import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useMultiViewStore } from "@/stores/multiViewStore";
import { resetAllStores } from "@/test/store-reset";
import { MultiViewCanvas } from "../MultiViewCanvas";


class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as any).ResizeObserver = MockResizeObserver;

describe("MultiViewCanvas", () => {
  beforeEach(() => {
    resetAllStores();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("レイアウトクラスが適用される", () => {
    useMultiViewStore.setState({
      layout: "split-vertical",
      views: [],
    } as any);
    const { container } = render(<MultiViewCanvas />);

    expect(container.querySelector(".multi-view-container")).toBeInTheDocument();
    expect(container.querySelector(".layout-split-vertical")).toBeInTheDocument();
  });

  it("views の数だけサブビューがレンダリングされる", () => {
    useMultiViewStore.setState({
      layout: "grid-2x2",
      views: [
        { id: "v1", zoom: 1, panX: 0, panY: 0, parameterOverrides: {} },
        { id: "v2", zoom: 1, panX: 0, panY: 0, parameterOverrides: {} },
      ],
    } as any);
    const { container } = render(<MultiViewCanvas />);

    const panes = container.querySelectorAll(".multi-view-pane");
    expect(panes).toHaveLength(2);
  });

  it("activeViewId と一致するビューに active クラスが付与される", () => {
    useMultiViewStore.setState({
      layout: "grid-2x2",
      activeViewId: "v1",
      views: [
        { id: "v1", zoom: 1, panX: 0, panY: 0, parameterOverrides: {} },
        { id: "v2", zoom: 1, panX: 0, panY: 0, parameterOverrides: {} },
      ],
    } as any);
    const { container } = render(<MultiViewCanvas />);

    const panes = container.querySelectorAll(".multi-view-pane");
    expect(panes[0]?.className).toContain("active");
    expect(panes[1]?.className).not.toContain("active");
  });

  it("サブビュークリックで setActiveView が呼ばれる", () => {
    const setActiveView = vi.fn();
    useMultiViewStore.setState({
      layout: "grid-2x2",
      activeViewId: "v1",
      views: [{ id: "v2", zoom: 1, panX: 0, panY: 0, parameterOverrides: {} }],
      setActiveView,
    } as any);
    const { container } = render(<MultiViewCanvas />);

    const pane = container.querySelector(".multi-view-pane") as HTMLElement;
    pane.click();

    expect(setActiveView).toHaveBeenCalledWith("v2");
  });

  it("project が null でもクラッシュしない", () => {
    useEditorStore.setState({ project: null, projectVersion: 0 });
    useMultiViewStore.setState({
      layout: "grid-2x2",
      views: [{ id: "v1", zoom: 1, panX: 0, panY: 0, parameterOverrides: {} }],
    } as any);

    expect(() => render(<MultiViewCanvas />)).not.toThrow();
  });

  it("views が空の場合パネルはレンダリングされない", () => {
    useMultiViewStore.setState({
      layout: "grid-2x2",
      views: [],
    } as any);
    const { container } = render(<MultiViewCanvas />);

    expect(container.querySelectorAll(".multi-view-pane")).toHaveLength(0);
  });
});
