import { findLayerById, flattenLayers } from "@vivi2d/core/layer-utils";
import { isViviMesh, isBone } from "@vivi2d/core/types";
import { useCallback, useEffect, useMemo } from "react";
import { buildDepthInspectorReferenceOverlaySettings } from "@/lib/depth-inspector-reference-overlay";
import type { I18nKey } from "@/lib/i18n";
import { t as tGlobal, useI18nStore, useT } from "@/lib/i18n";
import {
  getAutoSetupProjectBlockReasonKey,
  isAutoSetupDiscoverableProject,
} from "@/lib/project-source-kind";
import { summarizeSeeThroughAutoSetup } from "@/lib/see-through-auto-setup";
import { useAutoSetupCommandStore } from "@/stores/autoSetupCommandStore";
import { buildAutoSetupDraftProjectKey } from "@/stores/autoSetupDraftStore";
import { useBoneStore } from "@/stores/boneStore";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useMultiViewStore } from "@/stores/multiViewStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import {
  closeProject,
  loadProject,
  loadPsd,
  saveProject,
} from "@/stores/projectIO";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import {
  getAnimationTrackCleanupPlan,
  getParameterBindingCleanupPlan,
  getSceneBlendCleanupPlan,
  getStateMachineCleanupPlan,
  runAnimationTrackCleanup,
  runParameterBindingCleanup,
  runSceneBlendCleanup,
  runStateMachineCleanup,
} from "@/stores/rigHealthCleanup";
import { useSelectionStore } from "@/stores/selectionStore";
import { useSkinStore } from "@/stores/skinStore";
import { useThemeStore } from "@/stores/themeStore";
import { useViewportStore } from "@/stores/viewportStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import { MenuDialogsHost } from "./menu/MenuDialogsHost";
import {
  EditHistorySection,
  FileMenuSection,
  IntegrationsMenuSection,
  SettingsMenuSection,
  ViewMenuSection,
} from "./menu/MenuSections";
import { ToolButtons } from "./menu/ToolButtons";
import { useMenuDialogs } from "./menu/useMenuDialogs";
import { useMenuQuickActionsRegistration } from "./menu/useMenuQuickActionsRegistration";

