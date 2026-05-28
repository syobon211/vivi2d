import { describe, expect, it } from "vitest";
import type { BoneNode, ViviMeshNode } from "@vivi2d/core/types";
import {
  applySafeAutoSetupPlanToProject,
  applyAutoSetupMeshToLayer,
  applyAutoSetupSkinMetadata,
  remapAutoSetupWeightBoneIds,
} from "../auto-setup-apply-command";
import type { SafeAutoSetupPlan } from "../safe-auto-setup-plan";
import { createProject } from "./fixtures";

function createMesh(id: string): ViviMeshNode {
  return {
    id,
    name: id,
    kind: "viviMesh",
    visible: true,
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

function createBone(overrides: Partial<BoneNode> = {}): BoneNode {
  return {
    id: "bone",
    name: "Bone",
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

describe("editor-core Auto Setup apply helpers", () => {
  it("applies generated mesh data and managed metadata to a project layer", () => {
    const project = createProject({ layers: [createMesh("target")] });
    const applied = applyAutoSetupMeshToLayer(project, {
      layerId: "target",
      mesh: {
        vertices: [0, 0, 1, 1],
        uvs: [0, 0, 1, 1],
        indices: [0, 1],
        divisionsX: 1,
        divisionsY: 1,
      },
      managedTag: "safeAutoSetup:v1:mesh",
      managedSignature: "sig",
      managedSourceFingerprint: "sha256:test",
    });

    expect(applied).toBe(true);
    expect((project.layers[0] as ViviMeshNode).mesh.vertices).toEqual([0, 0, 1, 1]);
    expect(project.layers[0]).toMatchObject({
      managedTag: "safeAutoSetup:v1:mesh",
      managedSignature: "sig",
      managedSourceFingerprint: "sha256:test",
    });
  });

  it("remaps temporary weight bone ids and normalizes surviving weights", () => {
    const remapped = remapAutoSetupWeightBoneIds(
      {
        layerId: "target",
        boneIds: ["tmp-a", "missing"],
        weights: [
          [
            { boneId: "tmp-a", weight: 0.25 },
            { boneId: "missing", weight: 0.75 },
          ],
        ],
      },
      new Map([["tmp-a", "bone-a"]]),
    );

    expect(remapped).toEqual({
      layerId: "target",
      boneIds: ["bone-a"],
      weights: [[{ boneId: "bone-a", weight: 1 }]],
    });
  });

  it("applies managed metadata to an existing generated skin", () => {
    const project = createProject({
      skins: {
        target: {
          weights: [],
          bindPoseInverse: {},
        },
      },
    });

    const applied = applyAutoSetupSkinMetadata(project, {
      layerId: "target",
      managedTag: "safeAutoSetup:v1:skin",
      managedSignature: "skin-sig",
      managedSourceFingerprint: "sha256:test",
    });

    expect(applied).toBe(true);
    expect(project.skins.target).toMatchObject({
      managedTag: "safeAutoSetup:v1:skin",
      managedSignature: "skin-sig",
      managedSourceFingerprint: "sha256:test",
    });
  });

  it("clears omitted managed skin metadata fields to preserve replacement semantics", () => {
    const project = createProject({
      skins: {
        target: {
          weights: [],
          bindPoseInverse: {},
          managedTag: "previous-tag",
          managedSignature: "previous-signature",
          managedSourceFingerprint: "previous-source",
        },
      },
    });

    const applied = applyAutoSetupSkinMetadata(project, {
      layerId: "target",
      managedTag: "next-tag",
    });

    expect(applied).toBe(true);
    expect(project.skins.target).toMatchObject({
      managedTag: "next-tag",
      managedSignature: undefined,
      managedSourceFingerprint: undefined,
    });
  });

  it("returns false when generated skin metadata has no target skin", () => {
    const project = createProject({
      skins: {},
    });

    expect(
      applyAutoSetupSkinMetadata(project, {
        layerId: "missing",
        managedTag: "safeAutoSetup:v1:skin",
      }),
    ).toBe(false);
  });

  it("applies a safe plan without depending on UI stores", () => {
    const project = createProject({ layers: [createMesh("mesh-a")] });
    const mesh = {
      vertices: [0, 0, 10, 0, 0, 10, 10, 10],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 2, 1, 3, 2],
      divisionsX: 1,
      divisionsY: 1,
    };
    const plan: SafeAutoSetupPlan = {
      planVersion: 1,
      profile: "safeAutoSetupV1",
      sourceFingerprint: "fingerprint-a",
      diagnostics: [],
      operations: [
        {
          kind: "addBone",
          tempId: "tmp-body",
          name: "Body",
          x: 4,
          y: 8,
          managedTag: "safeAutoSetup:v1:bone:body",
          managedSignature: "body-sig",
        },
        {
          kind: "addBone",
          tempId: "tmp-head",
          name: "Head",
          x: 4,
          y: 2,
          managedTag: "safeAutoSetup:v1:bone:head",
          managedSignature: "head-sig",
        },
        {
          kind: "parentBone",
          childTempId: "tmp-head",
          parentTempId: "tmp-body",
        },
        {
          kind: "createParameter",
          parameter: {
            id: "param-face-x",
            name: "Face X",
            minValue: -1,
            maxValue: 1,
            defaultValue: 0,
            group: "Face",
            managedTag: "safeAutoSetup:v1:parameter:face-x",
            managedSignature: "parameter-sig",
          },
        },
        {
          kind: "createPhysicsGroup",
          group: {
            name: "Hair Sway",
            partCategory: "hair",
            layerIds: [],
            stiffness: 0.3,
            gravity: 0.5,
            damping: 0.4,
            managedTag: "safeAutoSetup:v1:physics:hair",
            managedSignature: "physics-sig",
          },
        },
        {
          kind: "createMesh",
          layerId: "mesh-a",
          layerName: "Mesh A",
          mesh,
          algorithm: "alphaBoundary",
          managedTag: "safeAutoSetup:v1:mesh:mesh-a",
          managedSignature: "mesh-sig",
        },
        {
          kind: "createSkin",
          layerId: "mesh-a",
          solver: "rigidLayer",
          boneIds: ["tmp-body", "tmp-head"],
          weights: [
            [{ boneId: "tmp-body", weight: 1 }],
            [{ boneId: "tmp-head", weight: 1 }],
            [
              { boneId: "tmp-body", weight: 0.25 },
              { boneId: "tmp-head", weight: 0.75 },
            ],
            [],
          ],
          managedTag: "safeAutoSetup:v1:skin:mesh-a",
        },
        {
          kind: "createBinding",
          parameterId: "param-face-x",
          target: { type: "bone", tempBoneId: "tmp-head", property: "x" },
          bindingPoints: [
            { paramValue: -1, targetValue: -2 },
            { paramValue: 1, targetValue: 2 },
          ],
          managedTag: "safeAutoSetup:v1:binding:face-x",
        },
      ],
    };
    const ids = ["bone-body", "bone-head", "physics-hair", "binding-face-x"];

    const result = applySafeAutoSetupPlanToProject(project, plan, {
      createId: () => ids.shift() ?? "fallback-id",
    });

    const body = project.layers.find((layer) => layer.id === "bone-body");
    const head = body?.children.find((layer) => layer.id === "bone-head");
    expect(result).toMatchObject({
      skippedManagedObjects: [],
      appliedMeshOrWeightChanges: true,
    });
    expect(body).toMatchObject({
      kind: "bone",
      managedSourceFingerprint: "fingerprint-a",
    });
    expect(head).toMatchObject({
      kind: "bone",
      parentBoneId: "bone-body",
    });
    expect(project.parameters[0]).toMatchObject({
      id: "param-face-x",
      managedSourceFingerprint: "fingerprint-a",
    });
    expect(project.physicsGroups[0]).toMatchObject({
      id: "physics-hair",
      managedSourceFingerprint: "fingerprint-a",
    });
    expect(project.skins["mesh-a"]?.weights[0]).toEqual([
      { boneId: "bone-body", weight: 1 },
    ]);
    expect(project.skins["mesh-a"]?.weights[1]).toEqual([
      { boneId: "bone-head", weight: 1 },
    ]);
    expect(project.skins["mesh-a"]?.weights[2]).toEqual([
      { boneId: "bone-body", weight: 0.25 },
      { boneId: "bone-head", weight: 0.75 },
    ]);
    expect(project.skins["mesh-a"]?.weights[3]).toEqual([
      { boneId: "bone-body", weight: 0.5 },
      { boneId: "bone-head", weight: 0.5 },
    ]);
    expect(project.parameterBindings?.[0]).toMatchObject({
      id: "binding-face-x",
      parameterId: "param-face-x",
      target: { type: "bone", boneId: "bone-head", property: "x" },
      managedSourceFingerprint: "fingerprint-a",
    });
  });

  it("keeps mesh change reporting false when the target layer is missing", () => {
    const project = createProject();
    const plan: SafeAutoSetupPlan = {
      planVersion: 1,
      profile: "safeAutoSetupV1",
      sourceFingerprint: "fingerprint-a",
      diagnostics: [],
      operations: [
        {
          kind: "createMesh",
          layerId: "missing",
          layerName: "Missing",
          mesh: {
            vertices: [0, 0],
            uvs: [0, 0],
            indices: [0],
            divisionsX: 0,
            divisionsY: 0,
          },
          algorithm: "alphaBoundary",
        },
      ],
    };

    expect(applySafeAutoSetupPlanToProject(project, plan)).toEqual({
      skippedManagedObjects: [],
      appliedMeshOrWeightChanges: false,
    });
  });

  it("keeps user-modified managed bones available to dependent bindings", () => {
    const project = createProject({
      layers: [
        createBone({
          id: "bone-existing",
          name: "Head",
          x: 11,
          y: 2,
          managedTag: "safeAutoSetup:v1:bone:head",
          managedSourceFingerprint: "fingerprint-a",
        }),
      ],
    });
    const plan: SafeAutoSetupPlan = {
      planVersion: 1,
      profile: "safeAutoSetupV1",
      sourceFingerprint: "fingerprint-a",
      diagnostics: [],
      operations: [
        {
          kind: "addBone",
          tempId: "tmp-head",
          name: "Head",
          x: 10,
          y: 2,
          managedTag: "safeAutoSetup:v1:bone:head",
          managedSignature: "head-sig",
        },
        {
          kind: "createParameter",
          parameter: {
            id: "param-face-x",
            name: "Face X",
            minValue: -1,
            maxValue: 1,
            defaultValue: 0,
          },
        },
        {
          kind: "createBinding",
          parameterId: "param-face-x",
          target: { type: "bone", tempBoneId: "tmp-head", property: "x" },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
      ],
    };

    const result = applySafeAutoSetupPlanToProject(project, plan, {
      createId: () => "binding-id",
    });

    expect(result.skippedManagedObjects).toEqual([
      "userModified:safeAutoSetup:v1:bone:head",
    ]);
    expect(project.layers).toHaveLength(1);
    expect(project.parameterBindings?.[0]?.target).toEqual({
      type: "bone",
      boneId: "bone-existing",
      property: "x",
    });
  });

  it("replaces unmanaged existing skin data instead of treating it as a mismatch", () => {
    const project = createProject({
      layers: [
        {
          ...createMesh("mesh-a"),
          mesh: {
            vertices: [0, 0],
            uvs: [0, 0],
            indices: [0],
            divisionsX: 0,
            divisionsY: 0,
          },
        },
      ],
      skins: {
        "mesh-a": {
          weights: [[{ boneId: "old-bone", weight: 1 }]],
          bindPoseInverse: {},
        },
      },
    });
    const plan: SafeAutoSetupPlan = {
      planVersion: 1,
      profile: "safeAutoSetupV1",
      sourceFingerprint: "fingerprint-a",
      diagnostics: [],
      operations: [
        {
          kind: "addBone",
          tempId: "tmp-head",
          name: "Head",
          x: 5,
          y: 5,
        },
        {
          kind: "createSkin",
          layerId: "mesh-a",
          solver: "rigidLayer",
          boneIds: ["tmp-head"],
          weights: [[{ boneId: "tmp-head", weight: 1 }]],
        },
      ],
    };

    const result = applySafeAutoSetupPlanToProject(project, plan, {
      createId: () => "bone-head",
    });

    expect(result.skippedManagedObjects).toEqual([]);
    expect(result.appliedMeshOrWeightChanges).toBe(true);
    expect(project.skins["mesh-a"]?.weights[0]).toEqual([
      { boneId: "bone-head", weight: 1 },
    ]);
  });
});
