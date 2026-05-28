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
    it("中ボタン押下でパンを開始する", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      const e = createPointerEvent({ button: 1, clientX: 100, clientY: 100 });
      result.current.onPointerDown(e);

      expect(e.preventDefault).toHaveBeenCalled();
      expect((e.target as HTMLElement).setPointerCapture).toHaveBeenCalledWith(1);
    });

    it("中ボタンパン中の移動でパン値が更新される", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      result.current.onPointerDown(
        createPointerEvent({ button: 1, clientX: 100, clientY: 100 }),
      );

      result.current.onPointerMove(createPointerEvent({ clientX: 130, clientY: 120 }));

      const state = useViewportStore.getState();
      expect(state.panX).toBe(30);
      expect(state.panY).toBe(20);
    });

    it("中ボタンリリースでパンを終了する", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      result.current.onPointerDown(
        createPointerEvent({ button: 1, clientX: 100, clientY: 100 }),
      );
      result.current.onPointerMove(createPointerEvent({ clientX: 130, clientY: 120 }));
      const upEvent = createPointerEvent({ clientX: 130, clientY: 120 });
      result.current.onPointerUp(upEvent);

      result.current.onPointerMove(createPointerEvent({ clientX: 200, clientY: 200 }));

      const state = useViewportStore.getState();
      expect(state.panX).toBe(30);
      expect(state.panY).toBe(20);
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

      result.current.onWheel(
        createWheelEvent({ deltaY: -100, clientX: 400, clientY: 300 }),
      );

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

    it("ホイール時に preventDefault が呼ばれる", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      const e = createWheelEvent({ deltaY: -100, clientX: 400, clientY: 300 });
      result.current.onWheel(e);

      expect(e.preventDefault).toHaveBeenCalled();
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

  describe("連続パン操作", () => {
    it("複数回の移動でパン値が累積する", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      result.current.onPointerDown(
        createPointerEvent({ button: 1, clientX: 0, clientY: 0 }),
      );
      result.current.onPointerMove(createPointerEvent({ clientX: 10, clientY: 20 }));
      result.current.onPointerMove(createPointerEvent({ clientX: 30, clientY: 50 }));

      const state = useViewportStore.getState();
      expect(state.panX).toBe(30);
      expect(state.panY).toBe(50);
    });
  });

  describe("パン中にポインタアップでキャプチャ解放", () => {
    it("releasePointerCapture が呼ばれる", () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() => useViewport(containerRef));

      result.current.onPointerDown(
        createPointerEvent({ button: 1, clientX: 0, clientY: 0 }),
      );

      const upEvent = createPointerEvent({ pointerId: 1 });
      result.current.onPointerUp(upEvent);

      expect((upEvent.target as HTMLElement).releasePointerCapture).toHaveBeenCalledWith(
        1,
      );
    });

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
