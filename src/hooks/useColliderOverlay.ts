import { pointInCircle, pointInRect } from "@vivi2d/core/collider";
import { COLLIDER_OVERLAY } from "@vivi2d/core/constants";
import { capturePointer, screenToWorld } from "@vivi2d/core/coord-utils";
import type { ColliderCircle, ColliderConfig, ColliderRect } from "@vivi2d/core/types";
import { useCallback, useEffect, useRef } from "react";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { useViewportStore } from "@/stores/viewportStore";

export type HandleId = "move" | "tl" | "tr" | "bl" | "br" | "radius";

interface DragState {
  colliderId: string;
  handle: HandleId;

  startWx: number;
  startWy: number;

  startShape: ColliderRect | ColliderCircle;
}

export function useColliderOverlay() {
  const dragging = useRef<DragState | null>(null);
  const rafId = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const proj = useEditorStore.getState().project;
    if (!proj) return;

    const { zoom: z, panX: px, panY: py } = useViewportStore.getState();
    const { wx, wy } = screenToWorld(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      z,
      px,
      py,
    );

    const colliders = proj.colliders.filter((c) => c.shape.type !== "mesh");
    const selId = useColliderStore.getState().selectedColliderId;
    const threshold = COLLIDER_OVERLAY.HIT_THRESHOLD / z;

    if (selId) {
      const sel = colliders.find((c) => c.id === selId);
      if (sel?.enabled) {
        const handle = hitTestHandles(sel, wx, wy, threshold);
        if (handle) {
          dragging.current = {
            colliderId: selId,
            handle,
            startWx: wx,
            startWy: wy,
            startShape: { ...sel.shape } as ColliderRect | ColliderCircle,
          };
          capturePointer(e);
          e.stopPropagation();
          return;
        }
      }
    }

    for (let i = colliders.length - 1; i >= 0; i--) {
      const c = colliders[i]!;
      if (!c.enabled) continue;
      if (hitTestBody(c, wx, wy)) {
        useColliderStore.getState().selectCollider(c.id);
        dragging.current = {
          colliderId: c.id,
          handle: "move",
          startWx: wx,
          startWy: wy,
          startShape: { ...c.shape } as ColliderRect | ColliderCircle,
        };
        capturePointer(e);
        e.stopPropagation();
        return;
      }
    }

    if (selId) {
      useColliderStore.getState().selectCollider(null);
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const dd = dragging.current;
      if (!dd) return;

      const { zoom: z, panX: px, panY: py } = useViewportStore.getState();
      const { wx, wy } = screenToWorld(
        e.nativeEvent.offsetX,
        e.nativeEvent.offsetY,
        z,
        px,
        py,
      );

      const deltaX = wx - dd.startWx;
      const deltaY = wy - dd.startWy;
      const shape = computeNewShape(dd, deltaX, deltaY);
      useColliderStore.getState().updateShape(dd.colliderId, shape);
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

export function computeNewShape(
  drag: DragState,
  deltaX: number,
  deltaY: number,
): Partial<ColliderRect> | Partial<ColliderCircle> {
  const s = drag.startShape;
  const min = COLLIDER_OVERLAY.MIN_SIZE;

  if (drag.handle === "move") {
    return { x: s.x + deltaX, y: s.y + deltaY };
  }

  if (s.type === "circle" && drag.handle === "radius") {
    const dx = drag.startWx + deltaX - s.x;
    const dy = drag.startWy + deltaY - s.y;
    return { radius: Math.max(min, Math.sqrt(dx * dx + dy * dy)) };
  }

  if (
    s.type === "rectangle" &&
    (drag.handle === "tl" ||
      drag.handle === "tr" ||
      drag.handle === "bl" ||
      drag.handle === "br")
  ) {
    return computeRectResize(s, drag.handle, deltaX, deltaY, min);
  }

  return {};
}

export function computeRectResize(
  s: ColliderRect,
  corner: "tl" | "tr" | "bl" | "br",
  dx: number,
  dy: number,
  min: number,
): Partial<ColliderRect> {
  let { x, y, width, height } = s;

  switch (corner) {
    case "tl":
      x += dx;
      y += dy;
      width -= dx;
      height -= dy;
      break;
    case "tr":
      y += dy;
      width += dx;
      height -= dy;
      break;
    case "bl":
      x += dx;
      width -= dx;
      height += dy;
      break;
    case "br":
      width += dx;
      height += dy;
      break;
  }

  if (width < min) {
    if (corner === "tl" || corner === "bl") x = s.x + s.width - min;
    width = min;
  }
  if (height < min) {
    if (corner === "tl" || corner === "tr") y = s.y + s.height - min;
    height = min;
  }

  return { x, y, width, height };
}

export function hitTestBody(collider: ColliderConfig, wx: number, wy: number): boolean {
  const s = collider.shape;
  if (s.type === "rectangle") {
    return pointInRect(wx, wy, s.x, s.y, s.width, s.height);
  }
  if (s.type === "circle") {
    return pointInCircle(wx, wy, s.x, s.y, s.radius);
  }
  return false;
}

export function hitTestHandles(
  collider: ColliderConfig,
  wx: number,
  wy: number,
  threshold: number,
): HandleId | null {
  const s = collider.shape;

  if (s.type === "rectangle") {
    const corners: [HandleId, number, number][] = [
      ["tl", s.x, s.y],
      ["tr", s.x + s.width, s.y],
      ["bl", s.x, s.y + s.height],
      ["br", s.x + s.width, s.y + s.height],
    ];
    for (const [id, cx, cy] of corners) {
      if (Math.abs(wx - cx) < threshold && Math.abs(wy - cy) < threshold) {
        return id;
      }
    }
  }

  if (s.type === "circle") {
    const hx = s.x + s.radius;
    const hy = s.y;
    if (Math.abs(wx - hx) < threshold && Math.abs(wy - hy) < threshold) {
      return "radius";
    }
  }

  return null;
}
