import { MESH_OVERLAY } from "@vivi2d/core/constants";
import {
  capturePointer,
  releasePointer,
  screenToWorld,
} from "@vivi2d/core/coord-utils";
import { isDefaultFormActive } from "@vivi2d/core/default-form-lock";
import { findNearestVertex } from "@vivi2d/core/hit-test";
import { findLayerById } from "@vivi2d/core/layer-utils";
import {
  applyPuppetWarp,
  findMirroredVertexIndex,
} from "@vivi2d/core/mesh-warp-utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  cancelE2EPerfProbe,
  endE2EPerfProbe,
  measureE2EPerfProbe,
  startE2EPerfProbe,
} from "@/lib/e2e-perf-probe";
import { createMeshHeatmapData, getMeshHeatmapColor } from "@/lib/mesh-heatmap-debug";
import {
  buildMeshEdgeLines,
  buildMeshHeatmapEdgeLines,
  buildMeshHeatmapVertexCircles,
  buildMeshPuppetFalloffCircles,
  buildMeshPuppetPinCircles,
  buildMeshVertexCircles,
  buildOverlayLassoPath,
  type MeshOverlaySvgModel,
} from "@/lib/mesh-overlay-svg";
import { useEditorStore } from "@/stores/editorStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useParameterStore } from "@/stores/parameterStore";
import {
  type PuppetWarpPin,
  usePuppetWarpStore,
} from "@/stores/puppetWarpStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import {
  buildPuppetWarpSamples,
  findNearestPuppetPin,
  getWorldVertices,
  normalizeDraggedHandleIds,
  type ViviMeshLike,
} from "./meshOverlayGeometry";
import { useMeshDrag, useMeshLasso } from "./meshOverlayInteractions";
import type { PixiAppRefs } from "./usePixiApp";

function restoreCancelledPuppetDrag(
  dragState: ReturnType<typeof usePuppetWarpStore.getState>["dragState"],
): void {
  if (!dragState) return;
  useEditorStore
    .getState()
    .setMeshVertices(dragState.meshId, [...dragState.baseVertices], dragState.mergeKey);
}

