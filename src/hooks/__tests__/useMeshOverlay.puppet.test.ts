import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { createMinimalPixiRefs } from "@/test/pixi-mocks";
import { resetAllStores } from "@/test/store-reset";
import { useMeshOverlay } from "../useMeshOverlay";

vi.mock("@vivi2d/core/hit-test", () => ({
  findNearestVertex: vi.fn(),
}));

const mockGraphics = {
  clear: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  circle: vi.fn(),
  fill: vi.fn(),
};

vi.mock("../useOverlayGraphics", () => ({
  useOverlayGraphics: vi.fn(() => ({ current: mockGraphics })),
}));

function createPointerEvent(
  overrides: Partial<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }> = {},
) {
  const target = document.createElement("div");
  vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
  vi.spyOn(target, "releasePointerCapture").mockImplementation(() => {});
  return {
    target,
    pointerId: overrides.pointerId ?? 1,
    ctrlKey: overrides.ctrlKey ?? false,
    metaKey: overrides.metaKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
    nativeEvent: {
      offsetX: overrides.offsetX ?? 0,
      offsetY: overrides.offsetY ?? 0,
    },
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

describe("useMeshOverlay puppet mode", () => {
  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
  });

  function setup() {
    const layer = createViviMesh({ width: 100, height: 100 });
    const project = createProject({ layers: [layer] });
    const pixiRefs = createMinimalPixiRefs();

    useEditorStore.setState({ project });
    useSelectionStore.setState({
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
    });
    useViewportStore.setState({ activeTool: "meshEdit" });
    usePuppetWarpStore.setState({ mode: "puppet" });

    const hook = renderHook(() => useMeshOverlay(pixiRefs));
    return { layer, ...hook };
  }

  it("creates a handle pin on the nearest vertex", async () => {
    const { findNearestVertex } = await import("@vivi2d/core/hit-test");
    vi.mocked(findNearestVertex).mockReturnValue(1);
    const { layer, result } = setup();

    const event = createPointerEvent({ offsetX: 50, offsetY: 0 });
    act(() => {
      result.current.onPointerDown(event);
    });

    const pins = usePuppetWarpStore.getState().pinsByMeshId[layer.id] ?? [];
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ vertexIndex: 1, kind: "handle" });
    expect(usePuppetWarpStore.getState().selectedPinIds).toEqual([pins[0]!.id]);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("creates mirrored anchor pins when symmetry is enabled", async () => {
    const { findNearestVertex } = await import("@vivi2d/core/hit-test");
    vi.mocked(findNearestVertex).mockReturnValue(0);
    const { layer, result } = setup();

    act(() => {
      usePuppetWarpStore.setState({
        symmetryEnabled: true,
        symmetryTolerance: 1,
      });
    });

    const event = createPointerEvent({ offsetX: 0, offsetY: 0, ctrlKey: true });
    act(() => {
      result.current.onPointerDown(event);
    });

    const pins = usePuppetWarpStore.getState().pinsByMeshId[layer.id] ?? [];
    expect(pins).toHaveLength(2);
    expect(pins.every((pin) => pin.kind === "anchor")).toBe(true);
    const left = pins.find((pin) => pin.vertexIndex === 0);
    const right = pins.find((pin) => pin.vertexIndex !== 0);
    expect(left?.mirrorPinId).toBe(right?.id ?? null);
    expect(right?.mirrorPinId).toBe(left?.id ?? null);
  });

  it("drags selected handle pins through setMeshVertices", () => {
    const setMeshVertices = vi.fn();
    const { layer, result } = setup();

    act(() => {
      useEditorStore.setState({ setMeshVertices } as never);
    });

    const pinId = usePuppetWarpStore.getState().addPin(layer.id, 0, "handle");
    expect(pinId).not.toBeNull();
    act(() => {
      usePuppetWarpStore.getState().setSelectedPins([pinId!]);
    });

    const downEvent = createPointerEvent({ offsetX: 0, offsetY: 0 });
    act(() => {
      result.current.onPointerDown(downEvent);
    });

    act(() => {
      result.current.onPointerMove(createPointerEvent({ offsetX: 10, offsetY: 0 }));
    });

    expect(setMeshVertices).toHaveBeenCalledWith(
      layer.id,
      expect.any(Array),
      expect.stringMatching(new RegExp(`^puppet-warp:${layer.id}:`)),
    );
  });

  it("restores the base vertices when Escape cancels a puppet drag", () => {
    const setMeshVertices = vi.fn();
    const { layer, result } = setup();

    act(() => {
      useEditorStore.setState({ setMeshVertices } as never);
    });

    const pinId = usePuppetWarpStore.getState().addPin(layer.id, 0, "handle");
    expect(pinId).not.toBeNull();
    act(() => {
      usePuppetWarpStore.getState().setSelectedPins([pinId!]);
    });

    act(() => {
      result.current.onPointerDown(createPointerEvent({ offsetX: 0, offsetY: 0 }));
      result.current.onPointerMove(createPointerEvent({ offsetX: 10, offsetY: 10 }));
    });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(setMeshVertices).toHaveBeenLastCalledWith(
      layer.id,
      [...layer.mesh.vertices],
      expect.stringMatching(new RegExp(`^puppet-warp:${layer.id}:`)),
    );
    expect(usePuppetWarpStore.getState().dragState).toBeNull();
  });

  it("mirrors drag motion when both linked handles are selected", () => {
    const setMeshVertices = vi.fn();
    const { layer, result } = setup();

    act(() => {
      useEditorStore.setState({ setMeshVertices } as never);
      usePuppetWarpStore.setState({ symmetryEnabled: true });
    });

    const leftPinId = usePuppetWarpStore.getState().addPin(layer.id, 0, "handle");
    const rightPinId = usePuppetWarpStore.getState().addPin(layer.id, 3, "handle");
    expect(leftPinId && rightPinId).toBeTruthy();

    act(() => {
      usePuppetWarpStore.getState().linkMirrorPins(leftPinId!, rightPinId!);
      usePuppetWarpStore.getState().setSelectedPins([leftPinId!, rightPinId!]);
    });

    act(() => {
      result.current.onPointerDown(createPointerEvent({ offsetX: 0, offsetY: 0 }));
      result.current.onPointerMove(createPointerEvent({ offsetX: 10, offsetY: 0 }));
    });

    const nextVertices = setMeshVertices.mock.calls.at(-1)?.[1] as number[];
    expect(nextVertices[0]).toBe(10);
    expect(nextVertices[6]).toBe(90);
  });

  it("does not start a drag when clicking an anchor pin", () => {
    const setMeshVertices = vi.fn();
    const { layer, result } = setup();

    act(() => {
      useEditorStore.setState({ setMeshVertices } as never);
    });

    const pinId = usePuppetWarpStore.getState().addPin(layer.id, 0, "anchor");
    expect(pinId).not.toBeNull();

    act(() => {
      result.current.onPointerDown(createPointerEvent({ offsetX: 0, offsetY: 0 }));
      result.current.onPointerMove(createPointerEvent({ offsetX: 20, offsetY: 0 }));
    });

    expect(usePuppetWarpStore.getState().dragState).toBeNull();
    expect(setMeshVertices).not.toHaveBeenCalled();
  });

  it("restores base vertices when the active tool switches during a drag", () => {
    const setMeshVertices = vi.fn();
    const { layer, result } = setup();

    act(() => {
      useEditorStore.setState({ setMeshVertices } as never);
    });

    const pinId = usePuppetWarpStore.getState().addPin(layer.id, 0, "handle");
    expect(pinId).not.toBeNull();
    act(() => {
      usePuppetWarpStore.getState().setSelectedPins([pinId!]);
      result.current.onPointerDown(createPointerEvent({ offsetX: 0, offsetY: 0 }));
      result.current.onPointerMove(createPointerEvent({ offsetX: 15, offsetY: 0 }));
      useViewportStore.setState({ activeTool: "select" });
    });

    expect(setMeshVertices).toHaveBeenLastCalledWith(
      layer.id,
      [...layer.mesh.vertices],
      expect.stringMatching(new RegExp(`^puppet-warp:${layer.id}:`)),
    );
    expect(usePuppetWarpStore.getState().dragState).toBeNull();
  });
});
