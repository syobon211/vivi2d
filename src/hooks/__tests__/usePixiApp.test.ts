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

  it("マウント時に Application を生成して init を呼ぶ", () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    renderHook(() => usePixiApp(containerRef));

    expect(Application).toHaveBeenCalledTimes(1);
    const appInstance = (Application as unknown as ReturnType<typeof vi.fn>).mock
      .results[0]!.value;
    expect(appInstance.init).toHaveBeenCalledTimes(1);
    expect(appInstance.init).toHaveBeenCalledWith(
      expect.objectContaining({
        resizeTo: el,
        antialias: true,
        autoDensity: true,
      }),
    );
  });

  it("init 完了後に canvas を DOM に追加する", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    expect(el.appendChild).toHaveBeenCalled();
  });

  it("init 完了後に world / background / overlay コンテナを作成する", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    expect(Container).toHaveBeenCalled();
    expect(Graphics).toHaveBeenCalled();
  });

  it("init 完了後に refs が正しく設定される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.current.app).not.toBeNull();
    expect(result.current.current.world).not.toBeNull();
    expect(result.current.current.background).not.toBeNull();
    expect(result.current.current.overlay).not.toBeNull();
  });

  it("world コンテナに label 'world' が設定される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.current.world).not.toBeNull();
    expect(result.current.current.world!.label).toBe("world");
  });

  it("background に label 'canvas-bg' が設定される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.current.background).not.toBeNull();
    expect(result.current.current.background!.label).toBe("canvas-bg");
  });

  it("overlay コンテナに label 'overlay' が設定される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.current.overlay).not.toBeNull();
    expect(result.current.current.overlay!.label).toBe("overlay");
  });

  it("stage に world と overlay が addChild される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    const appInstance = (Application as unknown as ReturnType<typeof vi.fn>).mock
      .results[0]!.value;
    expect(appInstance.stage.addChild).toHaveBeenCalledTimes(2);
  });

  it("ResizeObserver でコンテナ要素を監視する", () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    renderHook(() => usePixiApp(containerRef));

    expect(MockResizeObserver).toHaveBeenCalledTimes(1);
    expect(mockResizeObserverInstance.observe).toHaveBeenCalledWith(el);
  });

  it("アンマウント時に ResizeObserver を切断する", () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { unmount } = renderHook(() => usePixiApp(containerRef));
    unmount();

    expect(mockResizeObserverInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  it("アンマウント時に app.destroy(true) が呼ばれる", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { unmount } = renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    const appInstance = (Application as unknown as ReturnType<typeof vi.fn>).mock
      .results[0]!.value;
    unmount();

    expect(appInstance.destroy).toHaveBeenCalledWith(true);
  });

  it("アンマウント時に refs が全て null にリセットされる", () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { result, unmount } = renderHook(() => usePixiApp(containerRef));
    unmount();

    expect(result.current.current.app).toBeNull();
    expect(result.current.current.world).toBeNull();
    expect(result.current.current.background).toBeNull();
    expect(result.current.current.overlay).toBeNull();
  });

  it("containerRef.current が null の場合は初期化しない", () => {
    const containerRef = { current: null } as React.RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() => usePixiApp(containerRef));

    expect(Application).not.toHaveBeenCalled();
    expect(result.current.current.app).toBeNull();
  });

  it("init 完了前にアンマウントしてもクラッシュしない", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { unmount } = renderHook(() => usePixiApp(containerRef));

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockResizeObserverInstance.disconnect).toHaveBeenCalled();
  });

  it("返り値は PixiAppRefs 型の RefObject である", () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() => usePixiApp(containerRef));

    expect(result.current).toHaveProperty("current");
    expect(result.current.current).toHaveProperty("app");
    expect(result.current.current).toHaveProperty("world");
    expect(result.current.current).toHaveProperty("background");
    expect(result.current.current).toHaveProperty("overlay");
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

  it("init 完了後にグローバル参照が設定される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    const refs = getPixiAppRefs();
    expect(refs).not.toBeNull();
    expect(refs!.app).not.toBeNull();
  });

  it("アンマウント時にグローバル参照が null になる", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { unmount } = renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    const refs = getPixiAppRefs();
    expect(refs).toBeNull();
  });

  it("init 完了前にアンマウントすると disposed=true で destroy される", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    const { unmount } = renderHook(() => usePixiApp(containerRef));

    unmount();

    const appInstance = (Application as unknown as ReturnType<typeof vi.fn>).mock
      .results[0]!.value;

    await act(async () => {
      await Promise.resolve();
    });

    expect(appInstance.destroy).toHaveBeenCalledWith(true);
  });

  it("ResizeObserver のコールバックで app.resize が呼ばれる", async () => {
    const el = createContainerEl();
    const containerRef = { current: el } as React.RefObject<HTMLDivElement | null>;

    renderHook(() => usePixiApp(containerRef));

    await act(async () => {
      await Promise.resolve();
    });

    const resizeCallback = MockResizeObserver.mock.calls[0]![0] as () => void;
    resizeCallback();

    const appInstance = (Application as unknown as ReturnType<typeof vi.fn>).mock
      .results[0]!.value;
    expect(appInstance.resize).toHaveBeenCalled();
  });
});
