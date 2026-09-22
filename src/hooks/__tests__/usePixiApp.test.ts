import { act, renderHook } from "@testing-library/react";
import { Application, Container, Graphics } from "pixi.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/stores/themeStore";
import { getPixiAppRefs, usePixiApp } from "../usePixiApp";

const mockResizeObserverInstance = {
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
};
const MockResizeObserver = vi.fn().mockImplementation(function () {
  return mockResizeObserverInstance;
});
vi.stubGlobal("ResizeObserver", MockResizeObserver);

function createContainerEl(): HTMLDivElement {
  const el = document.createElement("div");
  vi.spyOn(el, "appendChild").mockImplementation((child) => child);
  return el;
}

describe("usePixiApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockResizeObserver.mockClear();
    mockResizeObserverInstance.observe.mockClear();
    mockResizeObserverInstance.disconnect.mockClear();
  });

  it("成功した初期化の実 refs と親子配置を公開し、resize と unmount の所有権を守る", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;
    const { result, unmount } = renderHook(() => usePixiApp(containerRef));
    expect(Application).toHaveBeenCalledTimes(1);
    const app = vi.mocked(Application).mock.results[0]!.value;
    expect(app.init).toHaveBeenCalledTimes(1);
    expect(app.init).toHaveBeenCalledWith(
      expect.objectContaining({
        resizeTo: el,
        antialias: true,
        autoDensity: true,
      }),
    );
    expect(MockResizeObserver).toHaveBeenCalledTimes(1);
    expect(mockResizeObserverInstance.observe).toHaveBeenCalledExactlyOnceWith(el);

    await act(async () => {
      await Promise.resolve();
    });

    expect(Container).toHaveBeenCalledTimes(2);
    expect(Graphics).toHaveBeenCalledTimes(1);
    const world = vi.mocked(Container).mock.results[0]!.value;
    const overlay = vi.mocked(Container).mock.results[1]!.value;
    const background = vi.mocked(Graphics).mock.results[0]!.value;
    expect(result.current.current).toEqual(
      expect.objectContaining({ app, world, background, overlay }),
    );
    expect(app.start).not.toHaveBeenCalled();
    result.current.current.markDisplayReady?.();
    expect(app.start).toHaveBeenCalledTimes(1);
    expect(getPixiAppRefs()).toBe(result.current.current);
    expect(el.appendChild).toHaveBeenCalledExactlyOnceWith(app.canvas);
    expect(world.label).toBe("world");
    expect(background.label).toBe("canvas-bg");
    expect(overlay.label).toBe("overlay");
    expect(app.stage.addChild.mock.calls).toEqual([[world], [overlay]]);
    expect(world.addChild).toHaveBeenCalledExactlyOnceWith(background);

    const resize = MockResizeObserver.mock.calls[0]![0] as () => void;
    app.resize.mockClear();
    resize();
    expect(app.resize).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockResizeObserverInstance.disconnect).toHaveBeenCalledTimes(1);
    expect(app.destroy).toHaveBeenCalledExactlyOnceWith(true);
    expect(result.current.current).toEqual({
      app: null,
      world: null,
      background: null,
      overlay: null,
    });
    expect(getPixiAppRefs()).toBeNull();
  });

  it("containerRef.current が null の場合は初期化しない", () => {
    const containerRef = { current: null } as React.RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() => usePixiApp(containerRef));

    expect(Application).not.toHaveBeenCalled();
    expect(result.current.current.app).toBeNull();
  });

  it("coalesces ordinary invalidations without losing requests during draw or bypassing suspension", async () => {
    // A stable ref models the actual Canvas owner across readiness updates.
    const containerRef = { current: createContainerEl() };
    const hook = renderHook(() => usePixiApp(containerRef));
    await act(async () => {
      await Promise.resolve();
    });
    const owned = hook.result.current.current,
      app = owned.app!;
    const tick = vi.mocked(app.ticker.add).mock.calls[0]![0] as () => void;
    const draw = vi.mocked(app.renderer.render);
    tick();
    expect(draw).not.toHaveBeenCalled();
    owned.markDisplayReady!();
    tick();
    tick();
    expect(draw).toHaveBeenCalledTimes(1);
    owned.requestDisplayRender!();
    owned.requestDisplayRender!();
    tick();
    expect(draw).toHaveBeenCalledTimes(2);
    draw.mockImplementationOnce(() => owned.requestDisplayRender!());
    owned.requestDisplayRender!();
    tick();
    tick();
    tick();
    expect(draw).toHaveBeenCalledTimes(4);
    owned.suspendDisplay!();
    vi.mocked(app.start).mockClear();
    owned.requestDisplayRender!();
    tick();
    expect(app.start).not.toHaveBeenCalled();
    expect(() => owned.renderDisplay!()).toThrow("V11_MASK_RENDERER_UNAVAILABLE");
    expect(draw).toHaveBeenCalledTimes(4);
    owned.markDisplayReady!();
    owned.renderDisplay!();
    owned.renderDisplay!();
    tick();
    expect(draw).toHaveBeenCalledTimes(6);
    hook.unmount();
    expect(() => owned.renderDisplay!()).toThrow("V11_MASK_RENDERER_UNAVAILABLE");
  });

  it("retires a context-lost owner and waits for fresh scene preparation on its replacement", async () => {
    const containerRef = { current: createContainerEl() };
    const { result } = renderHook(() => usePixiApp(containerRef));
    await act(async () => {
      await Promise.resolve();
    });
    const old = result.current.current,
      app = old.app!;
    old.markDisplayReady!();
    await act(async () => {
      app.canvas.dispatchEvent(new Event("webglcontextlost"));
      expect(old.displayUnavailable).toBe(true);
      expect(old.displayReady).toBe(false);
      old.requestDisplayRender!();
      expect(() => old.renderDisplay!()).toThrow("V11_MASK_RENDERER_UNAVAILABLE");
      await Promise.resolve();
    });
    const next = result.current.current;
    expect(next.app).not.toBe(app);
    expect(next.app!.start).not.toHaveBeenCalled();
    // A late event on the destroyed canvas must not revive the old generation.
    app.canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(next.displayReady).toBe(false);
    next.markDisplayReady!();
    next.renderDisplay!();
    expect(next.app!.renderer.render).toHaveBeenCalledTimes(1);
  });

  it("stops draws after an entered render fails and rebuilds via the existing lifecycle before resuming", async () => {
    const containerRef = { current: createContainerEl() };
    const { result } = renderHook(() => usePixiApp(containerRef));
    await act(async () => {
      await Promise.resolve();
    });
    const original = result.current.current;
    const originalApp = original.app!;
    const dispose = vi.fn();
    original.disposeScene = dispose;
    original.markDisplayReady!();
    vi.mocked(originalApp.renderer.render).mockImplementation(() => {
      throw new Error("synthetic GPU failure");
    });
    await act(async () => {
      expect(() => original.renderSafely!({ container: originalApp.stage })).toThrow(
        "V11_MASK_RENDERER_UNAVAILABLE",
      );
      expect(original.displayUnavailable).toBe(true);
      expect(() => original.renderSafely!({ container: originalApp.stage })).toThrow(
        "V11_MASK_RENDERER_UNAVAILABLE",
      );
      expect(originalApp.renderer.render).toHaveBeenCalledTimes(1);
      await Promise.resolve();
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(originalApp.destroy).toHaveBeenCalledTimes(1);
    const recovered = result.current.current;
    expect(recovered.app).not.toBe(originalApp);
    expect(recovered.app!.start).not.toHaveBeenCalled();
    recovered.markDisplayReady!();
    expect(recovered.app!.start).toHaveBeenCalledTimes(1);
  });

  it("テーマ変更時に背景色が更新される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    useThemeStore.getState().setTheme("dark");

    const { result } = renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    const appObj = result.current.current.app;
    expect(appObj).not.toBeNull();
    (appObj as any).renderer = { background: { color: 0x1e1e2e } };

    act(() => {
      useThemeStore.getState().setTheme("light");
    });

    expect((appObj as any).renderer.background.color).toBe(0xf0f0f6);
  });

  it("app が null の場合テーマ変更は安全に無視される", () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    renderHook(() => usePixiApp(containerRef));

    expect(() => {
      act(() => {
        useThemeStore.getState().setTheme("light");
      });
    }).not.toThrow();
  });

  it("init 完了前にアンマウントすると disposed=true で destroy される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { result, unmount } = renderHook(() => usePixiApp(containerRef));

    unmount();

    const appInstance = (Application as unknown as ReturnType<typeof vi.fn>).mock
      .results[0]!.value;

    await act(async () => {
      await Promise.resolve();
    });

    expect(appInstance.destroy).toHaveBeenCalledWith(true);
    expect(mockResizeObserverInstance.disconnect).toHaveBeenCalledOnce();
    expect(el.appendChild).not.toHaveBeenCalled();
    expect(result.current.current.app).toBeNull();
    expect(getPixiAppRefs()).toBeNull();
  });
});
