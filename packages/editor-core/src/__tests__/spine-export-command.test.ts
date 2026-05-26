import type { AnimationClip, BoneNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { exportSpineJson } from "../spine-export-command";
import { createProject, createViviMesh } from "./fixtures";

function createBone(
  id: string,
  name = id,
  children: BoneNode["children"] = [],
): BoneNode {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    x: 10,
    y: 20,
    width: 10,
    height: 10,
    children,
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    bone: { angle: Math.PI / 2, length: 12, scaleX: 1, scaleY: 1 },
  };
}

function createClip(overrides: Partial<AnimationClip> = {}): AnimationClip {
  return {
    id: "clip",
    name: "idle",
    duration: 60,
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

describe("spine export command", () => {
  it("exports filtered meshes with only their relevant parent bones", () => {
    const face = createViviMesh({
      id: "face",
      name: "Face",
      drawOrder: 2,
      mesh: {
        vertices: [0, 0, 10, 0, 10, 10],
        uvs: [0, 0, 1, 0, 1, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    const body = createViviMesh({ id: "body", name: "Body", drawOrder: 1 });
    const headBone = createBone("head", "Head", [face]);
    const bodyBone = createBone("body-bone", "BodyBone", [body]);
    const project = createProject({
      name: "Filtered Model",
      width: 640,
      height: 480,
      layers: [headBone, bodyBone],
    });

    const { json, warnings } = exportSpineJson(
      project,
      [createClip()],
      new Set(["face"]),
    );

    expect(warnings).toEqual([]);
    expect(json.skeleton).toMatchObject({
      width: 640,
      height: 480,
      images: "./images/",
      audio: "",
    });
    expect(json.slots).toEqual([
      { name: "Face", bone: "Head", attachment: "Face" },
    ]);
    expect(json.bones.map((bone) => bone.name)).toEqual(["root", "Head"]);
    expect(json.bones[1]).toMatchObject({ rotation: 90, length: 12 });
    expect(Object.keys(json.skins[0]!.attachments)).toEqual(["Face"]);
    expect(json.skins[0]!.attachments.Face!.Face!.vertices).toEqual([
      0, 0, 10, 0, 10, 10,
    ]);
  });

  it("exports every mesh without a layer filter and keeps draw-order sorting", () => {
    const front = createViviMesh({ id: "front", name: "Front", drawOrder: 20 });
    const back = createViviMesh({ id: "back", name: "Back", drawOrder: 10 });
    const project = createProject({
      layers: [createBone("root-bone", "RootBone", [front, back])],
    });

    const { json } = exportSpineJson(project, []);

    expect(json.slots.map((slot) => slot.name)).toEqual(["Back", "Front"]);
    expect(Object.keys(json.skins[0]!.attachments).sort()).toEqual([
      "Back",
      "Front",
    ]);
    expect(json.bones.map((bone) => bone.name)).toEqual(["root", "RootBone"]);
  });

  it("keeps ancestor bone chains for filtered grandchild meshes", () => {
    const face = createViviMesh({ id: "face", name: "Face" });
    const hand = createViviMesh({ id: "hand", name: "Hand" });
    const childBone = createBone("child", "Child", [face]);
    const parentBone = createBone("parent", "Parent", [childBone]);
    const unrelatedBone = createBone("unrelated", "Unrelated", [hand]);
    const project = createProject({ layers: [parentBone, unrelatedBone] });

    const { json } = exportSpineJson(project, [], new Set(["face"]));

    expect(json.slots).toEqual([
      { name: "Face", bone: "Child", attachment: "Face" },
    ]);
    expect(json.bones.map((bone) => bone.name)).toEqual(["root", "Parent", "Child"]);
  });

  it("converts bone animation keyframes and reports missing bone tracks", () => {
    const bone = createBone("head", "Head");
    const project = createProject({ layers: [bone] });
    const clip = createClip({
      name: "nod",
      boneTracks: [
        {
          boneId: "head",
          property: "angle",
          keyframes: [
            { frame: 0, value: 0, interpolation: "step" },
            {
              frame: 15,
              value: Math.PI,
              interpolation: "bezier",
              cp1x: 0.2,
              cp1y: 0.1,
              cp2x: 0.8,
              cp2y: 0.9,
            },
          ],
        },
        {
          boneId: "missing",
          property: "scaleX",
          keyframes: [{ frame: 0, value: 1, interpolation: "linear" }],
        },
      ],
    });

    const { json, warnings } = exportSpineJson(project, [clip]);

    expect(warnings).toEqual([
      'Bone id "missing" was not found for clip "nod".',
    ]);
    expect(json.animations.nod?.bones?.Head?.rotate).toEqual([
      { time: 0, angle: 0, curve: "stepped" },
      { time: 0.5, angle: 180, curve: [0.2, 0.1, 0.8, 0.9] },
    ]);
  });

  it("merges scaleX and scaleY tracks without forcing uniform scale", () => {
    const bone = createBone("head", "Head");
    const project = createProject({ layers: [bone] });
    const clip = createClip({
      name: "squash",
      boneTracks: [
        {
          boneId: "head",
          property: "scaleX",
          keyframes: [
            { frame: 0, value: 1.2, interpolation: "linear" },
            { frame: 15, value: 1.5, interpolation: "linear" },
          ],
        },
        {
          boneId: "head",
          property: "scaleY",
          keyframes: [
            { frame: 0, value: 0.8, interpolation: "linear" },
            { frame: 30, value: 0.6, interpolation: "linear" },
          ],
        },
      ],
    });

    const { json } = exportSpineJson(project, [clip]);

    expect(json.animations.squash?.bones?.Head?.scale).toEqual([
      { time: 0, x: 1.2, y: 0.8 },
      { time: 0.5, x: 1.5 },
      { time: 1, y: 0.6 },
    ]);
  });

  it("warns when merged scale axes have conflicting curves at the same frame", () => {
    const bone = createBone("head", "Head");
    const project = createProject({ layers: [bone] });
    const clip = createClip({
      name: "curve-conflict",
      boneTracks: [
        {
          boneId: "head",
          property: "scaleX",
          keyframes: [
            {
              frame: 0,
              value: 1.2,
              interpolation: "bezier",
              cp1x: 0.1,
              cp1y: 0.2,
              cp2x: 0.3,
              cp2y: 0.4,
            },
          ],
        },
        {
          boneId: "head",
          property: "scaleY",
          keyframes: [
            {
              frame: 0,
              value: 0.8,
              interpolation: "bezier",
              cp1x: 0.5,
              cp1y: 0.6,
              cp2x: 0.7,
              cp2y: 0.8,
            },
          ],
        },
      ],
    });

    const { json, warnings } = exportSpineJson(project, [clip]);

    expect(warnings).toEqual([
      'Scale curve conflict at frame 0 for bone "Head" in clip "curve-conflict". Keeping the first curve.',
    ]);
    expect(json.animations["curve-conflict"]?.bones?.Head?.scale).toEqual([
      { time: 0, x: 1.2, y: 0.8, curve: [0.1, 0.2, 0.3, 0.4] },
    ]);
  });

  it("copies mesh arrays instead of exposing project-owned references", () => {
    const mesh = createViviMesh({
      id: "mesh",
      name: "Mesh",
      mesh: {
        vertices: [0, 0, 1, 0, 0, 1],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    const project = createProject({ layers: [mesh] });

    const { json } = exportSpineJson(project, []);

    mesh.mesh.vertices[0] = 99;
    mesh.mesh.uvs[0] = 99;
    mesh.mesh.indices[0] = 99;

    const attachment = json.skins[0]!.attachments.Mesh!.Mesh!;
    expect(attachment.vertices).toEqual([0, 0, 1, 0, 0, 1]);
    expect(attachment.uvs).toEqual([0, 0, 1, 0, 0, 1]);
    expect(attachment.triangles).toEqual([0, 1, 2]);
  });
});
