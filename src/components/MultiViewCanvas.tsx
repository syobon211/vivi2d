import { PIXI_CONFIG, THEME_BG_COLORS, VIEWPORT } from "@vivi2d/core/constants";
import {
  destroyEditorPixiApp,
  type EditorPixiRefs,
  initEditorPixiApp,
} from "@vivi2d/renderer-pixi/editor-app";
import {
  buildMeshes,
  createLayerSyncContext,
  destroyLayerSyncContext,
  type LayerSyncContext,
  syncMeshProperties,
} from "@vivi2d/renderer-pixi/editor-layer-sync";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useScreenColorSupport } from "@/hooks/useScreenColorSupport";
import { shouldEnableE2ECanvasReadback } from "@/lib/e2e-canvas-readback";
import { useT } from "@/lib/i18n";
import { getTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useMultiViewStore, type ViewConfig } from "@/stores/multiViewStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useThemeStore } from "@/stores/themeStore";

interface SubViewRefs extends EditorPixiRefs {
  syncCtx: LayerSyncContext;
}

function SubView({ view }: { view: ViewConfig }) {
  const t = useT();
  const containerRef = useRef<HTMLButtonElement>(null);
  const refsRef = useRef<SubViewRefs | null>(null);
  const preserveDrawingBuffer = shouldEnableE2ECanvasReadback();
  const project = useEditorStore((s) => s.project);
  const projectVersion = useEditorStore((s) => s.projectVersion);
  const projectStructureVersion = useEditorStore((s) => s.projectStructureVersion);
  const parameterValues = useParameterStore((s) => s.parameterValues);
  const activeViewId = useMultiViewStore((s) => s.activeViewId);
  const setActiveView = useMultiViewStore((s) => s.setActiveView);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const screenColorSupport = useScreenColorSupport(project);

  const viewParameterValues = useMemo(
    () => ({ ...parameterValues, ...view.parameterOverrides }),
    [parameterValues, view.parameterOverrides],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    const theme = useThemeStore.getState().theme;
    const backgroundColor = THEME_BG_COLORS[theme] ?? PIXI_CONFIG.BG_COLOR;

    initEditorPixiApp({
      container: el,
      backgroundColor,
      antialias: true,
      resolution: (window.devicePixelRatio || 1) * 0.5,
      autoDensity: true,
      preserveDrawingBuffer,
      worldLabel: "sub-world",
      backgroundLabel: "sub-bg",
      overlayLabel: null,
    }).then((nextRefs) => {
      if (disposed) {
        destroyEditorPixiApp(nextRefs);
        return;
      }

      el.appendChild(nextRefs.app!.canvas);
      refsRef.current = {
        ...nextRefs,
        syncCtx: createLayerSyncContext(),
      };
    });

    const observer = new ResizeObserver(() => refsRef.current?.app?.resize());
    observer.observe(el);

    return () => {
      disposed = true;
      observer.disconnect();
      if (refsRef.current) {
        destroyLayerSyncContext(refsRef.current.syncCtx);
        destroyEditorPixiApp(refsRef.current);
        refsRef.current = null;
      }
    };
  }, [preserveDrawingBuffer]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: projectVersion intentionally rebuilds sub-view meshes for in-place project mutations.
  useEffect(() => {
    const refs = refsRef.current;
    if (!refs || !project || !refs.world || !refs.background || !refs.app) return;

    buildMeshes(refs.syncCtx, refs.world, refs.background, project, {}, {
      getTexture,
      notifyWarning: (message) => addNotification("warning", message),
      parameterValues: viewParameterValues,
      screenColorSupport: screenColorSupport ?? undefined,
    });

    const scaleX = refs.app.screen.width / project.width;
    const scaleY = refs.app.screen.height / project.height;
    const fitScale = Math.min(scaleX, scaleY) * VIEWPORT.FIT_SCALE;
    const offsetX = (refs.app.screen.width - project.width * fitScale) / 2;
    const offsetY = (refs.app.screen.height - project.height * fitScale) / 2;
    refs.world.scale.set(fitScale);
    refs.world.x = offsetX;
    refs.world.y = offsetY;
  }, [addNotification, project, projectVersion, screenColorSupport, viewParameterValues]);

  useEffect(() => {
    if (projectStructureVersion === 0) return;

    const refs = refsRef.current;
    if (!refs || !project || !refs.world || !refs.background) return;

    buildMeshes(refs.syncCtx, refs.world, refs.background, project, {}, {
      getTexture,
      notifyWarning: (message) => addNotification("warning", message),
      parameterValues: viewParameterValues,
      screenColorSupport: screenColorSupport ?? undefined,
    });
  }, [
    addNotification,
    project,
    projectStructureVersion,
    screenColorSupport,
    viewParameterValues,
  ]);

  useEffect(() => {
    const refs = refsRef.current;
    if (!refs || !project) return;

    const soloIds = useSelectionStore.getState().soloLayerIds;
    syncMeshProperties(refs.syncCtx, project, {}, soloIds, {
      parameterValues: viewParameterValues,
      screenColorSupport: screenColorSupport ?? undefined,
    });
  }, [project, screenColorSupport, viewParameterValues]);

  useEffect(() => {
    const refs = refsRef.current;
    if (!refs?.world) return;
    refs.world.scale.set(view.zoom);
    refs.world.x = view.panX;
    refs.world.y = view.panY;
  }, [view.zoom, view.panX, view.panY]);

  const handleClick = useCallback(() => {
    setActiveView(view.id);
  }, [setActiveView, view.id]);

  const isActive = activeViewId === view.id;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <button
      type="button"
      ref={containerRef}
      className={`multi-view-pane${isActive ? " active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${t("multiView.viewAria").replace("{id}", view.id)}${
        isActive ? ` (${t("multiView.active")})` : ""
      }`}
      aria-pressed={isActive}
    />
  );
}

export function MultiViewCanvas() {
  const views = useMultiViewStore((s) => s.views);
  const layout = useMultiViewStore((s) => s.layout);

  return (
    <div className={`multi-view-container layout-${layout}`}>
      {views.map((view) => (
        <SubView key={view.id} view={view} />
      ))}
    </div>
  );
}
