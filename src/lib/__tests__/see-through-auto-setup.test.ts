import type { LayerSemanticRole } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import type { GeneratedBone } from "@/lib/ai-bone-generator";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import {
  buildSeeThroughRigidWeightBindings,
  buildSeeThroughMotionRiskReport,
  buildSeeThroughSecondaryMotionBones,
  buildSeeThroughSecondaryMotionWeightBindings,
  summarizeSeeThroughAutoSetup,
} from "../see-through-auto-setup";

function createImportedMesh(id: string, semanticRole?: LayerSemanticRole, label = id) {
  return createViviMesh({
    id,
    name: id,
    semanticRole,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence: 0.9,
        leftRightSplit: "center",
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

describe("summarizeSeeThroughAutoSetup", () => {
  it("recognizes a See-through project and counts known roles", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("face", "face"),
      createImportedMesh("eye-left", "eyeLeft"),
      createImportedMesh("eye-right", "eyeRight"),
      createImportedMesh("mouth", "mouth"),
      createImportedMesh("body", "body"),
    ];

    const summary = summarizeSeeThroughAutoSetup(project);

    expect(summary.isSeeThroughProject).toBe(true);
    expect(summary.importedViviMeshCount).toBe(5);
    expect(summary.classifiedViviMeshCount).toBe(5);
    expect(summary.unknownRoleCount).toBe(0);
    expect(summary.warnings).toEqual([]);
  });

  it("reports missing critical roles", () => {
    const project = createEmptyProject();
    project.layers = [createImportedMesh("hair-front", "hairFront")];

    const summary = summarizeSeeThroughAutoSetup(project);

    expect(summary.missingCriticalRoles).toEqual(
      expect.arrayContaining(["head", "face", "eyeLeft", "eyeRight", "mouth", "body"]),
    );
    expect(summary.warnings).toEqual(
      expect.arrayContaining([
        "Face/head layers are missing.",
        "One or both eye layers are missing.",
        "Mouth layers are missing.",
        "Body layers are missing.",
      ]),
    );
  });

  it("recommends excluding accessory and unknown imported ViviMeshes", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("acc", "accessory"),
      createImportedMesh("unknown", "unknown"),
      createImportedMesh("unassigned"),
      createImportedMesh("body", "body"),
    ];

    const summary = summarizeSeeThroughAutoSetup(project);

    expect(summary.accessoryCount).toBe(1);
    expect(summary.unknownRoleCount).toBe(2);
    expect(summary.recommendedExcludedLayerIds).toEqual(["acc", "unknown", "unassigned"]);
  });

  it("stays inactive for non See-through projects", () => {
    const project = createEmptyProject();
    project.layers = [
      createViviMesh({ id: "plain", name: "plain", semanticRole: "face" }),
    ];

    const summary = summarizeSeeThroughAutoSetup(project);

    expect(summary).toEqual({
      isSeeThroughProject: false,
      importedViviMeshCount: 0,
      classifiedViviMeshCount: 0,
      unknownRoleCount: 0,
      accessoryCount: 0,
      missingCriticalRoles: [],
      warnings: [],
      recommendedExcludedLayerIds: [],
    });
  });
});

describe("buildSeeThroughRigidWeightBindings", () => {
  const bones: GeneratedBone[] = [
    {
      tempId: "bone_body",
      name: "Body",
      parentTempId: null,
      x: 50,
      y: 80,
      partCategory: "body",
    },
    {
      tempId: "bone_head",
      name: "Head",
      parentTempId: "bone_body",
      x: 50,
      y: 20,
      partCategory: "head",
    },
    {
      tempId: "bone_eye_left",
      name: "Eye Left",
      parentTempId: "bone_head",
      x: 40,
      y: 18,
      partCategory: "eyeLeft",
    },
    {
      tempId: "bone_mouth",
      name: "Mouth",
      parentTempId: "bone_head",
      x: 50,
      y: 32,
      partCategory: "mouth",
    },
  ];

  it("binds see-through facial layers to rigid facial controls", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("face", "face"),
      createImportedMesh("eye-left", "eyeLeft"),
      createImportedMesh("mouth", "mouth"),
      createImportedMesh("body", "body"),
    ];

    expect(buildSeeThroughRigidWeightBindings(project, bones)).toEqual({
      face: "bone_head",
      "eye-left": "bone_eye_left",
      mouth: "bone_mouth",
      body: "bone_body",
    });
  });

  it("uses see-through labels for role cleanup gaps and falls back to head", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("nose"),
      createImportedMesh("eye-right", undefined, "eye_white_right"),
    ];

    expect(buildSeeThroughRigidWeightBindings(project, bones)).toEqual({
      nose: "bone_head",
      "eye-right": "bone_head",
    });
  });
});

