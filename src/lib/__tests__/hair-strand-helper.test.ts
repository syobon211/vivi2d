import type { BoneNode, PhysicsGroup, ProjectData } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { applyHairStrandHelper } from "@/lib/hair-strand-helper";
import { createBoneNode, createProject } from "@/test/fixtures";

function createBoneChainProject(): {
  project: ProjectData;
  root: BoneNode;
  mid: BoneNode;
  tip: BoneNode;
} {
  const root = createBoneNode({ id: "bone-root", name: "Root" });
  const mid = createBoneNode({
    id: "bone-mid",
    name: "Mid",
    parentBoneId: root.id,
    bone: { angle: 0, length: 40, scaleX: 1, scaleY: 1 },
  });
  const tip = createBoneNode({
    id: "bone-tip",
    name: "Tip",
    parentBoneId: mid.id,
    bone: { angle: 0, length: 30, scaleX: 1, scaleY: 1 },
  });
  return {
    project: createProject({ layers: [root, mid, tip], physicsGroups: [] }),
    root,
    mid,
    tip,
  };
}

function getOnlyGroup(project: ProjectData): PhysicsGroup {
  const group = project.physicsGroups[0];
  if (!group) {
    throw new Error("Expected a physics group");
  }
  return group;
}

describe("hair-strand-helper", () => {
  it("creates a managed physics group for a valid tip bone", () => {
    const { project, root, mid, tip } = createBoneChainProject();

    const result = applyHairStrandHelper(project, tip.id, "generic");

    expect(result.status).toBe("created");
    expect(project.physicsGroups).toHaveLength(1);

    const group = getOnlyGroup(project);
    expect(group.managedTag).toBe(`hairStrandHelper:v1:tip=${tip.id}`);
    expect(group.managedSignature).toBe([root.id, mid.id, tip.id].join(">"));
    expect(group.outputs.map((output) => output.boneId)).toEqual([
      root.id,
      mid.id,
      tip.id,
    ]);
    expect(group.pendulums).toHaveLength(3);
  });

  it("rejects a non-leaf bone selection", () => {
    const { project, mid } = createBoneChainProject();

    const result = applyHairStrandHelper(project, mid.id, "generic");

    expect(result).toEqual({ status: "rejected", reason: "nonLeafBone" });
    expect(project.physicsGroups).toHaveLength(0);
  });

  it("rejects chains shorter than two bones", () => {
    const root = createBoneNode({ id: "solo-root", name: "Solo Root" });
    const project = createProject({ layers: [root], physicsGroups: [] });

    const result = applyHairStrandHelper(project, root.id, "generic");

    expect(result).toEqual({ status: "rejected", reason: "chainTooShort" });
    expect(project.physicsGroups).toHaveLength(0);
  });

  it("re-applies on the same chain without rebuilding the managed group", () => {
    const { project, root, mid, tip } = createBoneChainProject();
    applyHairStrandHelper(project, tip.id, "generic");
    const group = getOnlyGroup(project);
    const originalId = group.id;
    group.name = "Custom Hair Group";
    group.wind = 2;
    group.inputs.push({ parameterId: "param-x", type: "x", weight: 0.5 });
    group.outputs.push({
      parameterId: "param-angle",
      type: "angle",
      pendulumIndex: 0,
      weight: 0.25,
    });

    const result = applyHairStrandHelper(project, tip.id, "front");

    expect(result.status).toBe("updated");
    const updatedGroup = getOnlyGroup(project);
    expect(updatedGroup.id).toBe(originalId);
    expect(updatedGroup.name).toBe("Custom Hair Group");
    expect(updatedGroup.wind).toBe(2);
    expect(updatedGroup.inputs).toHaveLength(1);
    expect(updatedGroup.outputs).toEqual([
      { parameterId: "param-angle", type: "angle", pendulumIndex: 0, weight: 0.25 },
      { type: "boneAngle", boneId: root.id, pendulumIndex: 0, weight: 1 },
      { type: "boneAngle", boneId: mid.id, pendulumIndex: 1, weight: 1 },
      { type: "boneAngle", boneId: tip.id, pendulumIndex: 2, weight: 1 },
    ]);
    expect(updatedGroup.gravityStrength).toBe(7.5);
    expect(updatedGroup.pendulums[0]?.damping).toBe(0.12);
  });

  it("rebuilds the managed group in place when the strand topology changes", () => {
    const { project, root, tip } = createBoneChainProject();
    applyHairStrandHelper(project, tip.id, "generic");
    const group = getOnlyGroup(project);
    const originalId = group.id;

    const newMid = createBoneNode({
      id: "bone-mid-2",
      name: "Mid 2",
      parentBoneId: root.id,
      bone: { angle: 0, length: 25, scaleX: 1, scaleY: 1 },
    });
    const tipNode = project.layers.find(
      (layer): layer is BoneNode => layer.id === tip.id && layer.kind === "bone",
    );
    if (!tipNode) throw new Error("Expected tip bone");
    tipNode.parentBoneId = newMid.id;
    project.layers.splice(1, 0, newMid);

    const result = applyHairStrandHelper(project, tip.id, "back");

    expect(result.status).toBe("rebuilt");
    const rebuiltGroup = getOnlyGroup(project);
    expect(rebuiltGroup.id).toBe(originalId);
    expect(rebuiltGroup.managedSignature).toBe([root.id, newMid.id, tip.id].join(">"));
    expect(rebuiltGroup.outputs.map((output) => output.boneId)).toEqual([
      root.id,
      newMid.id,
      tip.id,
    ]);
    expect(rebuiltGroup.pendulums).toHaveLength(3);
    expect(rebuiltGroup.gravityStrength).toBe(11);
  });

  it("rejects duplicate managed groups for the same tip", () => {
    const { project, root, mid, tip } = createBoneChainProject();
    project.physicsGroups.push(
      {
        id: "group-1",
        name: "Helper 1",
        enabled: true,
        managedTag: `hairStrandHelper:v1:tip=${tip.id}`,
        managedSignature: [root.id, mid.id, tip.id].join(">"),
        pendulums: [{ length: 1, mass: 1, damping: 0.1 }],
        inputs: [],
        outputs: [],
        gravityDirection: 0,
        gravityStrength: 9.8,
        wind: 0,
      },
      {
        id: "group-2",
        name: "Helper 2",
        enabled: true,
        managedTag: `hairStrandHelper:v1:tip=${tip.id}`,
        managedSignature: [root.id, mid.id, tip.id].join(">"),
        pendulums: [{ length: 1, mass: 1, damping: 0.1 }],
        inputs: [],
        outputs: [],
        gravityDirection: 0,
        gravityStrength: 9.8,
        wind: 0,
      },
    );

    const result = applyHairStrandHelper(project, tip.id, "generic");

    expect(result.status).toBe("rejected");
    expect(result.reason).toBe("duplicateManagedGroup");
  });

  it("rejects a new helper when another managed helper already drives part of the chain", () => {
    const root = createBoneNode({ id: "root", name: "Root" });
    const leftTip = createBoneNode({
      id: "left-tip",
      name: "Left Tip",
      parentBoneId: root.id,
      bone: { angle: 0, length: 35, scaleX: 1, scaleY: 1 },
    });
    const rightTip = createBoneNode({
      id: "right-tip",
      name: "Right Tip",
      parentBoneId: root.id,
      bone: { angle: 0, length: 35, scaleX: 1, scaleY: 1 },
    });
    const project = createProject({
      layers: [root, leftTip, rightTip],
      physicsGroups: [],
    });
    expect(applyHairStrandHelper(project, leftTip.id, "generic").status).toBe("created");

    const result = applyHairStrandHelper(project, rightTip.id, "generic");

    expect(result.status).toBe("rejected");
    expect(result.reason).toBe("overlappingManagedGroup");
    expect(project.physicsGroups).toHaveLength(1);
  });
});
