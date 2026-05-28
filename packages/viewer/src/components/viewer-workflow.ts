import type { RecordingState } from "../recorder";

export type ViewerSheetSection =
  | "session"
  | "connect"
  | "overlays"
  | "calibration"
  | "inputEffects";

export type ViewerWorkflowStep =
  | "openModel"
  | "loading"
  | "connect"
  | "calibrate"
  | "prepare"
  | "recording"
  | "error";

export type ViewerRecommendationKey = "connect" | "calibrate";

export const VIEWER_RECOMMENDATION_SUPPRESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type ViewerIssueSeverity = "blocking" | "warning";

export interface ViewerIssue {
  code: string;
  severity: ViewerIssueSeverity;
  message: string;
  category:
    | "parse"
    | "permission"
    | "memory"
    | "file_missing"
    | "viewer_api"
    | "recording"
    | "unknown";
  createdAtMs: number;
}

export interface ViewerWorkflowInput {
  loaded: boolean;
  modelLoading: boolean;
  recordingState: RecordingState;
  viewerApiEnabled: boolean;
  calibrationNeedsAttention: boolean;
  suppressedRecommendations?: Partial<Record<ViewerRecommendationKey, number>>;
  nowMs?: number;
  issues: readonly ViewerIssue[];
}

export interface ViewerWorkflowModel {
  step: ViewerWorkflowStep;
  label: string;
  hint: string;
  targetSection: ViewerSheetSection;
  severity: "normal" | "attention" | "danger";
  issueCount: number;
  blockingIssueCount: number;
  recordControlState: RecordingState;
}

const WORKFLOW_COPY: Record<
  ViewerWorkflowStep,
  Pick<ViewerWorkflowModel, "label" | "hint" | "targetSection" | "severity">
> = {
  openModel: {
    label: "Open Model",
    hint: "Load a model file to start the viewer session.",
    targetSection: "session",
    severity: "normal",
  },
  loading: {
    label: "Loading",
    hint: "Preparing the model and renderer.",
    targetSection: "session",
    severity: "normal",
  },
  connect: {
    label: "Open Connect",
    hint: "Enable the local Viewer API only when you need external control.",
    targetSection: "connect",
    severity: "attention",
  },
  calibrate: {
    label: "Open Calibration",
    hint: "Review neutral pose and tracking ranges before going live.",
    targetSection: "calibration",
    severity: "attention",
  },
  prepare: {
    label: "Go Live Check",
    hint: "Model is ready. Adjust items, inputs, or overlays from the side sheet.",
    targetSection: "session",
    severity: "normal",
  },
  recording: {
    label: "Recording",
    hint: "Recording is active. Use Stop to finish and export.",
    targetSection: "session",
    severity: "danger",
  },
  error: {
    label: "Show issue",
    hint: "Resolve the blocking issue before continuing.",
    targetSection: "session",
    severity: "danger",
  },
};

export function deriveViewerWorkflowStep(
  input: ViewerWorkflowInput,
): ViewerWorkflowStep {
  const nowMs = input.nowMs ?? Date.now();
  if (input.issues.some((issue) => issue.severity === "blocking")) {
    return "error";
  }
  if (input.modelLoading) return "loading";
  if (!input.loaded) return "openModel";
  if (
    input.recordingState === "recording" ||
    input.recordingState === "processing"
  ) {
    return "recording";
  }
  if (
    input.calibrationNeedsAttention &&
    !isRecommendationSuppressed(
      input.suppressedRecommendations?.calibrate,
      nowMs,
    )
  ) {
    return "calibrate";
  }
  if (
    !input.viewerApiEnabled &&
    !isRecommendationSuppressed(input.suppressedRecommendations?.connect, nowMs)
  ) {
    return "connect";
  }
  return "prepare";
}

export function deriveViewerWorkflowModel(
  input: ViewerWorkflowInput,
): ViewerWorkflowModel {
  const step = deriveViewerWorkflowStep(input);
  const issueCount = input.issues.length;
  const blockingIssueCount = input.issues.filter(
    (issue) => issue.severity === "blocking",
  ).length;
  const copy = { ...WORKFLOW_COPY[step] };
  if (step === "error" && issueCount > 1) {
    copy.label = `Show issues (${getIssueBadgeLabel(issueCount)})`;
  }
  return {
    step,
    ...copy,
    issueCount,
    blockingIssueCount,
    recordControlState: input.recordingState,
  };
}

export function isRecommendationSuppressed(
  dismissedAtMs: number | undefined,
  nowMs: number,
): boolean {
  if (dismissedAtMs === undefined) return false;
  const elapsed = Math.max(0, nowMs - dismissedAtMs);
  return elapsed < VIEWER_RECOMMENDATION_SUPPRESSION_MS;
}

export type SuppressionResetEvent =
  | { type: "modelLoaded" }
  | { type: "calibrationProfileReset" }
  | { type: "calibrationProfileImported" }
  | { type: "trackingSourceChanged" }
  | { type: "neutralCaptureCompleted" }
  | { type: "localApiEnabled" }
  | { type: "firstViewerApiGrantApproved" }
  | { type: "pairingOpened" }
  | { type: "expirationChecked"; nowMs: number };

export function resetSuppressionsOnEvent(
  suppressed: Partial<Record<ViewerRecommendationKey, number>>,
  event: SuppressionResetEvent,
): Partial<Record<ViewerRecommendationKey, number>> {
  const next = { ...suppressed };
  switch (event.type) {
    case "modelLoaded":
    case "calibrationProfileReset":
    case "calibrationProfileImported":
    case "trackingSourceChanged":
    case "neutralCaptureCompleted":
      delete next.calibrate;
      break;
    case "localApiEnabled":
    case "firstViewerApiGrantApproved":
    case "pairingOpened":
      delete next.connect;
      break;
    case "expirationChecked":
      for (const key of Object.keys(next) as ViewerRecommendationKey[]) {
        if (!isRecommendationSuppressed(next[key], event.nowMs)) {
          delete next[key];
        }
      }
      break;
  }
  return next;
}

export function getIssueBadgeLabel(issueCount: number): string | null {
  if (issueCount <= 0) return null;
  return issueCount > 9 ? "9+" : String(issueCount);
}

export function getStreamSafeDisplayName(modelName: string): string {
  const raw = modelName.trim();
  if (!raw) return "No model";
  const base = raw.split(/[\\/]/).filter(Boolean).at(-1) ?? raw;
  const withoutExtension = base.replace(/\.(vivi|vvmd|json)$/i, "");
  return withoutExtension || "No model";
}

export function createViewerIssueFromMessage(
  message: string | null,
  nowMs = Date.now(),
): ViewerIssue[] {
  if (!message) return [];
  return [
    {
      code: "viewer.error",
      severity: "blocking",
      message,
      category: "unknown",
      createdAtMs: nowMs,
    },
  ];
}
