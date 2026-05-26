import {
  capturePointer,
  releasePointer,
  screenToWorld,
  worldToScreen,
} from "@vivi2d/core/coord-utils";
import { findLayerById } from "@vivi2d/core/layer-utils";
import { selectVerticesInPolygon } from "@vivi2d/core/mesh-operations";
import { useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";

export function useMeshDrag() {
  const dragging = useRef<{
    vertexIndex: number;
    layerId: string;
    mergeKey: string;
  } | null>(null);
  const rafId = useRef(0);
  const pendingVertex = useRef<{ x: number; y: number } | null>(null);

  const flushPendingVertex = useCallback(() => {
    const dragState = dragging.current;
    const pending = pendingVertex.current;
    if (!dragState || !pending) return;

    const { project } = useEditorStore.getState();
    if (!project) return;

    const layer = findLayerById(project.layers, dragState.layerId);
    if (!layer || layer.kind !== "viviMesh") return;

    const baseVertices = layer.mesh.vertices;
    const nextVertices = [...baseVertices];
    nextVertices[dragState.vertexIndex * 2] = pending.x;
    nextVertices[dragState.vertexIndex * 2 + 1] = pending.y;
    useEditorStore
      .getState()
      .setMeshVertices(dragState.layerId, nextVertices, dragState.mergeKey);
    pendingVertex.current = null;
  }, []);

  const startDrag = useCallback(
    (vertexIndex: number, layerId: string, event: React.PointerEvent) => {
      useMeshEditStore.getState().selectVertex(vertexIndex);
      dragging.current = {
        vertexIndex,
        layerId,
        mergeKey: `mesh-verts:${layerId}`,
      };
      capturePointer(event);
    },
    [],
  );

  const moveDrag = useCallback(
    (event: React.PointerEvent) => {
      const dragState = dragging.current;
      if (!dragState) return false;

      const { project } = useEditorStore.getState();
      if (!project) return false;

      const layer = findLayerById(project.layers, dragState.layerId);
      if (!layer) return false;

      const { zoom, panX, panY } = useViewportStore.getState();
      const { wx, wy } = screenToWorld(
        event.nativeEvent.offsetX,
        event.nativeEvent.offsetY,
        zoom,
        panX,
        panY,
      );
      pendingVertex.current = { x: wx - layer.x, y: wy - layer.y };

      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(flushPendingVertex);
      return true;
    },
    [flushPendingVertex],
  );

  const endDrag = useCallback(() => {
    if (!dragging.current) return false;
    cancelAnimationFrame(rafId.current);
    flushPendingVertex();
    dragging.current = null;
    return true;
  }, [flushPendingVertex]);

  const dragVertexIndex = useCallback(() => dragging.current?.vertexIndex ?? -1, []);
  const isDragging = useCallback(() => dragging.current !== null, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  return { startDrag, moveDrag, endDrag, dragVertexIndex, isDragging };
}

export function useMeshLasso() {
  const lassoRef = useRef(false);

  const startLasso = useCallback((event: React.PointerEvent) => {
    const { zoom, panX, panY } = useViewportStore.getState();
    const { wx, wy } = screenToWorld(
      event.nativeEvent.offsetX,
      event.nativeEvent.offsetY,
      zoom,
      panX,
      panY,
    );
    const screenPoint = worldToScreen(wx, wy, zoom, panX, panY);
    useMeshEditStore.getState().startLasso();
    useMeshEditStore.getState().addLassoPoint(screenPoint.sx, screenPoint.sy);
    lassoRef.current = true;
    capturePointer(event);
  }, []);

  const moveLasso = useCallback((event: React.PointerEvent) => {
    if (!lassoRef.current) return false;
    const { zoom, panX, panY } = useViewportStore.getState();
    const { wx, wy } = screenToWorld(
      event.nativeEvent.offsetX,
      event.nativeEvent.offsetY,
      zoom,
      panX,
      panY,
    );
    const screenPoint = worldToScreen(wx, wy, zoom, panX, panY);
    useMeshEditStore.getState().addLassoPoint(screenPoint.sx, screenPoint.sy);
    return true;
  }, []);

  const endLasso = useCallback((event: React.PointerEvent) => {
    if (!lassoRef.current) return false;
    lassoRef.current = false;
    releasePointer(event);

    const project = useEditorStore.getState().project;
    const selectedLayerId = useSelectionStore.getState().selectedLayerId;
    if (!project || !selectedLayerId) {
      useMeshEditStore.getState().endLasso();
      return true;
    }

    const layer = findLayerById(project.layers, selectedLayerId);
    if (!layer || layer.kind !== "viviMesh") {
      useMeshEditStore.getState().endLasso();
      return true;
    }

    const { zoom, panX, panY } = useViewportStore.getState();
    const screenVertices: number[] = [];
    for (let i = 0; i < layer.mesh.vertices.length; i += 2) {
      const vx = layer.mesh.vertices[i]!;
      const vy = layer.mesh.vertices[i + 1]!;
      const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
      screenVertices.push(screen.sx, screen.sy);
    }

    const lassoPoints = useMeshEditStore.getState().lassoPoints;
    const selectedVertices = selectVerticesInPolygon(screenVertices, lassoPoints);
    useMeshEditStore.getState().endLasso();

    if (selectedVertices.length > 0) {
      if (event.shiftKey) {
        const previous = useMeshEditStore.getState().selectedVertices;
        const merged = [...new Set([...previous, ...selectedVertices])];
        useMeshEditStore.getState().selectVertices(merged);
      } else {
        useMeshEditStore.getState().selectVertices(selectedVertices);
      }
    }
    return true;
  }, []);

  const isActive = useCallback(() => lassoRef.current, []);

  return { startLasso, moveLasso, endLasso, isActive };
}
