import { MAX_VIVI_TEXT_FILE_BYTES } from "@vivi2d/core/load-limits";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createViviWebPlayer,
  isViviWebError,
  isViviWebModel,
  loadViviWebModel,
  type ViviModelJSON,
  ViviWebError,
  type ViviWebEvent,
} from "../index";
import { getViviWebModelInternals } from "../model-internals";

const mocks = vi.hoisted(() => {
  const renderer = {
    destroy: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
    screenToWorld: vi.fn(() => ({ x: 10, y: 20 })),
    setModel: vi.fn(),
  };

  return {
    createRenderer: vi.fn().mockResolvedValue(renderer),
    extractTextures: vi.fn().mockResolvedValue(new Map()),
    generateThumbnail: vi.fn(() => "data:image/png;base64,thumb"),
    renderer,
  };
});

vi.mock("@vivi2d/renderer-pixi/loader", () => ({
  extractTextures: mocks.extractTextures,
}));

vi.mock("@vivi2d/renderer-pixi/renderer", () => ({
  ViviPixiRenderer: {
    create: mocks.createRenderer,
  },
}));

vi.mock("@vivi2d/renderer-pixi/thumbnail", () => ({
  generateThumbnail: mocks.generateThumbnail,
}));

function makeViviObject(): ViviModelJSON {
  return {
    profile: "publicProfileV1",
    version: 10,
    project: {
      clips: [],
      colliders: [],
      expressionPresets: [
        {
          hotkey: 1,
          id: "preset-smile",
          name: "Smile",
          values: {
            "vivi.head.yaw": 0.5,
          },
        },
      ],
      height: 128,
      layers: [],
      lipsyncConfig: {
        enabled: false,
        gain: 2,
        smoothing: 0.7,
        source: "microphone",
        targetParameterId: null,
        threshold: 0.02,
      },
      name: "web-sdk-fixture",
      parameters: [
        {
          defaultValue: 0,
          id: "vivi.head.yaw",
          maxValue: 1,
          minValue: -1,
          name: "Head Yaw",
        },
      ],
      physicsGroups: [],
      scenes: [],
      skins: {},
      stateMachines: [],
      width: 128,
    },
    atlases: [],
  };
}

function makeViviJson(): string {
  return JSON.stringify(makeViviObject());
}

