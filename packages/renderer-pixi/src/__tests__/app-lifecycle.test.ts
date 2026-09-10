import type { Application } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ticker = vi.hoisted(() => ({
  events: null as unknown,
  domElement: null as unknown,
  pauseUpdate: true,
  interactionFrequency: 10,
  init: vi.fn(function (this: { events: unknown }, events: unknown) {
    this.events = events;
  }),
  addTickerListener: vi.fn(),
}));
vi.mock("pixi.js", async (importOriginal) => {
  const { Color, GlContextSystem, GlBackBufferSystem } =
    await importOriginal<typeof import("pixi.js")>();
  return {
    Color,
    GlContextSystem,
    GlBackBufferSystem,
    isWebGLSupported: vi.fn(() => true),
    EventsTicker: ticker,
  };
});

let lifecycle: typeof import("../app-lifecycle");

function application({ owned = true, extensionAvailable = true } = {}) {
  if (owned) lifecycle.rememberPixiEventOwner();
  const canvas = document.createElement("canvas");
  const state = { lost: false, preventDefault: false };
  const events = {
    domElement: canvas as HTMLCanvasElement | null,
    renderer: {} as object | null,
  };
  const extension = {
    loseContext: vi.fn(() => {
      if (state.lost) return;
      state.lost = true;
      setTimeout(() => {
        const event = new Event("webglcontextlost", { cancelable: true });
        canvas.dispatchEvent(event);
        state.preventDefault = event.defaultPrevented;
      }, 0);
    }),
    restoreContext: vi.fn(() => {
      state.lost = false;
      canvas.dispatchEvent(new Event("webglcontextrestored"));
    }),
  };
  const gl = { canvas, isContextLost: () => state.lost };
  const destroy = vi.fn(() => {
    events.domElement = null;
    events.renderer = null;
    ticker.events = null;
    ticker.domElement = null;
    if (extensionAvailable) extension.loseContext();
  });
  const app = {
    renderer: {
      events,
      gl,
      context: { extensions: { loseContext: extensionAvailable ? extension : null } },
    },
    canvas,
    destroy,
  } as unknown as Application;
  ticker.events = events;
  ticker.domElement = canvas;
  ticker.pauseUpdate = true;
  ticker.interactionFrequency = 10;
  if (owned) lifecycle.registerPixiApplication(app);
  return { app, canvas, events, extension, state, destroy };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  ticker.events = null;
  ticker.domElement = null;
  ticker.pauseUpdate = true;
  ticker.interactionFrequency = 10;
  lifecycle = await import("../app-lifecycle");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Pixi canvas preflight", () => {
  const options = { backgroundColor: 0xffffff, backgroundAlpha: 1, antialias: true };
  const context = () =>
    ({
      isContextLost: vi.fn(() => false),
      getExtension: vi.fn(() => ({})),
    }) as unknown as WebGL2RenderingContext;

  it.each([
    -1,
    Infinity,
    2 ** 40,
  ])("rejects invalid color %s without touching a canvas or live event owner", (backgroundColor) => {
    const live = application();
    const canvas = document.createElement("canvas");
    const get = vi.spyOn(canvas, "getContext");
    expect(() =>
      lifecycle.preparePixiCanvas(canvas, { ...options, backgroundColor }),
    ).toThrow("Invalid renderer background color.");
    expect(get).not.toHaveBeenCalled();
    expect(ticker.events).toBe(live.events);
  });

  it.each([
    { backgroundAlpha: 0, antialias: false },
    { backgroundAlpha: 0, antialias: true },
    { backgroundAlpha: 1, antialias: false },
    { backgroundAlpha: 1, antialias: true },
  ])("preserves GL context attributes for %o", (selected) => {
    const canvas = document.createElement("canvas");
    const get = vi.spyOn(canvas, "getContext").mockReturnValue(context());
    lifecycle.preparePixiCanvas(canvas, { ...options, ...selected });
    expect(get).toHaveBeenCalledExactlyOnceWith("webgl2", {
      alpha: selected.backgroundAlpha < 1,
      premultipliedAlpha: true,
      antialias: selected.antialias,
      stencil: true,
      preserveDrawingBuffer: false,
      powerPreference: "default",
    });
  });

  it.each([
    "OES_vertex_array_object",
    "MOZ_OES_vertex_array_object",
    "WEBKIT_OES_vertex_array_object",
  ])("preserves WebGL 1 fallback with %s", (extensionName) => {
    const canvas = document.createElement("canvas");
    const gl = context();
    vi.mocked(gl.getExtension).mockImplementation((name: string) =>
      name === extensionName ? {} : null,
    );
    const get = vi
      .spyOn(canvas, "getContext")
      .mockReturnValueOnce(null)
      .mockReturnValue(gl);
    lifecycle.preparePixiCanvas(canvas, options);
    expect(get.mock.calls.map(([kind]) => kind)).toEqual(["webgl2", "webgl"]);
  });

  it.each([
    "null",
    "lost",
    "missing-vao",
    "throws",
  ])("rejects %s contexts with a fixed message", (failure) => {
    const canvas = document.createElement("canvas");
    const gl = context();
    const get = vi.spyOn(canvas, "getContext").mockReturnValue(gl);
    if (failure === "null") get.mockReturnValue(null);
    if (failure === "lost") vi.mocked(gl.isContextLost).mockReturnValue(true);
    if (failure === "missing-vao") {
      get.mockReturnValueOnce(null);
      vi.mocked(gl.getExtension).mockReturnValue(null);
    }
    if (failure === "throws")
      get.mockImplementation(() => {
        throw new Error("synthetic-private-detail");
      });
    expect(() => lifecycle.preparePixiCanvas(canvas, options)).toThrow(
      "Could not initialize the renderer canvas.",
    );
  });

  it("does not pre-create GL when automatic selection uses another backend", async () => {
    const { isWebGLSupported } = await import("pixi.js");
    vi.mocked(isWebGLSupported).mockReturnValueOnce(false);
    const canvas = document.createElement("canvas");
    const get = vi.spyOn(canvas, "getContext");
    lifecycle.preparePixiCanvas(canvas, options);
    expect(get).not.toHaveBeenCalled();
  });

  it("uses host defaults for context version and attributes", async () => {
    const { GlContextSystem, GlBackBufferSystem } = await import("pixi.js");
    const originalContext = GlContextSystem.defaultOptions;
    const originalBackBuffer = GlBackBufferSystem.defaultOptions;
    try {
      GlContextSystem.defaultOptions = {
        ...originalContext,
        preferWebGLVersion: 1,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "low-power",
      };
      GlBackBufferSystem.defaultOptions = { ...originalBackBuffer, useBackBuffer: true };
      const canvas = document.createElement("canvas");
      const get = vi.spyOn(canvas, "getContext").mockReturnValue(context());
      lifecycle.preparePixiCanvas(canvas, options);
      expect(get).toHaveBeenCalledExactlyOnceWith("webgl", {
        alpha: false,
        premultipliedAlpha: false,
        antialias: false,
        stencil: true,
        preserveDrawingBuffer: true,
        powerPreference: "low-power",
      });
    } finally {
      GlContextSystem.defaultOptions = originalContext;
      GlBackBufferSystem.defaultOptions = originalBackBuffer;
    }
  });

  it.each(["context", "multiView"])("does not override host %s", async (key) => {
    const { GlContextSystem } = await import("pixi.js");
    const original = GlContextSystem.defaultOptions;
    try {
      GlContextSystem.defaultOptions = {
        ...original,
        [key]: key === "context" ? context() : true,
      };
      const canvas = document.createElement("canvas");
      const get = vi.spyOn(canvas, "getContext");
      lifecycle.preparePixiCanvas(canvas, options);
      expect(get).not.toHaveBeenCalled();
    } finally {
      GlContextSystem.defaultOptions = original;
    }
  });
});

