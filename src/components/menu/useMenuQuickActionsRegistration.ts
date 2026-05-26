import { useEffect } from "react";
import {
  getAutoSetupProjectBlockReasonKey,
  isAutoSetupDiscoverableProject,
} from "@/lib/project-source-kind";
import { getTexture } from "@/lib/texture-store";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import type { QuickActionRegistration } from "@/stores/quickActionRegistryStore";
import { registerViewQuickActions } from "./registerViewQuickActions";

// biome-ignore lint/suspicious/noExplicitAny: This legacy hook receives a broad menu view-model bag until the menu API is split.
type MenuQuickActionsRegistrationParams = Record<string, any> & {
  registerQuickAction: (action: QuickActionRegistration) => void;
  unregisterQuickAction: (id: string) => void;
};

export function useMenuQuickActionsRegistration(
  params: MenuQuickActionsRegistrationParams,
) {
  const {
    autoSetupCommandInFlight,
    meshHeatmap,
    meshHeatmapSelectionReason,
    openDepthInspector,
    getCurrentSelectedViviMesh,
    getCurrentSelectedSkinMesh,
    getOrphanSkinCount,
    autoMeshSelectionReason,
    autoMeshTextureReason,
    autoWeightSkinReason,
    orphanSkinsMissingReason,
    parameterBindingCleanupReason,
    stateMachineCleanupReason,
    sceneBlendCleanupReason,
    animationTrackCleanupReason,
    cleanupOrphanSkins,
    autoWeights,
    normalizeAllWeights,
    getCurrentSelectedBone,
    getParameterBindingCleanupPlan,
    getStateMachineCleanupPlan,
    getSceneBlendCleanupPlan,
    getAnimationTrackCleanupPlan,
    boneSelectionReason,
    removeBone,
    setAutoMesh,
    project,
    queueAutoSetupCommand,
    registerQuickAction,
    referenceOverlay,
    referenceOverlayImportedBoundsReason,
    referenceOverlaySelectionReason,
    runParameterBindingCleanup,
    runStateMachineCleanup,
    runSceneBlendCleanup,
    runAnimationTrackCleanup,
    seeThroughSummary,
    setWorkspaceMode,
    dialogs,
    projectSourceKind,
    t,
    qa,
    requiresProjectReason,
    unregisterQuickAction,
  } = params;
  useEffect(() => {
    if (isAutoSetupDiscoverableProject(project, projectSourceKind)) {
      const autoSetupBlockReasonKey = getAutoSetupProjectBlockReasonKey(
        project,
        projectSourceKind,
      );
      const autoSetupDisabledReason = autoSetupBlockReasonKey
        ? t(autoSetupBlockReasonKey)
        : undefined;
      registerQuickAction({
        id: "menu.autoSetup",
        section: "project",
        title: t("menu.autoSetup"),
        description: t("menu.autoSetupTitle"),
        keywords: ["auto", "setup", "rig", "see-through", "psd"],
        order: 10,
        run: () => {
          if (!autoSetupDisabledReason) dialogs.openAutoSetup();
        },
        getAvailability: () =>
          autoSetupDisabledReason
            ? { enabled: false, reason: autoSetupDisabledReason }
            : { enabled: true },
      });
    }
    if (!dialogs.showAutoSetup) {
      const seeThroughAvailability = () => {
        if (!project) {
          return { enabled: false, reason: t("quickActions.requiresProject") };
        }
        if (!seeThroughSummary?.isSeeThroughProject) {
          return {
            enabled: false,
            reason: qa("reason.seeThroughProjectRequired"),
          };
        }
        if (autoSetupCommandInFlight) {
          return {
            enabled: false,
            reason: qa("reason.autoSetupQuickActionRunning"),
          };
        }
        return { enabled: true };
      };

      registerQuickAction({
        id: "menu.autoSetup.readyToRig",
        section: "project",
        title: qa("action.readyToRig.title"),
        description: qa("action.readyToRig.description"),
        keywords: ["auto", "setup", "ready", "rig", "cleanup", "see-through"],
        order: 30,
        run: () => queueAutoSetupCommand("readyToRig"),
        getAvailability: seeThroughAvailability,
      });
      registerQuickAction({
        id: "menu.autoSetup.meshRefine",
        section: "project",
        title: qa("action.refineImportedMeshes.title"),
        description: qa("action.refineImportedMeshes.description"),
        keywords: ["auto", "setup", "mesh", "refine", "see-through"],
        order: 35,
        run: () => queueAutoSetupCommand("meshRefine"),
        getAvailability: seeThroughAvailability,
      });
      registerQuickAction({
        id: "menu.autoSetup.eyeClipping",
        section: "project",
        title: qa("action.applyAutomaticEyeClipping.title"),
        description: qa("action.applyAutomaticEyeClipping.description"),
        keywords: ["auto", "setup", "eye", "clipping", "see-through"],
        order: 40,
        run: () => queueAutoSetupCommand("eyeClipping"),
        getAvailability: seeThroughAvailability,
      });
      registerQuickAction({
        id: "menu.autoSetup.eyeRig",
        section: "project",
        title: qa("action.createBasicEyeRig.title"),
        description: qa("action.createBasicEyeRig.description"),
        keywords: ["auto", "setup", "eye", "rig", "blink", "see-through"],
        order: 50,
        run: () => queueAutoSetupCommand("eyeRig"),
        getAvailability: seeThroughAvailability,
      });
      registerQuickAction({
        id: "menu.autoSetup.leftRightRepair",
        section: "project",
        title: qa("action.repairLeftRightRoles.title"),
        description: qa("action.repairLeftRightRoles.description"),
        keywords: ["auto", "setup", "left", "right", "roles", "see-through"],
        order: 60,
        run: () => queueAutoSetupCommand("leftRightRepair"),
        getAvailability: seeThroughAvailability,
      });
      registerQuickAction({
        id: "menu.autoSetup.mouthRig",
        section: "project",
        title: qa("action.createBasicMouthRig.title"),
        description: qa("action.createBasicMouthRig.description"),
        keywords: ["auto", "setup", "mouth", "rig", "lipsync", "see-through"],
        order: 70,
        run: () => queueAutoSetupCommand("mouthRig"),
        getAvailability: seeThroughAvailability,
      });
    }
    registerQuickAction({
      id: "project.physicsPanel",
      section: "project",
      title: qa("action.openPhysicsPanel.title"),
      description: qa("action.openPhysicsPanel.description"),
      keywords: ["physics", "hair", "strand", "secondary", "rigging"],
      order: 80,
      run: () => setWorkspaceMode("rigging"),
      getAvailability: () =>
        project
          ? { enabled: true }
          : { enabled: false, reason: t("quickActions.requiresProject") },
    });
    registerQuickAction({
      id: "project.propertiesPanel",
      section: "project",
      title: qa("action.openPropertiesPanel.title"),
      description: qa("action.openPropertiesPanel.description"),
      keywords: ["properties", "binding", "parameter", "review", "panel"],
      order: 80.1,
      run: () => setWorkspaceMode("default"),
      getAvailability: () =>
        project
          ? { enabled: true }
          : { enabled: false, reason: requiresProjectReason },
    });
    registerQuickAction({
      id: "project.stateMachinePanel",
      section: "project",
      title: qa("action.openStateMachinePanel.title"),
      description: qa("action.openStateMachinePanel.description"),
      keywords: ["state", "machine", "animation", "logic", "review"],
      order: 80.2,
      run: () => setWorkspaceMode("animation"),
      getAvailability: () =>
        project
          ? { enabled: true }
          : { enabled: false, reason: requiresProjectReason },
    });
    registerQuickAction({
      id: "project.sceneBlendPanel",
      section: "project",
      title: qa("action.openSceneBlendPanel.title"),
      description: qa("action.openSceneBlendPanel.description"),
      keywords: ["scene", "blend", "transition", "review"],
      order: 80.3,
      run: () => setWorkspaceMode("default"),
      getAvailability: () =>
        project
          ? { enabled: true }
          : { enabled: false, reason: requiresProjectReason },
    });
    registerQuickAction({
      id: "project.timelinePanel",
      section: "project",
      title: qa("action.openTimelinePanel.title"),
      description: qa("action.openTimelinePanel.description"),
      keywords: ["timeline", "clip", "track", "animation", "review"],
      order: 80.4,
      run: () => setWorkspaceMode("animation"),
      getAvailability: () =>
        project
          ? { enabled: true }
          : { enabled: false, reason: requiresProjectReason },
    });
    registerQuickAction({
      id: "project.cleanupParameterBindings",
      section: "project",
      title: qa("action.cleanParameterBindings.title"),
      description: qa("action.cleanParameterBindings.description"),
      keywords: ["parameter", "binding", "cleanup", "repair", "stale"],
      order: 80.15,
      run: runParameterBindingCleanup,
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        const plan = getParameterBindingCleanupPlan();
        if (!plan || plan.bindingIds.length === 0) {
          return { enabled: false, reason: parameterBindingCleanupReason };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "project.cleanupStateMachines",
      section: "project",
      title: qa("action.cleanStateMachines.title"),
      description: qa("action.cleanStateMachines.description"),
      keywords: ["state", "machine", "cleanup", "repair", "stale"],
      order: 80.25,
      run: runStateMachineCleanup,
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        const plan = getStateMachineCleanupPlan();
        if (
          !plan ||
          (plan.initialStateFixes.length === 0 &&
            plan.clearedStateClipRefs.length === 0 &&
            plan.blendTreeReplacements.length === 0 &&
            plan.removedTransitions.length === 0 &&
            plan.removedConditions.length === 0)
        ) {
          return { enabled: false, reason: stateMachineCleanupReason };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "project.cleanupSceneBlends",
      section: "project",
      title: qa("action.cleanSceneBlends.title"),
      description: qa("action.cleanSceneBlends.description"),
      keywords: ["scene", "blend", "cleanup", "repair", "stale"],
      order: 80.35,
      run: runSceneBlendCleanup,
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        const plan = getSceneBlendCleanupPlan();
        if (
          !plan ||
          (plan.removedBlendIds.length === 0 &&
            plan.normalizedDurationBlendIds.length === 0)
        ) {
          return { enabled: false, reason: sceneBlendCleanupReason };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "project.cleanupAnimationTracks",
      section: "project",
      title: qa("action.cleanAnimationTracks.title"),
      description: qa("action.cleanAnimationTracks.description"),
      keywords: [
        "timeline",
        "track",
        "animation",
        "cleanup",
        "repair",
        "stale",
      ],
      order: 80.45,
      run: runAnimationTrackCleanup,
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        const plan = getAnimationTrackCleanupPlan();
        if (!plan || plan.clipTargets.length === 0) {
          return { enabled: false, reason: animationTrackCleanupReason };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "project.validationDialog",
      section: "project",
      title: t("validation.title"),
      description: t("prop.rigHealth.openValidation"),
      keywords: ["validation", "rig", "health", "diagnostics", "errors"],
      order: 81,
      run: () => useProjectDialogsStore.getState().openValidationDialog(),
      getAvailability: () =>
        project
          ? { enabled: true }
          : { enabled: false, reason: requiresProjectReason },
    });
    registerQuickAction({
      id: "project.cleanupOrphanSkins",
      section: "project",
      title: qa("action.removeOrphanSkins.title"),
      description: qa("action.removeOrphanSkins.description"),
      keywords: ["skin", "cleanup", "orphan", "repair", "validation"],
      order: 83,
      run: () => cleanupOrphanSkins(),
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        if (getOrphanSkinCount() === 0) {
          return { enabled: false, reason: orphanSkinsMissingReason };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "layer.autoMesh.standard",
      section: "project",
      title: qa("action.rebuildSelectedMesh.title"),
      description: qa("action.rebuildSelectedMesh.description"),
      keywords: ["mesh", "auto", "rebuild", "repair", "selected"],
      order: 84,
      run: () => {
        const layer = getCurrentSelectedViviMesh();
        if (!layer || !getTexture(layer.id)) return;
        setAutoMesh(layer.id, "standard");
      },
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        const layer = getCurrentSelectedViviMesh();
        if (!layer) {
          return {
            enabled: false,
            reason: autoMeshSelectionReason,
          };
        }
        if (!getTexture(layer.id)) {
          return {
            enabled: false,
            reason: autoMeshTextureReason,
          };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "layer.skinAutoWeights",
      section: "project",
      title: qa("action.autoWeightSelectedMesh.title"),
      description: qa("action.autoWeightSelectedMesh.description"),
      keywords: ["skin", "weights", "auto", "selected", "repair"],
      order: 85,
      run: () => {
        const layer = getCurrentSelectedSkinMesh();
        if (!layer) return;
        autoWeights(layer.id);
      },
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        if (!getCurrentSelectedSkinMesh()) {
          return {
            enabled: false,
            reason: autoWeightSkinReason,
          };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "layer.normalizeSkinWeights",
      section: "project",
      title: qa("action.normalizeSelectedSkinWeights.title"),
      description: qa("action.normalizeSelectedSkinWeights.description"),
      keywords: ["skin", "weights", "normalize", "selected", "repair"],
      order: 86,
      run: () => {
        const layer = getCurrentSelectedSkinMesh();
        if (!layer) return;
        normalizeAllWeights(layer.id);
      },
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        if (!getCurrentSelectedSkinMesh()) {
          return {
            enabled: false,
            reason: autoWeightSkinReason,
          };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "layer.removeSelectedBone",
      section: "project",
      title: qa("action.deleteSelectedBone.title"),
      description: qa("action.deleteSelectedBone.description"),
      keywords: ["bone", "delete", "remove", "unused", "repair"],
      order: 88,
      run: () => {
        const layer = getCurrentSelectedBone();
        if (!layer) return;
        removeBone(layer.id);
      },
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        if (!getCurrentSelectedBone()) {
          return {
            enabled: false,
            reason: boneSelectionReason,
          };
        }
        return { enabled: true };
      },
    });
    registerQuickAction({
      id: "project.depthInspector",
      section: "project",
      title: t("prop.depthInspector.title"),
      description: t("prop.depthInspector.open"),
      keywords: ["depth", "inspector", "see-through", "draw order"],
      order: 83,
      run: openDepthInspector,
      getAvailability: () => {
        if (!project) {
          return { enabled: false, reason: requiresProjectReason };
        }
        if (!seeThroughSummary?.isSeeThroughProject) {
          return {
            enabled: false,
            reason: qa("reason.seeThroughImportedLayerRequired"),
          };
        }
        return { enabled: true };
      },
    });
    registerViewQuickActions(params);
    return () => {
      unregisterQuickAction("menu.autoSetup");
      unregisterQuickAction("menu.autoSetup.readyToRig");
      unregisterQuickAction("menu.autoSetup.meshRefine");
      unregisterQuickAction("menu.autoSetup.eyeClipping");
      unregisterQuickAction("menu.autoSetup.eyeRig");
      unregisterQuickAction("menu.autoSetup.leftRightRepair");
      unregisterQuickAction("menu.autoSetup.mouthRig");
      unregisterQuickAction("project.physicsPanel");
      unregisterQuickAction("project.propertiesPanel");
      unregisterQuickAction("project.stateMachinePanel");
      unregisterQuickAction("project.sceneBlendPanel");
      unregisterQuickAction("project.timelinePanel");
      unregisterQuickAction("project.cleanupParameterBindings");
      unregisterQuickAction("project.cleanupStateMachines");
      unregisterQuickAction("project.cleanupSceneBlends");
      unregisterQuickAction("project.cleanupAnimationTracks");
      unregisterQuickAction("project.validationDialog");
      unregisterQuickAction("project.cleanupOrphanSkins");
      unregisterQuickAction("layer.autoMesh.standard");
      unregisterQuickAction("layer.skinAutoWeights");
      unregisterQuickAction("layer.normalizeSkinWeights");
      unregisterQuickAction("layer.removeSelectedBone");
      unregisterQuickAction("project.depthInspector");
      unregisterQuickAction("view.referenceOverlay.toggle");
      unregisterQuickAction("view.referenceOverlay.source");
      unregisterQuickAction("view.referenceOverlay.currentBounds");
      unregisterQuickAction("view.referenceOverlay.importedBounds");
      unregisterQuickAction("view.referenceOverlay.compareBounds");
      unregisterQuickAction(
        "view.referenceOverlay.comparePreset.sourceCurrent",
      );
      unregisterQuickAction(
        "view.referenceOverlay.comparePreset.sourceImported",
      );
      unregisterQuickAction(
        "view.referenceOverlay.comparePreset.currentImported",
      );
      unregisterQuickAction("view.referenceOverlay.compareSwap");
      unregisterQuickAction("view.referenceOverlay.pinCompareSummary");
      unregisterQuickAction("view.referenceOverlay.opacity.25");
      unregisterQuickAction("view.referenceOverlay.opacity.50");
      unregisterQuickAction("view.referenceOverlay.opacity.75");
      unregisterQuickAction("view.referenceOverlay.opacity.100");
      unregisterQuickAction("view.meshHeatmap.toggle");
      unregisterQuickAction("view.meshHeatmap.intensity.50");
      unregisterQuickAction("view.meshHeatmap.intensity.100");
      unregisterQuickAction("view.meshHeatmap.intensity.150");
      unregisterQuickAction("view.meshHeatmap.intensity.200");
    };
  }, [
    autoSetupCommandInFlight,
    meshHeatmap.enabled,
    meshHeatmapSelectionReason,
    openDepthInspector,
    getCurrentSelectedViviMesh,
    getCurrentSelectedSkinMesh,
    getOrphanSkinCount,
    autoMeshSelectionReason,
    autoMeshTextureReason,
    autoWeightSkinReason,
    orphanSkinsMissingReason,
    parameterBindingCleanupReason,
    stateMachineCleanupReason,
    sceneBlendCleanupReason,
    animationTrackCleanupReason,
    cleanupOrphanSkins,
    autoWeights,
    normalizeAllWeights,
    getCurrentSelectedBone,
    getParameterBindingCleanupPlan,
    getStateMachineCleanupPlan,
    getSceneBlendCleanupPlan,
    getAnimationTrackCleanupPlan,
    boneSelectionReason,
    removeBone,
    setAutoMesh,
    project,
    queueAutoSetupCommand,
    registerQuickAction,
    referenceOverlay.enabled,
    referenceOverlayImportedBoundsReason,
    referenceOverlaySelectionReason,
    runParameterBindingCleanup,
    runStateMachineCleanup,
    runSceneBlendCleanup,
    runAnimationTrackCleanup,
    seeThroughSummary,
    setWorkspaceMode,
    dialogs,
    projectSourceKind,
    t,
    unregisterQuickAction,
    referenceOverlay.compareSecondary,
    requiresProjectReason,
    referenceOverlay.comparePrimary,
    referenceOverlay.pinCompareSummary,
    qa,
  ]);
}
