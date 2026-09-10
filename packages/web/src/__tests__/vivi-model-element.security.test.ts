import { MAX_VIVI_TEXT_FILE_BYTES } from "@vivi2d/core/load-limits";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViviModelElement } from "../vivi-model-element";

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

if (!customElements.get("vivi-model")) {
  customElements.define("vivi-model", ViviModelElement);
}

describe("ViviModelElement security guards", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects oversized remote models from Content-Length", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-length": String(MAX_VIVI_TEXT_FILE_BYTES + 1),
      }),
      body: null,
      text: vi.fn(),
    } as unknown as Response);

    const element = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(element);

    const errorPromise = new Promise<string>((resolve) => {
      element.addEventListener("error", (event) => {
        resolve((event as CustomEvent).detail.message);
      });
    });

    await element.load("huge.vivi");
    const message = await errorPromise;

    expect(message).toBe("Could not load a Vivi2D model.");

    document.body.removeChild(element);
  });

  it("cancels a non-OK fetched response owned by the element", async () => {
    const cancel = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { status: 503 }),
    );
    const element = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(element);
    try {
      await element.load("https://example.invalid/model.vivi");
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      element.remove();
    }
  });

  it.each([
    new TypeError("synthetic-password in fetch URL"),
    "synthetic-password",
  ])("does not forward rejected source details through public error events", async (failure) => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);
    const element = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(element);
    const messages: string[] = [];
    for (const name of ["error", "vivi-error"]) {
      element.addEventListener(name, (event) => {
        messages.push((event as CustomEvent).detail.message);
      });
    }
    try {
      await element.load("https://example.invalid/model.vivi");
      expect(messages).toEqual([
        "Could not load a Vivi2D model.",
        "Could not load a Vivi2D model.",
      ]);
    } finally {
      element.remove();
    }
  });
});
