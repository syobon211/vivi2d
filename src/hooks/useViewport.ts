import { capturePointer, releasePointer } from "@vivi2d/core/coord-utils";
import { useCallback, useRef } from "react";
import { useViewportStore } from "@/stores/viewportStore";

export function useViewport(containerRef: React.RefObject<HTMLDivElement | null>) {
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      useViewportStore
        .getState()
        .adjustZoom(-e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
    },
    [containerRef],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const { activeTool } = useViewportStore.getState();
    if (e.button === 1 || (e.button === 0 && activeTool === "pan")) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      capturePointer(e);
      e.preventDefault();
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    const { panX, panY } = useViewportStore.getState();
    useViewportStore.getState().setPan(panX + dx, panY + dy);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false;
      releasePointer(e);
    }
  }, []);

  const isInteracting = useCallback(() => isPanning.current, []);

  return { onWheel, onPointerDown, onPointerMove, onPointerUp, isInteracting };
}
