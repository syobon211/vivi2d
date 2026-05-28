import type {
  LayerImportFbSplit,
  LayerImportLrSplit,
  LayerSemanticRole,
} from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { buildSeeThroughQualityReport } from "../see-through-quality-report";

function createImportedMesh(
  id: string,
  {
    semanticRole,
    label = id,
    confidence = 0.9,
    leftRightSplit = "center",
    frontBackSplit = "middle",
    bbox = [0, 0, 10, 10] as [number, number, number, number],
    depthMean = 0.5,
    depthMin = 0,
    depthMax = 1,
  }: {
    semanticRole?: LayerSemanticRole;
    label?: string;
    confidence?: number;
    leftRightSplit?: LayerImportLrSplit;
    frontBackSplit?: LayerImportFbSplit;
    bbox?: [number, number, number, number];
    depthMean?: number;
    depthMin?: number;
    depthMax?: number;
  } = {},
) {
  return createViviMesh({
    id,
    name: id,
    semanticRole,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence,
        leftRightSplit,
        frontBackSplit,
        bbox,
        depthStats: { min: depthMin, max: depthMax, mean: depthMean },
      },
    },
  });
}

describe("buildSeeThroughQualityReport", () => {
  it("returns an inactive report for non See-through projects", () => {
    const project = createEmptyProject();
    project.layers = [createViviMesh({ id: "plain", name: "plain" })];

    expect(buildSeeThroughQualityReport(project)).toEqual({
      isSeeThroughProject: false,
      importedViviMeshCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      projectIssues: [],
      layerIssues: {},
    });
  });

  it("reports missing critical roles as project warnings", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMesh("hair", { semanticRole: "hairFront" })];

    const report = buildSeeThroughQualityReport(project);

    expect(report.projectIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missingHeadOrFace", severity: "warning" }),
        expect.objectContaining({ code: "missingEyeLeft", severity: "warning" }),
        expect.objectContaining({ code: "missingEyeRight", severity: "warning" }),
        expect.objectContaining({ code: "missingMouth", severity: "warning" }),
        expect.objectContaining({ code: "missingBody", severity: "warning" }),
      ]),
    );
  });

  it("reports unknown role and low confidence as layer warnings", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("uncertain", {
        semanticRole: "unknown",
        confidence: 0.2,
      }),
    ];

    const issues = buildSeeThroughQualityReport(project).layerIssues.uncertain ?? [];

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknownSemanticRole", severity: "warning" }),
        expect.objectContaining({ code: "lowConfidenceRole", severity: "warning" }),
      ]),
    );
  });

  it("reports left/right conflicts as informational issues", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("eye", {
        semanticRole: "eyeRight",
        label: "iris_left",
        leftRightSplit: "left",
      }),
    ];

    const issues = buildSeeThroughQualityReport(project).layerIssues.eye ?? [];
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "leftRightConflict", severity: "info" }),
      ]),
    );
  });

  it("reports invalid bbox and depth stats as errors", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("broken", {
        bbox: [0, 0, 0, 10],
        depthMin: 3,
        depthMax: 1,
        depthMean: 2,
      }),
    ];

    const issues = buildSeeThroughQualityReport(project).layerIssues.broken ?? [];
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalidBBox", severity: "error" }),
        expect.objectContaining({ code: "invalidDepthStats", severity: "error" }),
      ]),
    );
  });

  it("reports duplicate critical roles as project warnings", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("eye-left-a", { semanticRole: "eyeLeft", label: "iris_left" }),
      createImportedMesh("eye-left-b", {
        semanticRole: "eyeLeft",
        label: "eye_white_left",
      }),
      createImportedMesh("eye-right", { semanticRole: "eyeRight", label: "iris_right" }),
      createImportedMesh("mouth", { semanticRole: "mouth" }),
      createImportedMesh("body", { semanticRole: "body" }),
      createImportedMesh("face", { semanticRole: "face" }),
    ];

    expect(buildSeeThroughQualityReport(project).projectIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicateCriticalRole",
          severity: "warning",
          role: "eyeLeft",
        }),
      ]),
    );
  });
});
