import { capturePointer, screenToWorld } from "@vivi2d/core/coord-utils";
import { useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useIKControllerStore } from "@/stores/ikControllerStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useViewportStore } from "@/stores/viewportStore";

const TARGET_RADIUS = 8;

export function useIKOverlay() {
  const dragging = useRef<{ controllerId: string; type: "target" | "pole" } | null>(null);
  const rafId = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const proj = useEditorStore.getState().project;
    if (!proj?.ikControllers?.length) return;

    const z = useViewportStore.getState().zoom;
    const px = useViewportStore.getState().panX;
    const py = useViewportStore.getState().panY;
    const { wx, wy } = screenToWorld(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      z,
      px,
      py,
    );
    const runtimeTargets = useIKRuntimeStore.getState().runtimeTargets;

    for (const ik of proj.ikControllers) {
      const rt = runtimeTargets.get(ik.id);
      const tx = rt ? rt.x : ik.targetX;
      const ty = rt ? rt.y : ik.targetY;
      const dx = wx - tx;
      const dy = wy - ty;
      if (Math.sqrt(dx * dx + dy * dy) < TARGET_RADIUS / z) {
        dragging.current = { controllerId: ik.id, type: "target" };
        capturePointer(e);
        e.stopPropagation();
        return;
      }
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const d = dragging.current;
      if (!d) return;

      const z = useViewportStore.getState().zoom;
      const px = useViewportStore.getState().panX;
      const py = useViewportStore.getState().panY;
      const { wx, wy } = screenToWorld(
        e.nativeEvent.offsetX,
        e.nativeEvent.offsetY,
        z,
        px,
        py,
      );

      useIKRuntimeStore.getState().setRuntimeTarget(d.controllerId, wx, wy);
    });
  }, []);

  const onPointerUp = useCallback(() => {
    const d = dragging.current;
    if (!d) return;
    cancelAnimationFrame(rafId.current);

    const rt = useIKRuntimeStore.getState().runtimeTargets.get(d.controllerId);
    if (rt) {
      useIKControllerStore.getState().setTarget(d.controllerId, rt.x, rt.y);
      useIKRuntimeStore.getState().clearRuntimeTarget(d.controllerId);
    }

    dragging.current = null;
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const isInteracting = useCallback(() => dragging.current !== null, []);

  return { onPointerDown, onPointerMove, onPointerUp, isInteracting };
}
