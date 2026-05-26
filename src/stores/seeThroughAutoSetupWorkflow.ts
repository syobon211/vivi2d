import type { ProjectData } from "@vivi2d/core/types";
import {
  applySeeThroughEyeClipping,
  type SeeThroughEyeClippingPlan,
} from "@vivi2d/editor-core/see-through-eye-clipping";
import {
  applySeeThroughLeftRightSplitAssistant,
  type SeeThroughLeftRightSplitSummary,
} from "@vivi2d/editor-core/see-through-left-right-split";
import {
  applySeeThroughReadyToRigCleanup,
  type SeeThroughReadyToRigCleanupSummary,
} from "@vivi2d/editor-core/see-through-ready-to-rig";
import {
  applySeeThroughEyeRig,
  type SeeThroughEyeRigPlan,
} from "@vivi2d/editor-core/see-through-eye-rig";
import {
  applySeeThroughMouthRig,
  type SeeThroughMouthRigPlan,
} from "@vivi2d/editor-core/see-through-mouth-rig";
import { useEditorStore } from "@/stores/editorStore";
import {
  bumpProjectStructureVersion,
  mutateProject,
  runInHistoryTransaction,
} from "@/stores/projectMutator";

type SeeThroughWorkflowSummary = {
  applied: boolean;
};

function runSeeThroughProjectWorkflow<
  TSummary extends SeeThroughWorkflowSummary,
>(applyWorkflow: (project: ProjectData) => TSummary): TSummary | null {
  const project = useEditorStore.getState().project;
  if (!project) return null;

  const previewProject = structuredClone(project);
  let summary = applyWorkflow(previewProject);
  if (summary.applied) {
    runInHistoryTransaction(() => {
      let appliedToDraft = false;
      mutateProject((draftProject) => {
        summary = applyWorkflow(draftProject);
        appliedToDraft = summary.applied;
      });
      if (appliedToDraft) {
        bumpProjectStructureVersion();
      }
    });
  }
  return summary;
}

export function runSeeThroughReadyToRigCleanup(): SeeThroughReadyToRigCleanupSummary | null {
  return runSeeThroughProjectWorkflow(applySeeThroughReadyToRigCleanup);
}

export function runSeeThroughEyeClipping(): SeeThroughEyeClippingPlan | null {
  return runSeeThroughProjectWorkflow(applySeeThroughEyeClipping);
}

export function runSeeThroughEyeRig(): SeeThroughEyeRigPlan | null {
  return runSeeThroughProjectWorkflow(applySeeThroughEyeRig);
}

export function runSeeThroughLeftRightRepair(): SeeThroughLeftRightSplitSummary | null {
  return runSeeThroughProjectWorkflow(applySeeThroughLeftRightSplitAssistant);
}

export function runSeeThroughMouthRig(): SeeThroughMouthRigPlan | null {
  return runSeeThroughProjectWorkflow(applySeeThroughMouthRig);
}
