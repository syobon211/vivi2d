import { MAX_VIVI_TEXT_FILE_BYTES } from "@vivi2d/core/load-limits";
import { extractTextures } from "@vivi2d/renderer-pixi/loader";
import { ViviPixiRenderer } from "@vivi2d/renderer-pixi/renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViviModelElement } from "../vivi-model-element";

vi.mock("@vivi2d/renderer-pixi/loader", () => ({
  extractTextures: vi.fn(),
}));
vi.mock("@vivi2d/renderer-pixi/renderer", () => ({
  ViviPixiRenderer: { create: vi.fn() },
}));
vi.mock("@vivi2d/renderer-pixi/thumbnail", () => ({
  generateThumbnail: vi.fn(),
}));

const TAG = "vivi-model-lifecycle";
if (!customElements.get(TAG)) {
  customElements.define(TAG, class extends ViviModelElement {});
}

function renderer() {
  return {
    setModel: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn(),
  } as unknown as ViviPixiRenderer;
}

function response(name: string) {
  return new Response(
    JSON.stringify({
      version: 5,
      project: {
        name,
        width: 200,
        height: 200,
        layers: [],
        parameters: [],
        clips: [],
        scenes: [],
        stateMachines: [],
        skins: {},
        physicsGroups: [],
        colliders: [],
        expressionPresets: [],
        lipsyncConfig: {
          enabled: false,
          targetParameterId: null,
          source: "microphone",
          threshold: 0.02,
          smoothing: 0.7,
          gain: 2,
        },
      },
      atlases: [],
    }),
  );
}

describe("model load lifecycle", () => {
  beforeEach(() => {
    vi.mocked(extractTextures).mockReset().mockResolvedValue(new Map());
    vi.mocked(ViviPixiRenderer.create)
      .mockReset()
      .mockImplementation(async () => renderer());
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      response(String(url)),
    );
    vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockReturnValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function element() {
    const el = document.createElement(TAG) as ViviModelElement;
    document.body.appendChild(el);
    return el;
  }

  it("does not let an older texture decode replace a newer model", async () => {
    const textures = Promise.withResolvers<Awaited<ReturnType<typeof extractTextures>>>();
    vi.mocked(extractTextures).mockReturnValueOnce(textures.promise);
    const el = element();
    const loaded = vi.fn();
    el.addEventListener("vivi-load", loaded);
    const older = el.load("older.vivi");
    await vi.waitFor(() => expect(extractTextures).toHaveBeenCalledTimes(1));
    await el.load("newer.vivi");
    textures.resolve(new Map());
    await older;
    expect(el.project?.name).toBe("newer.vivi");
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(ViviPixiRenderer.create).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("destroys a superseded renderer and gives concurrent loads different canvases", async () => {
    const pending = Promise.withResolvers<ViviPixiRenderer>();
    const staleRenderer = renderer();
    const currentRenderer = renderer();
    vi.mocked(ViviPixiRenderer.create)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(currentRenderer);
    const el = element();
    const older = el.load("older.vivi");
    await vi.waitFor(() => expect(ViviPixiRenderer.create).toHaveBeenCalledTimes(1));
    await el.load("newer.vivi");
    pending.resolve(staleRenderer);
    await older;
    expect(el.project?.name).toBe("newer.vivi");
    expect(staleRenderer.destroy).toHaveBeenCalledOnce();
    expect(currentRenderer.destroy).not.toHaveBeenCalled();
    const calls = vi.mocked(ViviPixiRenderer.create).mock.calls;
    expect(calls[0][0]).not.toBe(calls[1][0]);
    expect(el.shadowRoot?.querySelector("canvas")).toBe(calls[1][0]);
  });

  it("cannot reactivate an element removed while the renderer is being created", async () => {
    const pending = Promise.withResolvers<ViviPixiRenderer>();
    const lateRenderer = renderer();
    vi.mocked(ViviPixiRenderer.create).mockReturnValueOnce(pending.promise);
    const el = element();
    const loaded = vi.fn();
    el.addEventListener("vivi-load", loaded);
    const loading = el.load("model.vivi");
    await vi.waitFor(() => expect(ViviPixiRenderer.create).toHaveBeenCalledOnce());
    el.remove();
    pending.resolve(lateRenderer);
    await loading;
    expect(el.model).toBeNull();
    expect(el.loading).toBe(false);
    expect(lateRenderer.destroy).toHaveBeenCalledOnce();
    expect(loaded).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("does not report an old fetch error or clear the newer loading state", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const el = element();
    const errors = vi.fn();
    el.addEventListener("vivi-error", errors);
    const older = el.load("older.vivi");
    const newer = el.load("newer.vivi");
    first.reject(new Error("aborted"));
    await older;
    expect(el.loading).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    second.resolve(response("newer"));
    await newer;
    expect(el.project?.name).toBe("newer");
  });

  it("cancels and releases an oversized response stream", async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({
        done: false,
        value: { byteLength: MAX_VIVI_TEXT_FILE_BYTES + 1 },
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Response);
    const el = element();
    const errors = vi.fn();
    el.addEventListener("vivi-error", errors);
    await el.load("oversized.vivi");
    expect(errors).toHaveBeenCalledOnce();
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(extractTextures).not.toHaveBeenCalled();
  });

  it("keeps the newer load started by a synchronous dispose listener", async () => {
    const el = element();
    let newer!: Promise<void>;
    const onDispose = () => {
      el.removeEventListener("vivi-dispose", onDispose);
      newer = el.load("newer.vivi");
    };
    el.addEventListener("vivi-dispose", onDispose);
    await el.load("older.vivi");
    await newer;
    expect(el.project?.name).toBe("newer.vivi");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not reactivate after removal by a synchronous dispose listener", async () => {
    const el = element();
    const onDispose = () => {
      el.removeEventListener("vivi-dispose", onDispose);
      el.remove();
    };
    el.addEventListener("vivi-dispose", onDispose);
    await el.load("removed.vivi");
    expect(el.model).toBeNull();
    expect(el.loading).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
