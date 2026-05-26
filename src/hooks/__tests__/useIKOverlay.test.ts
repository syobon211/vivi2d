import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useIKControllerStore } from "@/stores/ikControllerStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createIKController, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetIKRuntimeStore,
  resetViewportStore,
} from "@/test/store-reset";
import { useIKOverlay } from "../useIKOverlay";

let rafCallbacks: Array<() => void> = [];
vi.stubGlobal(
  "requestAnimationFrame",
  vi.fn((cb: () => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  }),
);
vi.stubGlobal("cancelAnimationFrame", vi.fn());

function flushRaf() {
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of callbacks) {
    cb();
  }
}

function createPointerEvent(
  overrides: Partial<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
  }> = {},
) {
  const target = document.createElement("div");
  vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
  return {
    target,
    pointerId: overrides.pointerId ?? 1,
    nativeEvent: {
      offsetX: overrides.offsetX ?? 0,
      offsetY: overrides.offsetY ?? 0,
    },
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

describe("useIKOverlay", () => {
  beforeEach(() => {
    resetEditorStore();
    resetViewportStore();
    resetIKRuntimeStore();
    rafCallbacks = [];
    vi.clearAllMocks();
  });

  it("returns stable interaction handlers", () => {
    const { result } = renderHook(() => useIKOverlay());

    expect(result.current.onPointerDown).toBeTypeOf("function");
    expect(result.current.onPointerMove).toBeTypeOf("function");
    expect(result.current.onPointerUp).toBeTypeOf("function");
    expect(result.current.isInteracting()).toBe(false);
  });

  it("ignores pointer down when there is no project IK state", () => {
    const { result } = renderHook(() => useIKOverlay());
    const event = createPointerEvent({ offsetX: 50, offsetY: 50 });

    expect(() => result.current.onPointerDown(event)).not.toThrow();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(result.current.isInteracting()).toBe(false);
  });

  it("starts dragging when the pointer hits an IK target", () => {
    const ik = createIKController({ id: "ik-1", targetX: 100, targetY: 100 });
    useEditorStore.setState({
      project: createProject({ ikControllers: [ik] }),
    });

    const { result } = renderHook(() => useIKOverlay());
    const event = createPointerEvent({ offsetX: 100, offsetY: 100 });
    result.current.onPointerDown(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect((event.target as HTMLElement).setPointerCapture).toHaveBeenCalled();
    expect(result.current.isInteracting()).toBe(true);
  });

  it("updates the runtime target through requestAnimationFrame while dragging", () => {
    const ik = createIKController({ id: "ik-1", targetX: 100, targetY: 100 });
    useEditorStore.setState({
      project: createProject({ ikControllers: [ik] }),
    });

    const { result } = renderHook(() => useIKOverlay());
    result.current.onPointerDown(createPointerEvent({ offsetX: 100, offsetY: 100 }));
    result.current.onPointerMove(createPointerEvent({ offsetX: 250, offsetY: 350 }));

    expect(requestAnimationFrame).toHaveBeenCalled();

    flushRaf();

    expect(useIKRuntimeStore.getState().runtimeTargets.get(ik.id)).toEqual({
      x: 250,
      y: 350,
    });
  });

  it("commits the runtime target back to the controller on pointer up", () => {
    const ik = createIKController({ id: "ik-1", targetX: 100, targetY: 100 });
    useEditorStore.setState({
      project: createProject({ ikControllers: [ik] }),
    });
    const setTargetSpy = vi.spyOn(useIKControllerStore.getState(), "setTarget");

    const { result } = renderHook(() => useIKOverlay());
    result.current.onPointerDown(createPointerEvent({ offsetX: 100, offsetY: 100 }));
    result.current.onPointerMove(createPointerEvent({ offsetX: 200, offsetY: 240 }));
    flushRaf();
    result.current.onPointerUp();

    expect(setTargetSpy).toHaveBeenCalledWith(ik.id, 200, 240);
    expect(useIKRuntimeStore.getState().runtimeTargets.get(ik.id)).toBeUndefined();
    expect(result.current.isInteracting()).toBe(false);
  });

  it("does not commit when no runtime target was created", () => {
    const ik = createIKController({ id: "ik-1", targetX: 100, targetY: 100 });
    useEditorStore.setState({
      project: createProject({ ikControllers: [ik] }),
    });
    const setTargetSpy = vi.spyOn(useIKControllerStore.getState(), "setTarget");

    const { result } = renderHook(() => useIKOverlay());
    result.current.onPointerDown(createPointerEvent({ offsetX: 100, offsetY: 100 }));
    result.current.onPointerUp();

    expect(setTargetSpy).not.toHaveBeenCalled();
    expect(result.current.isInteracting()).toBe(false);
  });

  it("respects zoom when hit-testing IK targets", () => {
    const ik = createIKController({ id: "ik-1", targetX: 100, targetY: 100 });
    useEditorStore.setState({
      project: createProject({ ikControllers: [ik] }),
    });
    useViewportStore.setState({ zoom: 4, panX: 0, panY: 0 });

    const { result } = renderHook(() => useIKOverlay());
    const event = createPointerEvent({ offsetX: 405, offsetY: 405 });
    result.current.onPointerDown(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.isInteracting()).toBe(true);
  });

  it("cancels pending animation frame state on unmount", () => {
    const ik = createIKController({ id: "ik-1", targetX: 100, targetY: 100 });
    useEditorStore.setState({
      project: createProject({ ikControllers: [ik] }),
    });

    const { result, unmount } = renderHook(() => useIKOverlay());
    act(() => {
      result.current.onPointerDown(createPointerEvent({ offsetX: 100, offsetY: 100 }));
      result.current.onPointerMove(createPointerEvent({ offsetX: 180, offsetY: 210 }));
    });

    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
