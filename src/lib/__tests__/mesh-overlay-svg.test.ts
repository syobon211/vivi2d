import { describe, expect, it } from "vitest";
import {
  buildMeshEdgeLines,
  buildMeshVertexCircles,
  buildOverlayLassoPath,
} from "@/lib/mesh-overlay-svg";

describe("mesh-overlay-svg", () => {
  it("deduplicates the reversed shared edge of two triangles and keeps all coordinates", () => {
    const lines = buildMeshEdgeLines(
      [0, 0, 10, 0, 10, 10, 0, 10],
      [0, 1, 2, 0, 2, 3],
      { id: "mesh-1", x: 1, y: -2 },
      2,
      3,
      4,
    );
    expect(lines.map(({ id, x1, y1, x2, y2 }) => [id, x1, y1, x2, y2])).toEqual([
      ["mesh-1:edge:0-1", 5, 0, 25, 0],
      ["mesh-1:edge:1-2", 25, 0, 25, 20],
      ["mesh-1:edge:0-2", 25, 20, 5, 0],
      ["mesh-1:edge:2-3", 25, 20, 5, 20],
      ["mesh-1:edge:0-3", 5, 20, 5, 0],
    ]);
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
    expect(path?.d).toBe("M 0 0 L 10 0 L 10 10 L 0 10 L 0 0 Z");
    expect(path?.strokeWidth).toBe(1);
  });
});