describe("@vivi2d/web programmatic SDK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRenderer.mockResolvedValue(mocks.renderer);
    mocks.extractTextures.mockResolvedValue(new Map());
    mocks.generateThumbnail.mockReturnValue("data:image/png;base64,thumb");
    mocks.renderer.screenToWorld.mockReturnValue({ x: 10, y: 20 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads public .vivi JSON as an opaque cloned web model", async () => {
    const source = makeViviObject();
    const model = await loadViviWebModel(source, {
      initialParameters: {
        "vivi.head.yaw": 99,
        unknown: 1,
      },
    });

    source.project.name = "mutated-after-load";

    expect(isViviWebModel(model)).toBe(true);
    expect(isViviWebModel({ metadata: model.metadata })).toBe(false);
    expect(model.metadata).toEqual({
      expressionPresetCount: 1,
      height: 128,
      name: "web-sdk-fixture",
      parameterCount: 1,
      width: 128,
    });
    const modelInternals = getViviWebModelInternals(model);
    expect(modelInternals.runtimeModel.project.name).toBe("web-sdk-fixture");
    expect(modelInternals.runtimeModel.parameterValues["vivi.head.yaw"]).toBe(1);
    expect(model.parameters).toEqual([
      {
        default: 0,
        id: "vivi.head.yaw",
        max: 1,
        min: -1,
        name: "Head Yaw",
      },
    ]);
    expect(model.expressionPresets).toEqual([
      {
        hotkey: 1,
        id: "preset-smile",
        name: "Smile",
      },
    ]);
  });

  it("normalizes hostile object and private-profile failures to ViviWebError", async () => {
    let getterWasCalled = false;
    const hostile = makeViviObject();
    Object.defineProperty(hostile.project, "unexpected", {
      enumerable: true,
      get() {
        getterWasCalled = true;
        throw new Error("getter should not run");
      },
    });

    await expect(loadViviWebModel(hostile)).rejects.toMatchObject({
      code: "VIVI_WEB_VALIDATION_FAILED",
    });
    expect(getterWasCalled).toBe(false);

    const privateProfile = makeViviObject();
    privateProfile.profile = "authoringProfileV1" as "publicProfileV1";

    await expect(loadViviWebModel(privateProfile)).rejects.toMatchObject({
      code: "VIVI_WEB_VALIDATION_FAILED",
    });

    const cyclic = makeViviObject();
    (cyclic.project as Record<string, unknown>).self = cyclic.project;
    await expect(loadViviWebModel(cyclic)).rejects.toMatchObject({
      code: "VIVI_WEB_VALIDATION_FAILED",
    });

    const withSymbol = makeViviObject();
    Object.defineProperty(withSymbol.project, Symbol("secret"), {
      enumerable: true,
      value: true,
    });
    await expect(loadViviWebModel(withSymbol)).rejects.toMatchObject({
      code: "VIVI_WEB_VALIDATION_FAILED",
    });

    const withArrayHole = makeViviObject();
    withArrayHole.project.layers = new Array(1);
    await expect(loadViviWebModel(withArrayHole)).rejects.toMatchObject({
      code: "VIVI_WEB_VALIDATION_FAILED",
    });

    const withArraySymbol = makeViviObject();
    Object.defineProperty(withArraySymbol.project.layers, Symbol("layer-secret"), {
      enumerable: true,
      value: true,
    });
    await expect(loadViviWebModel(withArraySymbol)).rejects.toMatchObject({
      code: "VIVI_WEB_VALIDATION_FAILED",
    });

    const tooDeep = makeViviObject();
    let cursor = tooDeep.project as Record<string, unknown>;
    for (let index = 0; index < 300; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    await expect(loadViviWebModel(tooDeep)).rejects.toMatchObject({
      code: "VIVI_WEB_VALIDATION_FAILED",
    });
  });

  it("rejects non-finite initial parameters before runtime state is created", async () => {
    await expect(
      loadViviWebModel(makeViviObject(), {
        initialParameters: {
          "vivi.head.yaw": Number.NaN,
        },
      }),
    ).rejects.toMatchObject({ code: "VIVI_WEB_INVALID_INPUT" });
  });

  it.each([
    "header",
    "stream",
  ])("cancels and releases an oversized SDK %s without waiting for its source", async (limitSource) => {
    const reader = {
      read: vi.fn().mockResolvedValue({
        done: false,
        value: { byteLength: MAX_VIVI_TEXT_FILE_BYTES + 1 },
      }),
      cancel: vi.fn(() => new Promise<void>(() => {})),
      releaseLock: vi.fn(),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers(
        limitSource === "header"
          ? {
              "content-length": String(MAX_VIVI_TEXT_FILE_BYTES + 1),
            }
          : {},
      ),
      body: { getReader: () => reader },
    } as unknown as Response);

    await expect(
      loadViviWebModel("https://example.invalid/large.vivi"),
    ).rejects.toMatchObject({ code: "VIVI_WEB_LIMIT_EXCEEDED" });
    expect(reader.read).toHaveBeenCalledTimes(limitSource === "header" ? 0 : 1);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });

  it("aborts a pending caller Response clone without consuming the caller branch", async () => {
    const abort = new AbortController();
    const stream = new ReadableStream<Uint8Array>();
    const response = new Response(stream);
    const result = loadViviWebModel(response, { signal: abort.signal }).then(
      () => "resolved",
      (error: ViviWebError) => error.code,
    );
    await Promise.resolve();
    abort.abort();
    const outcome = await Promise.race([
      result,
      new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
    ]);
    try {
      // Cancelling one tee branch must not await the untouched caller branch.
      expect(response.bodyUsed).toBe(false);
      expect(outcome).toBe("VIVI_WEB_ABORTED");
    } finally {
      void response.body?.cancel();
    }
  });

  it("releases a completed response reader and leaves the caller Response readable", async () => {
    const response = new Response(makeViviJson());
    const release = vi.spyOn(ReadableStreamDefaultReader.prototype, "releaseLock");
    await loadViviWebModel(response);
    expect(release).toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
    expect(await response.text()).toBe(makeViviJson());
  });

  it("does not clone or consume a non-OK caller Response", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status: 503 });
    const clone = vi.spyOn(response, "clone");
    await expect(loadViviWebModel(response)).rejects.toMatchObject({
      code: "VIVI_WEB_FETCH_FAILED",
    });
    expect(clone).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    await response.body?.cancel();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a non-OK fetched response owned by the SDK", async () => {
    const cancel = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { status: 503 }),
    );
    await expect(
      loadViviWebModel("https://example.invalid/model.vivi"),
    ).rejects.toMatchObject({ code: "VIVI_WEB_FETCH_FAILED" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("loads supported source variants and enforces safe fetch defaults", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(new Response(makeViviJson(), { status: 200 })),
      );

    await loadViviWebModel("https://example.invalid/model.vivi", {
      fetchOptions: {
        cache: "no-store",
      },
    });
    await expect(
      loadViviWebModel(new URL("https://example.invalid/from-url.vivi")),
    ).resolves.toMatchObject({
      metadata: { name: "web-sdk-fixture" },
    });
    await expect(
      loadViviWebModel(new Request("https://example.invalid/from-request.vivi")),
    ).resolves.toMatchObject({
      metadata: { name: "web-sdk-fixture" },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.invalid/model.vivi",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
      }),
    );

    await expect(
      loadViviWebModel(new Response("", { status: 404 })),
    ).rejects.toMatchObject({ code: "VIVI_WEB_FETCH_FAILED" });
    await expect(loadViviWebModel("")).rejects.toMatchObject({
      code: "VIVI_WEB_INVALID_SOURCE",
    });

    fetchSpy.mockRejectedValueOnce(new TypeError("network down"));
    await expect(
      loadViviWebModel("https://example.invalid/network.vivi"),
    ).rejects.toMatchObject({
      code: "VIVI_WEB_FETCH_FAILED",
    });

    const variants = [
      new Response(makeViviJson(), { status: 200 }),
      new Blob([makeViviJson()], { type: "application/json" }),
      new TextEncoder().encode(makeViviJson()).buffer,
      new TextEncoder().encode(makeViviJson()),
    ];

    for (const variant of variants) {
      await expect(loadViviWebModel(variant)).resolves.toMatchObject({
        metadata: { name: "web-sdk-fixture" },
      });
    }

    await expect(
      loadViviWebModel(
        new Response("", {
          headers: {
            "content-length": String(MAX_VIVI_TEXT_FILE_BYTES + 1),
          },
          status: 200,
        }),
      ),
    ).rejects.toMatchObject({ code: "VIVI_WEB_LIMIT_EXCEEDED" });

    const controller = new AbortController();
    controller.abort();
    await expect(
      loadViviWebModel(new Response(makeViviJson(), { status: 200 }), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "VIVI_WEB_ABORTED" });
  });

  it("creates a player with validated lifecycle, input, resize, and thumbnail APIs", async () => {
    const events: ViviWebEvent[] = [];
    const model = await loadViviWebModel(makeViviObject());
    const player = await createViviWebPlayer({
      canvas: document.createElement("canvas"),
      model,
      onEvent: (event) => events.push(event),
    });

    expect(mocks.createRenderer).toHaveBeenCalledTimes(1);
    expect(mocks.renderer.setModel).toHaveBeenCalledWith(
      getViviWebModelInternals(model).runtimeModel,
      new Map(),
    );
    expect(events.map((event) => event.type)).toEqual(["load"]);

    player.setInput("vivi.head.yaw", -99);
    expect(
      getViviWebModelInternals(model).runtimeModel.parameterValues["vivi.head.yaw"],
    ).toBe(-1);
    expect(() => player.setInput("vivi.head.yaw", Number.POSITIVE_INFINITY)).toThrow(
      ViviWebError,
    );
    expect(() => player.update(Number.NaN)).toThrow(ViviWebError);

    player.resize(320, 240);
    expect(mocks.renderer.resize).toHaveBeenCalledWith(320, 240);
    expect(player.screenToWorld(12, 24)).toEqual({ x: 10, y: 20 });
    expect(player.hitTest(Number.NaN, 0)).toBeNull();
    expect(player.generateThumbnail({ height: 64, width: 64 })).toBe(
      "data:image/png;base64,thumb",
    );

    player.dispose();
    expect(player.disposed).toBe(true);
    expect(mocks.renderer.destroy).toHaveBeenCalledTimes(1);
    expect(() => player.render()).toThrow(ViviWebError);
  });

  it("rejects fake models, unknown strict inputs, OffscreenCanvas, and huge thumbnails", async () => {
    const model = await loadViviWebModel(makeViviObject());

    await expect(
      createViviWebPlayer({
        canvas: document.createElement("canvas"),
        model: { metadata: model.metadata } as never,
      }),
    ).rejects.toMatchObject({ code: "VIVI_WEB_INVALID_SOURCE" });

    const strictPlayer = await createViviWebPlayer({
      canvas: document.createElement("canvas"),
      model,
      strictInputs: true,
    });
    strictPlayer.setInput("vivi.head.yaw", 0.25);
    expect(() => strictPlayer.setInput("unknown", 1)).toThrow(ViviWebError);
    expect(() => strictPlayer.setInputs({ "vivi.head.yaw": 0.75, unknown: 1 })).toThrow(
      ViviWebError,
    );
    expect(
      getViviWebModelInternals(model).runtimeModel.parameterValues["vivi.head.yaw"],
    ).toBe(0.25);
    expect(() => strictPlayer.generateThumbnail({ height: 2048, width: 2048 })).toThrow(
      ViviWebError,
    );
    strictPlayer.dispose();

    const offscreen =
      typeof OffscreenCanvas === "undefined"
        ? ({ height: 16, width: 16 } as OffscreenCanvas)
        : new OffscreenCanvas(16, 16);

    await expect(
      createViviWebPlayer({
        canvas: offscreen as never,
        model,
      }),
    ).rejects.toMatchObject({ code: "VIVI_WEB_RENDERER_UNAVAILABLE" });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      createViviWebPlayer({
        canvas: offscreen as never,
        source: "https://example.invalid/should-not-fetch.vivi",
      }),
    ).rejects.toMatchObject({ code: "VIVI_WEB_RENDERER_UNAVAILABLE" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses scheduler injection for autoStart without requiring a global raf", async () => {
    const model = await loadViviWebModel(makeViviObject());
    const scheduler = {
      cancelFrame: vi.fn(),
      requestFrame: vi.fn(() => 1),
    };
    const events: ViviWebEvent[] = [];
    const player = await createViviWebPlayer({
      autoStart: true,
      canvas: document.createElement("canvas"),
      model,
      onEvent: (event) => events.push(event),
      scheduler,
    });

    expect(player.running).toBe(true);
    expect(scheduler.requestFrame).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual(["load", "start"]);

    player.stop();

    expect(player.running).toBe(false);
    expect(scheduler.cancelFrame).toHaveBeenCalledTimes(1);
    expect(scheduler.cancelFrame).toHaveBeenCalledWith(1);

    player.dispose();
    player.dispose();

    expect(mocks.renderer.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps autoStart frames after load with a synchronous scheduler", async () => {
    const model = await loadViviWebModel(makeViviObject());
    let frameRequests = 0;
    const events: ViviWebEvent[] = [];
    const player = await createViviWebPlayer({
      autoStart: true,
      canvas: document.createElement("canvas"),
      model,
      onEvent: (event) => events.push(event),
      scheduler: {
        cancelFrame: vi.fn(),
        requestFrame: vi.fn((callback) => {
          frameRequests += 1;
          if (frameRequests === 1) callback(16);
          return frameRequests;
        }),
      },
    });

    expect(events.map((event) => event.type)).toEqual(["load", "start"]);
    expect(frameRequests).toBe(2);
    expect(player.running).toBe(true);
    player.dispose();
  });

  it.each([
    "start",
    "dispose",
  ] as const)("keeps disposal terminal when a stop listener calls %s", async (action) => {
    let onStop = () => {};
    let nextFrame = 0;
    const frames = new Set<number>();
    const events: string[] = [];
    const player = await createViviWebPlayer({
      autoStart: true,
      canvas: document.createElement("canvas"),
      model: await loadViviWebModel(makeViviObject()),
      onEvent: (event) => {
        events.push(event.type);
        if (event.type === "stop") onStop();
      },
      scheduler: {
        requestFrame: () => {
          frames.add(++nextFrame);
          return nextFrame;
        },
        cancelFrame: (handle) => {
          frames.delete(handle);
        },
      },
    });
    onStop = () => player[action]();
    player.dispose();
    expect(player.disposed).toBe(true);
    expect(player.running).toBe(false);
    expect(frames.size).toBe(0);
    expect(mocks.renderer.destroy).toHaveBeenCalledOnce();
    expect(events).toEqual(["load", "start", "stop", "dispose"]);
  });

  it("does not emit load when autoStart fails before the player is usable", async () => {
    const model = await loadViviWebModel(makeViviObject());
    const events: ViviWebEvent[] = [];

    await expect(
      createViviWebPlayer({
        autoStart: true,
        canvas: document.createElement("canvas"),
        model,
        onEvent: (event) => events.push(event),
        scheduler: {
          cancelFrame: vi.fn(),
          requestFrame: vi.fn(() => {
            throw new Error("scheduler unavailable");
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "VIVI_WEB_RENDERER_UNAVAILABLE" });

    expect(events.map((event) => event.type)).toEqual(["dispose", "error"]);
  });

  it("isolates user event handler failures from lifecycle and canonical errors", async () => {
    const model = await loadViviWebModel(makeViviObject());
    const player = await createViviWebPlayer({
      autoStart: true,
      canvas: document.createElement("canvas"),
      model,
      onEvent: () => {
        throw new Error("consumer handler failed");
      },
      scheduler: {
        cancelFrame: vi.fn(() => {
          throw new Error("scheduler cancel failed");
        }),
        requestFrame: vi.fn(() => 1),
      },
    });

    expect(player.running).toBe(true);
    expect(() => player.dispose()).not.toThrow();

    await expect(
      createViviWebPlayer({
        canvas: document.createElement("canvas"),
        model: { metadata: model.metadata } as never,
        onEvent: () => {
          throw new Error("consumer handler failed");
        },
      }),
    ).rejects.toMatchObject({ code: "VIVI_WEB_INVALID_SOURCE" });
  });

  it("maps thumbnail renderer failures and oversized output into canonical errors", async () => {
    const model = await loadViviWebModel(makeViviObject());
    const player = await createViviWebPlayer({
      canvas: document.createElement("canvas"),
      model,
    });

    mocks.generateThumbnail.mockImplementationOnce(() => {
      throw new DOMException("The canvas is tainted.", "SecurityError");
    });
    try {
      player.generateThumbnail();
      throw new Error("expected generateThumbnail to fail");
    } catch (error) {
      expect(isViviWebError(error)).toBe(true);
      expect((error as ViviWebError).code).toBe("VIVI_WEB_TEXTURE_FAILED");
    }

    mocks.generateThumbnail.mockReturnValueOnce(
      `data:image/png;base64,${"a".repeat(2 * 1024 * 1024)}`,
    );
    expect(() => player.generateThumbnail()).toThrow(ViviWebError);
  });

  it("rolls back renderer resources when creation is aborted after renderer init", async () => {
    const model = await loadViviWebModel(makeViviObject());
    const controller = new AbortController();
    mocks.extractTextures.mockImplementationOnce(async () => {
      controller.abort();
      return new Map();
    });

    await expect(
      createViviWebPlayer({
        canvas: document.createElement("canvas"),
        model,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "VIVI_WEB_ABORTED" });

    expect(mocks.renderer.destroy).toHaveBeenCalledTimes(1);
  });
});
