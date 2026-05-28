import type { LayerSemanticRole, LayerSemanticRoleSource } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { applySeeThroughLeftRightSplitAssistant } from "../see-through-left-right-split";
import { createEmptyProject, createViviMesh } from "./fixtures";

function createImportedMesh(
  id: string,
  name: string,
  label: string,
  leftRightSplit: "left" | "right" | "center" | "unknown",
  semanticRole?: LayerSemanticRole,
  semanticRoleSource?: LayerSemanticRoleSource,
  confidence = 0.9,
) {
  return createViviMesh({
    id,
    name,
    semanticRole,
    semanticRoleSource,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence,
        leftRightSplit,
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

describe("applySeeThroughLeftRightSplitAssistant", () => {
  it("assigns unknown imported side roles and marks them as assistant-owned", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh(
        "iris-left",
        "Iris Left",
        "iris_left",
        "left",
        "unknown",
        "seeThroughImport",
      ),
      createImportedMesh(
        "iris-right",
        "Iris Right",
        "iris_right",
        "right",
        undefined,
        undefined,
      ),
    ];

    const summary = applySeeThroughLeftRightSplitAssistant(project);

    expect(summary.applied).toBe(true);
    expect(summary.assignedLayerIds).toEqual(["iris-left", "iris-right"]);
    expect(summary.repairedLayerIds).toEqual([]);
    expect(project.layers[0]?.semanticRole).toBe("eyeLeft");
    expect(project.layers[0]?.semanticRoleSource).toBe("assistant");
    expect(project.layers[1]?.semanticRole).toBe("eyeRight");
    expect(project.layers[1]?.semanticRoleSource).toBe("assistant");
    expect(summary.unresolvedFamilyWarnings).toEqual([]);
  });

  it("repairs a wrong-side role only when the current role is assistant-owned", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh(
        "iris-left",
        "Iris Left",
        "iris_left",
        "left",
        "eyeRight",
        "assistant",
      ),
      createImportedMesh(
        "iris-right",
        "Iris Right",
        "iris_right",
        "right",
        "eyeRight",
        "assistant",
      ),
    ];

    const summary = applySeeThroughLeftRightSplitAssistant(project);

    expect(summary.applied).toBe(true);
    expect(summary.repairedLayerIds).toEqual(["iris-left"]);
    expect(project.layers[0]?.semanticRole).toBe("eyeLeft");
    expect(project.layers[0]?.semanticRoleSource).toBe("assistant");
  });

  it("preserves manual and legacy side roles even when the import hint disagrees", () => {
    const manualProject = createEmptyProject();
    manualProject.layers = [
      createImportedMesh(
        "iris-left",
        "Iris Left",
        "iris_left",
        "left",
        "eyeRight",
        "manual",
      ),
    ];

    const legacyProject = createEmptyProject();
    legacyProject.layers = [
      createImportedMesh(
        "iris-left",
        "Iris Left",
        "iris_left",
        "left",
        "eyeRight",
        undefined,
      ),
    ];

    const manualSummary = applySeeThroughLeftRightSplitAssistant(manualProject);
    const legacySummary = applySeeThroughLeftRightSplitAssistant(legacyProject);

    expect(manualSummary.applied).toBe(false);
    expect(legacySummary.applied).toBe(false);
    expect(manualProject.layers[0]?.semanticRole).toBe("eyeRight");
    expect(legacyProject.layers[0]?.semanticRole).toBe("eyeRight");
    expect(manualSummary.warnings[0]).toMatch(/protected/i);
    expect(legacySummary.warnings[0]).toMatch(/protected/i);
  });

  it("preserves conflicting non-side roles with a warning", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh(
        "iris-left",
        "Iris Left",
        "iris_left",
        "left",
        "accessory",
        "manual",
      ),
    ];

    const summary = applySeeThroughLeftRightSplitAssistant(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      'Preserved "Iris Left" because its current role accessory is outside the supported left/right families.',
    );
  });

  it("skips low-confidence candidates and unsupported labels", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh(
        "iris-left",
        "Iris Left",
        "iris_left",
        "left",
        "unknown",
        undefined,
        0.49,
      ),
      createImportedMesh(
        "hair-left",
        "Hair Left",
        "hair_front",
        "left",
        undefined,
        undefined,
        0.9,
      ),
    ];

    const summary = applySeeThroughLeftRightSplitAssistant(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings.some((warning) => /below 0.5/.test(warning))).toBe(true);
    expect(project.layers[0]?.semanticRole).toBe("unknown");
    expect(project.layers[1]?.semanticRole).toBeUndefined();
  });

  it("warns about unresolved duplicate-side and orphan-side families after repair", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh(
        "iris-left-a",
        "Iris Left A",
        "iris_left",
        "left",
        "unknown",
        undefined,
      ),
      createImportedMesh(
        "iris-left-b",
        "Iris Left B",
        "iris_left",
        "left",
        "unknown",
        undefined,
      ),
      createImportedMesh(
        "brow-right",
        "Brow Right",
        "eyebrow_right",
        "right",
        "unknown",
        undefined,
      ),
    ];

    const summary = applySeeThroughLeftRightSplitAssistant(project);

    expect(summary.applied).toBe(true);
    expect(summary.unresolvedFamilyWarnings).toContain(
      "Eye Left still appears multiple times.",
    );
    expect(summary.unresolvedFamilyWarnings).toContain(
      "Eye roles still cover only one side.",
    );
    expect(summary.unresolvedFamilyWarnings).toContain(
      "Eyebrow roles still cover only one side.",
    );
  });

  it("is idempotent on repeated application", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh(
        "iris-left",
        "Iris Left",
        "iris_left",
        "left",
        "unknown",
        undefined,
      ),
      createImportedMesh(
        "iris-right",
        "Iris Right",
        "iris_right",
        "right",
        "unknown",
        undefined,
      ),
    ];

    const first = applySeeThroughLeftRightSplitAssistant(project);
    const second = applySeeThroughLeftRightSplitAssistant(project);

    expect(first.applied).toBe(true);
    expect(second).toEqual({
      applied: false,
      repairedLayerIds: [],
      assignedLayerIds: [],
      unresolvedFamilyWarnings: [],
      warnings: [],
    });
  });
});
