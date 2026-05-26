import { renderHook } from "@testing-library/react";
import type { ColliderCircle, ColliderData, ColliderRect } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { createProject } from "@/test/fixtures";
import {
  resetColliderStore,
  resetEditorStore,
  resetViewportStore,
} from "@/test/store-reset";
import {
  computeNewShape,
  computeRectResize,
  hitTestBody,
  hitTestHandles,
  useColliderOverlay,
} from "../useColliderOverlay";

function makeRectCollider(overrides: Partial<ColliderData> = {}): ColliderData {
  return {
    id: "rect-1",
    name: "Rect",
    shape: { type: "rectangle", x: 100, y: 100, width: 200, height: 150 } as ColliderRect,
    enabled: true,
    ...overrides,
  };
}

function makeCircleCollider(overrides: Partial<ColliderData> = {}): ColliderData {
  return {
    id: "circle-1",
    name: "Circle",
    shape: { type: "circle", x: 300, y: 300, radius: 80 } as ColliderCircle,
    enabled: true,
    ...overrides,
  };
}

function makeMeshCollider(): ColliderData {
  return {
    id: "mesh-1",
    name: "Mesh",
    shape: { type: "mesh", meshId: "layer-1" },
    enabled: true,
  };
}

function createPointerEvent(offsetX: number, offsetY: number): React.PointerEvent {
  const target = document.createElement("div");
  vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
  return {
    target,
    pointerId: 1,
    nativeEvent: { offsetX, offsetY },
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent;
}

describe("useColliderOverlay", () => {
  beforeEach(() => {
    resetEditorStore();
    resetViewportStore();
    resetColliderStore();
  });

  it("returns stable interaction handlers", () => {
    const { result } = renderHook(() => useColliderOverlay());

    expect(result.current.onPointerDown).toBeTypeOf("function");
    expect(result.current.onPointerMove).toBeTypeOf("function");
    expect(result.current.onPointerUp).toBeTypeOf("function");
    expect(result.current.isInteracting()).toBe(false);
  });

  it("selects and starts dragging a rectangle collider body", () => {
    const rect = makeRectCollider();
    useEditorStore.setState({ project: createProject({ colliders: [rect] }) });

    const { result } = renderHook(() => useColliderOverlay());
    const event = createPointerEvent(200, 175);
    result.current.onPointerDown(event);

    expect(useColliderStore.getState().selectedColliderId).toBe(rect.id);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.isInteracting()).toBe(true);
  });

  it("starts a handle drag when a selected rectangle corner is hit", () => {
    const rect = makeRectCollider();
    useEditorStore.setState({ project: createProject({ colliders: [rect] }) });
    useColliderStore.setState({ selectedColliderId: rect.id });

    const { result } = renderHook(() => useColliderOverlay());
    const event = createPointerEvent(100, 100);
    result.current.onPointerDown(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.isInteracting()).toBe(true);
  });

  it("clears the selected collider when clicking empty space", () => {
    const rect = makeRectCollider();
    useEditorStore.setState({ project: createProject({ colliders: [rect] }) });
    useColliderStore.setState({ selectedColliderId: rect.id });

    const { result } = renderHook(() => useColliderOverlay());
    result.current.onPointerDown(createPointerEvent(10, 10));

    expect(useColliderStore.getState().selectedColliderId).toBeNull();
  });

  it("ignores disabled colliders during body hit-testing", () => {
    const rect = makeRectCollider({ enabled: false });
    useEditorStore.setState({ project: createProject({ colliders: [rect] }) });

    const { result } = renderHook(() => useColliderOverlay());
    const event = createPointerEvent(200, 175);
    result.current.onPointerDown(event);

    expect(useColliderStore.getState().selectedColliderId).toBeNull();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("updates the dragged collider through requestAnimationFrame", () => {
    vi.useFakeTimers();
    const rect = makeRectCollider();
    useEditorStore.setState({ project: createProject({ colliders: [rect] }) });

    const { result } = renderHook(() => useColliderOverlay());
    result.current.onPointerDown(createPointerEvent(200, 175));
    result.current.onPointerMove(createPointerEvent(240, 195));
    vi.runAllTimers();

    const shape = useEditorStore.getState().project?.colliders[0]?.shape;
    expect(shape).toMatchObject({ x: 140, y: 120 });
    vi.useRealTimers();
  });

  it("stops interacting on pointer up", () => {
    const rect = makeRectCollider();
    useEditorStore.setState({ project: createProject({ colliders: [rect] }) });

    const { result } = renderHook(() => useColliderOverlay());
    result.current.onPointerDown(createPointerEvent(200, 175));
    result.current.onPointerUp();

    expect(result.current.isInteracting()).toBe(false);
  });
});

describe("hitTestBody", () => {
  it("matches rectangle bounds inclusively", () => {
    const rect = makeRectCollider({
      shape: { type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
    });
    expect(hitTestBody(rect, 10, 20)).toBe(true);
    expect(hitTestBody(rect, 110, 70)).toBe(true);
    expect(hitTestBody(rect, 111, 70)).toBe(false);
  });

  it("matches circle bounds inclusively", () => {
    const circle = makeCircleCollider({
      shape: { type: "circle", x: 100, y: 100, radius: 50 },
    });
    expect(hitTestBody(circle, 100, 100)).toBe(true);
    expect(hitTestBody(circle, 150, 100)).toBe(true);
    expect(hitTestBody(circle, 151, 100)).toBe(false);
  });

  it("returns false for mesh colliders", () => {
    expect(hitTestBody(makeMeshCollider(), 0, 0)).toBe(false);
  });
});

describe("hitTestHandles", () => {
  it("matches rectangle corner handles", () => {
    const rect = makeRectCollider({
      shape: { type: "rectangle", x: 100, y: 200, width: 300, height: 150 },
    });
    expect(hitTestHandles(rect, 100, 200, 10)).toBe("tl");
    expect(hitTestHandles(rect, 400, 200, 10)).toBe("tr");
    expect(hitTestHandles(rect, 100, 350, 10)).toBe("bl");
    expect(hitTestHandles(rect, 400, 350, 10)).toBe("br");
  });

  it("matches the circle radius handle", () => {
    const circle = makeCircleCollider({
      shape: { type: "circle", x: 200, y: 200, radius: 80 },
    });
    expect(hitTestHandles(circle, 280, 200, 10)).toBe("radius");
    expect(hitTestHandles(circle, 200, 200, 10)).toBeNull();
  });
});

describe("computeRectResize", () => {
  it("grows or clamps rectangle corners correctly", () => {
    const base: ColliderRect = {
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    };
    expect(computeRectResize(base, "tl", -50, -50, 4)).toMatchObject({
      x: 50,
      y: 50,
      width: 250,
      height: 200,
    });
    expect(computeRectResize(base, "br", -400, -400, 4)).toMatchObject({
      x: 100,
      y: 100,
      width: 4,
      height: 4,
    });
  });
});

describe("computeNewShape", () => {
  it("moves rectangles and circles", () => {
    expect(
      computeNewShape(
        {
          colliderId: "r",
          handle: "move",
          startWx: 0,
          startWy: 0,
          startShape: { type: "rectangle", x: 100, y: 200, width: 50, height: 30 },
        },
        10,
        -20,
      ),
    ).toEqual({ x: 110, y: 180 });

    expect(
      computeNewShape(
        {
          colliderId: "c",
          handle: "move",
          startWx: 0,
          startWy: 0,
          startShape: { type: "circle", x: 50, y: 50, radius: 30 },
        },
        -10,
        5,
      ),
    ).toEqual({ x: 40, y: 55 });
  });

  it("resizes circles through the radius handle", () => {
    const result = computeNewShape(
      {
        colliderId: "c",
        handle: "radius",
        startWx: 130,
        startWy: 100,
        startShape: { type: "circle", x: 100, y: 100, radius: 30 },
      },
      20,
      0,
    );

    expect(result).toMatchObject({ radius: 50 });
  });
});