export function useMeshOverlayVisualModel(
  getDragVertexIndex: () => number,
  enabled = true,
): MeshOverlaySvgModel | null {
  const project = useEditorStore((state) => state.project);
  const selectedLayerId = useSelectionStore((state) => state.selectedLayerId);
  const { zoom, panX, panY } = useViewportStore(
    useShallow((state) => ({
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
    })),
  );
  const meshHeatmap = useViewportStore((state) => state.meshHeatmap);
  const { selectedVertices, lassoActive, lassoPoints } = useMeshEditStore(
    useShallow((state) => ({
      selectedVertices: state.selectedVertices,
      lassoActive: state.lassoActive,
      lassoPoints: state.lassoPoints,
    })),
  );
  const { mode, editTarget, pinsByMeshId, selectedPinIds } = usePuppetWarpStore(
    useShallow((state) => ({
      mode: state.mode,
      editTarget: state.editTarget,
      pinsByMeshId: state.pinsByMeshId,
      selectedPinIds: state.selectedPinIds,
    })),
  );
  const dragVertexIndex = getDragVertexIndex();
  const [vertexDetailsReady, setVertexDetailsReady] = useState(true);
  const detailSessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!project || !selectedLayerId) {
      if (detailSessionKeyRef.current) {
        cancelE2EPerfProbe("meshOverlay.vertexDetailsReady", detailSessionKeyRef.current);
      }
      detailSessionKeyRef.current = null;
      if (vertexDetailsReady) {
        setVertexDetailsReady(false);
      }
      return;
    }
    if (mode === "puppet") {
      detailSessionKeyRef.current = `puppet:${selectedLayerId ?? "none"}:${editTarget}`;
      if (!vertexDetailsReady) {
        setVertexDetailsReady(true);
      }
      return;
    }

    const sessionKey = `vertex:${selectedLayerId ?? "none"}:${editTarget}`;
    if (detailSessionKeyRef.current === sessionKey && vertexDetailsReady) {
      return;
    }

    if (detailSessionKeyRef.current && detailSessionKeyRef.current !== sessionKey) {
      cancelE2EPerfProbe("meshOverlay.vertexDetailsReady", detailSessionKeyRef.current);
    }
    detailSessionKeyRef.current = sessionKey;
    startE2EPerfProbe("meshOverlay.vertexDetailsReady", sessionKey);
    if (!vertexDetailsReady) {
      setVertexDetailsReady(true);
    }
    endE2EPerfProbe("meshOverlay.vertexDetailsReady", sessionKey, {
      enabled,
      selectedLayerId,
      editTarget,
    });
    return () => {
      cancelE2EPerfProbe("meshOverlay.vertexDetailsReady", sessionKey);
    };
  }, [
    editTarget,
    enabled,
    mode,
    project,
    selectedLayerId,
    vertexDetailsReady,
  ]);

  return useMemo(() => {
    return measureE2EPerfProbe(
      "meshOverlay.visualModelBuild",
      () => {
        if (!enabled) return null;
        if (!project || !selectedLayerId) return null;

        const layer = findLayerById(project.layers, selectedLayerId);
        if (!layer || layer.kind !== "viviMesh") return null;

        const overlayDetailsReady = mode === "puppet" || vertexDetailsReady;

        const model: MeshOverlaySvgModel = {
          layerId: layer.id,
          mode,
          edges: [],
          vertices: [],
          heatmapEdges: [],
          heatmapVertices: [],
          puppetFalloff: [],
          puppetPins: [],
          lassoPath:
            lassoActive && lassoPoints.length >= 4
              ? buildOverlayLassoPath(lassoPoints)
              : null,
        };

        if (!overlayDetailsReady) {
          return model;
        }

        const visibleVertices = layer.mesh.vertices;
        const heatmap = meshHeatmap.enabled
          ? createMeshHeatmapData(
              layer.mesh.vertices,
              visibleVertices,
              layer.mesh.indices,
              meshHeatmap.intensity,
            )
          : null;

        model.edges = buildMeshEdgeLines(
          visibleVertices,
          layer.mesh.indices,
          layer,
          zoom,
          panX,
          panY,
        );
        model.heatmapEdges = heatmap?.edges.length
          ? buildMeshHeatmapEdgeLines(
              heatmap.edges,
              visibleVertices,
              layer,
              zoom,
              panX,
              panY,
              getMeshHeatmapColor,
            )
          : [];
        model.heatmapVertices = heatmap?.vertices.length
          ? buildMeshHeatmapVertexCircles(
              heatmap.vertices,
              visibleVertices,
              layer,
              zoom,
              panX,
              panY,
              getMeshHeatmapColor,
            )
          : [];

        if (mode === "puppet") {
          const pins = pinsByMeshId[layer.id] ?? [];
          const selectedPinIdsSet = new Set(selectedPinIds);
          const selectedPinVertexIndices = new Set(
            pins
              .filter((pin) => selectedPinIdsSet.has(pin.id))
              .map((pin) => pin.vertexIndex),
          );
          model.puppetFalloff = buildMeshPuppetFalloffCircles(
            layer,
            visibleVertices,
            pins,
            selectedPinVertexIndices,
            zoom,
            panX,
            panY,
          );
          model.puppetPins = buildMeshPuppetPinCircles(
            layer,
            visibleVertices,
            pins,
            selectedPinVertexIndices,
            zoom,
            panX,
            panY,
          );
          return model;
        }

        const selectedSet = new Set(selectedVertices);
        model.vertices = overlayDetailsReady
          ? buildMeshVertexCircles(
              visibleVertices,
              layer,
              zoom,
              panX,
              panY,
              selectedSet,
              dragVertexIndex,
              Boolean(heatmap && heatmap.vertices.length > 0),
            )
          : [];
        return model;
      },
      {
        enabled,
        mode,
        selectedLayerId,
        editTarget,
      },
    );
  }, [
    dragVertexIndex,
    editTarget,
    enabled,
    lassoActive,
    lassoPoints,
    meshHeatmap.enabled,
    meshHeatmap.intensity,
    mode,
    panX,
    panY,
    pinsByMeshId,
    project,
    selectedLayerId,
    selectedPinIds,
    selectedVertices,
    vertexDetailsReady,
    zoom,
  ]);
}

