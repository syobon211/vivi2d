import { findLayerById } from "@vivi2d/core/layer-utils";
import { isBone } from "@vivi2d/core/types";
import { lazy, Suspense, useCallback, useEffect, useRef } from "react";
import { useBoneOverlay } from "@/hooks/useBoneOverlay";
import { useColliderOverlay } from "@/hooks/useColliderOverlay";
import { useIKOverlay } from "@/hooks/useIKOverlay";
import { useLayerSync } from "@/hooks/useLayerSync";
import {
  useMeshOverlayInteraction,
  useMeshOverlayVisualModel,
} from "@/hooks/useMeshOverlay";
import { usePixiApp } from "@/hooks/usePixiApp";
import { useViewport } from "@/hooks/useViewport";
import { endE2EPerfProbe } from "@/lib/e2e-perf-probe";
import {
  resolvePointerDownOverlayTargets,
  resolvePointerMoveOverlayTarget,
  shouldEnableSelectionOverlay,
} from "@/lib/editor-overlay-routing";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useMultiViewStore } from "@/stores/multiViewStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { MeshOverlaySvgHost } from "./MeshOverlaySvgHost";
import { SelectionOverlaySvgHost } from "./SelectionOverlaySvgHost";

const MultiViewCanvas = lazy(() =>
  import("./MultiViewCanvas").then((m) => ({ default: m.MultiViewCanvas })),
);
const ReferenceOverlayHost = lazy(() =>
  import("./ReferenceOverlayHost").then((m) => ({ default: m.ReferenceOverlayHost })),
);
const OnionSkinHost = lazy(() =>
  import("./OnionSkinHost").then((m) => ({ default: m.OnionSkinHost })),
);

function SelectionOverlaySvgGate() {
  const activeTool = useViewportStore((s) => s.activeTool);
  return shouldEnableSelectionOverlay(activeTool) ? <SelectionOverlaySvgHost /> : null;
}

function MeshOverlaySvgContent({
  getDragVertexIndex,
  enabled,
}: {
  getDragVertexIndex: () => number;
  enabled: boolean;
}) {
  const model = useMeshOverlayVisualModel(getDragVertexIndex, enabled);
  useEffect(() => {
    if (!enabled || !model?.layerId) return;
    endE2EPerfProbe("meshEdit.appReady", model.layerId, {
      layerId: model.layerId,
    });
  }, [enabled, model?.layerId]);
  return enabled ? <MeshOverlaySvgHost model={model} /> : null;
}

function MeshOverlaySvgGate({
  getDragVertexIndex,
}: {
  getDragVertexIndex: () => number;
}) {
  const activeTool = useViewportStore((s) => s.activeTool);
  return (
    <MeshOverlaySvgContent
      getDragVertexIndex={getDragVertexIndex}
      enabled={activeTool === "meshEdit"}
    />
  );
}

