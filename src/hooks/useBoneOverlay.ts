import { computeBoneLocalTransform, transformPoint } from "@vivi2d/core/bone-utils";
import { BONE_OVERLAY } from "@vivi2d/core/constants";
import { capturePointer, screenToWorld } from "@vivi2d/core/coord-utils";
import { isDefaultFormActive } from "@vivi2d/core/default-form-lock";
import { findLayerById } from "@vivi2d/core/layer-utils";
import type { BoneNode } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";
import { useCallback, useEffect, useRef } from "react";
import { t as tGlobal } from "@/lib/i18n";
import { useBoneStore } from "@/stores/boneStore";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";

export function useBoneOverlay() {
  const dragging = useRef<{ boneId: string } | null>(null);
  const rafId = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const proj = useEditorStore.getState().project;
    const selId = useSelectionStore.getState().selectedLayerId;
    if (!proj || !selId) return;
    const node = findLayerById(proj.layers, selId);
    if (!node || !isBone(node)) return;

    const { zoom: z, panX: px, panY: py } = useViewportStore.getState();
    const { wx: worldX, wy: worldY } = screenToWorld(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      z,
      px,
      py,
    );

    const tipWorld = getBoneTip(node);
    const dx = worldX - tipWorld[0];
    const dy = worldY - tipWorld[1];
    if (Math.sqrt(dx * dx + dy * dy) < BONE_OVERLAY.HIT_THRESHOLD / z) {
      const { defaultFormLocked } = useViewportStore.getState();
      if (defaultFormLocked) {
        const project = useEditorStore.getState().project;
        const { parameterValues } = useParameterStore.getState();
        if (project && isDefaultFormActive(project.parameters, parameterValues)) {
          useNotificationStore
            .getState()
            .addNotification("warning", tGlobal("notify.defaultFormLocked"));
          return;
        }
      }

      dragging.current = { boneId: selId };
      capturePointer(e);
      e.stopPropagation();
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;

    const { zoom: z, panX: px, panY: py } = useViewportStore.getState();
    const { wx: worldX, wy: worldY } = screenToWorld(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      z,
      px,
      py,
    );

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const { project: proj } = useEditorStore.getState();
      if (!proj) return;
      const node = findLayerById(proj.layers, d.boneId);
      if (!node || !isBone(node)) return;
      const angle = Math.atan2(worldY - node.y, worldX - node.x);
      useBoneStore.getState().setBoneAngle(d.boneId, angle, `bone-angle:${d.boneId}`);
    });
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragging.current) {
      cancelAnimationFrame(rafId.current);
      dragging.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const isInteracting = useCallback(() => dragging.current !== null, []);

  return { onPointerDown, onPointerMove, onPointerUp, isInteracting };
}

function getBoneTip(bone: BoneNode): [number, number] {
  const local = computeBoneLocalTransform(bone);
  return transformPoint(local, bone.bone.length, 0);
}
