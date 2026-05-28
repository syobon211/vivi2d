import { lazy, Suspense, useEffect } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PanelErrorBoundary } from "@/components/PanelErrorBoundary";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useProjectImportDrop } from "@/hooks/useProjectImportDrop";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { useThemeStore } from "@/stores/themeStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import "@/styles/global.css";

const NotificationToast = lazy(() =>
  import("./components/NotificationToast").then((m) => ({
    default: m.NotificationToast,
  })),
);
const MenuBar = lazy(() =>
  import("./components/MenuBar").then((m) => ({ default: m.MenuBar })),
);
const LayerPanel = lazy(() =>
  import("./components/LayerPanel").then((m) => ({ default: m.LayerPanel })),
);
const Canvas = lazy(() =>
  import("./components/Canvas").then((m) => ({ default: m.Canvas })),
);
const QuickActionsDialog = lazy(() =>
  import("./components/QuickActionsDialog").then((m) => ({
    default: m.QuickActionsDialog,
  })),
);
const ProjectDialogsHost = lazy(() =>
  import("./components/ProjectDialogsHost").then((m) => ({
    default: m.ProjectDialogsHost,
  })),
);
const AppRuntimeHost = lazy(() =>
  import("./components/AppRuntimeHost").then((m) => ({
    default: m.AppRuntimeHost,
  })),
);
const OffscreenPanel = lazy(() =>
  import("./components/OffscreenPanel").then((m) => ({
    default: m.OffscreenPanel,
  })),
);
const VMCPanel = lazy(() =>
  import("./components/VMCPanel").then((m) => ({ default: m.VMCPanel })),
);
const StateMachinePanel = lazy(() =>
  import("./components/StateMachinePanel").then((m) => ({
    default: m.StateMachinePanel,
  })),
);
const LipSyncPanel = lazy(() =>
  import("./components/LipSyncPanel").then((m) => ({
    default: m.LipSyncPanel,
  })),
);
const SceneBlendPanel = lazy(() =>
  import("./components/SceneBlendPanel").then((m) => ({
    default: m.SceneBlendPanel,
  })),
);
const ColliderPanel = lazy(() =>
  import("./components/ColliderPanel").then((m) => ({
    default: m.ColliderPanel,
  })),
);
const PhysicsPanel = lazy(() =>
  import("./components/PhysicsPanel").then((m) => ({
    default: m.PhysicsPanel,
  })),
);
const IKPanel = lazy(() =>
  import("./components/IKPanel").then((m) => ({ default: m.IKPanel })),
);
const ParameterPanel = lazy(() =>
  import("./components/ParameterPanel").then((m) => ({
    default: m.ParameterPanel,
  })),
);
const ExpressionPresetPanel = lazy(() =>
  import("./components/ExpressionPresetPanel").then((m) => ({
    default: m.ExpressionPresetPanel,
  })),
);
const TimelinePanel = lazy(() =>
  import("./components/TimelinePanel").then((m) => ({
    default: m.TimelinePanel,
  })),
);
const PropertiesPanel = lazy(() =>
  import("./components/PropertiesPanel").then((m) => ({
    default: m.PropertiesPanel,
  })),
);

function isPanelHiddenInWorkspaceMode(
  panelName: string,
  workspaceMode: "default" | "rigging" | "animation",
): boolean {
  if (workspaceMode === "rigging") {
    return [
      "ParameterPanel",
      "ExpressionPresetPanel",
      "StateMachinePanel",
      "LipSyncPanel",
      "SceneBlendPanel",
      "OffscreenPanel",
      "VMCPanel",
    ].includes(panelName);
  }

  if (workspaceMode === "animation") {
    return [
      "ColliderPanel",
      "PhysicsPanel",
      "SceneBlendPanel",
      "IKPanel",
      "OffscreenPanel",
    ].includes(panelName);
  }

  return false;
}

