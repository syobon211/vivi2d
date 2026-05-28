import type { ProjectData } from "@vivi2d/core/types";
import { endE2EPerfProbe } from "@/lib/e2e-perf-probe";
import type { ProjectSourceKind } from "@/lib/project-source-kind";
import { useColliderStore } from "../colliderStore";
import { useEditorStore } from "../editorStore";
import { useHistoryStore } from "../historyStore";
import { useIKRuntimeStore } from "../ikRuntimeStore";
import { useLipSyncStore } from "../lipsyncStore";
import { useMeshEditStore } from "../meshEditStore";
import { useMultiViewStore } from "../multiViewStore";
import { useParameterStore } from "../parameterStore";
import { usePhysicsStore } from "../physicsStore";
import { useSelectionStore } from "../selectionStore";
import { useTimelineStore } from "../timelineStore";
import { useVMCStore } from "../vmcStore";

export type ResetStep = {
  name: string;

  run: () => void;
};

export type ResetPlan = {
  steps: ResetStep[];
};

export function buildResetPlan(): ResetPlan {
  return {
    steps: [
      { name: "history", run: () => useHistoryStore.getState().clear() },
      {
        name: "timeline:activeClip",
        run: () => useTimelineStore.getState().setActiveClip(null),
      },
      {
        name: "timeline:activeScene",
        run: () => useTimelineStore.getState().setActiveScene(null),
      },
      { name: "physics", run: () => usePhysicsStore.getState().reset() },
      {
        name: "selection",
        run: () => useSelectionStore.getState().clearSelection(),
      },
      { name: "parameter", run: () => useParameterStore.getState().clear() },
      {
        name: "meshEdit",
        run: () =>
          useMeshEditStore.setState({
            selectedVertices: [],
            lassoActive: false,
            lassoPoints: [],
          }),
      },
      {
        name: "collider",
        run: () => useColliderStore.getState().selectCollider(null),
      },
      { name: "ikRuntime", run: () => useIKRuntimeStore.getState().clearAll() },
      { name: "lipSync", run: () => useLipSyncStore.getState().reset() },
      {
        name: "multiView",
        run: () => useMultiViewStore.getState().disableMultiView(),
      },
      { name: "vmc:runtime", run: () => useVMCStore.getState().resetRuntime() },
    ],
  };
}

export function applyResetPlan(plan: ResetPlan): void {
  for (const step of plan.steps) {
    step.run();
  }
}

export function resetRelatedStores(): void {
  applyResetPlan(buildResetPlan());
}

export function initParameterValues(): void {
  const project = useEditorStore.getState().project;
  if (!project) return;
  useParameterStore
    .getState()
    .setAllValues(
      Object.fromEntries(project.parameters.map((p) => [p.id, p.defaultValue])),
    );
}

export function applyLoadedProject(
  project: ProjectData,
  filePath: string | null,
  projectSourceKind: ProjectSourceKind,
): void {
  project.sourceKind =
    projectSourceKind === "none" ? undefined : projectSourceKind;
  useEditorStore.setState((s) => {
    s.project = project;
    s.projectVersion += 1;
    s.currentFilePath = filePath;
    s.projectSourceKind = projectSourceKind;
  });
  endE2EPerfProbe("canvasOpen.projectReady", "psd-import", {
    layerCount: project.layers.length,
  });
  resetRelatedStores();
  initParameterValues();
}
