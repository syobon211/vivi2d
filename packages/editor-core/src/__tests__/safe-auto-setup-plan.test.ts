import { describe, expect, it } from "vitest";
import {
  SAFE_AUTO_SETUP_PLAN_PROFILE,
  SAFE_AUTO_SETUP_PLAN_VERSION,
  createSafeAutoSetupManagedSignature,
  validateSafeAutoSetupPlan,
} from "../safe-auto-setup-plan";

describe("editor-core Safe Auto Setup plan", () => {
  it("accepts public-safe controller operations", () => {
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "createBinding",
          parameterId: "vivi.head.yaw",
          target: { type: "bone", tempBoneId: "bone_head", property: "angle" },
          bindingPoints: [
            { paramValue: -1, targetValue: -0.1 },
            { paramValue: 0, targetValue: 0 },
            { paramValue: 1, targetValue: 0.1 },
          ],
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(true);
  });

  it("rejects private deformation markers before application", () => {
    const privateTarget = ["mesh", "Pose"].join("");
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "createBinding",
          parameterId: "unsafe",
          target: { type: privateTarget },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["forbiddenOperationMarker", "invalidBindingTarget"]),
    );
  });

  it("rejects private deformation markers in object keys", () => {
    const privateKey = ["blend", "Shape"].join("");
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "createMesh",
          layerId: "layer-a",
          algorithm: "alphaBoundary",
          mesh: {
            vertices: [0, 0, 1, 0, 0, 1],
            uvs: [0, 0, 1, 0, 0, 1],
            indices: [0, 1, 2],
          },
          [privateKey]: true,
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "forbiddenOperationKeyMarker",
    );
  });

  it("rejects local-motion preview markers before application", () => {
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "createMesh",
          layerId: "layer-a",
          algorithm: "alphaBoundary",
          mesh: {
            vertices: [0, 0, 1, 0, 0, 1],
            uvs: [0, 0, 1, 0, 0, 1],
            indices: [0, 1, 2],
          },
          local_motion_draft: true,
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "forbiddenOperationKeyMarker",
    );
  });

  it("rejects bbw skins unless the review gate is enabled", () => {
    const plan = {
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "createSkin",
          layerId: "layer-a",
          weights: [[{ boneId: "bone-a", weight: 1 }]],
          boneIds: ["bone-a"],
          solver: "bbw",
        },
      ],
      diagnostics: [],
    };

    expect(validateSafeAutoSetupPlan(plan).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "bbwReviewGatePending" }),
      ]),
    );
    expect(validateSafeAutoSetupPlan(plan, { allowBbwSolver: true }).ok).toBe(
      true,
    );
  });

  it("does not treat resolver words as the solver marker", () => {
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "createMesh",
          layerId: "layer-a",
          layerName: "Resolver sample",
          algorithm: "alphaBoundary",
          mesh: {
            vertices: [0, 0, 1, 0, 0, 1],
            uvs: [0, 0, 1, 0, 0, 1],
            indices: [0, 1, 2],
          },
          moduleResolver: "safe",
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(true);
  });

  it("does not treat algorithm marker substrings in user labels as private markers", () => {
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "createMesh",
          layerId: "layer-a",
          layerName: "HTMLS Carapace bbwidth sample",
          algorithm: "alphaBoundary",
          mesh: {
            vertices: [0, 0, 1, 0, 0, 1],
            uvs: [0, 0, 1, 0, 0, 1],
            indices: [0, 1, 2],
          },
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(true);
  });

  it("rejects explicit private algorithm tokens in operation strings", () => {
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "addBone",
          tempId: "bone-a",
          name: "MLS ARAP BBW private algorithm note",
          x: 0,
          y: 0,
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "forbiddenOperationMarker",
    );
  });

  it("rejects solver markers outside the createSkin solver allowlist", () => {
    const validation = validateSafeAutoSetupPlan({
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint: "sha256:test",
      operations: [
        {
          kind: "addBone",
          tempId: "bone-a",
          name: "bone with unsafe solver metadata",
          x: 0,
          y: 0,
          solver: "local-solver",
        },
      ],
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "forbiddenOperationKeyMarker",
        "forbiddenOperationMarker",
      ]),
    );
  });

  it("creates deterministic managed signatures", () => {
    expect(createSafeAutoSetupManagedSignature({ b: 1, a: 2 })).toBe(
      createSafeAutoSetupManagedSignature({ a: 2, b: 1 }),
    );
  });
});
