import { describe, expect, it } from "vitest";
import { assertAtlasImageAllocationWithinLimits, MAX_PSD_PIXELS } from "../load-limits";
import type { AtlasData } from "../types";

function atlas(width = 16, height = 16): AtlasData {
  return {
    width, height,
    image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
    entries: [{ layerId: "mesh", x: 0, y: 0, width, height }],
  };
}

describe("live atlas allocation preflight", () => {
  it("accepts normal PNGs and legacy zero-size entries", () => {
    expect(() => assertAtlasImageAllocationWithinLimits([atlas()])).not.toThrow();
    const input = atlas();
    input.entries[0]!.width = 0;
    input.image = ` \n${input.image.slice(0, 12)}\n${input.image.slice(12)}`;
    expect(() => assertAtlasImageAllocationWithinLimits([input])).not.toThrow();
  });

  it("rejects invalid and oversized declared or extracted canvases", () => {
    for (const size of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000]) {
      expect(() => assertAtlasImageAllocationWithinLimits([atlas(size, size)])).toThrow();
      const input = atlas();
      input.entries[0]!.width = size;
      input.entries[0]!.height = size;
      expect(() => assertAtlasImageAllocationWithinLimits([input])).toThrow();
    }
  });

  it("bounds actual PNG IHDR dimensions before browser decoding", () => {
    const input = atlas();
    const bytes = Uint8Array.from(atob(input.image), (char) => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 1_000_000);
    view.setUint32(20, 1_000_000);
    input.image = btoa(String.fromCharCode(...bytes));
    expect(() => assertAtlasImageAllocationWithinLimits([input])).toThrow(/Atlas PNG/);
  });

  it("rejects unknown image signatures rather than letting MIME sniffing bypass the guard", () => {
    const input = atlas();
    for (const image of ["", "AAAA", "R0lGODlhAQAB", "/9j/4AAQSkZJRgABAQAAAQABAAD"]) {
      input.image = image;
      expect(() => assertAtlasImageAllocationWithinLimits([input])).toThrow(/PNG IHDR/);
    }
  });

  it("accounts aggregate canvases and decoded images without allocating pixels", () => {
    const side = Math.sqrt(MAX_PSD_PIXELS);
    expect(() => assertAtlasImageAllocationWithinLimits([atlas(side, side)])).not.toThrow();
    expect(() => assertAtlasImageAllocationWithinLimits([atlas(side, side), atlas(side, side)])).toThrow(/total/);
  });
});
