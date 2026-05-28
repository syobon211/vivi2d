import { applySeeThroughLeftRightSplitAssistant } from "@vivi2d/editor-core/see-through-left-right-split";
import { describe, expect, it } from "vitest";
import { createEmptyProject, createViviMesh } from "@/test/fixtures";
import { buildSeeThroughQualityReport } from "../see-through-quality-report";

describe("See-through quality report with left/right repair", () => {
  it("removes leftRightConflict after repairing the same project instance", () => {
    const project = createEmptyProject();
    project.layers = [
      createViviMesh({
        id: "iris-left",
        name: "Iris Left",
        semanticRole: "eyeRight",
        semanticRoleSource: "assistant",
        importMetadata: {
          source: "seeThrough",
          seeThrough: {
            label: "iris_left",
            order: 0,
            confidence: 0.9,
            leftRightSplit: "left",
            frontBackSplit: "middle",
            bbox: [0, 0, 10, 10],
            depthStats: { min: 0, max: 1, mean: 0.5 },
          },
        },
      }),
    ];

    expect(
      buildSeeThroughQualityReport(project).layerIssues["iris-left"]?.some(
        (issue) => issue.code === "leftRightConflict",
      ),
    ).toBe(true);

    applySeeThroughLeftRightSplitAssistant(project);

    expect(
      buildSeeThroughQualityReport(project).layerIssues["iris-left"]?.some(
        (issue) => issue.code === "leftRightConflict",
      ) ?? false,
    ).toBe(false);
  });
});