export function MenuBar() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const projectVersion = useEditorStore((s) => s.projectVersion);
  const projectStructureVersion = useEditorStore(
    (s) => s.projectStructureVersion,
  );
  const currentFilePath = useEditorStore((s) => s.currentFilePath);
  const projectSourceKind = useEditorStore((s) => s.projectSourceKind);
  const resetView = useViewportStore((s) => s.resetView);
  const defaultFormLocked = useViewportStore((s) => s.defaultFormLocked);
  const toggleDefaultFormLock = useViewportStore(
    (s) => s.toggleDefaultFormLock,
  );
  const onionSkinEnabled = useViewportStore((s) => s.onionSkin.enabled);
  const toggleOnionSkin = useViewportStore((s) => s.toggleOnionSkin);
  const referenceOverlay = useViewportStore((s) => s.referenceOverlay);
  const meshHeatmap = useViewportStore((s) => s.meshHeatmap);
  const currentTheme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const workspaceMode = useWorkspaceModeStore((s) => s.mode);
  const setWorkspaceMode = useWorkspaceModeStore((s) => s.setMode);
  const openQuickActions = useQuickActionsStore((s) => s.openPalette);
  const registerQuickAction = useQuickActionRegistryStore(
    (s) => s.registerAction,
  );
  const unregisterQuickAction = useQuickActionRegistryStore(
    (s) => s.unregisterAction,
  );
  const requestAutoSetupCommand = useAutoSetupCommandStore(
    (s) => s.requestCommand,
  );
  const clearAutoSetupCommandIfProjectChanged = useAutoSetupCommandStore(
    (s) => s.clearCommandIfProjectChanged,
  );
  const autoSetupCommandInFlight = useAutoSetupCommandStore(
    (s) => s.commandInFlight,
  );
  const multiViewEnabled = useMultiViewStore((s) => s.enabled);
  const enableMultiView = useMultiViewStore((s) => s.enableMultiView);
  const disableMultiView = useMultiViewStore((s) => s.disableMultiView);
  const undoStack = useHistoryStore((s) => s.undoStack);
  const redoStack = useHistoryStore((s) => s.redoStack);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const setAutoMesh = useEditorStore((s) => s.setAutoMesh);
  const cleanupOrphanSkins = useEditorStore((s) => s.cleanupOrphanSkins);
  const removeBone = useBoneStore((s) => s.removeBone);
  const autoWeights = useSkinStore((s) => s.autoWeights);
  const normalizeAllWeights = useSkinStore((s) => s.normalizeAllWeights);
  const setLocale = useI18nStore((s) => s.setLocale);
  const dialogs = useMenuDialogs();
  const seeThroughSummary = useMemo(
    () => (project ? summarizeSeeThroughAutoSetup(project) : null),
    [project],
  );
  const autoSetupProjectKey = useMemo(
    () =>
      project
        ? buildAutoSetupDraftProjectKey(
            project,
            currentFilePath,
            projectVersion,
          )
        : null,
    [currentFilePath, project, projectVersion],
  );
  const requiresProjectReason = t("quickActions.requiresProject");
  const qa = useCallback(
    (key: string) => t(`quickActions.${key}` as I18nKey),
    [t],
  );
  const autoSetupBlockReasonKey = getAutoSetupProjectBlockReasonKey(
    project,
    projectSourceKind,
  );
  const autoSetupDisabledReason = autoSetupBlockReasonKey
    ? t(autoSetupBlockReasonKey)
    : null;
  const showAutoSetup = isAutoSetupDiscoverableProject(
    project,
    projectSourceKind,
  );
  const referenceOverlaySelectionReason = qa(
    "reason.referenceOverlaySelection",
  );
  const referenceOverlayImportedBoundsReason = qa(
    "reason.referenceOverlayImportedBounds",
  );
  const meshHeatmapSelectionReason = qa("reason.meshHeatmapSelection");
  const autoMeshSelectionReason = qa("reason.autoMeshSelection");
  const autoMeshTextureReason = qa("reason.autoMeshTexture");
  const autoWeightSkinReason = qa("reason.autoWeightSkin");
  const boneSelectionReason = qa("reason.boneSelection");
  const orphanSkinsMissingReason = qa("reason.orphanSkinsMissing");
  const parameterBindingCleanupReason = qa("reason.parameterBindingCleanup");
  const stateMachineCleanupReason = qa("reason.stateMachineCleanup");
  const sceneBlendCleanupReason = qa("reason.sceneBlendCleanup");
  const animationTrackCleanupReason = qa("reason.animationTrackCleanup");
  const getCurrentSelectedViviMesh = useCallback(() => {
    const currentProject = useEditorStore.getState().project;
    const currentSelectedLayerId = useSelectionStore.getState().selectedLayerId;
    if (!currentProject || !currentSelectedLayerId) return null;
    const layer = findLayerById(currentProject.layers, currentSelectedLayerId);
    return layer && isViviMesh(layer) ? layer : null;
  }, []);
  const getCurrentSelectedSkinMesh = useCallback(() => {
    const currentProject = useEditorStore.getState().project;
    const layer = getCurrentSelectedViviMesh();
    if (!currentProject || !layer) return null;
    return currentProject.skins[layer.id] ? layer : null;
  }, [getCurrentSelectedViviMesh]);
  const getCurrentSelectedBone = useCallback(() => {
    const currentProject = useEditorStore.getState().project;
    const currentSelectedLayerId = useSelectionStore.getState().selectedLayerId;
    if (!currentProject || !currentSelectedLayerId) return null;
    const layer = findLayerById(currentProject.layers, currentSelectedLayerId);
    return layer && isBone(layer) ? layer : null;
  }, []);
  const getOrphanSkinCount = useCallback(() => {
    const currentProject = useEditorStore.getState().project;
    if (!currentProject) return 0;
    const validLayerIds = new Set(
      flattenLayers(currentProject.layers).map((layer) => layer.id),
    );
    return Object.keys(currentProject.skins).filter(
      (layerId) => !validLayerIds.has(layerId),
    ).length;
  }, []);
  const openDepthInspector = useCallback(() => {
    const currentProject = useEditorStore.getState().project;
    const currentSelectedLayerId = useSelectionStore.getState().selectedLayerId;
    const overlaySettings = buildDepthInspectorReferenceOverlaySettings(
      currentProject,
      currentSelectedLayerId,
    );
    if (overlaySettings) {
      useViewportStore.getState().setReferenceOverlaySettings(overlaySettings);
    }
    useProjectDialogsStore.getState().openDepthInspector();
  }, []);

  const handleOpenPsd = useCallback(async () => {
    await loadPsd();
  }, []);
  const handleOpenProject = useCallback(async () => {
    await loadProject();
  }, []);
  const handleSave = useCallback(async () => {
    await saveProject(false);
  }, []);
  const handleSaveAs = useCallback(async () => {
    await saveProject(true);
  }, []);
  const handleCloseProject = useCallback(() => {
    closeProject();
    useViewportStore.getState().resetView();
  }, []);
  const queueAutoSetupCommand = useCallback(
    (kind: Parameters<typeof requestAutoSetupCommand>[0]["kind"]) => {
      if (!autoSetupProjectKey || !project) return;
      requestAutoSetupCommand({
        kind,
        projectKey: autoSetupProjectKey,
        projectStructureVersion,
        requestedAt: Date.now(),
      });
      dialogs.openAutoSetup();
    },
    [
      autoSetupProjectKey,
      dialogs,
      project,
      projectStructureVersion,
      requestAutoSetupCommand,
    ],
  );

  useEffect(() => {
    clearAutoSetupCommandIfProjectChanged(
      autoSetupProjectKey,
      projectStructureVersion,
    );
  }, [
    autoSetupProjectKey,
    clearAutoSetupCommandIfProjectChanged,
    projectStructureVersion,
  ]);

  useMenuQuickActionsRegistration({
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
  });
  const handleGlbExport = useCallback(async () => {
    const proj = useEditorStore.getState().project;
    if (!proj) return;
    try {
      const { exportGlb } = await import("@/lib/export/glb-exporter");
      const buffer = await exportGlb(proj);
      const dirPath = await window.electronAPI.selectExportDirectory();
      if (!dirPath) return;
      const base64 = btoa(
        new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""),
      );
      await window.electronAPI.writeExportFiles({
        dirPath,
        files: [{ path: `${proj.name}.glb`, content: base64, isBlob: true }],
      });
      useNotificationStore
        .getState()
        .addNotification("info", tGlobal("menu.glbExportSuccess"));
    } catch {
      useNotificationStore
        .getState()
        .addNotification(
          "error",
          tGlobal("menu.glbExportFailed"),
        );
    }
  }, []);

  return (
    <div className="menu-bar">
      <div className="menu-left">
        <span className="app-title">Vivi2D</span>

        {/* ===== File ===== */}
        <FileMenuSection
          projectLoaded={!!project}
          showAutoSetup={showAutoSetup}
          autoSetupDisabledReason={autoSetupDisabledReason}
          requiresProjectReason={requiresProjectReason}
          onOpenPsd={handleOpenPsd}
          onOpenImage={dialogs.handleOpenImage}
          onImportImageAsLayer={dialogs.handleImportImageAsLayer}
          onImportImagesAsLayers={dialogs.handleImportImagesAsLayers}
          onImportFolderAsLayers={dialogs.handleImportFolderAsLayers}
          onOpenManualPngSplit={() =>
            useProjectDialogsStore.getState().openManualPngSplit()
          }
          onOpenProject={handleOpenProject}
          onOpenVividImport={dialogs.openVividImport}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onOpenExportDialog={dialogs.openExportDialog}
          onOpenMediaExport={dialogs.openMediaExport}
          onGlbExport={handleGlbExport}
          onOpenReimportDialog={dialogs.openReimportDialog}
          onOpenVividExport={dialogs.openVividExport}
          onOpenValidationDialog={() =>
            useProjectDialogsStore.getState().openValidationDialog()
          }
          onOpenAutoSetup={dialogs.openAutoSetup}
          onCloseProject={handleCloseProject}
        />

        {/* ===== Undo / Redo ===== */}
        <EditHistorySection
          projectLoaded={!!project}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undo}
          onRedo={redo}
        />

        {/* ===== Tool Selection ===== */}
        <div className="menu-separator" />
        <ToolButtons />

        <div className="menu-separator" />

        {/* ===== View ===== */}
        <ViewMenuSection
          defaultFormLocked={defaultFormLocked}
          onionSkinEnabled={onionSkinEnabled}
          multiViewEnabled={multiViewEnabled}
          workspaceMode={workspaceMode}
          onToggleDefaultFormLock={toggleDefaultFormLock}
          onToggleOnionSkin={toggleOnionSkin}
          onToggleMultiView={() =>
            multiViewEnabled
              ? disableMultiView()
              : enableMultiView("horizontal")
          }
          onResetView={resetView}
          onSetWorkspaceMode={setWorkspaceMode}
        />

        {/* ===== Settings ===== */}
        <SettingsMenuSection
          onOpenQuickActions={openQuickActions}
          onOpenShortcuts={dialogs.openShortcuts}
          currentTheme={currentTheme}
          onToggleTheme={toggleTheme}
          onSetLocale={(locale) => setLocale(locale, { persist: true })}
        />

        {/* ===== Integrations ===== */}
        <IntegrationsMenuSection
          onOpenAIGenerate={dialogs.openAIGenerate}
          onOpenComfyUISettings={dialogs.openComfyUISettings}
          onOpenOBSSettings={dialogs.openOBSSettings}
          onOpenVTSSettings={dialogs.openVTSSettings}
        />
      </div>

      <div className="menu-right">
        <span className="workspace-mode-indicator">
          {t(`menu.${workspaceMode}Workspace`)}
        </span>
        {project && <span className="project-name">{project.name}</span>}
      </div>
      <MenuDialogsHost dialogs={dialogs} />
    </div>
  );
}
