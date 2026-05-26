import { readPsd } from "ag-psd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePsdParseRequest } from "../psd-parse.worker";

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) >>> 0;
    state = Math.imul(state ^ (state >>> 12), 0x297a2d39) >>> 0;
    return (state ^ (state >>> 15)) >>> 0;
  };
}

function randomBuffer(seed: number): ArrayBuffer {
  const next = makeRng(seed);
  const bytes = new Uint8Array(next() % 4096);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = next() & 0xff;
  }
  return bytes.buffer;
}

beforeEach(() => {
  vi.mocked(readPsd).mockImplementation(() => {
    throw new Error("invalid PSD fixture");
  });
});

describe("PSD parse worker deterministic fuzz boundaries", () => {
  it("turns malformed byte payloads into bounded error responses", () => {
    for (let seed = 1; seed <= 128; seed += 1) {
      const { response, transfer } = handlePsdParseRequest({
        buffer: randomBuffer(seed),
        fileName: `fuzz-${seed}.psd`,
      });

      expect(response.type).toBe("error");
      expect(transfer).toEqual([]);
      if (response.type === "error") {
        expect(response.message).toMatch(/^Failed to load PSD file:/);
        expect(response.message.length).toBeLessThan(256);
      }
    }
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
