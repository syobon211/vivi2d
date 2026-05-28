import { describe, expect, it } from "vitest";
import {
  createViewerIssueFromMessage,
  deriveViewerWorkflowModel,
  deriveViewerWorkflowStep,
  getIssueBadgeLabel,
  getStreamSafeDisplayName,
  resetSuppressionsOnEvent,
  VIEWER_RECOMMENDATION_SUPPRESSION_MS,
  type ViewerWorkflowInput,
} from "../components/viewer-workflow";

function input(overrides: Partial<ViewerWorkflowInput> = {}): ViewerWorkflowInput {
  return {
    loaded: true,
    modelLoading: false,
    recordingState: "idle",
    viewerApiEnabled: true,
    calibrationNeedsAttention: false,
    issues: [],
    ...overrides,
  };
}

describe("viewer workflow derivation", () => {
  it("prioritizes blocking issues over all other states", () => {
    expect(
      deriveViewerWorkflowStep(
        input({
          modelLoading: true,
          recordingState: "recording",
          issues: createViewerIssueFromMessage("broken", 1),
        }),
      ),
    ).toBe("error");
  });

  it("uses loading and open model before session readiness", () => {
    expect(deriveViewerWorkflowStep(input({ modelLoading: true }))).toBe("loading");
    expect(deriveViewerWorkflowStep(input({ loaded: false }))).toBe("openModel");
  });

  it("keeps recording visible before connect and calibration prompts", () => {
    expect(
      deriveViewerWorkflowStep(
        input({
          recordingState: "recording",
          viewerApiEnabled: false,
          calibrationNeedsAttention: true,
        }),
      ),
    ).toBe("recording");
  });

  it("surfaces calibration before optional local API connection", () => {
    expect(
      deriveViewerWorkflowStep(
        input({
          viewerApiEnabled: false,
          calibrationNeedsAttention: true,
        }),
      ),
    ).toBe("calibrate");
  });

  it("caps issue badges and includes issue counts in the render model", () => {
    const issues = Array.from({ length: 11 }, (_, index) => ({
      code: `warn.${index}`,
      severity: "warning" as const,
      message: "warning",
      category: "unknown" as const,
      createdAtMs: index,
    }));
    const model = deriveViewerWorkflowModel(input({ issues }));
    expect(model.issueCount).toBe(11);
    expect(model.blockingIssueCount).toBe(0);
    expect(getIssueBadgeLabel(model.issueCount)).toBe("9+");
  });

  it("sanitizes model display names for stream-safe toolbar output", () => {
    expect(getStreamSafeDisplayName("C:/secret/project/my-model.vivi")).toBe(
      "my-model",
    );
    expect(getStreamSafeDisplayName("")).toBe("No model");
  });

  it("suppresses optional recommendations without hiding blocking errors", () => {
    const nowMs = 10_000;
    expect(
      deriveViewerWorkflowStep(
        input({
          viewerApiEnabled: false,
          suppressedRecommendations: { connect: nowMs },
          nowMs,
        }),
      ),
    ).toBe("prepare");
    expect(
      deriveViewerWorkflowStep(
        input({
          viewerApiEnabled: false,
          suppressedRecommendations: { connect: nowMs },
          nowMs,
          issues: createViewerIssueFromMessage("viewer api failed", nowMs),
        }),
      ),
    ).toBe("error");
  });

  it("expires and resets recommendation suppressions by explicit events", () => {
    const dismissedAt = 1_000;
    expect(
      resetSuppressionsOnEvent(
        { connect: dismissedAt, calibrate: dismissedAt },
        { type: "expirationChecked", nowMs: dismissedAt + 1_000 },
      ),
    ).toEqual({ connect: dismissedAt, calibrate: dismissedAt });
    expect(
      resetSuppressionsOnEvent(
        { connect: dismissedAt, calibrate: dismissedAt },
        {
          type: "expirationChecked",
          nowMs: dismissedAt + VIEWER_RECOMMENDATION_SUPPRESSION_MS,
        },
      ),
    ).toEqual({});
    expect(
      resetSuppressionsOnEvent(
        { connect: dismissedAt, calibrate: dismissedAt },
        { type: "modelLoaded" },
      ),
    ).toEqual({ connect: dismissedAt });
    expect(
      resetSuppressionsOnEvent(
        { connect: dismissedAt, calibrate: dismissedAt },
        { type: "localApiEnabled" },
      ),
    ).toEqual({ calibrate: dismissedAt });
  });
});
