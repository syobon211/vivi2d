import { afterAll, describe, expect, it } from "vitest";
import { trimTransparentBounds } from "../image-loader";

const canvasPixels = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function setOpaqueRect(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
) {
  const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      data[(y * canvas.width + x) * 4 + 3] = 255;
    }
  }
  canvasPixels.set(canvas, data);
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  contextId: "2d" | "bitmaprenderer" | "webgl" | "webgl2" | "webgpu",
  options?: unknown,
) {
  if (contextId !== "2d") {
    return (originalGetContext as any).call(this, contextId, options);
  }

  return {
    canvas: this,
    getImageData: () => ({
      data: canvasPixels.get(this) ?? new Uint8ClampedArray(this.width * this.height * 4),
    }),
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D;
} as typeof HTMLCanvasElement.prototype.getContext;

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe("trimTransparentBounds", () => {
  it("returns the original canvas when visible pixels already fill the bounds", () => {
    const canvas = createCanvas(4, 3);
    setOpaqueRect(canvas, { x: 0, y: 0, width: 4, height: 3 });

    const result = trimTransparentBounds(canvas);

    expect(result).toEqual({
      canvas,
      offsetX: 0,
      offsetY: 0,
      originalWidth: 4,
      originalHeight: 3,
      trimmed: false,
    });
  });

  it("trims transparent padding and reports the preserved offset", () => {
    const canvas = createCanvas(6, 5);
    setOpaqueRect(canvas, { x: 2, y: 1, width: 3, height: 2 });

    const result = trimTransparentBounds(canvas);

    expect(result.offsetX).toBe(2);
    expect(result.offsetY).toBe(1);
    expect(result.originalWidth).toBe(6);
    expect(result.originalHeight).toBe(5);
    expect(result.trimmed).toBe(true);
    expect(result.canvas.width).toBe(3);
    expect(result.canvas.height).toBe(2);
  });

  it("rejects fully transparent images", () => {
    const canvas = createCanvas(3, 3);

    expect(() => trimTransparentBounds(canvas)).toThrow(
      "PNG image contains no visible pixels.",
    );
  });
});
