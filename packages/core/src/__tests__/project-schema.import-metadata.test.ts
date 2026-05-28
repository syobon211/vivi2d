import { describe, expect, it } from "vitest";
import { TEST_ASSET_HAIR_PNG_PATH } from "../../../../src/test/path-fixtures";
import { LayerNodeSchema } from "../project-schema";

function makeViviMesh(importMetadata?: unknown) {
  return {
    id: "mesh-1",
    name: "mesh",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 128,
    height: 64,
    blendMode: "normal",
    expanded: true,
    kind: "viviMesh",
    children: [],
    mesh: {
      vertices: [0, 0, 128, 0, 128, 64, 0, 64],
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: [0, 1, 2, 0, 2, 3],
      divisionsX: 1,
      divisionsY: 1,
    },
    importMetadata,
  };
}

describe("LayerNodeSchema import metadata", () => {
  it("accepts manual PNG import metadata", () => {
    const result = LayerNodeSchema.parse(
      makeViviMesh({
        source: "manualPng",
        manualPng: {
          sourceFileName: "hair.png",
          sourcePath: TEST_ASSET_HAIR_PNG_PATH,
          originalWidth: 256,
          originalHeight: 128,
          trimmedBounds: [12, 8, 128, 64],
          finalOrigin: [12, 8],
          placementMode: "preserveImageOffset",
          trimTransparentBoundsApplied: true,
          autoGenerateMeshApplied: false,
        },
      }),
    );

    expect(result.importMetadata).toEqual({
      source: "manualPng",
      manualPng: {
        sourceFileName: "hair.png",
        sourcePath: TEST_ASSET_HAIR_PNG_PATH,
        originalWidth: 256,
        originalHeight: 128,
        trimmedBounds: [12, 8, 128, 64],
        finalOrigin: [12, 8],
        placementMode: "preserveImageOffset",
        trimTransparentBoundsApplied: true,
        autoGenerateMeshApplied: false,
      },
    });
  });

  it("accepts manual PNG metadata without an optional source path", () => {
    const result = LayerNodeSchema.parse(
      makeViviMesh({
        source: "manualPng",
        manualPng: {
          sourceFileName: "hair.png",
          originalWidth: 256,
          originalHeight: 128,
          trimmedBounds: [0, 0, 256, 128],
          finalOrigin: [0, 0],
          placementMode: "preserveImageOffset",
          autoGenerateMeshApplied: false,
        },
      }),
    );

    expect(result.importMetadata).toEqual({
      source: "manualPng",
      manualPng: {
        sourceFileName: "hair.png",
        originalWidth: 256,
        originalHeight: 128,
        trimmedBounds: [0, 0, 256, 128],
        finalOrigin: [0, 0],
        placementMode: "preserveImageOffset",
        autoGenerateMeshApplied: false,
      },
    });
  });

  it("normalizes legacy source-less see-through metadata", () => {
    const result = LayerNodeSchema.parse(
      makeViviMesh({
        label: "hair_front",
        order: 0,
        confidence: 0.92,
        leftRightSplit: "center",
        frontBackSplit: "front",
        bbox: [0, 0, 128, 64],
        depthStats: {
          min: 0.1,
          max: 0.8,
          mean: 0.45,
        },
      }),
    );

    expect(result.importMetadata).toEqual({
      source: "seeThrough",
      seeThrough: {
        label: "hair_front",
        order: 0,
        confidence: 0.92,
        leftRightSplit: "center",
        frontBackSplit: "front",
        bbox: [0, 0, 128, 64],
        depthStats: {
          min: 0.1,
          max: 0.8,
          mean: 0.45,
        },
      },
    });
  });
});