describe("Pixi Application lifecycle", () => {
  it("fully disposes the app and waits for the caller canvas to restore", async () => {
    const fixture = application();
    const remove = vi.spyOn(fixture.canvas, "removeEventListener");
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    expect(fixture.destroy).toHaveBeenCalledExactlyOnceWith(false, { children: true });
    const ready = vi.fn();
    const waiting = lifecycle.waitForPixiCanvas(fixture.canvas).then(ready);
    expect(ready).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await waiting;
    expect(fixture.state.preventDefault).toBe(true);
    expect(fixture.extension.restoreContext).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls.map(([event]) => event)).toEqual([
      "webglcontextlost",
      "webglcontextrestored",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not create or inspect a GL context on a fresh canvas", async () => {
    const canvas = document.createElement("canvas");
    const getContext = vi.spyOn(canvas, "getContext");
    await lifecycle.waitForPixiCanvas(canvas);
    expect(getContext).not.toHaveBeenCalled();
  });

  it.each([
    "older",
    "newer",
  ])("preserves the surviving app when the %s app is disposed", (order) => {
    const first = application();
    ticker.pauseUpdate = false;
    ticker.interactionFrequency = 4;
    const second = application();
    const disposed = order === "older" ? first : second;
    const live = order === "older" ? second : first;
    lifecycle.disposePixiApplication(disposed.app, disposed.canvas);
    expect(ticker.events).toBe(live.events);
    expect(ticker.domElement).toBe(live.canvas);
    expect(ticker.pauseUpdate).toBe(order === "older");
    expect(ticker.interactionFrequency).toBe(order === "older" ? 10 : 4);
  });

  it.each([
    "before",
    "after",
  ])("does not clear an external Pixi app created %s ours", (order) => {
    const first = application({ owned: order !== "before" });
    const second = application({ owned: order === "before" });
    const owned = order === "before" ? second : first;
    const external = order === "before" ? first : second;
    lifecycle.disposePixiApplication(owned.app, owned.canvas);
    expect(ticker.events).toBe(external.events);
    expect(ticker.domElement).toBe(external.canvas);
  });

  it("does not resurrect an app destroyed directly through pixiApp", () => {
    const first = application();
    const second = application();
    first.app.destroy(false);
    lifecycle.disposePixiApplication(second.app, second.canvas);
    expect(ticker.events).toBeNull();
  });

  it("skips restoration when the backend cannot forcibly lose its context", async () => {
    const fixture = application({ extensionAvailable: false });
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    await lifecycle.waitForPixiCanvas(fixture.canvas);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a failed restore, cleans listeners, and permits recovery after the timeout", async () => {
    const fixture = application();
    fixture.extension.restoreContext.mockImplementation(() => {});
    const remove = vi.spyOn(fixture.canvas, "removeEventListener");
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(lifecycle.waitForPixiCanvas(fixture.canvas)).rejects.toThrow(
      "Timed out",
    );
    expect(remove).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    fixture.state.lost = false;
    await expect(lifecycle.waitForPixiCanvas(fixture.canvas)).resolves.toBeUndefined();
  });

  it("preserves a loss event delivered after the deadline and restores once", async () => {
    const fixture = application();
    fixture.extension.loseContext.mockImplementation(() => {
      fixture.state.lost = true;
    });
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(lifecycle.waitForPixiCanvas(fixture.canvas)).rejects.toThrow(
      "Timed out",
    );
    expect(vi.getTimerCount()).toBe(0);
    const late = new Event("webglcontextlost", { cancelable: true });
    fixture.canvas.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(true);
    expect(fixture.extension.restoreContext).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await lifecycle.waitForPixiCanvas(fixture.canvas);
    expect(fixture.extension.restoreContext).toHaveBeenCalledTimes(1);
    const unrelated = new Event("webglcontextlost", { cancelable: true });
    fixture.canvas.dispatchEvent(unrelated);
    expect(unrelated.defaultPrevented).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a no-event late guard when external recovery permits reuse", async () => {
    const fixture = application();
    fixture.extension.loseContext.mockImplementation(() => {
      fixture.state.lost = true;
    });
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(lifecycle.waitForPixiCanvas(fixture.canvas)).rejects.toThrow(
      "Timed out",
    );
    fixture.state.lost = false;
    await lifecycle.waitForPixiCanvas(fixture.canvas);
    const unrelated = new Event("webglcontextlost", { cancelable: true });
    fixture.canvas.dispatchEvent(unrelated);
    expect(unrelated.defaultPrevented).toBe(false);
    expect(fixture.extension.restoreContext).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    false,
    true,
  ])("handles a deadline queued ahead of restoration (loss already observed: %s)", async (observed) => {
    const fixture = application();
    fixture.extension.loseContext.mockImplementation(() => {
      fixture.state.lost = true;
    });
    if (!observed) fixture.state.lost = true;
    const schedule = vi.spyOn(globalThis, "setTimeout");
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    if (observed)
      fixture.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    const deadline = schedule.mock.calls.find(([, delay]) => delay === 3000)?.[0];
    expect(typeof deadline).toBe("function");
    if (typeof deadline === "function") deadline();
    await expect(lifecycle.waitForPixiCanvas(fixture.canvas)).rejects.toThrow(
      "Timed out",
    );
    if (!observed) {
      const late = new Event("webglcontextlost", { cancelable: true });
      fixture.canvas.dispatchEvent(late);
      expect(late.defaultPrevented).toBe(true);
    }
    await vi.runAllTimersAsync();
    await lifecycle.waitForPixiCanvas(fixture.canvas);
    expect(fixture.extension.restoreContext).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    schedule.mockRestore();
  });

  it("contains late restoration exceptions without retrying or retaining timers", async () => {
    const fixture = application();
    fixture.extension.loseContext.mockImplementation(() => {
      fixture.state.lost = true;
    });
    fixture.extension.restoreContext.mockImplementation(() => {
      throw new Error("synthetic failure");
    });
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    await vi.advanceTimersByTimeAsync(3000);
    fixture.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    await vi.runAllTimersAsync();
    await expect(lifecycle.waitForPixiCanvas(fixture.canvas)).rejects.toThrow(
      "Timed out",
    );
    fixture.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(fixture.extension.restoreContext).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles restoration exceptions without an unhandled disposal rejection", async () => {
    const fixture = application();
    fixture.extension.restoreContext.mockImplementation(() => {
      throw new Error("test failure");
    });
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    await vi.runAllTimersAsync();
    await expect(lifecycle.waitForPixiCanvas(fixture.canvas)).rejects.toThrow(
      "Could not restore",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the saved extension when disposal starts with an already lost context", async () => {
    const fixture = application();
    fixture.state.lost = true;
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    await vi.runAllTimersAsync();
    await lifecycle.waitForPixiCanvas(fixture.canvas);
    expect(fixture.extension.restoreContext).toHaveBeenCalledTimes(1);
  });

  it("keeps only one pending restoration request for repeated loss events", async () => {
    const fixture = application();
    lifecycle.disposePixiApplication(fixture.app, fixture.canvas);
    fixture.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    fixture.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    await vi.runAllTimersAsync();
    await lifecycle.waitForPixiCanvas(fixture.canvas);
    expect(fixture.extension.restoreContext).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still restores another event owner when app disposal throws", async () => {
    const first = application();
    const second = application();
    first.destroy.mockImplementation(() => {
      throw new Error("test failure");
    });
    expect(() => lifecycle.disposePixiApplication(first.app, first.canvas)).toThrow(
      "test failure",
    );
    expect(ticker.events).toBe(second.events);
    await lifecycle.waitForPixiCanvas(first.canvas);
    expect(vi.getTimerCount()).toBe(0);
  });
});
