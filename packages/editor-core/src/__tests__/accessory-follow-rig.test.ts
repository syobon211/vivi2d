import { computeBoneWorldTransforms } from "@vivi2d/core/bone-utils";
import { computeSkinnedVertices } from "@vivi2d/core/skin-utils";
import type { BoneNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  applyAccessoryFollowRig,
  removeManagedAccessoryFollowSkinsForBone,
} from "../accessory-follow-rig";
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

function createMeshWithVertices(id = "mesh-a") {
  return createViviMesh({
    id,
    mesh: {
      vertices: [0, 0, 10, 0, 0, 10, 10, 10],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 2, 1, 3, 2],
      divisionsX: 1,
      divisionsY: 1,
    },
  });
}

describe("accessory follow rig command", () => {
  it("creates a managed rigid skin for a mesh and bone", () => {
    const bone = createBone();
    const mesh = createMeshWithVertices();
    const project = createProject({ layers: [bone, mesh], skins: {} });

    const result = applyAccessoryFollowRig(project, mesh.id, bone.id);

    expect(result).toMatchObject({
      status: "created",
      managedTag: `accessoryFollowRig:v1:mesh=${mesh.id}`,
      managedSignature: `${mesh.id}|${bone.id}|4`,
    });
    expect(project.skins[mesh.id]?.weights).toHaveLength(4);
    expect(project.skins[mesh.id]?.weights[0]).toEqual([
      { boneId: bone.id, weight: 1 },
    ]);
    expect(project.skins[mesh.id]?.bindPoseInverse[bone.id]).toHaveLength(6);
  });

  it("updates owned skins and reports replaced when the target bone changes", () => {
    const boneA = createBone({ id: "bone-a" });
    const boneB = createBone({ id: "bone-b" });
    const mesh = createMeshWithVertices();
    const project = createProject({ layers: [boneA, boneB, mesh], skins: {} });

    expect(applyAccessoryFollowRig(project, mesh.id, boneA.id).status).toBe(
      "created",
    );
    expect(applyAccessoryFollowRig(project, mesh.id, boneA.id).status).toBe(
      "updated",
    );
    expect(applyAccessoryFollowRig(project, mesh.id, boneB.id).status).toBe(
      "replaced",
    );
    expect(project.skins[mesh.id]?.weights[0]).toEqual([
      { boneId: boneB.id, weight: 1 },
    ]);
  });

  it("rejects unmanaged existing skins instead of overwriting user data", () => {
    const bone = createBone();
    const mesh = createMeshWithVertices();
    const project = createProject({
      layers: [bone, mesh],
      skins: {
        [mesh.id]: {
          weights: [[{ boneId: "manual-bone", weight: 1 }]],
          bindPoseInverse: {},
        },
      },
    });

    const result = applyAccessoryFollowRig(project, mesh.id, bone.id);

    expect(result).toMatchObject({
      status: "rejected",
      reason: "unmanagedSkinExists",
    });
    expect(project.skins[mesh.id]?.weights[0]).toEqual([
      { boneId: "manual-bone", weight: 1 },
    ]);
  });

  it("keeps mesh vertices visually unchanged when following a nested bone", () => {
    const root = createBone({ id: "root", x: 100, y: 40 });
    const child = createBone({
      id: "child",
      x: 20,
      y: 30,
      parentBoneId: root.id,
    });
    root.children = [child];
    const mesh = createMeshWithVertices();
    const project = createProject({ layers: [root, mesh], skins: {} });

    const result = applyAccessoryFollowRig(project, mesh.id, child.id);

    expect(result.status).toBe("created");
    const skin = project.skins[mesh.id]!;
    const worldTransforms = computeBoneWorldTransforms(project.layers);
    const skinned = computeSkinnedVertices(mesh.mesh.vertices, skin, worldTransforms);
    expect(skinned).toHaveLength(mesh.mesh.vertices.length);
    for (let i = 0; i < skinned.length; i += 1) {
      expect(skinned[i]!).toBeCloseTo(mesh.mesh.vertices[i]!, 6);
    }
  });

  it("removes only managed accessory skins that reference a deleted bone", () => {
    const bone = createBone();
    const mesh = createMeshWithVertices();
    const otherMesh = createMeshWithVertices("mesh-b");
    const project = createProject({ layers: [bone, mesh, otherMesh], skins: {} });
    applyAccessoryFollowRig(project, mesh.id, bone.id);
    project.skins[otherMesh.id] = {
      weights: [[{ boneId: bone.id, weight: 1 }]],
      bindPoseInverse: { [bone.id]: [1, 0, 0, 1, 0, 0] },
    };

    const removed = removeManagedAccessoryFollowSkinsForBone(project, bone.id);

    expect(removed).toEqual([mesh.id]);
    expect(project.skins[mesh.id]).toBeUndefined();
    expect(project.skins[otherMesh.id]).toBeDefined();
  });
});
