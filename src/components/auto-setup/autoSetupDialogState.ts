import {
  type AutoSetupOptions,
  type AutoSetupResult,
} from "@/lib/auto-setup";
import type { SeeThroughEyeClippingPlan } from "@vivi2d/editor-core/see-through-eye-clipping";
import type { SeeThroughEyeRigPlan } from "@vivi2d/editor-core/see-through-eye-rig";
import type { SeeThroughLeftRightSplitSummary } from "@vivi2d/editor-core/see-through-left-right-split";
import type { SeeThroughMouthRigPlan } from "@vivi2d/editor-core/see-through-mouth-rig";
import type { SeeThroughReadyToRigCleanupSummary } from "@vivi2d/editor-core/see-through-ready-to-rig";
import { SafeAutoSetupAuditHashUnsupportedError } from "@vivi2d/editor-core/layer-graph-safe-plan";
import type {
  AutoSetupDialogStep,
  AutoSetupExperienceMode,
} from "@/stores/autoSetupDraftStore";

const DEFAULT_AUTO_SETUP_MIN_CONFIDENCE = 0.3;
const MANUAL_PNG_AUTO_SETUP_MIN_CONFIDENCE = 0.1;

export function isUnsupportedAuditHashHostError(err: unknown): boolean {
  return err instanceof SafeAutoSetupAuditHashUnsupportedError;
}

export function createExcludedIdsCacheKey(ids: ReadonlySet<string>): string {
  return [...ids].sort().join("\0");
}

export function defaultAutoSetupMinConfidence(
  project: { sourceKind?: string | null } | null | undefined,
): number {
  return project?.sourceKind === "manualPng"
    ? MANUAL_PNG_AUTO_SETUP_MIN_CONFIDENCE
    : DEFAULT_AUTO_SETUP_MIN_CONFIDENCE;
}

export function createDefaultAutoSetupOptions(
  project?: { sourceKind?: string | null } | null,
): AutoSetupOptions {
  return {
    generateBones: true,
    generatePhysics: true,
    generateMeshes: true,
    generateWeights: true,
    meshPreset: "standard",
    minConfidence: defaultAutoSetupMinConfidence(project),
  };
}

export function hasMeaningfulAutoSetupDraft(
  step: AutoSetupDialogStep,
  experienceMode: AutoSetupExperienceMode,
  options: AutoSetupOptions,
  excludedIds: Set<string>,
  result: AutoSetupResult | null,
  seeThroughRecommendationsApplied: boolean,
  cleanupSummary: SeeThroughReadyToRigCleanupSummary | null,
  eyeClippingSummary: SeeThroughEyeClippingPlan | null,
  eyeRigSummary: SeeThroughEyeRigPlan | null,
  leftRightSplitSummary: SeeThroughLeftRightSplitSummary | null,
  mouthRigSummary: SeeThroughMouthRigPlan | null,
  useOcclusionAwareMeshDensity: boolean,
  defaultUseOcclusionAwareMeshDensity: boolean,
  defaultOptions: AutoSetupOptions,
): boolean {
  return (
    step !== "detect" ||
    experienceMode !== "beginner" ||
    options.generateBones !== defaultOptions.generateBones ||
    options.generatePhysics !== defaultOptions.generatePhysics ||
    options.generateMeshes !== defaultOptions.generateMeshes ||
    options.generateWeights !== defaultOptions.generateWeights ||
    options.meshPreset !== defaultOptions.meshPreset ||
    options.minConfidence !== defaultOptions.minConfidence ||
    excludedIds.size > 0 ||
    result !== null ||
    seeThroughRecommendationsApplied ||
    cleanupSummary !== null ||
    eyeClippingSummary !== null ||
    eyeRigSummary !== null ||
    leftRightSplitSummary !== null ||
    mouthRigSummary !== null ||
    useOcclusionAwareMeshDensity !== defaultUseOcclusionAwareMeshDensity
  );
}
