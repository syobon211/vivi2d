import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


vi.mock("@/lib/auto-mesh", () => ({
  generateAutoMesh: vi.fn(
    () =>
      ({
        vertices: [0, 0, 1, 0, 1, 1],
        indices: [0, 1, 2],
        uvs: [0, 0, 1, 0, 1, 1],
        divisionsX: 1,
        divisionsY: 1,
      }) as const,
  ),
}));

vi.mock("@/lib/workers/worker-runner", () => ({
  runWorker: vi.fn(async () => null),
}));

vi.mock("@/workers/auto-mesh.worker?worker", () => ({
  default: class FakeWorker {
    terminate() {}
  },
}));

import { generateAutoMesh } from "@/lib/auto-mesh";
import { generateAutoMeshAsync } from "@/lib/workers/auto-mesh-client";
import { runWorker } from "@/lib/workers/worker-runner";

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function stubCanvasContext(
  canvas: HTMLCanvasElement,
  opts: { throwGetImageData?: boolean } = {},
): void {
  const fakeCtx = {
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      if (opts.throwGetImageData) throw new Error("blocked");
      return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
    },
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(fakeCtx as any);
}

describe("generateAutoMeshAsync", () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalWorker) {
      (globalThis as any).Worker = originalWorker;
    } else {
      delete (globalThis as any).Worker;
    }
  });

  it("Worker 非対応環境では fallback の generateAutoMesh を同期呼び出しする", async () => {
    delete (globalThis as any).Worker;
    const canvas = makeCanvas(16, 16);
    const result = await generateAutoMeshAsync(canvas, 16, 16, "standard");
    expect(generateAutoMesh).toHaveBeenCalledTimes(1);
    expect(runWorker).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it("canvas サイズ 0 では null を返し Worker を起動しない", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    const canvas = makeCanvas(0, 0);
    const result = await generateAutoMeshAsync(canvas, 0, 0, "standard");
    expect(result).toBeNull();
    expect(runWorker).not.toHaveBeenCalled();
    expect(generateAutoMesh).not.toHaveBeenCalled();
  });

  it("getContext が null を返す場合は null を返す", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    const canvas = makeCanvas(16, 16);
    const result = await generateAutoMeshAsync(canvas, 16, 16, "standard");
    expect(result).toBeNull();
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("getImageData が例外を投げる場合は null を返す", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    const canvas = makeCanvas(16, 16);
    stubCanvasContext(canvas, { throwGetImageData: true });
    const result = await generateAutoMeshAsync(canvas, 16, 16, "standard");
    expect(result).toBeNull();
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("Worker 対応環境では runWorker に request と transfer を渡す", async () => {
    (globalThis as any).Worker = originalWorker ?? class StubWorker { terminate() {} };
    const expected = {
      vertices: [0, 0, 1, 0, 1, 1], indices: [0, 1, 2], uvs: [0, 0, 1, 0, 1, 1],
      divisionsX: 1, divisionsY: 1,
    };
    vi.mocked(runWorker).mockResolvedValueOnce(expected);
    const canvas = makeCanvas(2, 3);
    const pixels = new Uint8ClampedArray(2 * 3 * 4);
    pixels.set([10, 20, 30, 255]);
    pixels[pixels.length - 1] = 128;
    const getImageData = vi.fn(() => new ImageData(pixels, 2, 3));
    const canvas2d: {
      getContext(contextId: "2d"): CanvasRenderingContext2D | null;
    } = canvas;
    vi.spyOn(canvas2d, "getContext").mockReturnValue({ getImageData } as unknown as CanvasRenderingContext2D);
    const result = await generateAutoMeshAsync(canvas, 7, 11, "standard");
    expect(getImageData).toHaveBeenCalledWith(0, 0, 2, 3);
    expect(runWorker).toHaveBeenCalledOnce();
    const call = vi.mocked(runWorker).mock.calls[0]![0];
    expect(call.request).toEqual({
      buffer: expect.any(ArrayBuffer), texWidth: 2, texHeight: 3,
      layerWidth: 7, layerHeight: 11, preset: "standard",
    });
    const request = call.request as { buffer: ArrayBuffer };
    expect(new Uint8ClampedArray(request.buffer)).toEqual(pixels);
    expect(request.buffer).not.toBe(pixels.buffer);
    expect(call.transfer).toHaveLength(1);
    expect(call.transfer![0]).toBe(request.buffer);
    expect(result).toBe(expected);
  });
});
