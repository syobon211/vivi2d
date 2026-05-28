import type { LayerSemanticRole } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { buildSeeThroughMeshDensitySummary } from "@/lib/see-through-mesh-density";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";

function createImportedMesh(
  id: string,
  semanticRole?: LayerSemanticRole,
  frontBackSplit: "front" | "middle" | "back" | "unknown" = "middle",
  confidence = 0.9,
) {
  return createViviMesh({
    id,
    name: id,
    semanticRole,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label: id,
        order: 0,
        confidence,
        leftRightSplit: "center",
        frontBackSplit,
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

describe("buildSeeThroughMeshDensitySummary", () => {
  it("returns an empty summary for non See-through projects", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "plain", name: "Plain" })],
    };

    expect(buildSeeThroughMeshDensitySummary(project)).toEqual({
      isSeeThroughProject: false,
      importedViviMeshCount: 0,
      presetByLayerId: {},
      counts: { fine: 0, standard: 0, coarse: 0 },
    });
  });

  it("maps semantic roles and front/back accessory hints to per-layer presets", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createImportedMesh("eye-left", "eyeLeft"),
        createImportedMesh("hair-back", "hairBack"),
        createImportedMesh("body", "body"),
        createImportedMesh("accessory-front", "accessory", "front"),
        createImportedMesh("accessory-back", "accessory", "back"),
        createImportedMesh("unknown", "unknown"),
      ],
    };

    const summary = buildSeeThroughMeshDensitySummary(project);

    expect(summary.isSeeThroughProject).toBe(true);
    expect(summary.importedViviMeshCount).toBe(6);
    expect(summary.presetByLayerId).toEqual({
      "eye-left": "fine",
      "hair-back": "coarse",
      body: "standard",
      "accessory-front": "fine",
      "accessory-back": "coarse",
      unknown: "standard",
    });
    expect(summary.counts).toEqual({
      fine: 2,
      standard: 2,
      coarse: 2,
    });
  });

  it("clamps low-confidence recommendations back to standard", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createImportedMesh("eye-left", "eyeLeft", "middle", 0.49),
        createImportedMesh("hair-back", "hairBack", "back", 0.2),
      ],
    };

    const summary = buildSeeThroughMeshDensitySummary(project);

    expect(summary.presetByLayerId).toEqual({
      "eye-left": "standard",
      "hair-back": "standard",
    });
    expect(summary.counts).toEqual({
      fine: 0,
      standard: 2,
      coarse: 0,
    });
  });
});
