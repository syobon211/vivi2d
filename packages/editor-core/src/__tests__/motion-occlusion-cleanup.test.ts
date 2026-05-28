import { describe, expect, it } from "vitest";
import type { ManualSplitOutputMetadata } from "@vivi2d/core/types";
import {
  assertNoMotionOcclusionCleanupPrivateFields,
  createMotionOcclusionCleanupPlan,
  createProtectedCleanupReviewProof,
  isManualSplitLayerEligibleForMotionAutoSetup,
  projectMotionOcclusionCleanupForPublicSurface,
  sanitizeMotionOcclusionCleanupErrorForPublicSurface,
  validateMotionOcclusionCleanupApplyEnvelope,
  type DuplicateContourCleanupPlan,
  type HoldoutCleanupPlan,
  type MotionCleanupHash,
  type MotionOcclusionCleanupPlan,
  type UnderpaintRevealCleanupPlan,
} from "../motion-occlusion-cleanup";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const PROOF_ID = "22222222-2222-4222-8222-222222222222";
const REVIEWER_ID = "33333333-3333-4333-8333-333333333333";
const ACCEPTED_AT = "2026-05-18T00:00:00.000Z";
const hash = (seed: string): MotionCleanupHash =>
  `sha256:v1:${seed.repeat(64).slice(0, 64)}`;

const acceptedUnderpaint = {
  id: "underpaint-1",
  reviewState: "accepted" as const,
  revision: "underpaint-rev-1",
  fingerprint: hash("a"),
  bounds: { x: 4, y: 6, width: 20, height: 12 },
  sourceMaskId: "face-mask",
  occludedByMaskId: "hair-mask",
};

const protectedState = {
  protectedRegionSetFingerprint: hash("b"),
  protectedPolicyId: "defaultProtectedPolicy",
  protectedPolicyVersion: 1,
  protectedCropGeneration: 7,
};

const sourceLayer = {
  layerId: "source",
  layerRevision: "source-rev-1",
  textureId: "texture-source",
  pixelFingerprint: hash("c"),
};

const targetLayer = {
  layerId: "face",
  layerRevision: "face-rev-1",
  textureId: "texture-face",
  pixelFingerprint: hash("d"),
};

const movingMask = {
  maskId: "hair-mask",
  maskRevision: "hair-mask-rev-1",
  maskFingerprint: hash("e"),
};

function createAcceptedUnderpaintPlan(): UnderpaintRevealCleanupPlan {
  const result = createMotionOcclusionCleanupPlan({
    planId: PLAN_ID,
    regionId: "hair-front",
    sourceLayerId: "source",
    cleanupKind: "acceptedUnderpaintReveal",
    bounds: { x: 0, y: 0, width: 8, height: 8 },
    underpaintId: acceptedUnderpaint.id,
    underpaints: [acceptedUnderpaint],
  });
  expect(result.ok).toBe(true);
  return result.plan as UnderpaintRevealCleanupPlan;
}

function createHoldoutPlan(): HoldoutCleanupPlan {
  const result = createMotionOcclusionCleanupPlan({
    planId: PLAN_ID,
    regionId: "hair-front",
    sourceLayerId: "source",
    cleanupKind: "holdout",
    bounds: { x: 0, y: 0, width: 8, height: 8 },
  });
  expect(result.ok).toBe(true);
  return result.plan as HoldoutCleanupPlan;
}

function createDuplicateContourPlan(): DuplicateContourCleanupPlan {
  const result = createMotionOcclusionCleanupPlan({
    planId: PLAN_ID,
    regionId: "hair-front",
    sourceLayerId: "source",
    cleanupKind: "duplicateContourSuppression",
    bounds: { x: 0, y: 0, width: 8, height: 8 },
  });
  expect(result.ok).toBe(true);
  return result.plan as DuplicateContourCleanupPlan;
}

