import { describe, expect, it } from "vitest";
import { findSecondaryPhysicsTipBoneId } from "@/lib/secondary-physics-quick-action";
import { createBoneNode, createProject } from "@/test/fixtures";

describe("findSecondaryPhysicsTipBoneId", () => {
  it("prefers a leaf bone with a hair-like name", () => {
    const root = createBoneNode({ id: "root", name: "Root" });
    const armTip = createBoneNode({
      id: "arm-tip",
      name: "Hand Tip",
      parentBoneId: root.id,
    });
    const hairMid = createBoneNode({
      id: "hair-mid",
      name: "Hair Mid",
      parentBoneId: root.id,
    });
    const hairTip = createBoneNode({
      id: "hair-tip",
      name: "Hair Tip",
      parentBoneId: hairMid.id,
    });
    const project = createProject({ layers: [root, armTip, hairMid, hairTip] });

    expect(findSecondaryPhysicsTipBoneId(project)).toBe("hair-tip");
  });

  it("falls back to the only leaf bone when there is no hair-like name", () => {
    const root = createBoneNode({ id: "root", name: "Root" });
    const tip = createBoneNode({
      id: "tip",
      name: "Tip",
      parentBoneId: root.id,
    });
    const project = createProject({ layers: [root, tip] });

    expect(findSecondaryPhysicsTipBoneId(project)).toBe("tip");
  });

  it("returns null when multiple generic leaf bones exist", () => {
    const root = createBoneNode({ id: "root", name: "Root" });
    const tipA = createBoneNode({
      id: "tip-a",
      name: "Leaf A",
      parentBoneId: root.id,
    });
    const tipB = createBoneNode({
      id: "tip-b",
      name: "Leaf B",
      parentBoneId: root.id,
    });
    const project = createProject({ layers: [root, tipA, tipB] });

    expect(findSecondaryPhysicsTipBoneId(project)).toBeNull();
  });
});
