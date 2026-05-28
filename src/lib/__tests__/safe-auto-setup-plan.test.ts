import { describe, expect, it } from "vitest";
import type { AutoSetupResult } from "@/lib/auto-setup";
import { buildSafeAutoSetupPlan } from "@/lib/auto-setup";
import {
  SAFE_AUTO_SETUP_PLAN_PROFILE,
  SAFE_AUTO_SETUP_PLAN_VERSION,
  SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX,
  createAutoSetupSourceFingerprint,
  createFallbackAutoSetupSourceFingerprint,
  validateSafeAutoSetupPlan,
} from "@vivi2d/editor-core/safe-auto-setup-plan";
import { createEmptyProject, createViviMesh } from "@/test/fixtures";

function createSafeResult(): AutoSetupResult {
  return {
    detectedParts: [],
    boneResult: {
      bones: [
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
      ],
      parameters: [
        {
          name: "Head X",
          minValue: -30,
          maxValue: 30,
          defaultValue: 0,
          group: "Head",
        },
      ],
    },
    physicsGroups: [
      {
        name: "Hair sway",
        partCategory: "hair",
        layerIds: ["mesh-1"],
        stiffness: 0.3,
        gravity: 0.5,
        damping: 0.4,
      },
    ],
    meshResults: [
      {
        layerId: "mesh-1",
        layerName: "Hair",
        mesh: {
          vertices: [0, 0, 100, 0, 0, 100, 100, 100],
          uvs: [0, 0, 1, 0, 0, 1, 1, 1],
          indices: [0, 1, 2, 1, 3, 2],
          divisionsX: 0,
          divisionsY: 0,
        },
      },
    ],
    weightResults: [
      {
        layerId: "mesh-1",
        boneIds: ["bone_head"],
        weights: [
          [{ boneId: "bone_head", weight: 1 }],
          [{ boneId: "bone_head", weight: 1 }],
          [{ boneId: "bone_head", weight: 1 }],
          [{ boneId: "bone_head", weight: 1 }],
        ],
      },
    ],
  };
}

describe("Safe Auto Setup plan", () => {
  it("builds a validated public-safe operation plan", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-1", name: "Hair" })],
    };
    const plan = buildSafeAutoSetupPlan(project, createSafeResult(), {
      sourceFingerprint: "sha256:test",
    });

    expect(validateSafeAutoSetupPlan(plan).ok).toBe(true);
    expect(plan.profile).toBe(SAFE_AUTO_SETUP_PLAN_PROFILE);
    expect(plan.planVersion).toBe(SAFE_AUTO_SETUP_PLAN_VERSION);
    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      "addBone",
      "addBone",
      "parentBone",
      "createParameter",
      "createBinding",
      "createPhysicsGroup",
      "createMesh",
      "createSkin",
    ]);
    expect(plan.operations.find((operation) => operation.kind === "createBinding")).toMatchObject({
      kind: "createBinding",
      target: { type: "bone", tempBoneId: "bone_head", property: "x" },
    });
    expect(plan.operations.at(-1)).toMatchObject({ solver: "rigidLayer" });
  });

  it("excludes rejected temporary bones and layers from the plan", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-1", name: "Hair" })],
    };
    const plan = buildSafeAutoSetupPlan(project, createSafeResult(), {
      excludedIds: new Set(["bone_head", "mesh-1"]),
      sourceFingerprint: "sha256:test",
    });

    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      "addBone",
      "createParameter",
      "createPhysicsGroup",
    ]);
  });

  it("rejects unsupported operation kinds and private deformation markers", () => {
    const blockedMarker = ["blend", "Shape"].join("");
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        { kind: `create${blockedMarker}`, target: { type: blockedMarker } },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["unsupportedOperation", "forbiddenOperationMarker"]),
    );
  });

  it("rejects parameter bindings to private deformation targets", () => {
    const blockedTargetType = ["lattice", "Deformer"].join("");
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "createBinding",
          parameterId: "param-1",
          target: { type: blockedTargetType, deformerId: "deformer-1" },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "invalidBindingTarget",
    );
  });

  it("creates a deterministic source fingerprint fallback", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-1", name: "Hair" })],
    };
    const renamedProject = {
      ...project,
      layers: [createViviMesh({ id: "mesh-1", name: "Hair Front" })],
    };

    expect(createFallbackAutoSetupSourceFingerprint(project)).toBe(
      createFallbackAutoSetupSourceFingerprint(project),
    );
    expect(createFallbackAutoSetupSourceFingerprint(project)).not.toBe(
      createFallbackAutoSetupSourceFingerprint(renamedProject),
    );
  });

  it("fails closed when the serialized plan version is missing or unsupported", () => {
    const validation = validateSafeAutoSetupPlan({
      version: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [],
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "unsupportedPlanVersion",
        path: "planVersion",
      }),
    );
  });

  it("includes texture content and alpha coverage in async source fingerprints", async () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-1", name: "Hair" })],
    };
    const createTexture = (alpha: number) =>
      ({
        width: 1,
        height: 1,
        getContext: () => ({
          getImageData: () => ({
            width: 1,
            height: 1,
            data: new Uint8ClampedArray([255, 255, 255, alpha]),
          }),
        }),
      }) as unknown as HTMLCanvasElement;

    const opaque = await createAutoSetupSourceFingerprint(project, {
      getTexture: () => createTexture(255),
    });
    const transparent = await createAutoSetupSourceFingerprint(project, {
      getTexture: () => createTexture(0),
    });

    expect(opaque).not.toBe(transparent);
  });

  it("keeps source fingerprints stable after managed Auto Setup bones are added", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-1", name: "Hair" })],
    };
    const withGeneratedBone = {
      ...project,
      layers: [
        ...project.layers,
        {
          id: "bone-generated",
          name: "Generated Head",
          kind: "bone" as const,
          visible: true,
          opacity: 1,
          x: 50,
          y: 40,
          width: 0,
          height: 0,
          children: [],
          blendMode: "normal" as const,
          expanded: true,
          bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
          managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:bone:head`,
          managedSourceFingerprint: "sha256:previous",
        },
      ],
    };

    expect(createFallbackAutoSetupSourceFingerprint(withGeneratedBone)).toBe(
      createFallbackAutoSetupSourceFingerprint(project),
    );
  });
});
