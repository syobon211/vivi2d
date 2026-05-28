import { computeBoneWorldTransforms } from "@vivi2d/core/bone-utils";
import { computeSkinnedVertices } from "@vivi2d/core/skin-utils";
import type { BoneNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  autoComputeSkinWeights,
  bindSkinToBones,
  normalizeSkinWeights,
  paintSkinWeight,
  paintSkinWeightBrush,
  setSkinVertexWeights,
  unbindSkin,
} from "../skin-command";
import { createProject, createViviMesh } from "./fixtures";

function createBone(overrides: Partial<BoneNode> = {}): BoneNode {
  return {
    id: "bone-a",
    name: "Bone A",
    kind: "bone",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    blendMode: "normal",
    expanded: true,
    children: [],
    bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    ...overrides,
  };
}

function createMesh(id = "mesh-a") {
  return createViviMesh({
    id,
    mesh: {
      vertices: [0, 0, 100, 0, 0, 100, 100, 100],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 2, 1, 3, 2],
      divisionsX: 1,
      divisionsY: 1,
    },
  });
}

describe("skin commands", () => {
  it("binds a mesh to bones with inverse bind poses", () => {
    const root = createBone({ id: "root", x: 100, y: 40 });
    const child = createBone({ id: "child", x: 20, y: 30, parentBoneId: root.id });
    root.children = [child];
    const mesh = createMesh();
    const project = createProject({ layers: [root, mesh], skins: {} });

    expect(bindSkinToBones(project, mesh.id, [root.id, child.id])).toBe(true);

    const skin = project.skins[mesh.id]!;
    expect(skin.weights[0]).toEqual([
      { boneId: root.id, weight: 0.5 },
      { boneId: child.id, weight: 0.5 },
    ]);
    expect(Object.keys(skin.bindPoseInverse)).toEqual([root.id, child.id]);
    const skinned = computeSkinnedVertices(
      mesh.mesh.vertices,
      skin,
      computeBoneWorldTransforms(project.layers),
    );
    expect(skinned).toHaveLength(mesh.mesh.vertices.length);
    for (let i = 0; i < skinned.length; i += 1) {
      expect(skinned[i]!).toBeCloseTo(mesh.mesh.vertices[i]!, 6);
    }
  });

  it("sets, paints, normalizes, and unbinds weights", () => {
    const boneA = createBone({ id: "bone-a" });
    const boneB = createBone({ id: "bone-b" });
    const mesh = createMesh();
    const project = createProject({ layers: [boneA, boneB, mesh], skins: {} });
    bindSkinToBones(project, mesh.id, [boneA.id, boneB.id]);

    expect(setSkinVertexWeights(project, mesh.id, 0, [{ boneId: boneA.id, weight: 1 }]))
      .toBe(true);
    expect(paintSkinWeight(project, mesh.id, 0, boneB.id, 1)).toBe(true);
    expect(project.skins[mesh.id]?.weights[0]).toEqual([
      { boneId: boneA.id, weight: 0.5 },
      { boneId: boneB.id, weight: 0.5 },
    ]);

    project.skins[mesh.id]!.weights[0] = [
      { boneId: boneA.id, weight: 2 },
      { boneId: boneB.id, weight: 1 },
    ];
    expect(normalizeSkinWeights(project, mesh.id)).toBe(true);
    const total = project.skins[mesh.id]!.weights[0]!.reduce(
      (sum, weight) => sum + weight.weight,
      0,
    );
    expect(total).toBeCloseTo(1);
    expect(unbindSkin(project, mesh.id)).toBe(true);
    expect(project.skins[mesh.id]).toBeUndefined();
  });

  it("computes automatic distance weights from existing bind bones", () => {
    const boneA = createBone({ id: "bone-a", x: 0, y: 0 });
    const boneB = createBone({ id: "bone-b", x: 100, y: 0 });
    const mesh = createMesh();
    const project = createProject({ layers: [boneA, boneB, mesh], skins: {} });
    bindSkinToBones(project, mesh.id, [boneA.id, boneB.id]);

    expect(autoComputeSkinWeights(project, mesh.id)).toBe(true);

    const weights = project.skins[mesh.id]!.weights;
    expect(weights).toHaveLength(4);
    for (const vertexWeights of weights) {
      const total = vertexWeights.reduce((sum, weight) => sum + weight.weight, 0);
      expect(total).toBeCloseTo(1, 1);
    }
  });

  it("paints brush weights and leaves distant brushes unchanged", () => {
    const boneA = createBone({ id: "bone-a" });
    const boneB = createBone({ id: "bone-b" });
    const mesh = createMesh();
    const project = createProject({ layers: [boneA, boneB, mesh], skins: {} });
    bindSkinToBones(project, mesh.id, [boneA.id]);

    expect(
      paintSkinWeightBrush(project, mesh.id, 0, 0, 500, boneB.id, 1, "add"),
    ).toBe(true);
    expect(project.skins[mesh.id]?.weights[0]?.some((w) => w.boneId === boneB.id))
      .toBe(true);
    const before = structuredClone(project.skins[mesh.id]!.weights);
    expect(
      paintSkinWeightBrush(project, mesh.id, 99999, 99999, 1, boneB.id, 1, "add"),
    ).toBe(false);
    expect(project.skins[mesh.id]?.weights).toEqual(before);
  });

  it("returns false without throwing when optional skins storage is absent", () => {
    const project = createProject();
    delete (project as unknown as { skins?: unknown }).skins;

    expect(setSkinVertexWeights(project, "mesh", 0, [])).toBe(false);
    expect(paintSkinWeight(project, "mesh", 0, "bone", 1)).toBe(false);
    expect(normalizeSkinWeights(project, "mesh")).toBe(false);
    expect(autoComputeSkinWeights(project, "mesh")).toBe(false);
    expect(
      paintSkinWeightBrush(project, "mesh", 0, 0, 10, "bone", 1, "add"),
    ).toBe(false);
  });
});
