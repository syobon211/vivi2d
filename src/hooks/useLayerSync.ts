import { VIEWPORT } from "@vivi2d/core/constants";
import type { ProjectData } from "@vivi2d/core/types";
import {
  buildMeshes,
  createLayerSyncContext,
  destroyLayerSyncContext,
  type LayerSyncContext,
  syncMeshProperties,
} from "@vivi2d/renderer-pixi/editor-layer-sync";
import { useEffect, useRef } from "react";
import { getTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import type { PixiAppRefs } from "./usePixiApp";
import { useScreenColorSupport } from "./useScreenColorSupport";

export function useLayerSync(pixiRefs: React.RefObject<PixiAppRefs>) {
  const ctxRef = useRef<LayerSyncContext>(createLayerSyncContext());
  const project = useEditorStore((s) => s.project);
  const projectVersion = useEditorStore((s) => s.projectVersion);
  const projectStructureVersion = useEditorStore(
    (s) => s.projectStructureVersion,
  );
  const parameterValues = useParameterStore((s) => s.parameterValues);
  const _soloLayerIds = useSelectionStore((s) => s.soloLayerIds);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const screenColorSupport = useScreenColorSupport(project);

  // biome-ignore lint/correctness/useExhaustiveDependencies: projectVersion intentionally rebuilds meshes for in-place project mutations.
  useEffect(() => {
    const { world, background, app } = pixiRefs.current;
    if (!world || !background) return;

    const proj = useEditorStore.getState().project;
    if (!proj) {
      destroyLayerSyncContext(ctxRef.current);
      background.clear();
      return;
    }

    buildMeshes(
      ctxRef.current,
      world,
      background,
      proj,
      {},
      {
        getTexture,
        notifyWarning: (message) => addNotification("warning", message),
        parameterValues,
        screenColorSupport: screenColorSupport ?? undefined,
      },
    );
    fitView(app, proj);
  }, [
    addNotification,
    parameterValues,
    pixiRefs,
    projectVersion,
    screenColorSupport,
  ]);

  useEffect(() => {
    if (projectStructureVersion === 0) return;
    const { world, background } = pixiRefs.current;
    if (!world || !background) return;

    const proj = useEditorStore.getState().project;
    if (!proj) return;

    buildMeshes(
      ctxRef.current,
      world,
      background,
      proj,
      {},
      {
        getTexture,
        notifyWarning: (message) => addNotification("warning", message),
        parameterValues,
        screenColorSupport: screenColorSupport ?? undefined,
      },
    );
  }, [
    addNotification,
    parameterValues,
    pixiRefs,
    projectStructureVersion,
    screenColorSupport,
  ]);

  useEffect(() => {
    if (!project) return;
    const currentSoloIds = useSelectionStore.getState().soloLayerIds;
    syncMeshProperties(ctxRef.current, project, {}, currentSoloIds, {
      parameterValues,
      screenColorSupport: screenColorSupport ?? undefined,
    });
  }, [parameterValues, project, screenColorSupport]);
}

function fitView(app: PixiAppRefs["app"], project: ProjectData) {
  if (!app) return;
  const scaleX = app.screen.width / project.width;
  const scaleY = app.screen.height / project.height;
  const fitScale = Math.min(scaleX, scaleY) * VIEWPORT.FIT_SCALE;
  const offsetX = (app.screen.width - project.width * fitScale) / 2;
  const offsetY = (app.screen.height - project.height * fitScale) / 2;

  const vp = useViewportStore.getState();
  vp.setZoom(fitScale);
  vp.setPan(offsetX, offsetY);
}
