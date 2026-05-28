import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vivi2d/renderer-pixi/loader", () => ({
  extractTextures: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@vivi2d/renderer-pixi/renderer", () => ({
  ViviPixiRenderer: {
    create: vi.fn().mockResolvedValue({
      setModel: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn(),
      screenToWorld: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    }),
  },
}));
vi.mock("@vivi2d/renderer-pixi/thumbnail", () => ({
  generateThumbnail: vi.fn(() => "data:image/png;base64,thumb"),
}));

import { ViviModelElement } from "../vivi-model-element";

const TEST_VIVI_JSON = JSON.stringify({
  version: 5,
  project: {
    name: "release-gate",
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
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0.02,
      smoothing: 0.7,
      gain: 2,
    },
    expressionPresets: [],
  },
  atlases: [],
});

const TAG_NAME = "vivi-model-release-gate";
if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, class extends ViviModelElement {});
}

describe("ViviModelElement release gate smoke", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(TEST_VIVI_JSON, { status: 200 }),
    );
    vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockReturnValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("boots from declarative HTML attributes and dispatches load", async () => {
    document.body.innerHTML = `<${TAG_NAME} src="test.vivi" width="320" height="240"></${TAG_NAME}>`;
    const el = document.body.querySelector(TAG_NAME) as ViviModelElement | null;
    expect(el).not.toBeNull();

    await new Promise<void>((resolve) => {
      el!.addEventListener("load", () => resolve(), { once: true });
    });

    expect(el!.model).not.toBeNull();
    expect(el!.project?.name).toBe("release-gate");
    expect(el!.style.width).toBe("320px");
    expect(el!.style.height).toBe("240px");
    expect(el!.shadowRoot?.querySelector("canvas")).not.toBeNull();
  });

  it("dispatches an error event for a failed declarative load without crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));

    document.body.innerHTML = `<${TAG_NAME} src="missing.vivi"></${TAG_NAME}>`;
    const el = document.body.querySelector(TAG_NAME) as ViviModelElement | null;
    expect(el).not.toBeNull();

    const message = await new Promise<string>((resolve) => {
      el!.addEventListener(
        "error",
        (event) => {
          resolve((event as CustomEvent).detail.message);
        },
        { once: true },
      );
    });

    expect(message).toContain("404");
    expect(el!.isConnected).toBe(true);
  });

  it("reloads successfully when the declarative src attribute changes", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(TEST_VIVI_JSON, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(TEST_VIVI_JSON.replace("release-gate", "release-gate-second"), {
          status: 200,
        }),
      );

    const el = document.createElement(TAG_NAME) as ViviModelElement;
    document.body.appendChild(el);

    const firstLoad = new Promise<void>((resolve) => {
      el.addEventListener("load", () => resolve(), { once: true });
    });
    el.setAttribute("src", "first.vivi");
    await firstLoad;
    expect(el.project?.name).toBe("release-gate");

    const secondLoad = new Promise<void>((resolve) => {
      el.addEventListener("load", () => resolve(), { once: true });
    });
    el.setAttribute("src", "second.vivi");
    await secondLoad;

    expect(el.project?.name).toBe("release-gate-second");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("can disconnect and reconnect with declarative src without breaking subsequent loads", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(TEST_VIVI_JSON, { status: 200 }))
      .mockResolvedValueOnce(new Response(TEST_VIVI_JSON, { status: 200 }));

    const el = document.createElement(TAG_NAME) as ViviModelElement;
    document.body.appendChild(el);

    const firstLoad = new Promise<void>((resolve) => {
      el.addEventListener("load", () => resolve(), { once: true });
    });
    el.setAttribute("src", "reconnect.vivi");
    await firstLoad;
    expect(el.model).not.toBeNull();

    const detached = document.body.removeChild(el);
    expect(detached.model).toBeNull();

    const reconnectedLoad = new Promise<void>((resolve) => {
      detached.addEventListener("load", () => resolve(), { once: true });
    });
    document.body.appendChild(detached);
    await reconnectedLoad;

    expect(detached.model).not.toBeNull();
    expect(detached.project?.name).toBe("release-gate");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
