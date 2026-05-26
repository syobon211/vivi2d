import { findLayerById } from "@vivi2d/core/layer-utils";
import type { GroupNode, LayerImportMetadata } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

function createSeeThroughImportMetadata(label: string): LayerImportMetadata {
  return {
    source: "seeThrough",
    seeThrough: {
      label,
      order: 0,
      confidence: 0.91,
      leftRightSplit: "left",
      frontBackSplit: "front",
      bbox: [0, 0, 10, 10],
      depthStats: { min: 0.1, max: 0.2, mean: 0.15 },
    },
  };
}

describe("editorStore semantic role actions", () => {
  beforeEach(() => {
    resetAllStores();
    _resetMergeTimer();
  });

  it("writes a semantic role to a selected ViviMesh", () => {
    const mesh = createViviMesh({ id: "mesh-a", semanticRole: undefined });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    useEditorStore.getState().setLayerSemanticRole(mesh.id, "hairFront");

    const updated = findLayerById(useEditorStore.getState().project!.layers, mesh.id);
    expect(updated?.semanticRole).toBe("hairFront");
    expect(updated?.semanticRoleSource).toBe("manual");
  });

  it("clears semanticRole while preserving importMetadata", () => {
    const importMetadata = createSeeThroughImportMetadata("hair_front");
    const mesh = createViviMesh({
      id: "mesh-a",
      semanticRole: "hairFront",
      importMetadata,
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    useEditorStore.getState().setLayerSemanticRole(mesh.id, undefined);

    const updated = findLayerById(useEditorStore.getState().project!.layers, mesh.id);
    expect(updated?.semanticRole).toBeUndefined();
    expect(updated?.semanticRoleSource).toBeUndefined();
    expect(updated?.importMetadata).toEqual(importMetadata);
  });

  it("stores explicit unknown while preserving importMetadata", () => {
    const importMetadata = createSeeThroughImportMetadata("mouth");
    const mesh = createViviMesh({
      id: "mesh-a",
      semanticRole: "mouth",
      importMetadata,
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    useEditorStore.getState().setLayerSemanticRole(mesh.id, "unknown");

    const updated = findLayerById(useEditorStore.getState().project!.layers, mesh.id);
    expect(updated?.semanticRole).toBe("unknown");
    expect(updated?.semanticRoleSource).toBe("manual");
    expect(updated?.importMetadata).toEqual(importMetadata);
  });

  it("batch-updates ViviMeshes and skips non-viviMesh nodes", () => {
    const meshA = createViviMesh({ id: "mesh-a" });
    const meshB = createViviMesh({ id: "mesh-b", semanticRole: "mouth" });
    const group: GroupNode = {
      id: "group-a",
      name: "Group",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      children: [],
      blendMode: "normal",
      expanded: true,
      kind: "group",
    };
    useEditorStore.setState({
      project: createProject({ layers: [meshA, meshB, group] }),
    });

    useEditorStore
      .getState()
      .setLayerSemanticRoleBatch([meshA.id, group.id, meshB.id], "eyeLeft");

    const project = useEditorStore.getState().project!;
    expect(findLayerById(project.layers, meshA.id)?.semanticRole).toBe("eyeLeft");
    expect(findLayerById(project.layers, meshA.id)?.semanticRoleSource).toBe("manual");
    expect(findLayerById(project.layers, meshB.id)?.semanticRole).toBe("eyeLeft");
    expect(findLayerById(project.layers, meshB.id)?.semanticRoleSource).toBe("manual");
    expect(findLayerById(project.layers, group.id)?.semanticRole).toBeUndefined();
  });

  it("records batch apply as a single undo step", () => {
    const meshA = createViviMesh({ id: "mesh-a" });
    const meshB = createViviMesh({ id: "mesh-b" });
    useEditorStore.setState({
      project: createProject({ layers: [meshA, meshB] }),
    });

    useEditorStore.getState().setLayerSemanticRoleBatch([meshA.id, meshB.id], "hairBack");

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    useHistoryStore.getState().undo();

    const project = useEditorStore.getState().project!;
    expect(findLayerById(project.layers, meshA.id)?.semanticRole).toBeUndefined();
    expect(findLayerById(project.layers, meshA.id)?.semanticRoleSource).toBeUndefined();
    expect(findLayerById(project.layers, meshB.id)?.semanticRole).toBeUndefined();
    expect(findLayerById(project.layers, meshB.id)?.semanticRoleSource).toBeUndefined();
  });
});
