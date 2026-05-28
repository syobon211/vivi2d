import type { LayerNode } from "@vivi2d/core/types";
import { useMemo } from "react";

export interface FlatLayer {
  layer: LayerNode;
  depth: number;
}

function flattenVisibleLayers(layers: LayerNode[], depth = 0): FlatLayer[] {
  const out: FlatLayer[] = [];
  for (const layer of layers) {
    out.push({ layer, depth });
    if (layer.expanded && layer.children.length > 0) {
      out.push(...flattenVisibleLayers(layer.children, depth + 1));
    }
  }
  return out;
}

export function useLayerFlatten(layers: LayerNode[] | undefined): FlatLayer[] {
  return useMemo(() => (layers ? flattenVisibleLayers(layers) : []), [layers]);
}
