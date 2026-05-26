import type { ViviMeshNode } from "@vivi2d/core/types";

import type { LayerBounds, LayerOcclusionCleanupOperation } from "./types";

export function intersectBounds(a: LayerBounds, b: LayerBounds): LayerBounds | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function boundsArea(bounds: LayerBounds | null): number {
  if (!bounds) return 0;
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
}

export function expandLayerBounds(
  layer: ViviMeshNode,
  radiusX: number,
  radiusY: number,
): LayerBounds {
  return {
    x: layer.x - radiusX,
    y: layer.y - radiusY,
    width: layer.width + radiusX * 2,
    height: layer.height + radiusY * 2,
  };
}

export function uniqueOperations(
  operations: Iterable<LayerOcclusionCleanupOperation>,
): LayerOcclusionCleanupOperation[] {
  return [...new Set(operations)];
}
