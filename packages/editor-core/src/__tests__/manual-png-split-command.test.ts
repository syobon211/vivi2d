import { describe, expect, it } from "vitest";
import type { GroupNode, ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import { applyManualPngSplitPlan } from "../manual-png-split-command";

function createMesh(id: string, visible = true): ViviMeshNode {
  return {
    id,
    name: id,
    kind: "viviMesh",
    visible,
    opacity: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    blendMode: "normal",
    expanded: true,
    children: [],
    mesh: { vertices: [], uvs: [], indices: [], divisionsX: 0, divisionsY: 0 },
  };
}

function createGroup(id: string): GroupNode {
  return {
    id,
    name: id,
    kind: "group",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    blendMode: "normal",
    expanded: true,
    children: [createMesh("split-child")],
  };
}

function createProject(): ProjectData {
  return {
    version: "5.0.0",
    name: "Manual PNG",
    width: 100,
    height: 100,
    layers: [createMesh("source")],
    parameters: [],
    physics: [],
    scenes: [],
    clips: [],
    stateMachines: [],
    expressionPresets: [],
  };
}

describe("editor-core manual PNG split command", () => {
  it("hides the source layer and inserts the split group", () => {
    const project = createProject();
    const group = createGroup("split-group");
    const result = applyManualPngSplitPlan(project, {
      sourceLayerId: "source",
      group,
      selectedLayerId: "split-child",
    });

    expect(project.layers[0]?.visible).toBe(false);
    expect(project.sourceKind).toBe("manualPng");
    expect(project.layers.at(-1)).toMatchObject({ id: "split-group" });
    expect(result).toEqual({
      hiddenSourceLayer: true,
      insertedGroupId: "split-group",
      selectedLayerId: "split-child",
    });
  });

  it("clones the inserted group to avoid caller-side mutation leaks", () => {
    const project = createProject();
    const group = createGroup("split-group");
    applyManualPngSplitPlan(project, { sourceLayerId: "missing", group });
    group.name = "mutated after apply";

    expect(project.layers.at(-1)?.name).toBe("split-group");
    expect(project.layers[0]?.visible).toBe(true);
  });
});
