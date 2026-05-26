import type { GroupNode, LayerImportMetadata } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { createViviMesh, createProject } from "@/test/fixtures";
import {
  buildSeeThroughDepthInspectorWarnings,
  buildSeeThroughDepthNormalizationPlan,
  collectSeeThroughDepthInspectorRows,
  sortSeeThroughDepthInspectorRows,
} from "../see-through-depth-inspector";

function createMetadata(
  label: string,
  order: number,
  frontBackSplit: NonNullable<
    LayerImportMetadata["seeThrough"]
  >["frontBackSplit"] = "front",
): LayerImportMetadata {
  return {
    source: "seeThrough",
    seeThrough: {
      label,
      order,
      confidence: 0.9,
      leftRightSplit: "center",
      frontBackSplit,
      bbox: [0, 0, 16, 16],
      depthStats: { min: 0, max: 1, mean: 0.5 },
    },
  };
}

function createGroup(id: string): GroupNode {
  return {
    id,
    name: id,
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    blendMode: "normal",
    expanded: true,
    kind: "group",
    children: [],
  };
}

describe("see-through-depth-inspector", () => {
  it("extracts imported ViviMeshes only", () => {
    const importedA = createViviMesh({
      id: "import-a",
      importMetadata: createMetadata("hair_back", 1, "back"),
      drawOrder: 100,
    });
    const importedB = createViviMesh({
      id: "import-b",
      importMetadata: createMetadata("hair_front", 2, "front"),
      drawOrder: 200,
    });
    const plain = createViviMesh({ id: "plain", drawOrder: 300 });
    const group = createGroup("group");
    const project = createProject({ layers: [group, importedA, plain, importedB] });

    const rows = collectSeeThroughDepthInspectorRows(project);

    expect(rows.map((row) => row.layerId)).toEqual(["import-a", "import-b"]);
    expect(rows[0]?.treeOrder).toBeLessThan(rows[1]!.treeOrder);
  });

  it("sorts by imported depth and preserves tree order for ties", () => {
    const earlier = createViviMesh({
      id: "earlier",
      importMetadata: createMetadata("hair_back", 5, "back"),
      drawOrder: 100,
    });
    const later = createViviMesh({
      id: "later",
      importMetadata: createMetadata("hair_front", 5, "front"),
      drawOrder: 200,
    });
    const project = createProject({ layers: [earlier, later] });

    const rows = collectSeeThroughDepthInspectorRows(project);
    const sorted = sortSeeThroughDepthInspectorRows(rows, "importedDepth");

    expect(sorted.map((row) => row.layerId)).toEqual(["earlier", "later"]);
  });

  it("builds a stable normalization plan using the imported drawOrder multiset", () => {
    const back = createViviMesh({
      id: "back",
      importMetadata: createMetadata("hair_back", 10, "back"),
      drawOrder: 900,
    });
    const front = createViviMesh({
      id: "front",
      importMetadata: createMetadata("hair_front", 20, "front"),
      drawOrder: 100,
    });
    const middle = createViviMesh({
      id: "middle",
      importMetadata: createMetadata("hair_middle", 15, "middle"),
      drawOrder: 500,
    });
    const project = createProject({ layers: [front, back, middle] });

    const plan = buildSeeThroughDepthNormalizationPlan(project);

    expect(plan.assignments).toEqual([
      { layerId: "back", fromDrawOrder: 900, toDrawOrder: 100 },
      { layerId: "front", fromDrawOrder: 100, toDrawOrder: 900 },
    ]);
  });

  it("reports duplicate imported depth warnings", () => {
    const left = createViviMesh({
      id: "left",
      importMetadata: createMetadata("eye_white_left", 5),
      drawOrder: 100,
    });
    const right = createViviMesh({
      id: "right",
      importMetadata: createMetadata("eye_white_right", 5),
      drawOrder: 200,
    });
    const project = createProject({ layers: [left, right] });

    const warnings = buildSeeThroughDepthInspectorWarnings(
      project,
      collectSeeThroughDepthInspectorRows(project),
    );

    expect(warnings.some((warning) => warning.code === "duplicateImportedOrder")).toBe(
      true,
    );
    expect(warnings.some((warning) => warning.code === "rendererTieDepthOrder")).toBe(
      true,
    );
  });

  it("reports resulting drawOrder collisions even when normalization makes no assignments", () => {
    const imported = createViviMesh({
      id: "imported",
      drawOrder: 500,
      importMetadata: createMetadata("hair_front", 1),
    });
    const plain = createViviMesh({ id: "plain", drawOrder: 500 });
    const project = createProject({ layers: [imported, plain] });

    const warnings = buildSeeThroughDepthInspectorWarnings(
      project,
      collectSeeThroughDepthInspectorRows(project),
    );

    expect(
      warnings.some((warning) => warning.code === "duplicateExternalDrawOrder"),
    ).toBe(true);
  });
});
