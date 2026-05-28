import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deserializeProject,
  parseViviFile,
  serializeProject,
} from "@/lib/project-serializer";
import { clearTextures } from "@/lib/texture-store";
import { createViviMesh, createProject } from "@/test/fixtures";
import { TEST_ASSET_HAIR_PNG_PATH } from "@/test/path-fixtures";

describe("project serializer manual PNG metadata", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearTextures();
  });

  it("preserves manual PNG import metadata through serialize/parse/deserialize", async () => {
    const project = createProject({
      sourceKind: "manualPng",
      layers: [
        createViviMesh({
          id: "mesh-1",
          name: "hair",
          importMetadata: {
            source: "manualPng",
            manualPng: {
              sourceFileName: "hair.png",
              sourcePath: TEST_ASSET_HAIR_PNG_PATH,
              originalWidth: 256,
              originalHeight: 128,
              trimmedBounds: [12, 8, 128, 64],
              finalOrigin: [24, 16],
              placementMode: "centerOnCanvas",
              trimTransparentBoundsApplied: true,
              autoGenerateMeshApplied: true,
            },
          },
        }),
      ],
    });

    const serialized = serializeProject(project, new Map());
    const parsed = parseViviFile(JSON.stringify(serialized));
    const restored = await deserializeProject(parsed);
    const restoredMesh = restored.layers[0];

    expect(restoredMesh?.kind).toBe("viviMesh");
    expect(restoredMesh?.importMetadata).toEqual({
      source: "manualPng",
      manualPng: {
        sourceFileName: "hair.png",
        sourcePath: TEST_ASSET_HAIR_PNG_PATH,
        originalWidth: 256,
        originalHeight: 128,
        trimmedBounds: [12, 8, 128, 64],
        finalOrigin: [24, 16],
        placementMode: "centerOnCanvas",
        trimTransparentBoundsApplied: true,
        autoGenerateMeshApplied: true,
      },
    });
    expect(restored.sourceKind).toBe("manualPng");
  });

  it("round-trips manual PNG metadata when optional fields are omitted", async () => {
    const project = createProject({
      sourceKind: "manualPng",
      layers: [
        createViviMesh({
          id: "mesh-optional",
          name: "brow",
          importMetadata: {
            source: "manualPng",
            manualPng: {
              sourceFileName: "brow.png",
              originalWidth: 128,
              originalHeight: 64,
              trimmedBounds: [0, 0, 128, 64],
              finalOrigin: [0, 0],
              placementMode: "preserveImageOffset",
              autoGenerateMeshApplied: false,
            },
          },
        }),
      ],
    });

    const serialized = serializeProject(project, new Map());
    const parsed = parseViviFile(JSON.stringify(serialized));
    const restored = await deserializeProject(parsed);
    const restoredMesh = restored.layers[0];

    expect(restoredMesh?.kind).toBe("viviMesh");
    expect(restoredMesh?.importMetadata).toEqual({
      source: "manualPng",
      manualPng: {
        sourceFileName: "brow.png",
        originalWidth: 128,
        originalHeight: 64,
        trimmedBounds: [0, 0, 128, 64],
        finalOrigin: [0, 0],
        placementMode: "preserveImageOffset",
        autoGenerateMeshApplied: false,
      },
    });
    expect(restored.sourceKind).toBe("manualPng");
  });
});
