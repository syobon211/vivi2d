import { describe, expect, it } from "vitest";
import { decodeViviBinary, isViviBinaryFormat } from "../vivib-format";

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function randomBytes(seed: number, length: number): Uint8Array {
  const next = makeRng(seed);
  const bytes = new Uint8Array(length);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = next() & 0xff;
  }
  return bytes;
}

describe(".vivb deterministic fuzz boundaries", () => {
  it("classifies random byte prefixes without throwing", () => {
    for (let seed = 1; seed <= 256; seed += 1) {
      const bytes = randomBytes(seed, seed % 64);
      const expected =
        bytes.length >= 4 &&
        bytes[0] === 0x56 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x56 &&
        bytes[3] === 0x42;

      expect(isViviBinaryFormat(bytes.buffer)).toBe(expected);
    }
  });

  it("rejects mutated binary payloads with regular Error objects", () => {
    for (let seed = 1; seed <= 128; seed += 1) {
      const length = 9 + (seed % 96);
      const bytes = randomBytes(seed * 0x9e3779b1, length);
      if (seed % 2 === 0) {
        bytes.set([0x56, 0x49, 0x56, 0x42], 0);
        bytes[4] = seed % 5 === 0 ? 1 : seed & 0xff;
      }

      try {
        decodeViviBinary(bytes.buffer);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(String((error as Error).message)).not.toContain("[object Object]");
      }
    }
  });
});
