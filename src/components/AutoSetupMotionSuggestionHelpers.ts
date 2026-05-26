import type { MotionHandleDraft } from "@vivi2d/editor-core/motion-handles";
import type { QualityGateStatus } from "@vivi2d/editor-core/layer-graph";
import type { PublicMotionStressCheckId } from "@vivi2d/editor-core/motion-stress-diagnostics";
import type { AutoSetupResult } from "@/lib/auto-setup";
import type { I18nKey } from "@/lib/i18n";

type MotionRegion = MotionHandleDraft["regions"][number];
type MotionSuggestionStatus = NonNullable<MotionRegion["handleSuggestion"]>["status"];
type MotionSuggestionConfidence =
  NonNullable<MotionRegion["handleSuggestion"]>["confidence"];

export interface MotionSuggestionSummary {
  counts: Record<MotionSuggestionStatus, number>;
  warningCount: number;
}

export type AutoSetupSafeOperationKind =
  | "addBone"
  | "parentBone"
  | "createSkin"
  | "createPhysicsGroup"
  | "rigidLayer"
  | "cleanup";

export type AutoSetupDiscardedPreviewCategory =
  | "motionPreviewData"
  | "previewGeometryData"
  | "internalAlgorithmData"
  | "stressDiagnosticData";

export interface AutoSetupPublicStressCheck {
  id: PublicMotionStressCheckId;
  status: QualityGateStatus;
  severityBucket?: "low" | "medium" | "high";
}

export type AutoSetupCleanupComparisonKind =
  | "none"
  | "lowerHoldout"
  | "featherHoldout"
  | "duplicateOutlineSuppression"
  | "acceptedUnderpaintReveal";

export type AutoSetupCleanupComparisonStatus =
  | "preferred"
  | "recommended"
  | "available"
  | "blocked";

export interface AutoSetupCleanupComparison {
  id: AutoSetupCleanupComparisonKind;
  status: AutoSetupCleanupComparisonStatus;
}

export interface AutoSetupReviewPanelModel {
  operationCounts: Readonly<Record<string, number>>;
  skinModeCounts: Readonly<Record<string, number>>;
  safeOperations: readonly {
    id: AutoSetupSafeOperationKind;
    count: number;
  }[];
  discardedPreviewCategories: readonly AutoSetupDiscardedPreviewCategory[];
  stressChecks: readonly AutoSetupPublicStressCheck[];
  cleanupComparisons: readonly AutoSetupCleanupComparison[];
}

export interface PublicReviewPanelProjection {
  safeOperations: AutoSetupReviewPanelModel["safeOperations"];
  discardedPreviewCategories: AutoSetupReviewPanelModel["discardedPreviewCategories"];
  stressChecks: readonly AutoSetupPublicStressCheck[];
  cleanupComparisons: readonly AutoSetupCleanupComparison[];
}

export const AUTO_SETUP_DISCARDED_PREVIEW_CATEGORIES = Object.freeze([
  "motionPreviewData",
  "previewGeometryData",
  "internalAlgorithmData",
  "stressDiagnosticData",
] as const);

export function summarizeMotionSuggestions(
  regions: readonly MotionRegion[],
): MotionSuggestionSummary {
  return regions.reduce<MotionSuggestionSummary>(
    (summary, region) => {
      const status = region.handleSuggestion?.status;
      return {
        counts: status
          ? { ...summary.counts, [status]: summary.counts[status] + 1 }
          : summary.counts,
        warningCount:
          summary.warningCount + (region.handleSuggestion?.warnings.length ?? 0),
      };
    },
    {
      counts: { apply: 0, review: 0, rejected: 0 },
      warningCount: 0,
    },
  );
}

export function createAutoSetupReviewPanelModel(
  result: AutoSetupResult,
): AutoSetupReviewPanelModel {
  const operationCounts =
    result.plan?.operations.reduce(
      (counts, operation) => ({
        ...counts,
        [operation.kind]: (counts[operation.kind] ?? 0) + 1,
      }),
      {} as Record<string, number>,
    ) ?? {};
  const skinModeCounts =
    result.plan?.operations.reduce(
      (counts, operation) => {
        if (operation.kind !== "createSkin") return counts;
        return {
          ...counts,
          [operation.solver]: (counts[operation.solver] ?? 0) + 1,
        };
      },
      {} as Record<string, number>,
    ) ?? {};
  const safeOperations = [
    { id: "addBone", count: operationCounts.addBone ?? 0 },
    { id: "parentBone", count: operationCounts.parentBone ?? 0 },
    { id: "createSkin", count: operationCounts.createSkin ?? 0 },
    { id: "createPhysicsGroup", count: operationCounts.createPhysicsGroup ?? 0 },
    { id: "rigidLayer", count: skinModeCounts.rigidLayer ?? 0 },
    { id: "cleanup", count: result.occlusionCleanupReport?.pairCount ?? 0 },
  ] as const;
  const stressChecks =
    mergePublicStressChecks(
      result.motionHandleDraft?.quality.gates.map((gate) => ({
        id: projectQualityGateToPublicStressCheckId(gate.id),
        status: gate.status,
        severityBucket: stressStatusToBucket(gate.status),
      })) ?? [],
    );
  const cleanupComparisons = createCleanupComparisons(result);

  return Object.freeze({
    operationCounts: Object.freeze({ ...operationCounts }),
    skinModeCounts: Object.freeze({ ...skinModeCounts }),
    safeOperations: Object.freeze([...safeOperations]),
    discardedPreviewCategories: AUTO_SETUP_DISCARDED_PREVIEW_CATEGORIES,
    stressChecks: Object.freeze(stressChecks),
    cleanupComparisons: Object.freeze(cleanupComparisons),
  });
}

