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
import { PSD_METADATA_READ_OPTIONS } from "@/lib/psd-security";
import { clearTextures } from "@/lib/texture-store";

const mockReadPsd = vi.mocked(readPsd);

describe("parsePsd security guards", () => {
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
    expect(mockReadPsd).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      PSD_METADATA_READ_OPTIONS,
    );
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

    expect(mockReadPsd).toHaveBeenNthCalledWith(
      1,
      expect.any(ArrayBuffer),
      PSD_METADATA_READ_OPTIONS,
    );
    expect(mockReadPsd).toHaveBeenNthCalledWith(2, expect.any(ArrayBuffer), {
      useImageData: false,
    });
  });
});
