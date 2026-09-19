import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useViewportStore } from "@/stores/viewportStore";
import { resetViewportStore } from "@/test/store-reset";
import { useViewport } from "../useViewport";

function createPointerEvent(
  overrides: Partial<{
    button: number;
    clientX: number;
    clientY: number;
    pointerId: number;
    target: EventTarget;
  }> = {},
) {
  const target = document.createElement("div");
  vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
  vi.spyOn(target, "releasePointerCapture").mockImplementation(() => {});
  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    target,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.PointerEvent;
}

function createWheelEvent(
  overrides: Partial<{
    deltaY: number;
    clientX: number;
    clientY: number;
  }> = {},
) {
  return {
    deltaY: 0,
    clientX: 0,
    clientY: 0,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.WheelEvent;
}

function createContainerRef() {
  return {
    current: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: vi.fn(),
      }),
    },
  } as unknown as React.RefObject<HTMLDivElement | null>;
}

describe("useViewport", () => {
  beforeEach(() => resetViewportStore());

  describe("中ボタンパン", () => {
    it("中ボタンの連続 delta を累積し、pointerUp で capture とパンを終了する", () => {
      const { result } = renderHook(() => useViewport(createContainerRef()));
      const down = createPointerEvent({
        button: 1, pointerId: 9, clientX: 100, clientY: 100,
      });
      result.current.onPointerDown(down);
      expect(down.preventDefault).toHaveBeenCalledOnce();
      expect((down.target as HTMLElement).setPointerCapture).toHaveBeenCalledExactlyOnceWith(9);
      expect(result.current.isInteracting()).toBe(true);

      result.current.onPointerMove(createPointerEvent({ clientX: 130, clientY: 120 }));
      expect(useViewportStore.getState()).toMatchObject({ panX: 30, panY: 20 });
      result.current.onPointerMove(createPointerEvent({ clientX: 160, clientY: 150 }));
      expect(useViewportStore.getState()).toMatchObject({ panX: 60, panY: 50 });

      const up = createPointerEvent({ pointerId: 9, target: down.target });
      result.current.onPointerUp(up);
      expect((down.target as HTMLElement).releasePointerCapture).toHaveBeenCalledExactlyOnceWith(9);
      expect(result.current.isInteracting()).toBe(false);
      result.current.onPointerMove(createPointerEvent({ clientX: 300, clientY: 300 }));
      expect(useViewportStore.getState()).toMatchObject({ panX: 60, panY: 50 });
    });



    it("どのツールでも中ボタンパンが動作する", () => {
      const containerRef = createContainerRef();
      useViewportStore.getState().setTool("meshEdit");

      const { result } = renderHook(() => useViewport(containerRef));
      result.current.onPointerDown(
        createPointerEvent({ button: 1, clientX: 0, clientY: 0 }),
      );
      result.current.onPointerMove(createPointerEvent({ clientX: 50, clientY: 50 }));

      expect(useViewportStore.getState().panX).toBe(50);
    });
  });

  describe("左クリックパン", () => {
    it("pan ツール選択時は左クリックでパンする", () => {
      const containerRef = createContainerRef();
      useViewportStore.getState().setTool("pan");

      const { result } = renderHook(() => useViewport(containerRef));
      result.current.onPointerDown(
        createPointerEvent({ button: 0, clientX: 50, clientY: 50 }),
      );
      result.current.onPointerMove(createPointerEvent({ clientX: 100, clientY: 80 }));

      const state = useViewportStore.getState();
      expect(state.panX).toBe(50);
      expect(state.panY).toBe(30);
    });

    it("select ツール時は左クリックでパンしない", () => {
      const containerRef = createContainerRef();
      useViewportStore.getState().setTool("select");

      const { result } = renderHook(() => useViewport(containerRef));
      result.current.onPointerDown(
        createPointerEvent({ button: 0, clientX: 50, clientY: 50 }),
      );
      result.current.onPointerMove(createPointerEvent({ clientX: 100, clientY: 80 }));

      const state = useViewportStore.getState();
      expect(state.panX).toBe(0);
      expect(state.panY).toBe(0);
    });

    it("meshEdit ツール時は左クリックでパンしない", () => {
      const containerRef = createContainerRef();
      useViewportStore.getState().setTool("meshEdit");

      const { result } = renderHook(() => useViewport(containerRef));
      result.current.onPointerDown(
        createPointerEvent({ button: 0, clientX: 0, clientY: 0 }),
      );
      result.current.onPointerMove(createPointerEvent({ clientX: 100, clientY: 100 }));

      expect(useViewportStore.getState().panX).toBe(0);
    });
  });

  describe("ホイールズーム", () => {
    it("上スクロール（deltaY < 0）でズームインする", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      const event = createWheelEvent({ deltaY: -100, clientX: 400, clientY: 300 });
      result.current.onWheel(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();

      expect(useViewportStore.getState().zoom).toBeGreaterThan(1);
    });

    it("下スクロール（deltaY > 0）でズームアウトする", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      result.current.onWheel(
        createWheelEvent({ deltaY: 100, clientX: 400, clientY: 300 }),
      );

      expect(useViewportStore.getState().zoom).toBeLessThan(1);
    });


    it("containerRef.current が null の場合は何もしない", () => {
      const containerRef = {
        current: null,
      } as React.RefObject<HTMLDivElement | null>;
      const { result } = renderHook(() => useViewport(containerRef));

      expect(() => {
        result.current.onWheel(
          createWheelEvent({ deltaY: -100, clientX: 400, clientY: 300 }),
        );
      }).not.toThrow();

      expect(useViewportStore.getState().zoom).toBe(1);
    });
  });


  describe("パン中にポインタアップでキャプチャ解放", () => {

    it("パン中でない場合は releasePointerCapture が呼ばれない", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      const upEvent = createPointerEvent({ pointerId: 1 });
      result.current.onPointerUp(upEvent);

      expect(
        (upEvent.target as HTMLElement).releasePointerCapture,
      ).not.toHaveBeenCalled();
    });
  });
});