export function createPublicReviewPanelProjection(
  model: AutoSetupReviewPanelModel,
): PublicReviewPanelProjection {
  return Object.freeze({
    safeOperations: Object.freeze(
      model.safeOperations.map((operation) =>
        Object.freeze({ id: operation.id, count: operation.count }),
      ),
    ),
    discardedPreviewCategories: AUTO_SETUP_DISCARDED_PREVIEW_CATEGORIES,
    stressChecks: Object.freeze(
      mergePublicStressChecks(model.stressChecks).map((check) =>
        Object.freeze({
          id: check.id,
          status: check.status,
          severityBucket: check.severityBucket,
        }),
      ),
    ),
    cleanupComparisons: Object.freeze(
      model.cleanupComparisons.map((comparison) =>
        Object.freeze({ id: comparison.id, status: comparison.status }),
      ),
    ),
  });
}

export function assertNoPublicReviewPanelPrivateDetails(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /"(?:threshold|affectedRegionIds|diagnosticHash|solverId|solverKind)"\s*:/.test(serialized) ||
    /protectedCropDelta|edgeContamination|duplicateContour|restRecompositionDelta|protected_crop_delta|duplicate_contour_score|hidden_reveal_score/.test(
      serialized,
    )
  ) {
    throw new Error("Public review panel projection contains private diagnostic details.");
  }
}

export function formatMotionSuggestionStatus(
  t: (key: I18nKey) => string,
  status: MotionSuggestionStatus,
): string {
  switch (status) {
    case "apply":
      return t("autoSetup.motionSuggestionStatus.apply");
    case "review":
      return t("autoSetup.motionSuggestionStatus.review");
    case "rejected":
      return t("autoSetup.motionSuggestionStatus.rejected");
  }
}

export function formatMotionSuggestionConfidence(
  t: (key: I18nKey) => string,
  confidence: MotionSuggestionConfidence,
): string {
  switch (confidence) {
    case "low":
      return t("autoSetup.motionSuggestionConfidence.low");
    case "medium":
      return t("autoSetup.motionSuggestionConfidence.medium");
    case "high":
      return t("autoSetup.motionSuggestionConfidence.high");
  }
}

export function formatMotionSuggestionWarning(
  t: (key: I18nKey) => string,
  warning: string,
): string {
  switch (warning) {
    case "roundMask":
      return t("autoSetup.motionSuggestionWarning.roundMask");
    case "smallMask":
      return t("autoSetup.motionSuggestionWarning.smallMask");
    case "multiLobeMask":
      return t("autoSetup.motionSuggestionWarning.multiLobeMask");
    case "protectedFaceAdjacent":
      return t("autoSetup.motionSuggestionWarning.protectedFaceAdjacent");
    case "weakAdjacency":
      return t("autoSetup.motionSuggestionWarning.weakAdjacency");
    case "lowConfidence":
      return t("autoSetup.motionSuggestionWarning.lowConfidence");
    case "manualReviewRequired":
      return t("autoSetup.motionSuggestionWarning.manualReviewRequired");
    default:
      return t("autoSetup.motionSuggestionWarning.manualReviewRequired");
  }
}

export function formatMotionSuggestionSource(
  t: (key: I18nKey) => string,
  region: MotionRegion,
): string {
  if (region.acceptedMaskAlphaHash) {
    return t("autoSetup.motionSuggestionSource.acceptedMask");
  }
  if (region.handleSuggestion?.status === "rejected") {
    return t("autoSetup.motionSuggestionSource.invalidMask");
  }
  return t("autoSetup.motionSuggestionSource.pseudoMask");
}

