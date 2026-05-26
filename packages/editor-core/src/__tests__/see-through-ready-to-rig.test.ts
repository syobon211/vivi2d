import type { LayerSemanticRole } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { applySeeThroughReadyToRigCleanup } from "../see-through-ready-to-rig";
import { createEmptyProject, createViviMesh } from "./fixtures";

function createImportedMesh(
  id: string,
  name: string,
  label: string,
  confidence = 0.9,
  semanticRole?: LayerSemanticRole,
) {
  return createViviMesh({
    id,
    name,
    semanticRole,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence,
        leftRightSplit: "center",
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

describe("applySeeThroughReadyToRigCleanup", () => {
  it("normalizes imported names and fills unknown roles from raw labels", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("hair", "v2d[token] Hair Front", "hair_front", 0.8),
    ];

    const summary = applySeeThroughReadyToRigCleanup(project);

    expect(summary.applied).toBe(true);
    expect(summary.renamedLayerIds).toEqual(["hair"]);
    expect(summary.assignedRoleLayerIds).toEqual(["hair"]);
    expect(project.layers[0]!.name).toBe("Hair Front");
    expect(project.layers[0]!.semanticRole).toBe("hairFront");
  });

  it("does not assign roles below the cleanup confidence threshold", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("hair", "v2d[token] Hair Front", "hair_front", 0.2),
    ];

    const summary = applySeeThroughReadyToRigCleanup(project);

    expect(summary.renamedLayerIds).toEqual(["hair"]);
    expect(summary.assignedRoleLayerIds).toEqual([]);
    expect(project.layers[0]!.semanticRole).toBeUndefined();
  });

  it("does not overwrite explicit known roles", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("hair", "v2d[token] Hair Front", "hair_back", 0.9, "hairFront"),
    ];

    const summary = applySeeThroughReadyToRigCleanup(project);

    expect(summary.renamedLayerIds).toEqual(["hair"]);
    expect(summary.assignedRoleLayerIds).toEqual([]);
    expect(project.layers[0]!.semanticRole).toBe("hairFront");
  });

  it("still fills non-singleton roles even when another layer already has that role", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("known-hair", "Known Hair", "hair_front", 0.9, "hairFront"),
      createImportedMesh("unknown-hair", "v2d[token] Hair Strand", "hair_front", 0.9),
    ];

    const summary = applySeeThroughReadyToRigCleanup(project);

    expect(summary.assignedRoleLayerIds).toEqual(["unknown-hair"]);
    expect(project.layers[1]!.semanticRole).toBe("hairFront");
  });

  it("skips singleton-role assignments when multiple imported layers compete", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("eye-a", "v2d[a] Eye A", "iris_left", 0.9),
      createImportedMesh("eye-b", "v2d[b] Eye B", "eye_white_left", 0.9),
    ];

    const summary = applySeeThroughReadyToRigCleanup(project);

    expect(summary.assignedRoleLayerIds).toEqual([]);
    expect(summary.warnings).toContain(
      "Skipped automatic assignment for eyeLeft because 2 imported layers match that singleton role.",
    );
    expect(project.layers.every((layer) => layer.semanticRole == null)).toBe(true);
  });

  it("skips imported-name cleanup when the stripped name would collide", () => {
    const project = createEmptyProject();
    project.layers = [
      createViviMesh({ id: "plain", name: "Body" }),
      createImportedMesh("imported", "v2d[token] Body", "torso_wear", 0.9),
    ];

    const summary = applySeeThroughReadyToRigCleanup(project);

    expect(summary.renamedLayerIds).toEqual([]);
    expect(summary.assignedRoleLayerIds).toEqual(["imported"]);
    expect(summary.warnings).toContain(
      'Skipped imported name cleanup for "v2d[token] Body" because "Body" would collide with another layer name.',
    );
    expect(project.layers[1]!.name).toBe("v2d[token] Body");
  });

  it("skips imported-name cleanup when stripping would leave an empty name", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMesh("imported", "v2d[token]", "torso_wear", 0.9)];

    const summary = applySeeThroughReadyToRigCleanup(project);

    expect(summary.renamedLayerIds).toEqual([]);
    expect(summary.assignedRoleLayerIds).toEqual(["imported"]);
    expect(summary.warnings).toContain(
      'Skipped imported name cleanup for "v2d[token]" because the stripped name would be empty.',
    );
  });

  it("is idempotent when applied twice", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMesh("mouth", "v2d[token] Mouth", "mouth", 0.9)];

    const first = applySeeThroughReadyToRigCleanup(project);
    const second = applySeeThroughReadyToRigCleanup(project);

    expect(first.applied).toBe(true);
    expect(second).toEqual({
      applied: false,
      renamedLayerIds: [],
      assignedRoleLayerIds: [],
      warnings: [],
    });
    expect(project.layers[0]!.name).toBe("Mouth");
    expect(project.layers[0]!.semanticRole).toBe("mouth");
  });
});