export function App() {
  const theme = useThemeStore((s) => s.theme);
  const workspaceMode = useWorkspaceModeStore((s) => s.mode);
  const toggleQuickActions = useQuickActionsStore((s) => s.togglePalette);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.vivi2dReady = "true";
    return () => {
      document.documentElement.dataset.vivi2dReady = "false";
    };
  }, []);
  useEffect(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    const hiddenShell = activeElement.closest<HTMLElement>(
      "[data-panel-name][hidden]",
    );
    if (!hiddenShell) return;
    activeElement.blur();
  }, []);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.isComposing) return;
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      toggleQuickActions();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleQuickActions]);

  useKeyboardShortcuts();
  useProjectImportDrop();

  const parameterPanelHidden = isPanelHiddenInWorkspaceMode(
    "ParameterPanel",
    workspaceMode,
  );
  const expressionPresetPanelHidden = isPanelHiddenInWorkspaceMode(
    "ExpressionPresetPanel",
    workspaceMode,
  );
  const colliderPanelHidden = isPanelHiddenInWorkspaceMode(
    "ColliderPanel",
    workspaceMode,
  );
  const physicsPanelHidden = isPanelHiddenInWorkspaceMode(
    "PhysicsPanel",
    workspaceMode,
  );
  const stateMachinePanelHidden = isPanelHiddenInWorkspaceMode(
    "StateMachinePanel",
    workspaceMode,
  );
  const lipSyncPanelHidden = isPanelHiddenInWorkspaceMode(
    "LipSyncPanel",
    workspaceMode,
  );
  const sceneBlendPanelHidden = isPanelHiddenInWorkspaceMode(
    "SceneBlendPanel",
    workspaceMode,
  );
  const ikPanelHidden = isPanelHiddenInWorkspaceMode("IKPanel", workspaceMode);
  const offscreenPanelHidden = isPanelHiddenInWorkspaceMode(
    "OffscreenPanel",
    workspaceMode,
  );
  const vmcPanelHidden = isPanelHiddenInWorkspaceMode(
    "VMCPanel",
    workspaceMode,
  );

  return (
    <ErrorBoundary>
      <div className="app">
        <Suspense fallback={null}>
          <MenuBar />
        </Suspense>
        <Suspense fallback={null}>
          <NotificationToast />
        </Suspense>
        <Suspense fallback={null}>
          <QuickActionsDialog />
        </Suspense>
        <Suspense fallback={null}>
          <ProjectDialogsHost />
        </Suspense>
        <Suspense fallback={null}>
          <AppRuntimeHost />
        </Suspense>
        <div
          className={`workspace workspace-mode-${workspaceMode}`}
          data-workspace-mode={workspaceMode}
        >
          <div className="workspace-panel-shell" data-panel-name="LayerPanel">
            <Suspense fallback={null}>
              <PanelErrorBoundary panelName="LayerPanel">
                <LayerPanel />
              </PanelErrorBoundary>
            </Suspense>
          </div>
          <div className="workspace-center">
            <div className="workspace-panel-shell" data-panel-name="Canvas">
              <Suspense
                fallback={
                  <div className="canvas-container" aria-hidden="true" />
                }
              >
                <PanelErrorBoundary panelName="Canvas">
                  <Canvas />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${parameterPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="ParameterPanel"
              hidden={parameterPanelHidden}
              aria-hidden={parameterPanelHidden || undefined}
              inert={parameterPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="ParameterPanel">
                  <ParameterPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${expressionPresetPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="ExpressionPresetPanel"
              hidden={expressionPresetPanelHidden}
              aria-hidden={expressionPresetPanelHidden || undefined}
              inert={expressionPresetPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="ExpressionPresetPanel">
                  <ExpressionPresetPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className="workspace-panel-shell"
              data-panel-name="TimelinePanel"
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="TimelinePanel">
                  <TimelinePanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
          </div>
          <div className="workspace-right">
            <div
              className="workspace-panel-shell"
              data-panel-name="PropertiesPanel"
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="PropertiesPanel">
                  <PropertiesPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${colliderPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="ColliderPanel"
              hidden={colliderPanelHidden}
              aria-hidden={colliderPanelHidden || undefined}
              inert={colliderPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="ColliderPanel">
                  <ColliderPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${physicsPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="PhysicsPanel"
              hidden={physicsPanelHidden}
              aria-hidden={physicsPanelHidden || undefined}
              inert={physicsPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="PhysicsPanel">
                  <PhysicsPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${stateMachinePanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="StateMachinePanel"
              hidden={stateMachinePanelHidden}
              aria-hidden={stateMachinePanelHidden || undefined}
              inert={stateMachinePanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="StateMachinePanel">
                  <StateMachinePanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${lipSyncPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="LipSyncPanel"
              hidden={lipSyncPanelHidden}
              aria-hidden={lipSyncPanelHidden || undefined}
              inert={lipSyncPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="LipSyncPanel">
                  <LipSyncPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${sceneBlendPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="SceneBlendPanel"
              hidden={sceneBlendPanelHidden}
              aria-hidden={sceneBlendPanelHidden || undefined}
              inert={sceneBlendPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="SceneBlendPanel">
                  <SceneBlendPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${ikPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="IKPanel"
              hidden={ikPanelHidden}
              aria-hidden={ikPanelHidden || undefined}
              inert={ikPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="IKPanel">
                  <IKPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${offscreenPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="OffscreenPanel"
              hidden={offscreenPanelHidden}
              aria-hidden={offscreenPanelHidden || undefined}
              inert={offscreenPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="OffscreenPanel">
                  <OffscreenPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
            <div
              className={`workspace-panel-shell${vmcPanelHidden ? " workspace-panel-shell-hidden" : ""}`}
              data-panel-name="VMCPanel"
              hidden={vmcPanelHidden}
              aria-hidden={vmcPanelHidden || undefined}
              inert={vmcPanelHidden ? true : undefined}
            >
              <Suspense fallback={null}>
                <PanelErrorBoundary panelName="VMCPanel">
                  <VMCPanel />
                </PanelErrorBoundary>
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
