import {
  VIVI2D_MANIFEST_SCHEMA_VERSION,
  type ViviSeeThroughManifest,
} from "@vivi2d/provider-comfyui";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import { describe, expect, it } from "vitest";
import { createProject, createViviMesh } from "@/test/fixtures";
import { applySeeThroughImportContext } from "../seeThroughImport";

function createComfyManifest(
  overrides: Partial<ViviSeeThroughManifest> = {},
): ViviSeeThroughManifest {
  return {
    schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
    generator: {
      plugin: "vivi2d-compat-comfyui",
      plugin_version: "0.1.0",
      model: "see-through",
      model_version: "test",
    },
    canvas: { width: 512, height: 512 },
    layers: [
      {
        id: "layer_000",
        name: "Hair Front",
        label: "hair_front",
        order: 0,
        psd_leaf_token: "layer_000",
        image_path: "layers/layer_000.png",
        bbox: [0, 0, 100, 100],
        confidence: 0.95,
        left_right_split: "center",
        front_back_split: "front",
        depth_stats: { min: 0.1, max: 0.3, mean: 0.2 },
      },
    ],
    ...overrides,
  };
}

describe("See-through import store adapter", () => {
  it("adapts a ComfyUI manifest into the editor-core import context", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "mesh-1", name: "v2d[layer_000] raw-hair" })],
    });

    const result = applySeeThroughImportContext(project, createComfyManifest());
    const layers = flattenLayers(result.project.layers);

    expect(result.applied).toBe(true);
    expect(result.warning).toBeNull();
    expect(layers[0]?.name).toBe("Hair Front");
    expect(layers[0]?.semanticRole).toBe("hairFront");
    expect(layers[0]?.importMetadata?.seeThrough?.psdLeafToken).toBe("layer_000");
  });

  it("rejects a ComfyUI manifest whose schema version differs from the adapter constant", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "mesh-1", name: "v2d[layer_000] raw-hair" })],
    });

    const result = applySeeThroughImportContext(
      project,
      createComfyManifest({
        schema_version: "0.9.0",
      } as unknown as Partial<ViviSeeThroughManifest>),
    );

    expect(result.applied).toBe(false);
    expect(result.warning).toMatch(/schema 0\.9\.0 is unsupported/i);
    expect(flattenLayers(result.project.layers)[0]?.name).toBe("raw-hair");
  });
});
