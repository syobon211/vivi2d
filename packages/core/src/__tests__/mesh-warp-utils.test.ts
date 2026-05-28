import { describe, expect, it } from "vitest";
import {
  applyPuppetWarp,
  findMirroredVertexIndex,
  type PuppetWarpPinSample,
} from "../mesh-warp-utils";

function pin(
  partial: Partial<PuppetWarpPinSample> & { vertexIndex: number },
): PuppetWarpPinSample {
  return {
    vertexIndex: partial.vertexIndex,
    kind: partial.kind ?? "handle",
    dx: partial.dx ?? 0,
    dy: partial.dy ?? 0,
    radius: partial.radius ?? 1,
    strength: partial.strength ?? 1,
    curve: partial.curve ?? "linear",
  };
}

describe("applyPuppetWarp", () => {
  it("returns a copied vertex array when no pins are provided", () => {
    const base = [0, 0, 1, 0, 2, 0];
    const out = applyPuppetWarp(base, []);
    expect(out).toEqual(base);
    expect(out).not.toBe(base);
  });

  it("moves the dragged handle vertex by the exact delta", () => {
    const base = [0, 0, 1, 0];
    const out = applyPuppetWarp(base, [pin({ vertexIndex: 0, dx: 5, dy: 7 })]);
    expect(out[0]).toBe(5);
    expect(out[1]).toBe(7);
  });

  it("leaves vertices outside the influence radius unchanged", () => {
    const base = [0, 0, 100, 0];
    const out = applyPuppetWarp(base, [pin({ vertexIndex: 0, dx: 5, dy: 7 })]);
    expect(out[2]).toBe(100);
    expect(out[3]).toBe(0);
  });

  it("lets an anchor suppress nearby handle influence", () => {
    const base = [0, 0, 1, 0, 2, 0];
    const out = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, radius: 5 }),
      pin({ vertexIndex: 2, kind: "anchor", radius: 5 }),
    ]);
    expect(out[2]).toBeCloseTo(6, 5);
  });

  it("does not treat an undragged handle as an implicit anchor", () => {
    const base = [0, 0, 1, 0, 2, 0];
    const out = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, radius: 5 }),
      pin({ vertexIndex: 2, dx: 0, dy: 0, radius: 5 }),
    ]);
    expect(out[2]).toBeCloseTo(11, 5);
  });

  it("applies full delta to vertices inside a full influence radius", () => {
    const base = [0, 0, 0.1, 0, 0.9, 0];
    const out = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, radius: 1 }),
    ]);
    expect(out[2]).toBeCloseTo(10.1, 5);
    expect(out[4]).toBeCloseTo(10.9, 5);
  });

  it("combines multiple dragged handles through normalized weighting", () => {
    const base = [0, 0, 1, 0, 2, 0];
    const out = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, radius: 5 }),
      pin({ vertexIndex: 2, dx: 10, dy: 0, radius: 5 }),
    ]);
    expect(out[2]).toBeCloseTo(11, 5);
  });

  it("supports smoothstep falloff", () => {
    const base = [0, 0, 0.1, 0, 5, 0];
    const linear = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, radius: 6, curve: "linear" }),
      pin({
        vertexIndex: 2,
        kind: "anchor",
        radius: 6,
        curve: "linear",
      }),
    ]);
    const smooth = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, radius: 6, curve: "smoothstep" }),
      pin({
        vertexIndex: 2,
        kind: "anchor",
        radius: 6,
        curve: "smoothstep",
      }),
    ]);
    expect(smooth[2]!).toBeGreaterThan(linear[2]!);
  });

  it("supports gaussian falloff", () => {
    const base = [0, 0, 100, 0];
    const out = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, curve: "gaussian" }),
    ]);
    expect(out[2]).toBe(100);
  });

  it("scales anchor resistance through strength", () => {
    const base = [0, 0, 1, 0, 2, 0];
    const weak = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, radius: 5 }),
      pin({ vertexIndex: 2, kind: "anchor", radius: 5, strength: 0.1 }),
    ]);
    const strong = applyPuppetWarp(base, [
      pin({ vertexIndex: 0, dx: 10, dy: 0, radius: 5 }),
      pin({ vertexIndex: 2, kind: "anchor", radius: 5, strength: 10 }),
    ]);
    expect(strong[2]! - 1).toBeLessThan(weak[2]! - 1);
  });

  it("does not mutate the input vertex array", () => {
    const base = [0, 0, 1, 0];
    const copy = [...base];
    applyPuppetWarp(base, [pin({ vertexIndex: 0, dx: 5, dy: 0, radius: 2 })]);
    expect(base).toEqual(copy);
  });
});

describe("findMirroredVertexIndex", () => {
  it("finds the opposite-side vertex across the mesh center line", () => {
    const vertices = [0, 0, 2, 0, 8, 0, 10, 0];
    expect(findMirroredVertexIndex(vertices, 0, 10, 0.01)).toBe(3);
    expect(findMirroredVertexIndex(vertices, 1, 10, 0.01)).toBe(2);
  });

  it("returns null for a center-line vertex", () => {
    const vertices = [5, 0, 0, 0, 10, 0];
    expect(findMirroredVertexIndex(vertices, 0, 10, 0.01)).toBeNull();
  });

  it("returns null when pairing is ambiguous", () => {
    const vertices = [0, 0, 10, 0, 10, 0];
    expect(findMirroredVertexIndex(vertices, 0, 10, 0.01)).toBeNull();
  });

  it("still finds a mirror for vertices near the center line when a real pair exists", () => {
    const vertices = [4.9999, 0, 5.0001, 0];
    expect(findMirroredVertexIndex(vertices, 0, 10, 0.01)).toBe(1);
  });

  it("ignores pins that reference an out-of-range vertex index", () => {
    const base = [0, 0, 1, 0];
    const out = applyPuppetWarp(base, [
      pin({ vertexIndex: 99, dx: 5, dy: 2, radius: 10 }),
    ]);
    expect(out).toEqual(base);
  });
});
