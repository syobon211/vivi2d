import {
  MAX_PSD_FILE_BYTES,
  MAX_PSD_LAYER_PIXELS,
  MAX_PSD_TOTAL_LAYER_PIXELS,
} from "@vivi2d/core/load-limits";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ag-psd", () => ({
  readPsd: vi.fn(),
}));

import { readPsd } from "ag-psd";
import { parsePsd } from "@/lib/psd-loader";
import { PSD_METADATA_READ_OPTIONS, readPsdSafely } from "@/lib/psd-security";
import { clearTextures } from "@/lib/texture-store";

const mockReadPsd = vi.mocked(readPsd);

describe("parsePsd security guards", () => {
  it("skips unused thumbnails before the real decoder can log a canvas error", async () => {
    const actual = await vi.importActual<typeof import("ag-psd")>("ag-psd");
    const createCanvas = vi.fn(
      () =>
        ({
          getContext: () => {
            throw new Error("C:/synthetic-secret/token-canary.psd");
          },
        }) as unknown as HTMLCanvasElement,
    );
    actual.initializeCanvas(createCanvas);
    mockReadPsd.mockImplementation(actual.readPsd);
    const bytes: number[] = [];
    const u16 = (value: number) => bytes.push((value >>> 8) & 255, value & 255);
    const u32 = (value: number) => {
      u16(value >>> 16);
      u16(value);
    };
    // A 1x1 RGB PSD with one unused JPEG-thumbnail resource, no layers.
    u32(0x38425053);
    u16(1);
    bytes.push(0, 0, 0, 0, 0, 0);
    u16(3);
    u32(1);
    u32(1);
    u16(8);
    u16(3);
    u32(0);
    u32(44);
    u32(0x3842494d);
    u16(1036);
    bytes.push(0, 0);
    u32(32);
    u32(1);
    u32(1);
    u32(1);
    u32(4);
    u32(4);
    u32(4);
    u16(24);
    u16(1);
    bytes.push(0xff, 0xd8, 0xff, 0xd9);
    u32(0);
    u16(0);
    bytes.push(0, 0, 0);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const options = { skipCompositeImageData: true, skipLayerImageData: true };
      // The unprotected real decoder logs the synthetic canvas error internally.
      actual.readPsd(new Uint8Array(bytes).buffer, options);
      expect(log.mock.calls.flat()).toContainEqual(
        expect.stringContaining("C:/synthetic-secret/token-canary.psd"),
      );
      expect(createCanvas).toHaveBeenCalledOnce();
      log.mockClear();
      createCanvas.mockClear();
      const psd = readPsdSafely(new Uint8Array(bytes).buffer, options);
      expect(psd.width).toBe(1);
      expect(psd.height).toBe(1);
      expect(psd.imageResources?.thumbnail).toBeUndefined();
      expect(createCanvas).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("discards decoder diagnostics without inspecting their arguments", () => {
    const inspect = vi.fn(() => {
      throw new Error("inspection must not happen");
    });
    mockReadPsd.mockImplementationOnce((_buffer, options) => {
      expect(options?.log).toBeTypeOf("function");
      options!.log!({ toString: inspect }, "C:/synthetic-secret/token-canary.psd");
      return { width: 1, height: 1, children: [] };
    });
    expect(readPsdSafely(new ArrayBuffer(8), {}).width).toBe(1);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("redacts decoder errors from either pass without coercing arbitrary thrown values", () => {
    const inspect = vi.fn(() => {
      throw new Error("inspection must not happen");
    });
    const accessorError = new Error();
    Object.defineProperty(accessorError, "message", { get: inspect });
    for (const pass of [0, 1]) {
      for (const thrown of [
        new Error("C:/synthetic-secret/token-canary.psd"),
        "token-canary",
        accessorError,
        { toString: inspect },
      ]) {
        mockReadPsd.mockReset();
        if (pass === 1)
          mockReadPsd.mockReturnValueOnce({ width: 1, height: 1, children: [] });
        mockReadPsd.mockImplementationOnce(() => {
          throw thrown;
        });
        expect(() => parsePsd(new ArrayBuffer(8), "safe.psd")).toThrow(
          new Error("Failed to load PSD file."),
        );
        expect(readPsd).toHaveBeenCalledTimes(pass + 1);
      }
    }
    expect(inspect).not.toHaveBeenCalled();
  });

  afterEach(() => {
    clearTextures();
    mockReadPsd.mockReset();
  });

  it("rejects oversized PSD buffers before parsing", () => {
    const hugeBuffer = new ArrayBuffer(MAX_PSD_FILE_BYTES + 1);
    expect(() => parsePsd(hugeBuffer, "huge.psd")).toThrow("PSD file is too large");
    expect(mockReadPsd).not.toHaveBeenCalled();
  });

  it("rejects oversized PSD layer canvases before converting layers", () => {
    mockReadPsd.mockReturnValueOnce({
      width: 1024,
      height: 1024,
      children: [
        {
          name: "huge layer",
          left: 0,
          top: 0,
          right: MAX_PSD_LAYER_PIXELS + 1,
          bottom: 1,
        },
      ],
    } as never);

    expect(() => parsePsd(new ArrayBuffer(8), "huge-layer.psd")).toThrow(
      "PSD layer[0] is too large",
    );
    expect(mockReadPsd).toHaveBeenCalledTimes(1);
    expect(mockReadPsd).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
      ...PSD_METADATA_READ_OPTIONS,
      log: expect.any(Function),
    });
  });

  it("rejects PSDs whose cumulative layer pixel budget is too large", () => {
    const layerCount = Math.floor(MAX_PSD_TOTAL_LAYER_PIXELS / MAX_PSD_LAYER_PIXELS) + 1;
    mockReadPsd.mockReturnValueOnce({
      width: 1024,
      height: 1024,
      children: Array.from({ length: layerCount }, (_, index) => ({
        name: `layer ${index}`,
        left: 0,
        top: 0,
        right: MAX_PSD_LAYER_PIXELS,
        bottom: 1,
      })),
    } as never);

    expect(() => parsePsd(new ArrayBuffer(8), "total-layer-budget.psd")).toThrow(
      "PSD layers are too large in total",
    );
    expect(mockReadPsd).toHaveBeenCalledTimes(1);
  });

  it("fully decodes PSDs only after metadata preflight passes", () => {
    const metadataPsd = {
      width: 1024,
      height: 1024,
      children: [{ name: "layer", left: 0, top: 0, right: 64, bottom: 64 }],
    };
    const fullPsd = {
      width: 1024,
      height: 1024,
      children: [{ name: "layer", canvas: { width: 64, height: 64 } }],
    };
    mockReadPsd.mockReturnValueOnce(metadataPsd as never);
    mockReadPsd.mockReturnValueOnce(fullPsd as never);

    parsePsd(new ArrayBuffer(8), "safe.psd");

    expect(mockReadPsd).toHaveBeenNthCalledWith(1, expect.any(ArrayBuffer), {
      ...PSD_METADATA_READ_OPTIONS,
      log: expect.any(Function),
    });
    expect(mockReadPsd).toHaveBeenNthCalledWith(2, expect.any(ArrayBuffer), {
      useImageData: false,
      skipThumbnail: true,
      log: expect.any(Function),
    });
  });
});
