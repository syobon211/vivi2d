import { describe, expect, it } from "vitest";
import {
  buildMeshEdgeLines,
  buildMeshVertexCircles,
  buildOverlayLassoPath,
} from "@/lib/mesh-overlay-svg";

describe("mesh-overlay-svg", () => {
  it("builds unique mesh edges for a triangle", () => {
    const lines = buildMeshEdgeLines(
      [0, 0, 10, 0, 0, 10],
      [0, 1, 2],
      { id: "mesh-1", x: 0, y: 0 },
      1,
      0,
      0,
    );

    expect(lines).toHaveLength(3);
    expect(new Set(lines.map((line) => line.id)).size).toBe(3);
  });

  it("marks selected vertices with the larger radius", () => {
    const circles = buildMeshVertexCircles(
      [0, 0, 10, 0, 0, 10],
      { id: "mesh-1", x: 0, y: 0 },
      1,
      0,
      0,
      new Set([1]),
      -1,
      false,
    );

    expect(circles).toHaveLength(3);
    expect(circles[1]?.radius).toBeGreaterThan(circles[0]?.radius ?? 0);
  });

  it("builds a closed lasso path", () => {
    const path = buildOverlayLassoPath([0, 0, 10, 0, 10, 10, 0, 10]);
    expect(path?.d).toContain("Z");
    expect(path?.strokeWidth).toBe(1);
  });
});