describe("motion occlusion cleanup", () => {
  it("rejects preview underpaint before apply", () => {
    const result = createMotionOcclusionCleanupPlan({
      planId: PLAN_ID,
      regionId: "hair-front",
      sourceLayerId: "source",
      cleanupKind: "acceptedUnderpaintReveal",
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      underpaintId: "underpaint-preview",
      underpaints: [
        {
          ...acceptedUnderpaint,
          id: "underpaint-preview",
          reviewState: "preview",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        code: "underpaintNotAccepted",
        severity: "blocker",
        underpaintId: "underpaint-preview",
      },
    ]);
  });

  it("allows cleanup plans that reference accepted underpaint", () => {
    expect(createAcceptedUnderpaintPlan()).toEqual({
      id: PLAN_ID,
      regionId: "hair-front",
      sourceLayerId: "source",
      cleanupKind: "acceptedUnderpaintReveal",
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      reviewState: "accepted",
      touchesProtectedRegion: false,
      requiredUnderpaintId: "underpaint-1",
      sourceMaskId: "face-mask",
      occludedByMaskId: "hair-mask",
      protectedReviewProof: undefined,
    });
  });

  it("requires protected review proof before touching protected regions", () => {
    const basePlan = createDuplicateContourPlan();
    const proof = createProtectedCleanupReviewProof({
      plan: basePlan,
      protectedState,
      proofId: PROOF_ID,
      reviewerInstanceId: REVIEWER_ID,
      acceptedAt: ACCEPTED_AT,
    });
    const blocked = createMotionOcclusionCleanupPlan({
      planId: PLAN_ID,
      regionId: "hair-front",
      sourceLayerId: "source",
      cleanupKind: "duplicateContourSuppression",
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      touchesProtectedRegion: true,
    });
    const allowed = createMotionOcclusionCleanupPlan({
      planId: PLAN_ID,
      regionId: "hair-front",
      sourceLayerId: "source",
      cleanupKind: "duplicateContourSuppression",
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      touchesProtectedRegion: true,
      protectedReviewProof: proof,
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics).toEqual([
      { code: "protectedRegionRequiresReview", severity: "blocker" },
    ]);
    expect(allowed.ok).toBe(true);
  });

  it("rejects protected review proof when protected regions or policy changed", () => {
    const basePlan = createDuplicateContourPlan();
    const proof = createProtectedCleanupReviewProof({
      plan: basePlan,
      protectedState,
      proofId: PROOF_ID,
      reviewerInstanceId: REVIEWER_ID,
      acceptedAt: ACCEPTED_AT,
    });
    const result = validateMotionOcclusionCleanupApplyEnvelope(
      {
        kind: "duplicateContourSuppression",
        plan: { ...basePlan, touchesProtectedRegion: true, protectedReviewProof: proof },
        precondition: {
          common: {
            sourceLayer,
            movingRegionMask: movingMask,
            targetLayers: [targetLayer],
            layerGraphFingerprint: hash("f"),
            compositingStateFingerprint: hash("1"),
          },
        },
      },
      {
        currentProtectedState: {
          ...protectedState,
          protectedPolicyVersion: 2,
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: "protectedRegionReviewStale",
      severity: "blocker",
      path: "currentProtectedState",
    });
  });

  it("requires kind-specific layer and mask preconditions for holdout cleanup", () => {
    const plan = createHoldoutPlan();
    const missingTarget = validateMotionOcclusionCleanupApplyEnvelope({
      kind: "holdout",
      plan,
      precondition: {
        common: {
          sourceLayer,
          movingRegionMask: movingMask,
          targetLayers: [] as never,
          layerGraphFingerprint: hash("f"),
        },
      },
    });
    const valid = validateMotionOcclusionCleanupApplyEnvelope({
      kind: "holdout",
      plan,
      precondition: {
        common: {
          sourceLayer,
          movingRegionMask: movingMask,
          targetLayers: [targetLayer],
          layerGraphFingerprint: hash("f"),
        },
      },
    });

    expect(missingTarget.ok).toBe(false);
    expect(missingTarget.diagnostics).toContainEqual({
      code: "missingTargetLayer",
      severity: "blocker",
      path: "precondition.common.targetLayers",
    });
    expect(valid.ok).toBe(true);
  });

  it("requires compositing state for duplicate contour suppression", () => {
    const plan = createDuplicateContourPlan();
    const result = validateMotionOcclusionCleanupApplyEnvelope({
      kind: "duplicateContourSuppression",
      plan,
      precondition: {
        common: {
          sourceLayer,
          movingRegionMask: movingMask,
          targetLayers: [targetLayer],
          layerGraphFingerprint: hash("f"),
          compositingStateFingerprint: "invalid" as MotionCleanupHash,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: "missingCompositingState",
      severity: "blocker",
      path: "precondition.common.compositingStateFingerprint",
    });
  });

  it("requires accepted underpaint revision and fingerprint for reveal cleanup", () => {
    const plan = createAcceptedUnderpaintPlan();
    const result = validateMotionOcclusionCleanupApplyEnvelope({
      kind: "acceptedUnderpaintReveal",
      plan,
      precondition: {
        common: {
          sourceLayer,
          movingRegionMask: movingMask,
        },
        acceptedUnderpaintId: "underpaint-1",
        acceptedUnderpaintFingerprint: "invalid" as MotionCleanupHash,
        acceptedUnderpaintRevision: "",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        code: "invalidFingerprint",
        severity: "blocker",
        path: "precondition.acceptedUnderpaintFingerprint",
      },
      {
        code: "invalidRevision",
        severity: "blocker",
        path: "precondition.acceptedUnderpaintRevision",
      },
    ]);
  });

  it("redacts cleanup preconditions from public projections", () => {
    const plan = createAcceptedUnderpaintPlan();
    const projection = projectMotionOcclusionCleanupForPublicSurface(plan);

    expect(projection).toEqual({
      cleanupKind: "acceptedUnderpaintReveal",
      reviewState: "accepted",
      touchesProtectedRegion: false,
      underpaintState: "accepted",
    });
    expect(() => assertNoMotionOcclusionCleanupPrivateFields(projection)).not.toThrow();
    expect(() =>
      assertNoMotionOcclusionCleanupPrivateFields({
        acceptedUnderpaintFingerprint: hash("f"),
      }),
    ).toThrow(/private field/);
  });

  it("sanitizes cleanup errors without exposing stacks or paths", () => {
    const error = new Error("failed at C:\\Users\\xltt\\secret\\file.ts");
    Object.defineProperty(error, "stack", {
      value: "Error: failed\n at C:\\Users\\xltt\\secret\\file.ts:1:1",
      enumerable: false,
    });
    Object.defineProperty(error, "danger", {
      get() {
        throw new Error("accessor should not run");
      },
      enumerable: true,
    });
    error.name = "PreviewSolverError";

    expect(sanitizeMotionOcclusionCleanupErrorForPublicSurface(error)).toEqual({
      name: "InternalError",
      message: "failed at <path-redacted>",
    });
  });

  it("excludes generated underpaint layers from motion auto setup", () => {
    const generated: ManualSplitOutputMetadata = {
      kind: "generatedUnderpaintLayer",
      ownership: "userAccepted",
      origin: "localUnderpaint",
      manualSplitLayerId: "underpaint-layer",
      manualSplitSourceLayerId: "source",
      manualSplitSourceFingerprint: "sha256:source",
      underpaintBufferId: "underpaint-1",
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      acceptedAt: "2026-05-18T00:00:00.000Z",
    };
    const extracted: ManualSplitOutputMetadata = {
      kind: "maskExtractedLayer",
      ownership: "userAccepted",
      origin: "manualMask",
      manualSplitLayerId: "hair-layer",
      manualSplitSourceLayerId: "source",
      manualSplitSourceFingerprint: "sha256:source",
      manualSplitMaskId: "hair-mask",
      maskCoverage: 0.5,
      edgeFeatherPx: 1,
    };

    expect(isManualSplitLayerEligibleForMotionAutoSetup(generated)).toBe(false);
    expect(isManualSplitLayerEligibleForMotionAutoSetup(extracted)).toBe(true);
    expect(isManualSplitLayerEligibleForMotionAutoSetup(undefined)).toBe(true);
  });
});