export function formatMotionQualityGateId(
  t: (key: I18nKey) => string,
  id: string,
): string {
  switch (id) {
    case "motionStress.protectedArea":
      return t("autoSetup.motionStressCheck.protectedArea");
    case "motionStress.duplicateOutline":
      return t("autoSetup.motionStressCheck.duplicateOutline");
    case "motionStress.hiddenReveal":
      return t("autoSetup.motionStressCheck.hiddenReveal");
    case "motionStress.restConsistency":
      return t("autoSetup.motionStressCheck.restConsistency");
    case "motionStress.incompleteCheck":
      return t("autoSetup.motionStressCheck.incompleteCheck");
    case "rest_recompose_delta":
      return t("autoSetup.qualityGate.restRecomposeDelta");
    case "protected_crop_delta":
      return t("autoSetup.qualityGate.protectedCropDelta");
    case "stress_pose_delta":
      return t("autoSetup.qualityGate.stressPoseDelta");
    case "duplicate_contour_score":
      return t("autoSetup.qualityGate.duplicateOutline");
    case "alpha_halo_score":
      return t("autoSetup.qualityGate.alphaHaloScore");
    case "hidden_reveal_score":
      return t("autoSetup.qualityGate.hiddenRevealScore");
    case "runtime_profile_scan":
      return t("autoSetup.qualityGate.runtimeProfileScan");
    case "provider_boundary_scan":
      return t("autoSetup.qualityGate.providerBoundaryScan");
    default:
      return id;
  }
}

export function formatMotionStressAction(
  t: (key: I18nKey) => string,
  id: PublicMotionStressCheckId,
  status: QualityGateStatus,
): string {
  if (status === "pass") return t("autoSetup.motionStressAction.pass");
  if (status === "notRun") return t("autoSetup.motionStressAction.incompleteCheck");
  switch (id) {
    case "motionStress.protectedArea":
      return t("autoSetup.motionStressAction.protectedArea");
    case "motionStress.duplicateOutline":
      return t("autoSetup.motionStressAction.duplicateOutline");
    case "motionStress.hiddenReveal":
      return t("autoSetup.motionStressAction.hiddenReveal");
    case "motionStress.restConsistency":
      return t("autoSetup.motionStressAction.restConsistency");
    case "motionStress.incompleteCheck":
      return t("autoSetup.motionStressAction.incompleteCheck");
  }
}

function projectQualityGateToPublicStressCheckId(
  id: string,
): PublicMotionStressCheckId {
  switch (id) {
    case "protected_crop_delta":
    case "stress_pose_delta":
    case "alpha_halo_score":
      return "motionStress.protectedArea";
    case "duplicate_contour_score":
      return "motionStress.duplicateOutline";
    case "hidden_reveal_score":
      return "motionStress.hiddenReveal";
    case "rest_recompose_delta":
    case "runtime_profile_scan":
    case "provider_boundary_scan":
    default:
      return "motionStress.restConsistency";
  }
}

function createCleanupComparisons(
  result: AutoSetupResult,
): readonly AutoSetupCleanupComparison[] {
  const operationSet = new Set(
    result.occlusionCleanupReport?.pairReports?.flatMap((report) => report.operations) ?? [],
  );
  const hasCleanup = operationSet.size > 0;
  return Object.freeze([
    {
      id: "none",
      status: hasCleanup ? "blocked" : "preferred",
    },
    ...(operationSet.has("lower-holdout")
      ? [
          { id: "lowerHoldout", status: "recommended" } as const,
          { id: "featherHoldout", status: "available" } as const,
        ]
      : []),
    ...(operationSet.has("duplicate-contour")
      ? [{ id: "duplicateOutlineSuppression", status: "recommended" } as const]
      : []),
    ...(operationSet.has("underpaint")
      ? [{ id: "acceptedUnderpaintReveal", status: "recommended" } as const]
      : []),
  ]);
}

function stressStatusToBucket(
  status: QualityGateStatus,
): AutoSetupPublicStressCheck["severityBucket"] {
  switch (status) {
    case "fail":
      return "high";
    case "warning":
      return "medium";
    case "pass":
      return "low";
    case "notRun":
      return undefined;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function mergePublicStressChecks(
  checks: readonly AutoSetupPublicStressCheck[],
): readonly AutoSetupPublicStressCheck[] {
  return checks.reduce<AutoSetupPublicStressCheck[]>((merged, check) => {
    const normalized = {
      id: check.id,
      status: check.status,
      severityBucket: stressStatusToBucket(check.status),
    } satisfies AutoSetupPublicStressCheck;
    const existing = merged.find((entry) => entry.id === check.id);
    if (!existing) return [...merged, normalized];
    if (compareGateSeverity(normalized.status, existing.status) <= 0) return merged;
    return merged.map((entry) => (entry.id === check.id ? normalized : entry));
  }, []);
}

function compareGateSeverity(
  left: QualityGateStatus,
  right: QualityGateStatus,
): number {
  return gateSeverityRank(left) - gateSeverityRank(right);
}

function gateSeverityRank(status: QualityGateStatus): number {
  switch (status) {
    case "fail":
      return 3;
    case "warning":
      return 2;
    case "notRun":
      return 1;
    case "pass":
      return 0;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
