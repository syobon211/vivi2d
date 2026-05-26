import { DRAW_ORDER } from "@vivi2d/core/constants";
import { findLayerById } from "@vivi2d/core/layer-utils";
import type { GroupNode, LayerNode, MeshData, RGBColor } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  cleanupOrphanSkins,
  moveLayer,
  reorderLayer,
  setBlendMode,
  setClipMaskIds,
  setCulling,
  setDrawOrder,
  setDrawOrderBatch,
  setLayerOpacity,
  setLayerSemanticRole,
  setLayerSemanticRoleBatch,
  setMeshData,
  setMeshDivisions,
  setMeshVertices,
  setMultiplyColor,
  setScreenColor,
  toggleExpanded,
  toggleVisibility,
} from "../layer-command";
import { createProject, createViviMesh } from "./fixtures";

function group(id: string, children: LayerNode[] = []): GroupNode {
  return {
    id,
    name: id,
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children,
    blendMode: "normal",
    expanded: true,
    kind: "group",
  };
}

describe("layer commands", () => {
  it("updates basic layer visibility, expansion, opacity, masks, blend, and colors", () => {
    const layer = createViviMesh({ id: "mesh" });
    const project = createProject({ layers: [layer] });
    const color: RGBColor = { r: 0.1, g: Number.NaN, b: 0.3 };

    expect(toggleVisibility(project, "mesh")).toBe(true);
    expect(toggleExpanded(project, "mesh")).toBe(true);
    expect(setLayerOpacity(project, "mesh", 2)).toBe(true);
    expect(setClipMaskIds(project, "mesh", ["mask"])).toBe(true);
    expect(setBlendMode(project, "mesh", "multiply")).toBe(true);
    expect(setMultiplyColor(project, "mesh", color)).toBe(true);
    color.r = 999;
    expect(setScreenColor(project, "mesh", { r: 0.2, g: 0.4, b: 0.6 })).toBe(true);

    expect(layer.visible).toBe(false);
    expect(layer.expanded).toBe(false);
    expect(layer.opacity).toBe(1);
    expect(layer.clipMaskIds).toEqual(["mask"]);
    expect(layer.blendMode).toBe("multiply");
    expect(layer.multiplyColor).toEqual({ r: 0.1, g: 1, b: 0.3 });
    expect(layer.screenColor).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
  });

  it("moves and reorders layers without losing nodes on invalid targets", () => {
    const a = createViviMesh({ id: "a" });
    const b = createViviMesh({ id: "b" });
    const child = createViviMesh({ id: "child" });
    const parent = group("parent", [child]);
    const project = createProject({ layers: [a, b, parent] });

    expect(moveLayer(project, "b", "up")).toBe(true);
    expect(project.layers.map((layer) => layer.id)).toEqual(["b", "a", "parent"]);
    expect(reorderLayer(project, "parent", "child", "before")).toBe(false);
    expect(findLayerById(project.layers, "parent")).not.toBeNull();
    expect(reorderLayer(project, "a", "b", "after")).toBe(true);
    expect(project.layers.map((layer) => layer.id)).toEqual(["b", "a", "parent"]);
  });

  it("updates mesh data defensively", () => {
    const meshLayer = createViviMesh({ id: "mesh", width: 100, height: 50 });
    const project = createProject({ layers: [meshLayer] });
    const mesh: MeshData = {
      vertices: [0, Number.NaN, 10, 20],
      uvs: [0, 1],
      indices: [0, 1.2, Number.POSITIVE_INFINITY],
      divisionsX: Number.NaN,
      divisionsY: 2,
    };

    expect(setMeshVertices(project, "mesh", [1, Number.NaN, 3])).toBe(true);
    expect(meshLayer.mesh.vertices).toEqual([1, 0, 3]);
    expect(setMeshData(project, "mesh", mesh)).toBe(true);
    mesh.vertices[0] = 999;
    expect(meshLayer.mesh.vertices).toEqual([0, 0, 10, 20]);
    expect(meshLayer.mesh.indices).toEqual([0, 1, 0]);
    expect(meshLayer.mesh.divisionsX).toBe(1);
    expect(setMeshDivisions(project, "mesh", 3, Number.NaN)).toBe(true);
    expect(meshLayer.mesh.divisionsX).toBe(3);
    expect(setMeshData(project, "missing", mesh)).toBe(false);
  });

  it("clamps draw order, culling, and semantic role updates", () => {
    const meshA = createViviMesh({ id: "a" });
    const meshB = createViviMesh({ id: "b" });
    const project = createProject({ layers: [meshA, meshB, group("group")] });

    expect(setDrawOrder(project, "a", Number.NaN)).toBe(true);
    expect(meshA.drawOrder).toBe(DRAW_ORDER.DEFAULT);
    expect(
      setDrawOrderBatch(project, [
        { id: "a", drawOrder: DRAW_ORDER.MAX + 100 },
        { id: "b", drawOrder: DRAW_ORDER.MIN - 100 },
      ]),
    ).toBe(2);
    expect(meshA.drawOrder).toBe(DRAW_ORDER.MAX);
    expect(meshB.drawOrder).toBe(DRAW_ORDER.MIN);
    expect(setCulling(project, "a", true)).toBe(true);
    expect(setCulling(project, "group", true)).toBe(false);
    expect(setLayerSemanticRole(project, "a", "hair")).toBe(true);
    expect(meshA.semanticRoleSource).toBe("manual");
    expect(setLayerSemanticRoleBatch(project, ["a", "b", "group"], undefined)).toBe(2);
    expect(meshA.semanticRole).toBeUndefined();
    expect(meshB.semanticRole).toBeUndefined();
  });

  it("removes orphan skins only", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "mesh" })],
      skins: {
        mesh: { weights: [], bindPoseInverse: {} },
        orphan: { weights: [], bindPoseInverse: {} },
      },
    });

    expect(cleanupOrphanSkins(project)).toBe(1);
    expect(project.skins.mesh).toBeDefined();
    expect(project.skins.orphan).toBeUndefined();
  });
});
