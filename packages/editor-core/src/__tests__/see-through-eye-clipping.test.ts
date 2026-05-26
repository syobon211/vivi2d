import { describe, expect, it } from "vitest";
import { applySeeThroughEyeClipping } from "../see-through-eye-clipping";
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

describe("applySeeThroughEyeClipping", () => {
  it("applies left and right iris clipping when both sides are unambiguous", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("iris-left", "Iris Left", " iris_left "),
      createImportedMesh("white-left", "Eye White Left", "eye_white_left"),
      createImportedMesh("iris-right", "Iris Right", "iris_right"),
      createImportedMesh("white-right", "Eye White Right", "eye_white_right"),
    ];

    const summary = applySeeThroughEyeClipping(project);

    expect(summary).toEqual({
      applied: true,
      updatedLayerIds: ["iris-left", "iris-right"],
      warnings: [],
    });
    expect(project.layers[0]!.clipMaskIds).toEqual(["white-left"]);
    expect(project.layers[2]!.clipMaskIds).toEqual(["white-right"]);
  });

  it("skips a side when the iris layer is missing", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("white-left", "Eye White Left", "eye_white_left"),
    ];

    const summary = applySeeThroughEyeClipping(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      "Skipped left eye clipping because no imported iris layer was found.",
    );
  });

  it("skips a side when the eye-white source is missing", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMesh("iris-left", "Iris Left", "iris_left")];

    const summary = applySeeThroughEyeClipping(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      "Skipped left eye clipping because no imported eye-white layer was found.",
    );
  });

  it("skips ambiguous sides safely", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("iris-a", "Iris A", "iris_left"),
      createImportedMesh("iris-b", "Iris B", "iris_left"),
      createImportedMesh("white-left", "Eye White Left", "eye_white_left"),
    ];

    const summary = applySeeThroughEyeClipping(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      "Skipped left eye clipping because 2 imported iris layers were found.",
    );
  });

  it("preserves existing manual clip masks", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("iris-left", "Iris Left", "iris_left"),
      createImportedMesh("white-left", "Eye White Left", "eye_white_left"),
    ];
    project.layers[0]!.clipMaskIds = ["manual-mask"];

    const summary = applySeeThroughEyeClipping(project);

    expect(summary.applied).toBe(false);
    expect(summary.warnings).toContain(
      "Skipped left eye clipping because Iris Left already has clip masks.",
    );
    expect(project.layers[0]!.clipMaskIds).toEqual(["manual-mask"]);
  });

  it("is idempotent when applied twice", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("iris-left", "Iris Left", "iris_left"),
      createImportedMesh("white-left", "Eye White Left", "eye_white_left"),
    ];

    const first = applySeeThroughEyeClipping(project);
    const second = applySeeThroughEyeClipping(project);

    expect(first.applied).toBe(true);
    expect(second).toEqual({
      applied: false,
      updatedLayerIds: [],
      warnings: [],
    });
  });
});
