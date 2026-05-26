import type { LayerNode } from "./types";

export function findLayerById(layers: LayerNode[], id: string): LayerNode | null {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    const found = findLayerById(layer.children, id);
    if (found) return found;
  }
  return null;
}

export function updateLayerInTree(
  layers: LayerNode[],
  id: string,
  updater: (node: LayerNode) => LayerNode,
): LayerNode[] {
  return layers.map((layer) => {
    if (layer.id === id) return updater(layer);
    if (layer.children.length > 0) {
      return {
        ...layer,
        children: updateLayerInTree(layer.children, id, updater),
      } as LayerNode;
    }
    return layer;
  });
}

export function flattenLayers(layers: LayerNode[]): LayerNode[] {
  const result: LayerNode[] = [];
  for (const layer of layers) {
    result.push(layer);
    if (layer.children.length > 0) {
      result.push(...flattenLayers(layer.children));
    }
  }
  return result;
}

export function findPathToLayer(layers: LayerNode[], targetId: string): LayerNode[] {
  return findPathImpl(layers, targetId) ?? [];
}

function findPathImpl(layers: LayerNode[], targetId: string): LayerNode[] | null {
  for (const layer of layers) {
    if (layer.id === targetId) return [layer];
    if (layer.children.length > 0) {
      const path = findPathImpl(layer.children, targetId);
      if (path) {
        path.unshift(layer);
        return path;
      }
    }
  }
  return null;
}

export function buildParentIdMap(layers: LayerNode[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const walk = (nodes: LayerNode[], parentId: string | null): void => {
    for (const node of nodes) {
      map.set(node.id, parentId);
      if (node.children.length > 0) {
        walk(node.children, node.id);
      }
    }
  };
  walk(layers, null);
  return map;
}

export function findPathToLayerFromMap(
  targetId: string,
  parentIdMap: Map<string, string | null>,
  layersById: Map<string, LayerNode>,
): LayerNode[] {
  const target = layersById.get(targetId);
  if (!target) return [];

  const reversed: LayerNode[] = [target];
  let currentId: string | null = parentIdMap.get(targetId) ?? null;
  while (currentId) {
    const node = layersById.get(currentId);
    if (!node) break;
    reversed.push(node);
    currentId = parentIdMap.get(currentId) ?? null;
  }
  reversed.reverse();
  return reversed;
}

export function moveLayerInTree(
  layers: LayerNode[],
  id: string,
  direction: "up" | "down",
): boolean {
  for (const layer of layers) {
    const idx = layer.children.findIndex((c) => c.id === id);
    if (idx !== -1) {
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= layer.children.length) return false;
      const temp = layer.children[idx]!;
      layer.children[idx] = layer.children[newIdx]!;
      layer.children[newIdx] = temp;
      return true;
    }
    if (moveLayerInTree(layer.children, id, direction)) return true;
  }
  const rootIdx = layers.findIndex((l) => l.id === id);
  if (rootIdx !== -1) {
    const newIdx = direction === "up" ? rootIdx - 1 : rootIdx + 1;
    if (newIdx < 0 || newIdx >= layers.length) return false;
    const temp = layers[rootIdx]!;
    layers[rootIdx] = layers[newIdx]!;
    layers[newIdx] = temp;
    return true;
  }
  return false;
}

export function insertLayerAt(
  layers: LayerNode[],
  targetId: string,
  node: LayerNode,
  position: "before" | "after",
): boolean {
  for (const layer of layers) {
    const idx = layer.children.findIndex((c) => c.id === targetId);
    if (idx !== -1) {
      layer.children.splice(position === "before" ? idx : idx + 1, 0, node);
      return true;
    }
    if (insertLayerAt(layer.children, targetId, node, position)) return true;
  }
  const rootIdx = layers.findIndex((l) => l.id === targetId);
  if (rootIdx !== -1) {
    layers.splice(position === "before" ? rootIdx : rootIdx + 1, 0, node);
    return true;
  }
  return false;
}

export function removeFromTree(layers: LayerNode[], id: string): LayerNode | null {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i]!.id === id) {
      return layers.splice(i, 1)[0]!;
    }
    const found = removeFromTree(layers[i]!.children, id);
    if (found) return found;
  }
  return null;
}

export function isLayerEffectivelyVisible(
  target: LayerNode,
  rootLayers: LayerNode[],
): boolean {
  if (!target.visible) return false;
  const path = findPathToLayer(rootLayers, target.id);
  return path.every((l) => l.visible);
}

export function isLayerSoloVisible(
  targetId: string,
  soloLayerIds: readonly string[],
  rootLayers: LayerNode[],
): boolean {
  if (soloLayerIds.length === 0) return true;

  if (soloLayerIds.includes(targetId)) return true;

  for (const soloId of soloLayerIds) {
    const soloNode = findLayerById(rootLayers, soloId);
    if (soloNode && findLayerById(soloNode.children, targetId)) return true;
  }

  for (const soloId of soloLayerIds) {
    const path = findPathToLayer(rootLayers, soloId);
    if (path.some((l) => l.id === targetId)) return true;
  }

  return false;
}
