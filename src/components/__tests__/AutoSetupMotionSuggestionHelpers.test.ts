import { describe, expect, it } from "vitest";
import type { AutoSetupResult } from "@/lib/auto-setup";
import type { I18nKey } from "@/lib/i18n";
import {
  assertNoPublicReviewPanelPrivateDetails,
  createAutoSetupReviewPanelModel,
  createPublicReviewPanelProjection,
  formatMotionStressAction,
} from "../AutoSetupMotionSuggestionHelpers";

const echoT = (key: I18nKey) => key;

describe("AutoSetupMotionSuggestionHelpers", () => {
  it("projects review panel stress checks without diagnostic scalar details", () => {
    const result = {
      plan: {
        operations: [
          { kind: "addBone" },
          { kind: "parentBone" },
          { kind: "createSkin", solver: "rigidLayer" },
          { kind: "createSkin", solver: "secondaryMotion" },
        ],
      },
      occlusionCleanupReport: { pairCount: 2 },
      motionHandleDraft: {
        quality: {
          gates: [
            {
              id: "protected_crop_delta",
              status: "warning",
              value: 0.72,
              threshold: 0.12,
              affectedRegionIds: ["face"],
            },
            {
              id: "stress_pose_delta",
              status: "fail",
              value: 0.8,
              threshold: 0.3,
              affectedRegionIds: ["eye"],
            },
            {
              id: "hidden_reveal_score",
              status: "pass",
              value: 0.02,
              threshold: 0.2,
            },
          ],
        },
      },
    } as unknown as AutoSetupResult;

    const model = createAutoSetupReviewPanelModel(result);
    const projection = createPublicReviewPanelProjection(model);
    const serialized = JSON.stringify(projection);

    expect(model.safeOperations).toContainEqual({ id: "cleanup", count: 2 });
    expect(projection.cleanupComparisons).toEqual([
      { id: "none", status: "preferred" },
    ]);
    expect(projection.stressChecks).toEqual([
      {
        id: "motionStress.protectedArea",
        status: "fail",
        severityBucket: "high",
      },
      {
        id: "motionStress.hiddenReveal",
        status: "pass",
        severityBucket: "low",
      },
    ]);
    expect(serialized).not.toMatch(
      /value|threshold|affectedRegionIds|face|eye|0\.72|0\.12|0\.8|0\.3/,
    );
    expect(() => assertNoPublicReviewPanelPrivateDetails(projection)).not.toThrow();
  });

  it("rejects public review panel projections with private diagnostic keys", () => {
    expect(() =>
      assertNoPublicReviewPanelPrivateDetails({
        stressChecks: [
          {
            id: "hidden_reveal_score",
            status: "fail",
            threshold: 0.9,
          },
        ],
      }),
    ).toThrow(/private diagnostic/);
  });

  it("formats motion stress actions from public-safe stress IDs", () => {
    expect(
      formatMotionStressAction(echoT, "motionStress.duplicateOutline", "warning"),
    ).toBe("autoSetup.motionStressAction.duplicateOutline");
    expect(
      formatMotionStressAction(echoT, "motionStress.hiddenReveal", "fail"),
    ).toBe("autoSetup.motionStressAction.hiddenReveal");
    expect(
      formatMotionStressAction(echoT, "motionStress.protectedArea", "pass"),
    ).toBe("autoSetup.motionStressAction.pass");
    expect(
      formatMotionStressAction(echoT, "motionStress.incompleteCheck", "notRun"),
    ).toBe("autoSetup.motionStressAction.incompleteCheck");
  });

  it("projects cleanup comparison options from cleanup operations", () => {
    const result = {
      occlusionCleanupReport: {
        pairCount: 1,
        pairReports: [
          {
            operations: ["lower-holdout", "duplicate-contour", "underpaint"],
          },
        ],
      },
    } as unknown as AutoSetupResult;

    const projection = createPublicReviewPanelProjection(
      createAutoSetupReviewPanelModel(result),
    );

    expect(projection.cleanupComparisons).toEqual([
      { id: "none", status: "blocked" },
      { id: "lowerHoldout", status: "recommended" },
      { id: "featherHoldout", status: "available" },
      { id: "duplicateOutlineSuppression", status: "recommended" },
      { id: "acceptedUnderpaintReveal", status: "recommended" },
    ]);
    expect(JSON.stringify(projection)).not.toMatch(/duplicate-contour|underpaintRadius/);
  });
});
