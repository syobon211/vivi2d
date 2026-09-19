import { vi } from "vitest";

/** Byte-backed Canvas 2D test double; product matching/history remain real. */
export function installRasterCanvas() {
  const pixels = new WeakMap<HTMLCanvasElement, ImageData>();
  const imageFor = (canvas: HTMLCanvasElement) => {
    let image = pixels.get(canvas);
    if (!image || image.width !== canvas.width || image.height !== canvas.height) {
      image = new ImageData(
        new Uint8ClampedArray(canvas.width * canvas.height * 4),
        canvas.width,
        canvas.height,
      );
      pixels.set(canvas, image);
    }
    return image;
  };
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(function (this: HTMLCanvasElement) {
      return {
        getImageData: () => {
          const image = imageFor(this);
          return new ImageData(
            new Uint8ClampedArray(image.data),
            image.width,
            image.height,
          );
        },
        putImageData: (image: ImageData) => {
          pixels.set(
            this,
            new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
          );
        },
      } as unknown as CanvasRenderingContext2D;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  function create(width = 2, height = 2, value = 0): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const data = new Uint8ClampedArray(width * height * 4).fill(value);
    canvas.getContext("2d")!.putImageData(new ImageData(data, width, height), 0, 0);
    return canvas;
  }
  function read(canvas: HTMLCanvasElement): number[] {
    return [
      ...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data,
    ];
  }
  return { create, read, restore: () => context.mockRestore() };
}
