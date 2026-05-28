import { describe, expect, it } from "vitest";
import { createMeshHeatmapData, getMeshHeatmapColor } from "@/lib/mesh-heatmap-debug";

describe("mesh heatmap debug", () => {
  it("treats pure translation as no deformation", () => {
    const rest = [0, 0, 10, 0, 0, 10];
    const current = [5, 2, 15, 2, 5, 12];
    const heatmap = createMeshHeatmapData(rest, current, [0, 1, 2]);

    expect(heatmap).not.toBeNull();
    expect(heatmap?.vertices).toEqual([]);
    expect(heatmap?.edges).toEqual([]);
  });

  it("normalizes non-uniform deformation and computes edge intensities", () => {
    const rest = [0, 0, 10, 0, 0, 10];
    const current = [0, 0, 12, 0, 0, 10];
    const heatmap = createMeshHeatmapData(rest, current, [0, 1, 2]);

    expect(heatmap).not.toBeNull();
    expect(heatmap?.vertices).toHaveLength(3);
    expect(heatmap?.vertices.map((sample) => sample.intensity)).toEqual([
      expect.closeTo(0.5, 8),
      1,
      expect.closeTo(0.5, 8),
    ]);
    expect(heatmap?.edges).toHaveLength(3);
    expect(heatmap?.edges.map((edge) => edge.intensity)).toContain(0.75);
  });

  it("applies the intensity scale after normalization", () => {
    const rest = [0, 0, 10, 0, 0, 10];
    const current = [0, 0, 12, 0, 0, 10];

    const low = createMeshHeatmapData(rest, current, [0, 1, 2], 0.5);
    const high = createMeshHeatmapData(rest, current, [0, 1, 2], 2);

    expect(low?.vertices.map((sample) => sample.intensity)).toEqual([
      expect.closeTo(0.25, 8),
      0.5,
      expect.closeTo(0.25, 8),
    ]);
    expect(high?.vertices.map((sample) => sample.intensity)).toEqual([
      expect.closeTo(1, 8),
      1,
      expect.closeTo(1, 8),
    ]);
  });

  it("returns null for mismatched topologies", () => {
    expect(createMeshHeatmapData([0, 0, 1, 1], [0, 0], [0, 1])).toBeNull();
  });

  it("maps the full cool-to-hot range deterministically", () => {
    expect(getMeshHeatmapColor(0)).toBe(0x2563eb);
    expect(getMeshHeatmapColor(1)).toBe(0xef4444);
  });
});
