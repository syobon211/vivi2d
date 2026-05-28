import { isBone } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { applySeeThroughEyeRig } from "../see-through-eye-rig";
import { createEmptyProject, createViviMesh } from "./fixtures";

function createImportedMesh(id: string, name: string, label: string) {
  return createViviMesh({
    id,
    name,
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

function createClippedEyePair(side: "left" | "right") {
  const iris = createImportedMesh(`iris-${side}`, `Iris ${side}`, `iris_${side}`);
  const eyeWhite = createImportedMesh(
    `white-${side}`,
    `Eye White ${side}`,
    `eye_white_${side}`,
  );
  iris.clipMaskIds = [eyeWhite.id];
  return { iris, eyeWhite };
}

describe("applySeeThroughEyeRig", () => {
  it("creates blink parameters and control bones for both sides", () => {
    const project = createEmptyProject();
    const left = createClippedEyePair("left");
    const right = createClippedEyePair("right");
    project.layers = [left.iris, left.eyeWhite, right.iris, right.eyeWhite];
    const ids = ["param-left", "bone-left", "param-right", "bone-right"];

    const summary = applySeeThroughEyeRig(project, {
      createId: () => ids.shift() ?? "fallback-id",
    });

    expect(summary).toMatchObject({
      applied: true,
      createdParameterIds: ["param-left", "param-right"],
      createdControlBoneIds: ["bone-left", "bone-right"],
      adoptedAssetIds: [],
      warnings: [],
    });
    expect(project.parameters.map((parameter) => parameter.name)).toEqual([
      "Eye Blink Left",
      "Eye Blink Right",
    ]);
    expect(
      project.parameters.every((parameter) =>
        parameter.managedTag?.startsWith("seeThroughEyeControl:v1:"),
      ),
    ).toBe(true);

    const controlBones = project.layers.filter(isBone);
    expect(controlBones.map((bone) => bone.name)).toEqual([
      "Eye Control Left",
      "Eye Control Right",
    ]);
    expect(
      controlBones.every((bone) =>
        bone.managedTag?.startsWith("seeThroughEyeControl:v1:"),
      ),
    ).toBe(true);
  });

  it("skips a side when clipping is not configured", () => {
    const project = createEmptyProject();
    const iris = createImportedMesh("iris-left", "Iris Left", "iris_left");
    const eyeWhite = createImportedMesh("white-left", "Eye White Left", "eye_white_left");
    project.layers = [iris, eyeWhite];

    const summary = applySeeThroughEyeRig(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      "Skipped left eye controls because Iris Left is not clipped by Eye White Left.",
    );
    expect(project.parameters).toHaveLength(0);
    expect(project.layers.filter(isBone)).toHaveLength(0);
  });

  it("skips conflicting user-owned parameter names safely", () => {
    const project = createEmptyProject();
    const left = createClippedEyePair("left");
    project.layers = [left.iris, left.eyeWhite];
    project.parameters.push({
      id: "manual-blink",
      name: "Eye Blink Left",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
    });

    const summary = applySeeThroughEyeRig(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      "Skipped left eye controls because Eye Blink Left already exists as a user-owned parameter.",
    );
    expect(project.layers.filter(isBone)).toHaveLength(0);
  });

  it("is idempotent on repeated application", () => {
    const project = createEmptyProject();
    const left = createClippedEyePair("left");
    project.layers = [left.iris, left.eyeWhite];

    const first = applySeeThroughEyeRig(project);
    const second = applySeeThroughEyeRig(project);

    expect(first.applied).toBe(true);
    expect(second).toEqual({
      applied: false,
      createdParameterIds: [],
      createdControlBoneIds: [],
      adoptedAssetIds: [],
      warnings: [],
    });
  });
});
