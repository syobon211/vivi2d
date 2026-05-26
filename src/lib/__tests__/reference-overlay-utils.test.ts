import { describe, expect, it } from "vitest";
import {
  assessReferenceOverlayCompareSummary,
  getCurrentReferenceBounds,
  getImportedReferenceBounds,
  getReferenceOverlayCompareSummary,
  getReferenceOverlayDifferenceRects,
  getReferenceOverlayModeLabel,
  getSourceReferenceBounds,
} from "@/lib/reference-overlay-utils";
import { createViviMesh } from "@/test/fixtures";

describe("reference overlay utils", () => {
  it("computes current world-space bounds from mesh vertices", () => {
    const mesh = createViviMesh({
      x: 5,
      y: 7,
      mesh: {
        vertices: [2, 3, 20, 4, 4, 18],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
    });

    expect(getCurrentReferenceBounds(mesh)).toEqual({
      x: 7,
      y: 10,
      width: 18,
      height: 15,
    });
  });

  it("returns imported see-through bounds when metadata is valid", () => {
    const mesh = createViviMesh({
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.95,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [11, 22, 33, 44],
          depthStats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      },
    });

    expect(getImportedReferenceBounds(mesh)).toEqual({
      x: 11,
      y: 22,
      width: 33,
      height: 44,
    });
  });

  it("returns source bounds from the ViviMesh rectangle", () => {
    const mesh = createViviMesh({ x: 12, y: 34, width: 56, height: 78 });

    expect(getSourceReferenceBounds(mesh)).toEqual({
      x: 12,
      y: 34,
      width: 56,
      height: 78,
    });
  });

  it("builds a compare summary when current and imported bounds are both available", () => {
    const mesh = createViviMesh({
      x: 5,
      y: 7,
      mesh: {
        vertices: [2, 3, 20, 4, 4, 18],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.95,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [11, 22, 33, 44],
          depthStats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      },
    });

    expect(getReferenceOverlayCompareSummary(mesh)).toEqual({
      offsetX: -4,
      offsetY: -12,
      widthDelta: -15,
      heightDelta: -29,
      areaScale: (18 * 15) / (33 * 44),
      widthScale: 18 / 33,
      heightScale: 15 / 44,
      centerDistance: Math.hypot(7 + 9 - (11 + 16.5), 10 + 7.5 - (22 + 22)),
    });
  });

  it("builds a compare summary for arbitrary A/B reference modes", () => {
    const mesh = createViviMesh({
      x: 10,
      y: 20,
      width: 40,
      height: 50,
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.95,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [14, 22, 20, 30],
          depthStats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      },
    });

    expect(getReferenceOverlayCompareSummary(mesh, "source", "importedBounds")).toEqual({
      offsetX: -4,
      offsetY: -2,
      widthDelta: 20,
      heightDelta: 20,
      areaScale: (40 * 50) / (20 * 30),
      widthScale: 40 / 20,
      heightScale: 50 / 30,
      centerDistance: Math.hypot(10 + 20 - (14 + 10), 20 + 25 - (22 + 15)),
    });
  });

  it("classifies compare drift for offset and scale changes", () => {
    const assessment = assessReferenceOverlayCompareSummary({
      offsetX: -4,
      offsetY: -12,
      widthDelta: -15,
      heightDelta: -29,
      areaScale: 0.18,
      widthScale: 0.55,
      heightScale: 0.34,
      centerDistance: 29,
    });

    expect(assessment).toEqual({
      status: "offsetAndScaleDrift",
      label: "Offset + scale drift",
    });
  });

  it("builds difference rectangles for non-overlapping portions of compared bounds", () => {
    const result = getReferenceOverlayDifferenceRects(
      { x: 10, y: 20, width: 40, height: 30 },
      { x: 20, y: 25, width: 15, height: 10 },
    );

    expect(result.primaryOnly).toEqual([
      { x: 10, y: 20, width: 10, height: 30 },
      { x: 35, y: 20, width: 15, height: 30 },
      { x: 20, y: 20, width: 15, height: 5 },
      { x: 20, y: 35, width: 15, height: 15 },
    ]);
    expect(result.secondaryOnly).toEqual([]);
  });

  it("formats reference overlay mode labels", () => {
    expect(getReferenceOverlayModeLabel("source")).toBe("Source");
    expect(getReferenceOverlayModeLabel("currentBounds")).toBe("Current bounds");
    expect(getReferenceOverlayModeLabel("importedBounds")).toBe("Imported bounds");
  });
});
