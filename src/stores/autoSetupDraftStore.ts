import type { ProjectData } from "@vivi2d/core/types";
import { create } from "zustand";
import type { AutoSetupOptions, AutoSetupResult } from "@/lib/auto-setup";
import {
  createFallbackAutoSetupSourceFingerprint,
  validateSafeAutoSetupPlan,
} from "@vivi2d/editor-core/safe-auto-setup-plan";
import { assertNoEditorPreviewFields } from "@vivi2d/editor-core/motion-handles";
import type { SeeThroughEyeClippingPlan } from "@vivi2d/editor-core/see-through-eye-clipping";
import type { SeeThroughEyeRigPlan } from "@vivi2d/editor-core/see-through-eye-rig";
import type { SeeThroughLeftRightSplitSummary } from "@vivi2d/editor-core/see-through-left-right-split";
import type { SeeThroughMouthRigPlan } from "@vivi2d/editor-core/see-through-mouth-rig";
import type { SeeThroughReadyToRigCleanupSummary } from "@vivi2d/editor-core/see-through-ready-to-rig";

export type AutoSetupDialogStep = "detect" | "options" | "preview";
export type AutoSetupExperienceMode = "beginner" | "advanced";

export interface AutoSetupDraft {
  projectKey: string;
  projectStructureVersion: number;
  step: AutoSetupDialogStep;
  experienceMode: AutoSetupExperienceMode;
  options: AutoSetupOptions;
  excludedIds: string[];
  result: AutoSetupResult | null;
  seeThroughRecommendationsApplied: boolean;
  cleanupSummary: SeeThroughReadyToRigCleanupSummary | null;
  eyeClippingSummary: SeeThroughEyeClippingPlan | null;
  eyeRigSummary: SeeThroughEyeRigPlan | null;
  leftRightSplitSummary: SeeThroughLeftRightSplitSummary | null;
  mouthRigSummary: SeeThroughMouthRigPlan | null;
  useOcclusionAwareMeshDensity: boolean;
}

function hasValidSafePlan(draft: AutoSetupDraft): boolean {
  const plan = draft.result?.plan;
  return !plan || validateSafeAutoSetupPlan(plan).ok;
}

function stripTransientAutoSetupResult(
  result: AutoSetupResult | null,
): AutoSetupResult | null {
  if (!result) return null;
  const { motionHandleDraft: _motionHandleDraft, ...persistableResult } = result;
  return persistableResult;
}

interface AutoSetupDraftState {
  draft: AutoSetupDraft | null;
  saveDraft: (draft: AutoSetupDraft) => void;
  clearDraft: () => void;
  getCompatibleDraft: (
    projectKey: string,
    projectStructureVersion: number,
  ) => AutoSetupDraft | null;
}

export function buildAutoSetupDraftProjectKey(
  project: ProjectData,
  currentFilePath: string | null,
  projectVersion: number,
): string {
  const sourceFingerprint = createFallbackAutoSetupSourceFingerprint(project);
  return `${currentFilePath ?? "__unsaved__"}:${project.width}x${project.height}:v${projectVersion}:source-${sourceFingerprint}`;
}

export const useAutoSetupDraftStore = create<AutoSetupDraftState>()((set, get) => ({
  draft: null,
  saveDraft: (draft) => {
    if (!hasValidSafePlan(draft)) {
      set({ draft: null });
      return;
    }
    const persistableResult = stripTransientAutoSetupResult(draft.result);
    try {
      if (persistableResult) assertNoEditorPreviewFields(persistableResult);
    } catch {
      set({ draft: null });
      return;
    }
    set({
      draft: structuredClone({
        ...draft,
        result: persistableResult,
      }),
    });
  },
  clearDraft: () => set({ draft: null }),
  getCompatibleDraft: (projectKey, projectStructureVersion) => {
    const draft = get().draft;
    if (!draft) return null;
    if (
      draft.projectKey !== projectKey ||
      draft.projectStructureVersion !== projectStructureVersion
    ) {
      set({ draft: null });
      return null;
    }
    if (!hasValidSafePlan(draft)) {
      set({ draft: null });
      return null;
    }
    return structuredClone(draft);
  },
}));
