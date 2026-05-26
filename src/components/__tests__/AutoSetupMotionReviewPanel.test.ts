import { describe, expect, it } from "vitest";
import { resetMotionHandleQuality } from "../auto-setup/AutoSetupMotionReviewPanel";

describe("AutoSetupMotionReviewPanel", () => {
  it("resets motion-handle quality without preserving stale diagnostic metadata", () => {
    const reset = resetMotionHandleQuality({
      status: "warning",
      lastEvaluatedGeneration: 12,
      gates: [
        {
          id: "protected_crop_delta",
          status: "warning",
          value: 0.72,
          threshold: 0.12,
          affectedRegionIds: ["face"],
          message: "previous diagnostic detail",
        },
      ],
    });

    expect(reset).toEqual({
      status: "notRun",
      gates: [{ id: "protected_crop_delta", status: "notRun" }],
    });
    expect(JSON.stringify(reset)).not.toMatch(
      /lastEvaluatedGeneration|value|threshold|affectedRegionIds|face|previous diagnostic/,
    );
  });
});
