import type { LayerNode } from "@vivi2d/core";

export function findRuntimeLayerById(
  layers: readonly LayerNode[],
  id: string,
): LayerNode | null {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    const found = findRuntimeLayerById(layer.children, id);
    if (found) return found;
  }
  return null;
}

export function flattenRuntimeLayers(
  layers: readonly LayerNode[],
): LayerNode[] {
  const result: LayerNode[] = [];
  for (const layer of layers) {
    result.push(layer);
    if (layer.children.length > 0) {
      result.push(...flattenRuntimeLayers(layer.children));
    }
  }
  return result;
}

export function findRuntimePathToLayer(
  layers: readonly LayerNode[],
  targetId: string,
): LayerNode[] {
  return findRuntimePathImpl(layers, targetId) ?? [];
}

export function isRuntimeLayerEffectivelyVisible(
  target: LayerNode,
  rootLayers: readonly LayerNode[],
): boolean {
  if (!target.visible) return false;
  const path = findRuntimePathToLayer(rootLayers, target.id);
  return path.every((layer) => layer.visible);
}

function findRuntimePathImpl(
  layers: readonly LayerNode[],
  targetId: string,
): LayerNode[] | null {
  for (const layer of layers) {
    if (layer.id === targetId) return [layer];
    if (layer.children.length > 0) {
      const path = findRuntimePathImpl(layer.children, targetId);
      if (path) {
        path.unshift(layer);
        return path;
      }
    }
  }
  return null;
}
