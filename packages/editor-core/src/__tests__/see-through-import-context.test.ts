import { flattenLayers } from "@vivi2d/core/layer-utils";
import { describe, expect, it } from "vitest";
import {
  applySeeThroughImportContext,
  SEE_THROUGH_IMPORT_SCHEMA_VERSION,
  type SeeThroughImportManifest,
} from "../see-through-import-context";
import { createProject, createViviMesh } from "./fixtures";

function createManifest(
  overrides: Partial<SeeThroughImportManifest> = {},
): SeeThroughImportManifest {
  return {
    schemaVersion: SEE_THROUGH_IMPORT_SCHEMA_VERSION,
    layers: [
      {
        name: "Hair Front",
        label: "hair_front",
        order: 2,
        leafToken: "layer_000",
        bbox: [0, 0, 100, 100],
        confidence: 0.95,
        leftRightSplit: "center",
        frontBackSplit: "front",
        depthStats: { min: 0.1, max: 0.3, mean: 0.2 },
      },
      {
        name: "Mystery Accessory",
        label: "headwear",
        order: 1,
        leafToken: "layer_001",
        bbox: [10, 10, 40, 40],
        confidence: 0.4,
        leftRightSplit: "unknown",
        frontBackSplit: "unknown",
        depthStats: { min: 0.2, max: 0.5, mean: 0.35 },
      },
    ],
    ...overrides,
  };
}

describe("applySeeThroughImportContext", () => {
  it("matches imported PSD leaves by token and annotates semanticRole/importMetadata", () => {
    const project = createProject({
      layers: [
        createViviMesh({ id: "mesh-1", name: "v2d[layer_000] raw-hair" }),
        createViviMesh({ id: "mesh-2", name: "v2d[layer_001] raw-hat" }),
      ],
    });

    const result = applySeeThroughImportContext(project, createManifest(), {
      expectedSchemaVersion: SEE_THROUGH_IMPORT_SCHEMA_VERSION,
    });
    const layers = flattenLayers(result.project.layers);

    expect(result.applied).toBe(true);
    expect(result.warning).toBeNull();
    expect(layers[0]?.name).toBe("Hair Front");
    expect(layers[0]?.semanticRole).toBe("hairFront");
    expect(layers[0]?.semanticRoleSource).toBe("seeThroughImport");
    expect(layers[0]?.importMetadata?.source).toBe("seeThrough");
    expect(layers[0]?.importMetadata?.seeThrough?.label).toBe("hair_front");
    expect(layers[0]?.importMetadata?.seeThrough?.psdLeafToken).toBe("layer_000");
    expect(layers[1]?.name).toBe("Mystery Accessory");
    expect(layers[1]?.semanticRole).toBe("unknown");
    expect(layers[1]?.semanticRoleSource).toBe("seeThroughImport");
    expect(layers[1]?.importMetadata?.seeThrough?.psdLeafToken).toBe("layer_001");
    expect(layers[1]?.importMetadata?.seeThrough?.confidence).toBe(0.4);
  });

  it("falls back cleanly when imported PSD leaves do not carry Vivi2D tokens", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "mesh-1", name: "raw-hair" })],
    });

    const result = applySeeThroughImportContext(project, createManifest(), {
      expectedSchemaVersion: SEE_THROUGH_IMPORT_SCHEMA_VERSION,
    });
    const layers = flattenLayers(result.project.layers);

    expect(result.applied).toBe(false);
    expect(result.warning).toMatch(/missing Vivi2D leaf tokens/i);
    expect(layers[0]?.name).toBe("raw-hair");
    expect(layers[0]?.semanticRole).toBeUndefined();
    expect(layers[0]?.semanticRoleSource).toBeUndefined();
    expect(layers[0]?.importMetadata).toBeUndefined();
  });

  it("falls back when the manifest carries unmatched layers", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "mesh-1", name: "v2d[layer_000] raw-hair" })],
    });

    const result = applySeeThroughImportContext(project, createManifest(), {
      expectedSchemaVersion: SEE_THROUGH_IMPORT_SCHEMA_VERSION,
    });
    const layers = flattenLayers(result.project.layers);

    expect(result.applied).toBe(false);
    expect(result.warning).toMatch(/manifest contains layers that were not found/i);
    expect(layers[0]?.name).toBe("raw-hair");
    expect(layers[0]?.semanticRole).toBeUndefined();
    expect(layers[0]?.semanticRoleSource).toBeUndefined();
    expect(layers[0]?.importMetadata).toBeUndefined();
  });

  it("ignores unsupported manifest schema versions and strips technical names", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "mesh-1", name: "v2d[layer_000] raw-hair" })],
    });

    const result = applySeeThroughImportContext(
      project,
      createManifest({ schemaVersion: "9.9.9" }),
      { expectedSchemaVersion: SEE_THROUGH_IMPORT_SCHEMA_VERSION },
    );
    const layers = flattenLayers(result.project.layers);

    expect(result.applied).toBe(false);
    expect(result.warning).toMatch(/schema 9\.9\.9 is unsupported/i);
    expect(layers[0]?.name).toBe("raw-hair");
  });

  it("preserves assistant provenance for supported side roles across reimport", () => {
    const project = createProject({
      layers: [
        createViviMesh({
          id: "mesh-1",
          name: "v2d[layer_000] raw-eye",
          semanticRole: "eyeRight",
          semanticRoleSource: "assistant",
        }),
      ],
    });

    const manifest = createManifest({
      layers: [
        {
          name: "Iris Left",
          label: "iris_left",
          order: 0,
          leafToken: "layer_000",
          bbox: [0, 0, 100, 100],
          confidence: 0.95,
          leftRightSplit: "left",
          frontBackSplit: "front",
          depthStats: { min: 0.1, max: 0.3, mean: 0.2 },
        },
      ],
    });

    const result = applySeeThroughImportContext(project, manifest, {
      expectedSchemaVersion: SEE_THROUGH_IMPORT_SCHEMA_VERSION,
    });
    const layers = flattenLayers(result.project.layers);

    expect(result.applied).toBe(true);
    expect(layers[0]?.semanticRole).toBe("eyeLeft");
    expect(layers[0]?.semanticRoleSource).toBe("assistant");
  });
});
