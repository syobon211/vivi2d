import { MAX_PSD_LAYER_PIXELS } from "@vivi2d/core/load-limits";
import { readPsd } from "ag-psd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PSD_METADATA_READ_OPTIONS } from "@/lib/psd-security";
import { handlePsdParseRequest } from "../psd-parse.worker";

beforeEach(() => {
  vi.mocked(readPsd).mockImplementation(() => {
    throw new Error("invalid PSD");
  });
});

describe("handlePsdParseRequest", () => {
  it("wraps parser rejection with the public prefix and no transfer", () => {
    const { response, transfer } = handlePsdParseRequest({
      buffer: new ArrayBuffer(0),
      fileName: "empty.psd",
    });

    expect(response).toEqual({
      type: "error",
      message: "Failed to load PSD file.",
    });
    expect(transfer).toEqual([]);
  });

  it("rejects oversized metadata before full image data decoding", () => {
    vi.mocked(readPsd).mockReset();
    vi.mocked(readPsd).mockReturnValueOnce({
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

    const { response, transfer } = handlePsdParseRequest({
      buffer: new ArrayBuffer(8),
      fileName: "huge.psd",
    });

    expect(response.type).toBe("error");
    expect(transfer).toEqual([]);
    expect(readPsd).toHaveBeenCalledTimes(1);
    expect(readPsd).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
      ...PSD_METADATA_READ_OPTIONS,
      log: expect.any(Function),
    });
  });
});
