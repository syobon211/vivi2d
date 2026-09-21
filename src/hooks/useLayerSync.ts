import { VIEWPORT } from "@vivi2d/core/constants";
import type { ProjectData } from "@vivi2d/core/types";
import {
  buildMeshes,
  createLayerSyncContext,
  destroyLayerSyncContext,
  type LayerSyncContext,
  type LayerSyncV11MaskResources,
  prepareLayerSyncV11,
  syncMeshProperties,
} from "@vivi2d/renderer-pixi/editor-layer-sync";
import {
  createScreenColorFilter,
  updateScreenColorFilter,
} from "@vivi2d/renderer-pixi/screen-color-filter";
import { RenderTexture } from "pixi.js";
import { useEffect, useRef } from "react";
import { projectV11DisplayProjection } from "@/lib/project-v11-display-projection";
import { isProjectV11Publishing } from "@/lib/project-v11-publishing";
import { installProjectV11Display } from "@/lib/project-v11-renderer";
import { getTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import type { PixiAppRefs } from "./usePixiApp";

const screenColorSupport = {
  createFilter: createScreenColorFilter,
  updateFilter: updateScreenColorFilter,
};

function resources(refs: PixiAppRefs): LayerSyncV11MaskResources {
  const app = refs.app;
  if (!app || !refs.renderSafely || refs.displayUnavailable)
    throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
  const renderer = app.renderer;
  const gl = "gl" in renderer ? (renderer.gl as WebGLRenderingContext) : null;
  const gpu =
    "gpu" in renderer
      ? (renderer.gpu as { device: { limits: { maxTextureDimension2D: number } } })
      : null;
  const maxTextureSize = gl
    ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
    : gpu?.device.limits.maxTextureDimension2D;
  if (!Number.isSafeInteger(maxTextureSize) || !maxTextureSize || maxTextureSize <= 0)
    throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
  const { width, height } = app.screen;
  const resolution = renderer.resolution;
  return {
    maxTextureSize,
    resolution,
    viewportWidth: width,
    viewportHeight: height,
    isUnavailable: () => !!refs.displayUnavailable,
    rasterizeMask(source, request) {
      const target = RenderTexture.create({
        width: request.width,
        height: request.height,
        resolution: request.resolution,
        antialias: false,
      });
      try {
        refs.renderSafely!({
          container: source,
          target,
          transform: request.transform,
          clear: true,
        });
        return target;
      } catch (error) {
        target.destroy(true);
        throw error;
      }
    },
    prepareScene(scene, transform) {
      const target = RenderTexture.create({
        width,
        height,
        resolution,
        antialias: false,
      });
      try {
        refs.renderSafely!({ container: scene, target, transform, clear: true });
        if (gl?.isContextLost()) {
          refs.retireDisplay?.();
          throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
        }
        if (gl && gl.getError() !== gl.NO_ERROR)
          throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
      } finally {
        target.destroy(true);
      }
    },
  };
}

function setCamera(refs: PixiAppRefs): void {
  const world = refs.world;
  if (!world) return;
  const camera = useViewportStore.getState();
  world.scale.set(camera.zoom);
  world.x = camera.panX;
  world.y = camera.panY;
}

export function useLayerSync(pixiRefs: React.RefObject<PixiAppRefs>) {
  const ctxRef = useRef<LayerSyncContext>(createLayerSyncContext());
  const published = useRef<ProjectData | null>(null);
  const publishedParameters = useRef<Record<string, number> | null>(null);
  const versions = useRef({ project: -1, structure: -1 });
  const app = pixiRefs.current.app;
  const project = useEditorStore((s) => s.project);
  const projectVersion = useEditorStore((s) => s.projectVersion);
  const structureVersion = useEditorStore((s) => s.projectStructureVersion);
  const parameterValues = useParameterStore((s) => s.parameterValues);
  const solo = useSelectionStore((s) => s.soloLayerIds);

  useEffect(
    () =>
      installProjectV11Display((input) => {
        const refs = pixiRefs.current;
        if (!refs.world || !refs.background || !refs.app || refs.displayUnavailable)
          throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
        setCamera(refs);
        const prepared = prepareLayerSyncV11(
          ctxRef.current,
          refs.world,
          refs.background,
          input.v11 && input.project
            ? projectV11DisplayProjection(input.project, input.parameterValues)
            : input.project,
          {
            getTexture: (id) => input.aliases.get(id),
            parameterValues: input.parameterValues,
            features: { v11Masks: input.v11 },
            screenColorSupport,
            v11MaskResources: resources(refs),
            rebuild: input.rebuild,
            soloLayerIds: input.newSession
              ? []
              : useSelectionStore.getState().soloLayerIds,
          },
        );
        const oldPublished = published.current;
        const oldParameters = publishedParameters.current;
        return {
          commit() {
            prepared.commit();
            published.current = input.project;
            publishedParameters.current = input.parameterValues;
          },
          rollback() {
            prepared.rollback();
            published.current = oldPublished;
            publishedParameters.current = oldParameters;
          },
          finalize() {
            prepared.finalize();
            const state = useEditorStore.getState();
            versions.current = {
              project: state.projectVersion,
              structure: state.projectStructureVersion,
            };
            refs.markDisplayReady?.();
          },
        };
      }),
    [pixiRefs],
  );

  useEffect(() => {
    if (!app) return;
    const refs = pixiRefs.current;
    const dispose = () => {
      destroyLayerSyncContext(ctxRef.current);
      published.current = null;
      publishedParameters.current = null;
      versions.current = { project: -1, structure: -1 };
    };
    refs.disposeScene = dispose;
    return () => {
      dispose();
      if (refs.disposeScene === dispose) refs.disposeScene = undefined;
    };
  }, [app, pixiRefs]);

  // Refresh rasterized coverage synchronously before the ordinary ticker renders.
  useEffect(() => {
    if (!app) return;
    const refresh = () => {
      const refs = pixiRefs.current,
        state = useEditorStore.getState();
      if (
        isProjectV11Publishing() ||
        refs.app !== app ||
        refs.displayUnavailable ||
        !state.projectV11 ||
        !state.project ||
        !refs.world ||
        !refs.background
      )
        return;
      try {
        setCamera(refs);
        const capturedParameters = useParameterStore.getState().parameterValues;
        const prepared = prepareLayerSyncV11(
          ctxRef.current,
          refs.world,
          refs.background,
          projectV11DisplayProjection(state.project, capturedParameters),
          {
            getTexture,
            parameterValues: capturedParameters,
            features: { v11Masks: true },
            screenColorSupport,
            v11MaskResources: resources(refs),
            rebuild:
              published.current !== state.project &&
              versions.current.structure !== state.projectStructureVersion,
            soloLayerIds: useSelectionStore.getState().soloLayerIds,
          },
        );
        try {
          if (
            useEditorStore.getState().project !== state.project ||
            useEditorStore.getState().projectV11 !== state.projectV11 ||
            useParameterStore.getState().parameterValues !== capturedParameters
          )
            throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
          prepared.commit();
        } catch (error) {
          prepared.rollback();
          throw error;
        }
        prepared.finalize();
        published.current = state.project;
        publishedParameters.current = capturedParameters;
        versions.current = {
          project: state.projectVersion,
          structure: state.projectStructureVersion,
        };
        refs.markDisplayReady?.();
      } catch {
        // A healthy renderer may retry a later valid camera/frame, but must not
        // draw stale masks under a newly changed camera while preparation failed.
        refs.suspendDisplay?.();
        try {
          useNotificationStore
            .getState()
            .addNotification("warning", "Project display is unavailable.");
        } catch {
          /* Fixed message only. */
        }
      }
    };
    const offCamera = useViewportStore.subscribe(refresh);
    const offParameters = useParameterStore.subscribe(refresh);
    const offSolo = useSelectionStore.subscribe(refresh);
    const renderer = app.renderer;
    renderer.on("resize", refresh);
    return () => {
      offCamera();
      offParameters();
      offSolo();
      renderer.off("resize", refresh);
    };
  }, [app, pixiRefs]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: store versions trigger refresh; read the live snapshot to avoid publishing a stale React render.
  useEffect(() => {
    const refs = pixiRefs.current;
    if (
      !app ||
      refs.app !== app ||
      !refs.world ||
      !refs.background ||
      refs.displayUnavailable ||
      isProjectV11Publishing()
    )
      return;
    const state = useEditorStore.getState();
    const next = state.project;
    const capturedParameters = useParameterStore.getState().parameterValues;
    try {
      if (state.projectV11) {
        if (
          published.current === next &&
          publishedParameters.current === capturedParameters &&
          versions.current.project === state.projectVersion &&
          versions.current.structure === state.projectStructureVersion
        )
          return;
        setCamera(refs);
        const prepared = prepareLayerSyncV11(
          ctxRef.current,
          refs.world,
          refs.background,
          next ? projectV11DisplayProjection(next, capturedParameters) : next,
          {
            getTexture,
            parameterValues: capturedParameters,
            features: { v11Masks: true },
            screenColorSupport,
            v11MaskResources: resources(refs),
            rebuild: versions.current.structure !== state.projectStructureVersion,
            soloLayerIds: solo,
          },
        );
        try {
          if (
            useEditorStore.getState().project !== next ||
            useEditorStore.getState().projectV11 !== state.projectV11 ||
            useParameterStore.getState().parameterValues !== capturedParameters
          )
            throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
          prepared.commit();
        } catch (error) {
          prepared.rollback();
          throw error;
        }
        prepared.finalize();
      } else if (!next) {
        destroyLayerSyncContext(ctxRef.current);
        refs.background.clear();
      } else if (
        versions.current.project !== state.projectVersion ||
        versions.current.structure !== state.projectStructureVersion
      ) {
        buildMeshes(
          ctxRef.current,
          refs.world,
          refs.background,
          next,
          {},
          {
            getTexture,
            parameterValues,
            screenColorSupport,
            notifyWarning: (message) =>
              useNotificationStore.getState().addNotification("warning", message),
          },
        );
        if (versions.current.project !== state.projectVersion) fitView(app, next);
      } else
        syncMeshProperties(ctxRef.current, next, {}, solo, {
          parameterValues,
          screenColorSupport,
        });
      published.current = next;
      publishedParameters.current = capturedParameters;
      versions.current = {
        project: state.projectVersion,
        structure: state.projectStructureVersion,
      };
      refs.markDisplayReady?.();
    } catch {
      refs.suspendDisplay?.();
      try {
        useNotificationStore
          .getState()
          .addNotification("warning", "Project display is unavailable.");
      } catch {
        /* No raw GPU details. */
      }
    }
  }, [app, parameterValues, pixiRefs, project, projectVersion, solo, structureVersion]);
}

function fitView(app: PixiAppRefs["app"], project: ProjectData) {
  if (!app) return;
  const fitScale =
    Math.min(app.screen.width / project.width, app.screen.height / project.height) *
    VIEWPORT.FIT_SCALE;
  const vp = useViewportStore.getState();
  vp.setZoom(fitScale);
  vp.setPan(
    (app.screen.width - project.width * fitScale) / 2,
    (app.screen.height - project.height * fitScale) / 2,
  );
}
