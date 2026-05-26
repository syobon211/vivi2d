import { findLayerById } from "@vivi2d/core/layer-utils";
import type { BoneNode, GroupNode, LayerNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  addBone,
  addRootBone,
  removeBone,
  reparentBone,
  setBoneAngle,
  setBoneLength,
  setBonePosition,
  setBoneScale,
} from "../bone-command";
import { createProject } from "./fixtures";

function bone(overrides: Partial<BoneNode> = {}): BoneNode {
  return {
    id: "bone",
    name: "Bone",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    ...overrides,
  };
}

function group(children: LayerNode[] = []): GroupNode {
  return {
    id: "group",
    name: "Group",
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

describe("bone commands", () => {
  it("adds root and child bones", () => {
    const project = createProject({ layers: [group()] });

    const rootId = addRootBone(
      project,
      "Root",
      Number.NaN,
      20,
      { managedTag: "tag" },
      () => "root",
    );
    const childId = addBone(project, rootId, "Child", 5, 10, () => "child");
    const groupChildId = addBone(project, "group", "Group child", 1, 2, () => "g-child");

    expect(rootId).toBe("root");
    expect(childId).toBe("child");
    expect(groupChildId).toBe("g-child");
    const root = findLayerById(project.layers, rootId) as BoneNode;
    expect(root).toMatchObject({
      id: "root",
      name: "Root",
      x: 0,
      y: 20,
      managedTag: "tag",
    });
    expect(root.children[0]).toMatchObject({
      id: "child",
      parentBoneId: "root",
    });
    const groupNode = findLayerById(project.layers, "group") as GroupNode;
    expect((groupNode.children[0] as BoneNode).parentBoneId).toBeUndefined();
  });

  it("updates bone transforms with finite guards", () => {
    const project = createProject({ layers: [bone({ id: "bone" })] });

    expect(setBonePosition(project, "bone", 10, Number.NaN)).toBe(true);
    expect(setBoneAngle(project, "bone", Math.PI / 2)).toBe(true);
    expect(setBoneScale(project, "bone", Number.NaN, 2)).toBe(true);
    expect(setBoneLength(project, "bone", -10)).toBe(true);

    const updated = project.layers[0] as BoneNode;
    expect(updated.x).toBe(10);
    expect(updated.y).toBe(0);
    expect(updated.bone.angle).toBe(Math.PI / 2);
    expect(updated.bone.scaleX).toBe(1);
    expect(updated.bone.scaleY).toBe(2);
    expect(updated.bone.length).toBe(0);
    expect(setBoneAngle(project, "missing", 1)).toBe(false);
  });

  it("reparents bones without losing nodes on invalid targets", () => {
    const child = bone({ id: "child", name: "Child" });
    const parent = bone({ id: "parent", name: "Parent", children: [child] });
    const other = bone({ id: "other", name: "Other" });
    const project = createProject({ layers: [parent, other] });

    expect(reparentBone(project, "parent", "child")).toBe(false);
    expect(project.layers).toHaveLength(2);
    expect(findLayerById(project.layers, "parent")).not.toBeNull();
    expect(reparentBone(project, "other", "missing")).toBe(false);
    expect(project.layers).toHaveLength(2);
    expect(reparentBone(project, "child", "other")).toBe(true);

    const otherNode = findLayerById(project.layers, "other") as BoneNode;
    expect(otherNode.children[0]?.id).toBe("child");
    expect((otherNode.children[0] as BoneNode).parentBoneId).toBe("other");
  });

  it("reparents bones to root and groups", () => {
    const child = bone({ id: "child", parentBoneId: "parent" });
    const parent = bone({ id: "parent", children: [child] });
    const targetGroup = group();
    const project = createProject({ layers: [parent, targetGroup] });

    expect(reparentBone(project, "child", null)).toBe(true);
    expect((findLayerById(project.layers, "child") as BoneNode).parentBoneId)
      .toBeUndefined();
    expect(reparentBone(project, "child", "group")).toBe(true);
    expect((findLayerById(project.layers, "child") as BoneNode).parentBoneId)
      .toBeUndefined();
    expect((findLayerById(project.layers, "group") as GroupNode).children[0]?.id)
      .toBe("child");
  });

  it("removes bones, promotes children, and cleans accessory-follow skins", () => {
    const child = bone({ id: "child", parentBoneId: "parent" });
    const parent = bone({ id: "parent", children: [child] });
    const project = createProject({
      layers: [parent],
      skins: {
        mesh: {
          weights: [],
          bindPoseInverse: {
            parent: [1, 0, 0, 1, 0, 0],
          },
          managedTag: "accessoryFollowRig:v1:mesh=mesh",
        },
      },
    });

    expect(removeBone(project, "parent")).toBe(true);
    expect(project.layers).toHaveLength(1);
    expect(project.layers[0]?.id).toBe("child");
    expect((project.layers[0] as BoneNode).parentBoneId).toBeUndefined();
    expect(project.skins.mesh).toBeUndefined();
    expect(removeBone(project, "missing")).toBe(false);
  });

  it("promotes removed children into the removed bone's previous parent", () => {
    const child = bone({ id: "child", parentBoneId: "parent" });
    const parent = bone({ id: "parent", parentBoneId: "grandparent", children: [child] });
    const grandparent = bone({ id: "grandparent", children: [parent] });
    const project = createProject({ layers: [grandparent] });

    expect(removeBone(project, "parent")).toBe(true);

    const grandparentNode = findLayerById(project.layers, "grandparent") as BoneNode;
    expect(project.layers).toHaveLength(1);
    expect(grandparentNode.children).toHaveLength(1);
    expect(grandparentNode.children[0]?.id).toBe("child");
    expect((grandparentNode.children[0] as BoneNode).parentBoneId).toBe("grandparent");
  });
});
