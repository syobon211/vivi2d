import { DRAW_ORDER } from "@vivi2d/core/constants";
import {
  findLayerById,
  flattenLayers,
  insertLayerAt,
  moveLayerInTree,
} from "@vivi2d/core/layer-utils";
import { generateGridMesh } from "@vivi2d/core/mesh-utils";
import type {
  BlendMode,
  LayerId,
  LayerNode,
  LayerSemanticRole,
  MeshData,
  ProjectData,
  RGBColor,
} from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finiteOr(value, fallback)));
}

function withNode(
  project: ProjectData,
  id: LayerId,
  fn: (node: LayerNode) => void,
): boolean {
  const node = findLayerById(project.layers, id);
  if (!node) return false;
  fn(node);
  return true;
}

interface RemovalContext {
  node: LayerNode;
  siblings: LayerNode[];
  index: number;
}

function removeFromTreeWithContext(
  layers: LayerNode[],
  id: LayerId,
): RemovalContext | null {
  for (let index = 0; index < layers.length; index++) {
    const node = layers[index]!;
    if (node.id === id) {
      layers.splice(index, 1);
      return { node, siblings: layers, index };
    }
    const found = removeFromTreeWithContext(node.children, id);
    if (found) return found;
  }
  return null;
}

function cloneMeshData(mesh: MeshData): MeshData {
  return {
    vertices: mesh.vertices.map((value) => finiteOr(value, 0)),
    uvs: mesh.uvs.map((value) => finiteOr(value, 0)),
    indices: mesh.indices.map((value) => Math.max(0, Math.round(finiteOr(value, 0)))),
    divisionsX: Math.max(1, Math.round(finiteOr(mesh.divisionsX, 1))),
    divisionsY: Math.max(1, Math.round(finiteOr(mesh.divisionsY, 1))),
  };
}

function clampDrawOrder(drawOrder: number): number {
  return Math.round(
    clamp(drawOrder, DRAW_ORDER.MIN, DRAW_ORDER.MAX, DRAW_ORDER.DEFAULT),
  );
}

function cloneColor(color: RGBColor): RGBColor {
  return {
    r: finiteOr(color.r, 1),
    g: finiteOr(color.g, 1),
    b: finiteOr(color.b, 1),
  };
}

export function toggleVisibility(project: ProjectData, id: LayerId): boolean {
  return withNode(project, id, (node) => {
    node.visible = !node.visible;
  });
}

export function toggleExpanded(project: ProjectData, id: LayerId): boolean {
  return withNode(project, id, (node) => {
    node.expanded = !node.expanded;
  });
}

export function setLayerOpacity(
  project: ProjectData,
  id: LayerId,
  opacity: number,
): boolean {
  return withNode(project, id, (node) => {
    node.opacity = clamp(opacity, 0, 1, node.opacity);
  });
}

export function moveLayer(
  project: ProjectData,
  id: LayerId,
  direction: "up" | "down",
): boolean {
  return moveLayerInTree(project.layers, id, direction);
}

export function reorderLayer(
  project: ProjectData,
  sourceId: LayerId,
  targetId: LayerId,
  position: "before" | "after",
): boolean {
  if (sourceId === targetId) return false;
  const source = findLayerById(project.layers, sourceId);
  const target = findLayerById(project.layers, targetId);
  if (!source || !target) return false;
  if (findLayerById(source.children, targetId)) return false;

  const removal = removeFromTreeWithContext(project.layers, sourceId);
  if (!removal) return false;
  if (insertLayerAt(project.layers, targetId, removal.node, position)) return true;
  removal.siblings.splice(removal.index, 0, removal.node);
  return false;
}

export function setClipMaskIds(
  project: ProjectData,
  layerId: LayerId,
  maskIds: readonly LayerId[],
): boolean {
  return withNode(project, layerId, (node) => {
    node.clipMaskIds = [...maskIds];
  });
}

export function setMeshVertices(
  project: ProjectData,
  layerId: LayerId,
  vertices: readonly number[],
): boolean {
  const node = findLayerById(project.layers, layerId);
  if (!node || !isViviMesh(node)) return false;
  node.mesh.vertices = vertices.map((value) => finiteOr(value, 0));
  return true;
}

export function setMeshData(
  project: ProjectData,
  layerId: LayerId,
  mesh: MeshData,
): boolean {
  const layer = findLayerById(project.layers, layerId);
  if (!layer || !isViviMesh(layer)) return false;
  layer.mesh = cloneMeshData(mesh);
  return true;
}

export function setMeshDivisions(
  project: ProjectData,
  layerId: LayerId,
  divisionsX: number,
  divisionsY: number,
): boolean {
  const layer = findLayerById(project.layers, layerId);
  if (!layer || !isViviMesh(layer)) return false;
  layer.mesh = generateGridMesh(
    layer.width,
    layer.height,
    Math.max(1, Math.round(finiteOr(divisionsX, layer.mesh.divisionsX))),
    Math.max(1, Math.round(finiteOr(divisionsY, layer.mesh.divisionsY))),
  );
  return true;
}

export function cleanupOrphanSkins(project: ProjectData): number {
  const validLayerIds = new Set(flattenLayers(project.layers).map((layer) => layer.id));
  let removedCount = 0;
  for (const skinLayerId of Object.keys(project.skins)) {
    if (!validLayerIds.has(skinLayerId)) {
      delete project.skins[skinLayerId];
      removedCount++;
    }
  }
  return removedCount;
}

export function setDrawOrder(
  project: ProjectData,
  id: LayerId,
  drawOrder: number,
): boolean {
  return withNode(project, id, (node) => {
    node.drawOrder = clampDrawOrder(drawOrder);
  });
}

export function setDrawOrderBatch(
  project: ProjectData,
  updates: readonly { id: LayerId; drawOrder: number }[],
): number {
  let count = 0;
  for (const update of updates) {
    if (setDrawOrder(project, update.id, update.drawOrder)) count++;
  }
  return count;
}

export function setBlendMode(
  project: ProjectData,
  id: LayerId,
  blendMode: BlendMode,
): boolean {
  return withNode(project, id, (node) => {
    node.blendMode = blendMode;
  });
}

export function setMultiplyColor(
  project: ProjectData,
  id: LayerId,
  color: RGBColor,
): boolean {
  return withNode(project, id, (node) => {
    node.multiplyColor = cloneColor(color);
  });
}

export function setScreenColor(
  project: ProjectData,
  id: LayerId,
  color: RGBColor,
): boolean {
  return withNode(project, id, (node) => {
    node.screenColor = cloneColor(color);
  });
}

export function setCulling(
  project: ProjectData,
  id: LayerId,
  culling: boolean,
): boolean {
  const node = findLayerById(project.layers, id);
  if (!node || !isViviMesh(node)) return false;
  node.culling = culling;
  return true;
}

export function setLayerSemanticRole(
  project: ProjectData,
  id: LayerId,
  role?: LayerSemanticRole,
): boolean {
  const node = findLayerById(project.layers, id);
  if (!node || !isViviMesh(node)) return false;
  node.semanticRole = role;
  node.semanticRoleSource = role ? "manual" : undefined;
  return true;
}

export function setLayerSemanticRoleBatch(
  project: ProjectData,
  layerIds: readonly LayerId[],
  role?: LayerSemanticRole,
): number {
  let count = 0;
  for (const id of layerIds) {
    if (setLayerSemanticRole(project, id, role)) count++;
  }
  return count;
}