export function useMeshOverlayInteraction(_pixiRefs: React.RefObject<PixiAppRefs>) {
  const drag = useMeshDrag();
  const lasso = useMeshLasso();
  const project = useEditorStore((state) => state.project);
  const defaultFormLocked = useViewportStore((state) => state.defaultFormLocked);
  const parameterValues = useParameterStore((state) => state.parameterValues);
  const {
    mode,
    editTarget,
    pinsByMeshId,
    selectedPinIds,
    symmetryEnabled,
    symmetryTolerance,
    dragState,
  } = usePuppetWarpStore(
    useShallow((state) => ({
      mode: state.mode,
      editTarget: state.editTarget,
      pinsByMeshId: state.pinsByMeshId,
      selectedPinIds: state.selectedPinIds,
      symmetryEnabled: state.symmetryEnabled,
      symmetryTolerance: state.symmetryTolerance,
      dragState: state.dragState,
    })),
  );

  const notify = useCallback((type: "info" | "warning" | "error", message: string) => {
    useNotificationStore.getState().addNotification(type, message);
  }, []);
  const checkFormLock = useCallback((): boolean => {
    const { defaultFormLocked } = useViewportStore.getState();
    if (!defaultFormLocked) return false;
    const project = useEditorStore.getState().project;
    const { parameterValues } = useParameterStore.getState();
    if (project && isDefaultFormActive(project.parameters, parameterValues)) {
      notify("warning", "Mesh editing is disabled while the default form is locked.");
      return true;
    }
    return false;
  }, [notify]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const cancelled = usePuppetWarpStore.getState().cancelDrag();
      restoreCancelledPuppetDrag(cancelled);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return useViewportStore.subscribe((state, previousState) => {
      if (state.activeTool === previousState.activeTool) return;
      const currentDragState = usePuppetWarpStore.getState().dragState;
      if (!currentDragState) return;
      const currentMode = usePuppetWarpStore.getState().mode;
      const currentSelectedLayerId = useSelectionStore.getState().selectedLayerId;
      if (
        state.activeTool === "meshEdit" &&
        currentMode === "puppet" &&
        currentSelectedLayerId === currentDragState.meshId
      ) {
        return;
      }
      const cancelled = usePuppetWarpStore.getState().cancelDrag();
      restoreCancelledPuppetDrag(cancelled);
    });
  }, []);

  useEffect(() => {
    if (!dragState) return;
    if (
      !defaultFormLocked ||
      !project ||
      !isDefaultFormActive(project.parameters, parameterValues)
    ) {
      return;
    }
    const cancelled = usePuppetWarpStore.getState().cancelDrag();
    restoreCancelledPuppetDrag(cancelled);
  }, [defaultFormLocked, dragState, project, parameterValues]);

  const syncSelectedPins = useCallback(() => {
    const currentSelectedLayerId = useSelectionStore.getState().selectedLayerId;
    if (!currentSelectedLayerId) {
      if (selectedPinIds.length > 0) {
        usePuppetWarpStore.getState().setSelectedPins([]);
      }
      return;
    }
    const validPinIds = new Set(
      (pinsByMeshId[currentSelectedLayerId] ?? []).map((pin) => pin.id),
    );
    if (selectedPinIds.some((pinId) => !validPinIds.has(pinId))) {
      usePuppetWarpStore
        .getState()
        .setSelectedPins(selectedPinIds.filter((pinId) => validPinIds.has(pinId)));
    }
  }, [pinsByMeshId, selectedPinIds]);

  useEffect(() => {
    syncSelectedPins();
  }, [syncSelectedPins]);

  useEffect(() => {
    return useSelectionStore.subscribe((state, previousState) => {
      if (state.selectedLayerId === previousState.selectedLayerId) return;
      syncSelectedPins();
    });
  }, [syncSelectedPins]);

  const createSymmetricPins = useCallback(
    (
      layer: ViviMeshLike,
      meshId: string,
      vertexIndex: number,
      kind: PuppetWarpPin["kind"],
    ) => {
      if (!symmetryEnabled) return [];
      const mirrorIndex = findMirroredVertexIndex(
        layer.mesh.vertices,
        vertexIndex,
        layer.width,
        symmetryTolerance,
      );
      if (mirrorIndex === null) return [];

      const store = usePuppetWarpStore.getState();
      const originalPins = pinsByMeshId[meshId] ?? [];
      const mirrorId = store.addPin(meshId, mirrorIndex, kind);
      if (!mirrorId) {
        const existingMirror = originalPins.find(
          (pin) => pin.vertexIndex === mirrorIndex,
        );
        return existingMirror ? [existingMirror.id] : [];
      }
      return [mirrorId];
    },
    [pinsByMeshId, symmetryEnabled, symmetryTolerance],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const activeTool = useViewportStore.getState().activeTool;
      if (activeTool !== "meshEdit") return;

      const project = useEditorStore.getState().project;
      const currentLayerId = useSelectionStore.getState().selectedLayerId;
      if (!project || !currentLayerId) return;

      const layer = findLayerById(project.layers, currentLayerId);
      if (!layer || layer.kind !== "viviMesh") return;

      const { zoom, panX, panY } = useViewportStore.getState();
      const { wx: worldX, wy: worldY } = screenToWorld(
        event.nativeEvent.offsetX,
        event.nativeEvent.offsetY,
        zoom,
        panX,
        panY,
      );
      const editableVertices = layer.mesh.vertices;

      if (mode === "puppet") {
        const store = usePuppetWarpStore.getState();
        const pins = store.pinsByMeshId[currentLayerId] ?? [];
        const hitPin = findNearestPuppetPin(
          layer,
          editableVertices,
          pins,
          worldX,
          worldY,
          zoom,
        );

        if (hitPin) {
          if (event.shiftKey) {
            store.togglePinSelection(hitPin.id);
            event.stopPropagation();
            return;
          }

          const nextSelectedPinIds = selectedPinIds.includes(hitPin.id)
            ? selectedPinIds
            : [hitPin.id];
          store.setSelectedPins(nextSelectedPinIds);

          if (hitPin.kind === "handle") {
            if (checkFormLock()) return;
            const selectedHandleIds = nextSelectedPinIds.filter((pinId) =>
              (store.pinsByMeshId[currentLayerId] ?? []).some(
                (pin) => pin.id === pinId && pin.kind === "handle",
              ),
            );
            const draggedPinIds = normalizeDraggedHandleIds(
              layer,
              editableVertices,
              store.pinsByMeshId[currentLayerId] ?? [],
              selectedHandleIds,
              hitPin.id,
              store.symmetryEnabled,
            );
            store.beginDrag(
              currentLayerId,
              editableVertices,
              draggedPinIds,
              worldX,
              worldY,
              { editTarget: "mesh" },
            );
            capturePointer(event);
          }

          event.stopPropagation();
          return;
        }

        const worldVertices = getWorldVertices(layer, editableVertices);
        const hitVertexIndex = findNearestVertex(
          worldVertices,
          worldX,
          worldY,
          MESH_OVERLAY.HIT_THRESHOLD / zoom,
        );

        if (hitVertexIndex !== null) {
          if (checkFormLock()) return;

          const pinKind = event.ctrlKey || event.metaKey ? "anchor" : "handle";
          const createdPinId = store.addPin(currentLayerId, hitVertexIndex, pinKind);
          if (!createdPinId) {
            notify("warning", "A warp pin already exists on that vertex.");
            event.stopPropagation();
            return;
          }

          const mirroredPinIds = createSymmetricPins(
            layer,
            currentLayerId,
            hitVertexIndex,
            pinKind,
          );
          for (const mirroredPinId of mirroredPinIds) {
            store.linkMirrorPins(createdPinId, mirroredPinId);
          }

          store.setSelectedPins([createdPinId, ...mirroredPinIds]);
          event.stopPropagation();
          return;
        }

        if (!event.shiftKey) {
          store.setSelectedPins([]);
        }
        return;
      }

      if (event.altKey) {
        lasso.startLasso(event);
        event.stopPropagation();
        return;
      }

      const worldVertices = getWorldVertices(layer, editableVertices);
      const hitVertexIndex = findNearestVertex(
        worldVertices,
        worldX,
        worldY,
        MESH_OVERLAY.HIT_THRESHOLD / zoom,
      );

      if (hitVertexIndex !== null) {
        if (checkFormLock()) return;

        if (event.shiftKey) {
          useMeshEditStore.getState().toggleVertex(hitVertexIndex);
          event.stopPropagation();
          return;
        }

        drag.startDrag(hitVertexIndex, currentLayerId, event);
        event.stopPropagation();
      } else if (!event.shiftKey) {
        useMeshEditStore.getState().clearSelection();
      }
    },
    [
      checkFormLock,
      createSymmetricPins,
      drag,
      lasso,
      mode,
      editTarget,
      notify,
      selectedPinIds,
    ],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (mode === "puppet") {
        const currentDragState = usePuppetWarpStore.getState().dragState;
        if (!currentDragState) return;

        const project = useEditorStore.getState().project;
        if (!project) return;

        const layer = findLayerById(project.layers, currentDragState.meshId);
        if (!layer || layer.kind !== "viviMesh") return;

        const { zoom, panX, panY } = useViewportStore.getState();
        const { wx, wy } = screenToWorld(
          event.nativeEvent.offsetX,
          event.nativeEvent.offsetY,
          zoom,
          panX,
          panY,
        );
        const deltaX = wx - currentDragState.startWorldX;
        const deltaY = wy - currentDragState.startWorldY;

        const pins =
          usePuppetWarpStore.getState().pinsByMeshId[currentDragState.meshId] ?? [];
        const samples = buildPuppetWarpSamples(
          pins,
          new Set(currentDragState.draggedPinIds),
          deltaX,
          deltaY,
          usePuppetWarpStore.getState().symmetryEnabled,
        );
        const nextVertices = applyPuppetWarp(currentDragState.baseVertices, samples);
        useEditorStore
          .getState()
          .setMeshVertices(
            currentDragState.meshId,
            nextVertices,
            currentDragState.mergeKey,
          );
        usePuppetWarpStore.getState().updateDrag(nextVertices);
        return;
      }

      if (lasso.moveLasso(event)) return;
      drag.moveDrag(event);
    },
    [drag, lasso, mode],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (mode === "puppet") {
        if (usePuppetWarpStore.getState().dragState) {
          releasePointer(event);
          usePuppetWarpStore.getState().commitDrag();
        }
        return;
      }

      if (lasso.endLasso(event)) return;
      if (drag.endDrag()) {
        releasePointer(event);
      }
    },
    [drag, lasso, mode],
  );

  const isInteracting = useCallback(() => {
    if (mode === "puppet") {
      return usePuppetWarpStore.getState().dragState !== null;
    }
    return drag.isDragging() || lasso.isActive();
  }, [drag, lasso, mode]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isInteracting,
    getDragVertexIndex: drag.dragVertexIndex,
  };
}

export function useMeshOverlay(_pixiRefs: React.RefObject<PixiAppRefs>) {
  const interaction = useMeshOverlayInteraction(_pixiRefs);
  const activeTool = useViewportStore((state) => state.activeTool);
  const visualModel = useMeshOverlayVisualModel(
    interaction.getDragVertexIndex,
    activeTool === "meshEdit",
  );
  return {
    ...interaction,
    visualModel,
  };
}
