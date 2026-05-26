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
  it("returns an error for an empty buffer without throwing", () => {
    const { response, transfer } = handlePsdParseRequest({
      buffer: new ArrayBuffer(0),
      fileName: "empty.psd",
    });

    expect(response.type).toBe("error");
    if (response.type === "error") {
      expect(response.message).toMatch(/Failed to load PSD file/);
    }
    expect(transfer).toEqual([]);
  });

  it("returns a bounded error response for malformed bytes", () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff, 0xee]);
    const { response, transfer } = handlePsdParseRequest({
      buffer: garbage.buffer,
      fileName: "garbage.psd",
    });

    expect(response.type).toBe("error");
    expect(transfer).toEqual([]);
  });

  it("keeps worker error messages under the public English prefix", () => {
    const { response } = handlePsdParseRequest({
      buffer: new ArrayBuffer(4),
      fileName: "tiny.psd",
    });

    expect(response.type).toBe("error");
    if (response.type === "error") {
      expect(response.message.startsWith("Failed to load PSD file")).toBe(true);
    }
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
    expect(readPsd).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      PSD_METADATA_READ_OPTIONS,
    );
  });
});