describe("see-through secondary motion helpers", () => {
  const primaryBones: GeneratedBone[] = [
    {
      tempId: "bone_body",
      name: "Body",
      parentTempId: null,
      x: 500,
      y: 650,
      partCategory: "body",
    },
    {
      tempId: "bone_head",
      name: "Head",
      parentTempId: "bone_body",
      x: 500,
      y: 260,
      partCategory: "head",
    },
  ];

  it("creates root/mid/tip bones for imported hair and tail layers", () => {
    const project = createEmptyProject();
    project.width = 1000;
    project.height = 1000;
    project.layers = [
      createImportedMesh("front-hair", "hairFront"),
      createImportedMesh("tail", "tail"),
      createImportedMesh("face", "face"),
    ];

    const secondaryBones = buildSeeThroughSecondaryMotionBones(project, primaryBones);
    const frontHairRoot = secondaryBones.find(
      (bone) => bone.tempId === "bone_secondary_front-hair_root",
    );
    const frontHairTip = secondaryBones.find(
      (bone) => bone.tempId === "bone_secondary_front-hair_tip",
    );

    expect(secondaryBones.map((bone) => bone.tempId)).toEqual(
      expect.arrayContaining([
        "bone_secondary_front-hair_root",
        "bone_secondary_front-hair_mid",
        "bone_secondary_front-hair_tip",
        "bone_secondary_tail_root",
        "bone_secondary_tail_mid",
        "bone_secondary_tail_tip",
      ]),
    );
    expect(frontHairRoot?.parentTempId).toBeNull();
    expect(
      secondaryBones.find((bone) => bone.tempId === "bone_secondary_front-hair_mid")
        ?.parentTempId,
    ).toBeNull();
    expect(frontHairTip?.parentTempId).toBeNull();
    expect(
      secondaryBones.find((bone) => bone.tempId === "bone_secondary_tail_root")
        ?.parentTempId,
    ).toBeNull();
    expect(frontHairRoot?.y).toBeCloseTo(5);
    expect(frontHairTip?.y).toBeCloseTo(94);
  });

  it("returns tapered weight bindings for the generated secondary chains", () => {
    const project = createEmptyProject();
    project.width = 1000;
    project.layers = [
      createImportedMesh("front-hair", "hairFront"),
      createImportedMesh("tail", "tail"),
    ];
    project.layers[1]!.x = 700;
    project.layers[1]!.width = 180;
    project.layers[1]!.height = 80;
    const bones = [
      ...primaryBones,
      ...buildSeeThroughSecondaryMotionBones(project, primaryBones),
    ];

    const bindings = buildSeeThroughSecondaryMotionWeightBindings(project, bones);

    expect(bindings["front-hair"]).toEqual({
      boneIds: [
        "bone_secondary_front-hair_root",
        "bone_secondary_front-hair_mid",
        "bone_secondary_front-hair_tip",
      ],
      axis: "vertical",
      reverse: false,
      motionScale: expect.any(Number),
      riskScore: expect.any(Number),
    });
    expect(bindings.tail).toEqual({
      boneIds: [
        "bone_secondary_tail_root",
        "bone_secondary_tail_mid",
        "bone_secondary_tail_tip",
      ],
      axis: "horizontal",
      reverse: false,
      motionScale: expect.any(Number),
      riskScore: expect.any(Number),
    });
  });

  it("scores secondary motion risk and clamps risky foreground motion", () => {
    const project = createEmptyProject();
    project.width = 1000;
    const hair = createImportedMesh("front-hair", "hairFront");
    hair.x = 250;
    hair.y = 100;
    hair.width = 500;
    hair.height = 300;
    const face = createImportedMesh("face", "face");
    face.x = 380;
    face.y = 250;
    face.width = 240;
    face.height = 220;
    project.layers = [hair, face];

    const report = buildSeeThroughMotionRiskReport(project);
    const hairReport = report.layerReports.find((entry) => entry.layerId === "front-hair");

    expect(report.isSeeThroughProject).toBe(true);
    expect(hairReport?.riskScore).toBeGreaterThan(0.2);
    expect(hairReport?.motionScale).toBeLessThan(0.92);
    expect(hairReport?.reasons).toContain("face/head overlap");
  });
});