export function Canvas() {
  const t = useT();
  const multiViewEnabled = useMultiViewStore((s) => s.enabled);
  const projectLayerCount = useEditorStore((s) => s.project?.layers.length ?? 0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoom = useViewportStore((s) => s.zoom);
  const panX = useViewportStore((s) => s.panX);
  const panY = useViewportStore((s) => s.panY);
  const onionSkinEnabled = useViewportStore((s) => s.onionSkin.enabled);
  const referenceOverlayEnabled = useViewportStore((s) => s.referenceOverlay.enabled);

  const pixiRefs = usePixiApp(containerRef);
  useLayerSync(pixiRefs);
  const viewport = useViewport(surfaceRef);
  const meshOverlay = useMeshOverlayInteraction(pixiRefs);
  const boneOverlay = useBoneOverlay();
  const ikOverlay = useIKOverlay();
  const colliderOverlay = useColliderOverlay();

  const resolveSelectedOverlayKind = useCallback((): "bone" | null => {
    const project = useEditorStore.getState().project;
    const selectedLayerId = useSelectionStore.getState().selectedLayerId;
    if (!project || !selectedLayerId) return null;
    const layer = findLayerById(project.layers, selectedLayerId);
    if (!layer) return null;
    if (isBone(layer)) return "bone";
    return null;
  }, []);

  const resolveActiveInteraction = useCallback(() => {
    if (meshOverlay.isInteracting()) return "mesh";
    if (colliderOverlay.isInteracting()) return "collider";
    if (ikOverlay.isInteracting()) return "ik";
    if (boneOverlay.isInteracting()) return "bone";
    if (viewport.isInteracting()) return "viewport";
    return null;
  }, [boneOverlay, colliderOverlay, ikOverlay, meshOverlay, viewport]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const activeTool = useViewportStore.getState().activeTool;
      const targets = resolvePointerDownOverlayTargets(
        activeTool,
        resolveSelectedOverlayKind(),
      );

      if (targets.mesh) {
        meshOverlay.onPointerDown(e);
      }
      if (targets.collider) {
        colliderOverlay.onPointerDown(e);
      }
      if (targets.ik) {
        ikOverlay.onPointerDown(e);
      }
      if (targets.bone) {
        boneOverlay.onPointerDown(e);
      }
      if (targets.viewport) {
        viewport.onPointerDown(e);
      }
    },
    [
      colliderOverlay.onPointerDown,
      ikOverlay.onPointerDown,
      meshOverlay.onPointerDown,
      boneOverlay.onPointerDown,
      viewport.onPointerDown,
      resolveSelectedOverlayKind,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const activeInteraction = resolvePointerMoveOverlayTarget(
        resolveActiveInteraction(),
      );
      if (activeInteraction === "mesh") {
        meshOverlay.onPointerMove(e);
        return;
      }
      if (activeInteraction === "collider") {
        colliderOverlay.onPointerMove(e);
        return;
      }
      if (activeInteraction === "ik") {
        ikOverlay.onPointerMove(e);
        return;
      }
      if (activeInteraction === "bone") {
        boneOverlay.onPointerMove(e);
        return;
      }
      viewport.onPointerMove(e);
    },
    [
      colliderOverlay.onPointerMove,
      ikOverlay.onPointerMove,
      meshOverlay.onPointerMove,
      boneOverlay.onPointerMove,
      viewport.onPointerMove,
      resolveActiveInteraction,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const activeInteraction = resolvePointerMoveOverlayTarget(
        resolveActiveInteraction(),
      );
      if (activeInteraction === "mesh") {
        meshOverlay.onPointerUp(e);
        return;
      }
      if (activeInteraction === "collider") {
        colliderOverlay.onPointerUp();
        return;
      }
      if (activeInteraction === "ik") {
        ikOverlay.onPointerUp();
        return;
      }
      if (activeInteraction === "bone") {
        boneOverlay.onPointerUp();
        return;
      }
      viewport.onPointerUp(e);
    },
    [
      colliderOverlay.onPointerUp,
      ikOverlay.onPointerUp,
      meshOverlay.onPointerUp,
      boneOverlay.onPointerUp,
      viewport.onPointerUp,
      resolveActiveInteraction,
    ],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  useEffect(() => {
    const world = pixiRefs.current.world;
    if (!world) return;
    world.scale.set(zoom);
    world.x = panX;
    world.y = panY;
  }, [zoom, panX, panY, pixiRefs]);

  useEffect(() => {
    if (projectLayerCount === 0) return;
    let cancelled = false;
    let frameId = 0;
    const markCanvasReady = () => {
      if (cancelled) return;
      const canvas = containerRef.current?.querySelector("canvas");
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        endE2EPerfProbe("canvasOpen.editableCanvasReady", "psd-import", {
          width: canvas.width,
          height: canvas.height,
          layerCount: projectLayerCount,
        });
        return;
      }
      frameId = requestAnimationFrame(markCanvasReady);
    };
    markCanvasReady();
    return () => {
      cancelled = true;
      if (frameId !== 0) cancelAnimationFrame(frameId);
    };
  }, [projectLayerCount]);

  if (multiViewEnabled) {
    return (
      <Suspense fallback={null}>
        <MultiViewCanvas />
      </Suspense>
    );
  }

  return (
    <>
      {onionSkinEnabled ? (
        <Suspense fallback={null}>
          <OnionSkinHost pixiRefs={pixiRefs} />
        </Suspense>
      ) : null}
      {referenceOverlayEnabled ? (
        <Suspense fallback={null}>
          <ReferenceOverlayHost pixiRefs={pixiRefs} />
        </Suspense>
      ) : null}
      <div
        ref={surfaceRef}
        className="canvas-surface"
        role="application"
        aria-label={t("canvas.editorCanvas")}
        onWheel={viewport.onWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        <div ref={containerRef} className="canvas-container" />
        <MeshOverlaySvgGate getDragVertexIndex={meshOverlay.getDragVertexIndex} />
        <SelectionOverlaySvgGate />
      </div>
    </>
  );
}
