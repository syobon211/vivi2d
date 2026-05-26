import { findLayerById } from "@vivi2d/core/layer-utils";
import type { ProjectData } from "@vivi2d/core/types";
import {
  applyAnimationTrackCleanup,
  applyParameterBindingCleanup,
  applySceneBlendCleanup,
  applyStateMachineCleanup,
  planAnimationTrackCleanup,
  planParameterBindingCleanup,
  planSceneBlendCleanup,
  planStateMachineCleanup,
  type AnimationTrackCleanupPlan,
  type ParameterBindingCleanupPlan,
  type SceneBlendCleanupPlan,
  type StateMachineCleanupPlan,
} from "@vivi2d/editor-core/rig-health-workflow-cleanup";
import { t as tGlobal } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { mutateProject } from "@/stores/projectMutator";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";

function formatI18nTemplate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(params[key] ?? ""),
  );
}

export function getParameterBindingCleanupPlan(): ParameterBindingCleanupPlan | null {
  const currentProject = useEditorStore.getState().project;
  return currentProject ? planParameterBindingCleanup(currentProject) : null;
}

export function getStateMachineCleanupPlan(): StateMachineCleanupPlan | null {
  const currentProject = useEditorStore.getState().project;
  return currentProject ? planStateMachineCleanup(currentProject) : null;
}

export function getSceneBlendCleanupPlan(): SceneBlendCleanupPlan | null {
  const currentProject = useEditorStore.getState().project;
  return currentProject ? planSceneBlendCleanup(currentProject) : null;
}

export function getAnimationTrackCleanupPlan(): AnimationTrackCleanupPlan | null {
  const currentProject = useEditorStore.getState().project;
  return currentProject ? planAnimationTrackCleanup(currentProject) : null;
}

function resolveParameterBindingCleanupLayerId(
  currentProject: ProjectData,
  plan: ParameterBindingCleanupPlan,
): string | undefined {
  if (plan.bindingIds.length === 0) return undefined;
  const planBindingIds = new Set(plan.bindingIds);
  for (const binding of currentProject.parameterBindings ?? []) {
    if (!planBindingIds.has(binding.id)) continue;
    if (binding.target.type === "bone") {
      if (findLayerById(currentProject.layers, binding.target.boneId)) {
        return binding.target.boneId;
      }
      continue;
    }
    if (binding.target.type === "ikController") {
      const controllerId = binding.target.controllerId;
      const controller = currentProject.ikControllers?.find(
        (entry) => entry.id === controllerId,
      );
      const layerId = controller?.boneChain[0]?.boneId;
      if (layerId && findLayerById(currentProject.layers, layerId)) {
        return layerId;
      }
      continue;
    }
  }
  return undefined;
}

export function runParameterBindingCleanup(): void {
  const currentProject = useEditorStore.getState().project;
  if (!currentProject) return;
  const plan = planParameterBindingCleanup(currentProject);
  if (plan.bindingIds.length === 0) return;
  const focusLayerId = resolveParameterBindingCleanupLayerId(currentProject, plan);
  mutateProject((nextProject) => {
    applyParameterBindingCleanup(nextProject, plan);
  });
  useWorkspaceModeStore.getState().setMode("default");
  if (focusLayerId) {
    useSelectionStore.getState().selectLayer(focusLayerId);
  }
  useNotificationStore
    .getState()
    .addNotification(
      "info",
      formatI18nTemplate(tGlobal("notify.cleanedParameterBindings"), {
        count: plan.bindingIds.length,
      }),
    );
}

export function runStateMachineCleanup(): void {
  const plan = getStateMachineCleanupPlan();
  if (
    !plan ||
    (plan.initialStateFixes.length === 0 &&
      plan.clearedStateClipRefs.length === 0 &&
      plan.blendTreeReplacements.length === 0 &&
      plan.removedTransitions.length === 0 &&
      plan.removedConditions.length === 0)
  ) {
    return;
  }
  mutateProject((nextProject) => {
    applyStateMachineCleanup(nextProject, plan);
  });
  useWorkspaceModeStore.getState().setMode("animation");
  const affectedCount =
    plan.initialStateFixes.length +
    plan.clearedStateClipRefs.length +
    plan.blendTreeReplacements.length +
    plan.removedTransitions.length +
    plan.removedConditions.reduce((sum, value) => sum + value.indices.length, 0);
  useNotificationStore
    .getState()
    .addNotification(
      "info",
      formatI18nTemplate(tGlobal("notify.cleanedStateMachines"), {
        count: affectedCount,
      }),
    );
}

export function runSceneBlendCleanup(): void {
  const plan = getSceneBlendCleanupPlan();
  if (
    !plan ||
    (plan.removedBlendIds.length === 0 &&
      plan.normalizedDurationBlendIds.length === 0)
  ) {
    return;
  }
  mutateProject((nextProject) => {
    applySceneBlendCleanup(nextProject, plan);
  });
  useWorkspaceModeStore.getState().setMode("default");
  const affectedCount =
    plan.removedBlendIds.length + plan.normalizedDurationBlendIds.length;
  useNotificationStore
    .getState()
    .addNotification(
      "info",
      formatI18nTemplate(tGlobal("notify.cleanedSceneBlends"), {
        count: affectedCount,
      }),
    );
}

export function runAnimationTrackCleanup(): void {
  const plan = getAnimationTrackCleanupPlan();
  if (!plan || plan.clipTargets.length === 0) return;
  mutateProject((nextProject) => {
    applyAnimationTrackCleanup(nextProject, plan);
  });
  useWorkspaceModeStore.getState().setMode("animation");
  useTimelineStore.getState().setActiveClip(plan.clipTargets[0]?.clipId ?? null);
  const affectedCount =
    plan.removedParameterTrackCount +
    plan.removedBoneTrackCount +
    plan.removedImageSequenceTrackCount +
    plan.removedIkControllerTrackCount +
    plan.removedLipSyncTrackCount +
    plan.clearedLipSyncParameterTargetCount;
  useNotificationStore
    .getState()
    .addNotification(
      "info",
      formatI18nTemplate(tGlobal("notify.cleanedAnimationTracks"), {
        count: affectedCount,
      }),
    );
}
