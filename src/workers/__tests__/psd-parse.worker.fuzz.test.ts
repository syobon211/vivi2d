import { readPsd } from "ag-psd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePsdParseRequest } from "../psd-parse.worker";

beforeEach(() => {
  vi.mocked(readPsd).mockImplementation(() => {
    throw new Error("invalid PSD fixture");
  });
});

describe("PSD parse worker request filename isolation", () => {
  it("redacts arbitrary decoder throws in both passes without reading or coercing them", () => {
    const inspect = vi.fn(() => {
      throw new Error("inspection must not happen");
    });
    const accessorError = new Error();
    Object.defineProperty(accessorError, "message", { get: inspect });
    const throws = [
      new Error("C:/synthetic-secret/token-canary.psd"),
      "token-canary",
      accessorError,
      { toString: inspect },
    ];
    for (const pass of [0, 1]) {
      for (const thrown of throws) {
        vi.mocked(readPsd).mockReset();
        if (pass === 1)
          vi.mocked(readPsd).mockReturnValueOnce({ width: 1, height: 1, children: [] });
        vi.mocked(readPsd).mockImplementationOnce(() => {
          throw thrown;
        });
        expect(
          handlePsdParseRequest({ buffer: new ArrayBuffer(8), fileName: "safe.psd" }),
        ).toEqual({
          response: { type: "error", message: "Failed to load PSD file." },
          transfer: [],
        });
        expect(readPsd).toHaveBeenCalledTimes(pass + 1);
      }
    }
    expect(inspect).not.toHaveBeenCalled();
  });

  it("does not echo hostile file names into parse errors", () => {
    const hostileNames = [
      "C:/Users/Alice/private.psd",
      "../client/private.psd",
      "\\\\server\\share\\secret.psd",
      "private-token-abc123.psd",
    ];

    for (const fileName of hostileNames) {
      const { response } = handlePsdParseRequest({
        buffer: new ArrayBuffer(16),
        fileName,
      });

      expect(response.type).toBe("error");
      if (response.type === "error") {
        expect(response.message).not.toContain(fileName);
        expect(response.message).not.toContain("Alice");
        expect(response.message).not.toContain("private-token");
      }
    }
  });
});
