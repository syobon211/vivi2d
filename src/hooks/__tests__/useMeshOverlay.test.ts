import { act, renderHook } from "@testing-library/react";
import { findNearestVertex } from "@vivi2d/core/hit-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createGroup, createProject } from "@/test/fixtures";
import { createMinimalPixiRefs } from "@/test/pixi-mocks";
import { resetAllStores } from "@/test/store-reset";
import { useMeshOverlay } from "../useMeshOverlay";

vi.mock("@vivi2d/core/hit-test", () => ({
  findNearestVertex: vi.fn(),
  findNearestControlPoint: vi.fn(),
}));

let rafCallbacks: Array<() => void> = [];
vi.stubGlobal(
  "requestAnimationFrame",
  vi.fn((cb: () => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  }),
);
vi.stubGlobal("cancelAnimationFrame", vi.fn());

function createPointerEvent(
  overrides: Partial<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
    shiftKey: boolean;
    altKey: boolean;
  }> = {},
) {
  const target = document.createElement("div");
  vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
  vi.spyOn(target, "releasePointerCapture").mockImplementation(() => {});
  return {
    target,
    pointerId: overrides.pointerId ?? 1,
    shiftKey: overrides.shiftKey ?? false,
    altKey: overrides.altKey ?? false,
    nativeEvent: {
      offsetX: overrides.offsetX ?? 0,
      offsetY: overrides.offsetY ?? 0,
    },
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

function flushRaf() {
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  for (const callback of callbacks) {
    callback();
  }
}

describe("useMeshOverlay", () => {
  beforeEach(() => {
    resetAllStores();
    rafCallbacks = [];
    vi.mocked(findNearestVertex).mockReset();
    vi.mocked(requestAnimationFrame).mockClear();
    vi.mocked(cancelAnimationFrame).mockClear();
  });

  it("returns no visual model when the active tool is not mesh edit", () => {
    useViewportStore.setState({ activeTool: "select" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    expect(result.current.visualModel).toBeNull();
  });

  it("returns no visual model when no layer is selected", () => {
    useEditorStore.setState({ project: createProject() });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    expect(result.current.visualModel).toBeNull();
  });

  it("builds edge and vertex visuals for a selected ViviMesh", () => {
    const layer = createViviMesh({ id: "mesh-a" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    act(() => {
      flushRaf();
    });

    expect(result.current.visualModel).not.toBeNull();
    expect(result.current.visualModel?.layerId).toBe(layer.id);
    expect(result.current.visualModel?.mode).toBe("vertex");
    expect(result.current.visualModel?.edges.length).toBeGreaterThan(0);
    expect(result.current.visualModel?.vertices).toHaveLength(
      layer.mesh.vertices.length / 2,
    );
  });

  it("builds mesh edge and vertex data immediately for the active mesh edit target", () => {
    const layer = createViviMesh({ id: "mesh-a-deferred" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    expect(result.current.visualModel).not.toBeNull();
    expect(result.current.visualModel?.edges.length).toBeGreaterThan(0);
    expect(result.current.visualModel?.vertices).toHaveLength(
      layer.mesh.vertices.length / 2,
    );
  });

  it("updates screen-space edge coordinates when zoom changes", () => {
    const layer = createViviMesh({ id: "mesh-b" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit", zoom: 1, panX: 0, panY: 0 });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    act(() => {
      flushRaf();
    });

    const initialEdges = result.current.visualModel?.edges.map((edge) => ({
      x1: edge.x1,
      y1: edge.y1,
      x2: edge.x2,
      y2: edge.y2,
    }));
    expect(initialEdges).toBeDefined();

    act(() => {
      useViewportStore.setState({ zoom: 2 });
    });

    const nextEdges = result.current.visualModel?.edges.map((edge) => ({
      x1: edge.x1,
      y1: edge.y1,
      x2: edge.x2,
      y2: edge.y2,
    }));
    expect(nextEdges).toBeDefined();
    expect(nextEdges).not.toEqual(initialEdges);
  });

  it("returns no visual model for non-ViviMesh selections", () => {
    const group = createGroup({ id: "group-a" });
    useEditorStore.setState({ project: createProject({ layers: [group] }) });
    useSelectionStore.setState({
      selectedLayerId: group.id,
      selectedLayerIds: [group.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    expect(result.current.visualModel).toBeNull();
  });

  it("includes a lasso path in the visual model while lasso selection is active", () => {
    const layer = createViviMesh({ id: "mesh-c" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });
    useMeshEditStore.setState({
      lassoActive: true,
      lassoPoints: [10, 10, 50, 10, 50, 50, 10, 50],
    });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    expect(result.current.visualModel?.lassoPath).not.toBeNull();
  });

  it("ignores pointerdown when the active tool is not mesh edit", () => {
    const layer = createViviMesh({ id: "mesh-d" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "select" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));
    const event = createPointerEvent({ offsetX: 20, offsetY: 20 });

    result.current.onPointerDown(event);

    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("starts vertex dragging when a mesh vertex is hit", () => {
    vi.mocked(findNearestVertex).mockReturnValue(0);
    const layer = createViviMesh({ id: "mesh-e" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));
    const event = createPointerEvent({ offsetX: 10, offsetY: 10 });

    result.current.onPointerDown(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect((event.target as HTMLElement).setPointerCapture).toHaveBeenCalledWith(
      event.pointerId,
    );
    expect(useMeshEditStore.getState().selectedVertices).toContain(0);
  });

  it("toggles a vertex on shift-click without starting a drag", () => {
    vi.mocked(findNearestVertex).mockReturnValue(2);
    const layer = createViviMesh({ id: "mesh-f" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));
    const event = createPointerEvent({ offsetX: 10, offsetY: 10, shiftKey: true });

    result.current.onPointerDown(event);

    expect(useMeshEditStore.getState().selectedVertices).toContain(2);
    expect((event.target as HTMLElement).setPointerCapture).not.toHaveBeenCalled();
  });

  it("clears vertex selection on empty clicks", () => {
    vi.mocked(findNearestVertex).mockReturnValue(null);
    const layer = createViviMesh({ id: "mesh-g" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });
    useMeshEditStore.setState({ selectedVertices: [0, 1, 2] });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    result.current.onPointerDown(createPointerEvent({ offsetX: 999, offsetY: 999 }));

    expect(useMeshEditStore.getState().selectedVertices).toHaveLength(0);
  });

  it("selects vertices through alt-drag lasso", () => {
    const layer = createViviMesh({ id: "mesh-h", width: 100, height: 100 });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    result.current.onPointerDown(
      createPointerEvent({ offsetX: -10, offsetY: -10, altKey: true }),
    );
    result.current.onPointerMove(createPointerEvent({ offsetX: 200, offsetY: -10 }));
    result.current.onPointerMove(createPointerEvent({ offsetX: 200, offsetY: 200 }));
    result.current.onPointerMove(createPointerEvent({ offsetX: -10, offsetY: 200 }));
    result.current.onPointerUp(createPointerEvent({ offsetX: -10, offsetY: 200 }));

    expect(useMeshEditStore.getState().selectedVertices.length).toBeGreaterThan(0);
  });

  it("schedules a drag flush with requestAnimationFrame on pointer move", () => {
    vi.mocked(findNearestVertex).mockReturnValue(0);
    const layer = createViviMesh({ id: "mesh-i" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));
    result.current.onPointerDown(createPointerEvent({ offsetX: 10, offsetY: 10 }));

    result.current.onPointerMove(createPointerEvent({ offsetX: 20, offsetY: 30 }));

    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it("ends a drag and cancels the pending animation frame on pointer up", () => {
    vi.mocked(findNearestVertex).mockReturnValue(0);
    const layer = createViviMesh({ id: "mesh-j" });
    useEditorStore.setState({ project: createProject({ layers: [layer] }) });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));
    const downEvent = createPointerEvent({ offsetX: 10, offsetY: 10 });
    result.current.onPointerDown(downEvent);
    result.current.onPointerMove(createPointerEvent({ offsetX: 20, offsetY: 30 }));

    const upEvent = createPointerEvent();
    result.current.onPointerUp(upEvent);

    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect((upEvent.target as HTMLElement).releasePointerCapture).toHaveBeenCalledWith(
      upEvent.pointerId,
    );
  });

  it("warns and blocks editing while the default form lock is active", () => {
    vi.mocked(findNearestVertex).mockReturnValue(0);
    const layer = createViviMesh({ id: "mesh-k" });
    useEditorStore.setState({
      project: createProject({ layers: [layer], parameters: [] }),
    });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit", defaultFormLocked: true });

    const { result } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));
    const event = createPointerEvent({ offsetX: 10, offsetY: 10 });

    result.current.onPointerDown(event);

    expect(useNotificationStore.getState().notifications.at(-1)?.type).toBe("warning");
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("cancels the animation frame watcher on unmount", () => {
    const { unmount } = renderHook(() => useMeshOverlay(createMinimalPixiRefs()));

    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
