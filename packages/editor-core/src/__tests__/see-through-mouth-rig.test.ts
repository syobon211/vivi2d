import { isBone } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { applySeeThroughMouthRig } from "../see-through-mouth-rig";
import { createEmptyProject, createViviMesh } from "./fixtures";

function createImportedMouthMesh(id = "mouth", name = "Mouth", label = "mouth") {
  return createViviMesh({
    id,
    name,
    semanticRole: "mouth",
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence: 0.9,
        leftRightSplit: "center",
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

describe("applySeeThroughMouthRig", () => {
  it("creates a mouth parameter, control bone, and lipsync parameter wiring", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMouthMesh()];
    const ids = ["param-mouth", "bone-mouth"];

    const summary = applySeeThroughMouthRig(project, {
      createId: () => ids.shift() ?? "fallback-id",
    });

    expect(summary).toMatchObject({
      applied: true,
      createdParameterIds: ["param-mouth"],
      createdControlBoneIds: ["bone-mouth"],
      lipsyncTargetUpdated: true,
      warnings: [],
    });
    expect(project.parameters.map((parameter) => parameter.name)).toEqual([
      "Mouth Open",
    ]);
    expect(project.parameters[0]?.group).toBe("Mouth");
    expect(project.parameters[0]?.managedTag).toBe(
      "seeThroughMouthControl:v1:parameter",
    );
    const controlBones = project.layers.filter(isBone);
    expect(controlBones).toHaveLength(1);
    expect(controlBones[0]?.name).toBe("Mouth Control");
    expect(controlBones[0]?.managedTag).toBe("seeThroughMouthControl:v1:controlBone");
    expect(project.lipsyncConfig.targetParameterId).toBe(project.parameters[0]?.id);
  });

  it("skips ambiguous imported mouth candidates safely", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMouthMesh("mouth-a", "Mouth A", "mouth"),
      createImportedMouthMesh("mouth-b", "Mouth B", "mouth"),
    ];

    const summary = applySeeThroughMouthRig(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      "Skipped mouth controls because 2 imported mouth layers were found.",
    );
    expect(project.parameters).toHaveLength(0);
    expect(project.layers.filter(isBone)).toHaveLength(0);
  });

  it("preserves conflicting user-owned assets with a warning", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMouthMesh()];
    project.parameters.push({
      id: "manual-mouth-open",
      name: "Mouth Open",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
    });

    const summary = applySeeThroughMouthRig(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      "Skipped mouth controls because Mouth Open already exists as a user-owned parameter.",
    );
    expect(project.layers.filter(isBone)).toHaveLength(0);
  });

  it("preserves a valid existing lipsync target that points elsewhere", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMouthMesh()];
    project.parameters.push({
      id: "manual-mouth",
      name: "Manual Mouth",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
    });
    project.lipsyncConfig.targetParameterId = "manual-mouth";

    const summary = applySeeThroughMouthRig(project);

    expect(summary.applied).toBe(true);
    expect(summary.lipsyncTargetUpdated).toBe(false);
    expect(summary.warnings).toContain(
      "Preserved existing lip-sync parameter target and did not rewire Mouth Open automatically.",
    );
    expect(project.lipsyncConfig.targetParameterId).toBe("manual-mouth");
  });

  it("repairs a stale missing lipsync target", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMouthMesh()];
    project.lipsyncConfig.targetParameterId = "missing-mouth-open";

    const summary = applySeeThroughMouthRig(project);

    expect(summary.lipsyncTargetUpdated).toBe(true);
    expect(project.lipsyncConfig.targetParameterId).toBe(project.parameters[0]?.id);
  });

  it("is idempotent on repeated application", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMouthMesh()];

    const first = applySeeThroughMouthRig(project);
    const second = applySeeThroughMouthRig(project);

    expect(first.applied).toBe(true);
    expect(second).toEqual({
      applied: false,
      createdParameterIds: [],
      createdControlBoneIds: [],
      adoptedAssetIds: [],
      lipsyncTargetUpdated: false,
      warnings: [],
    });
  });
});
