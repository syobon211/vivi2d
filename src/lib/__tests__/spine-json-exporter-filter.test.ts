import { describe, expect, it } from "vitest";
import { exportSpineJson } from "@vivi2d/editor-core/spine-export-command";
import {
  createAnimationClip,
  createViviMesh,
  createBoneNode,
  createEmptyProject,
} from "@/test/fixtures";

describe("exportSpineJson — レイヤーフィルタ", () => {
  it("指定したViviMeshのみがスロットとスキンに含まれる", () => {
    const meshA = createViviMesh({ name: "顔" });
    const meshB = createViviMesh({ name: "体" });
    const meshC = createViviMesh({ name: "背景" });
    const project = createEmptyProject();
    project.layers = [meshA, meshB, meshC];

    const filter = new Set([meshA.id, meshB.id]);
    const { json } = exportSpineJson(project, [], filter);

    expect(json.slots).toHaveLength(2);
    expect(json.slots.map((s) => s.name)).toEqual(["顔", "体"]);

    const skinAttachments = Object.keys(json.skins[0]!.attachments);
    expect(skinAttachments).toHaveLength(2);
    expect(skinAttachments).toContain("顔");
    expect(skinAttachments).toContain("体");
    expect(skinAttachments).not.toContain("背景");
  });

  it("フィルタ未指定時は全ViviMeshが含まれる", () => {
    const meshA = createViviMesh({ name: "顔" });
    const meshB = createViviMesh({ name: "体" });
    const project = createEmptyProject();
    project.layers = [meshA, meshB];

    const { json } = exportSpineJson(project, []);
    expect(json.slots).toHaveLength(2);
  });

  it("フィルタ対象のViviMeshの親ボーンが自動的に含まれる", () => {
    const mesh = createViviMesh({ name: "手テクスチャ" });
    const hand = createBoneNode({ name: "手", children: [mesh] });
    const arm = createBoneNode({ name: "腕", children: [hand] });
    const project = createEmptyProject();
    project.layers = [arm];

    const filter = new Set([mesh.id]);
    const { json } = exportSpineJson(project, [], filter);

    const boneNames = json.bones.map((b) => b.name);
    expect(boneNames).toContain("root");
    expect(boneNames).toContain("腕");
    expect(boneNames).toContain("手");
  });

  it("フィルタ対象外のViviMeshの親ボーンは含まれない", () => {
    const meshA = createViviMesh({ name: "顔" });
    const headBone = createBoneNode({ name: "頭", children: [meshA] });
    const meshB = createViviMesh({ name: "足" });
    const legBone = createBoneNode({ name: "足ボーン", children: [meshB] });
    const project = createEmptyProject();
    project.layers = [headBone, legBone];

    const filter = new Set([meshA.id]);
    const { json } = exportSpineJson(project, [], filter);

    const boneNames = json.bones.map((b) => b.name);
    expect(boneNames).toContain("頭");
    expect(boneNames).not.toContain("足ボーン");
  });

  it("空のフィルタはViviMeshもボーンも空になる", () => {
    const mesh = createViviMesh({ name: "顔" });
    const bone = createBoneNode({ name: "頭", children: [mesh] });
    const project = createEmptyProject();
    project.layers = [bone];

    const filter = new Set<string>();
    const { json } = exportSpineJson(project, [], filter);

    expect(json.slots).toHaveLength(0);
    expect(json.bones).toHaveLength(1);
    expect(json.bones[0]!.name).toBe("root");
  });

  it("フィルタはアニメーションには影響しない（クリップは別フィルタ）", () => {
    const bone = createBoneNode({ name: "頭" });
    const mesh = createViviMesh({ name: "顔" });
    bone.children = [mesh];
    const project = createEmptyProject();
    project.layers = [bone];

    const clip = createAnimationClip({
      name: "うなずき",
      boneTracks: [
        {
          boneId: bone.id,
          property: "angle",
          keyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 15, value: 0.5, interpolation: "linear" },
          ],
        },
      ],
    });

    const filter = new Set([mesh.id]);
    const { json } = exportSpineJson(project, [clip], filter);

    expect(json.animations.うなずき).toBeDefined();
    expect(json.animations.うなずき!.bones?.頭?.rotate).toHaveLength(2);
  });
});
