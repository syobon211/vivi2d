import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  ColliderConfig,
  ColliderShape,
  LayerId,
  ProjectData,
} from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";

export interface RectColliderInput {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleColliderInput {
  name: string;
  x: number;
  y: number;
  radius: number;
}

export interface MeshColliderInput {
  name: string;
  meshId: LayerId;
}

const defaultCreateId = () => crypto.randomUUID();

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function getColliders(project: ProjectData): ColliderConfig[] {
  return project.colliders;
}

export function addRectCollider(
  project: ProjectData,
  input: RectColliderInput,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  getColliders(project).push({
    id,
    name: input.name,
    shape: {
      type: "rectangle",
      x: finiteOr(input.x, 0),
      y: finiteOr(input.y, 0),
      width: finiteOr(input.width, 1),
      height: finiteOr(input.height, 1),
    },
    enabled: true,
  });
  return id;
}

export function addCircleCollider(
  project: ProjectData,
  input: CircleColliderInput,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  getColliders(project).push({
    id,
    name: input.name,
    shape: {
      type: "circle",
      x: finiteOr(input.x, 0),
      y: finiteOr(input.y, 0),
      radius: finiteOr(input.radius, 1),
    },
    enabled: true,
  });
  return id;
}

export function addMeshCollider(
  project: ProjectData,
  input: MeshColliderInput,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  getColliders(project).push({
    id,
    name: input.name,
    shape: { type: "mesh", meshId: input.meshId },
    enabled: true,
  });
  return id;
}

export function removeCollider(project: ProjectData, colliderId: string): boolean {
  const colliders = getColliders(project);
  const index = colliders.findIndex((collider) => collider.id === colliderId);
  if (index === -1) return false;
  colliders.splice(index, 1);
  return true;
}

export function toggleCollider(project: ProjectData, colliderId: string): boolean {
  const collider = getColliders(project).find((entry) => entry.id === colliderId);
  if (!collider) return false;
  collider.enabled = !collider.enabled;
  return true;
}

export function renameCollider(
  project: ProjectData,
  colliderId: string,
  name: string,
): boolean {
  const collider = getColliders(project).find((entry) => entry.id === colliderId);
  if (!collider) return false;
  collider.name = name;
  return true;
}

export function setColliderTag(
  project: ProjectData,
  colliderId: string,
  tag: string | undefined,
): boolean {
  const collider = getColliders(project).find((entry) => entry.id === colliderId);
  if (!collider) return false;
  collider.tag = tag;
  return true;
}

export function updateColliderShape(
  project: ProjectData,
  colliderId: string,
  shapeUpdates: Partial<ColliderShape>,
): boolean {
  const collider = getColliders(project).find((entry) => entry.id === colliderId);
  if (!collider) return false;
  if ("type" in shapeUpdates && shapeUpdates.type !== collider.shape.type) {
    return false;
  }

  if (collider.shape.type === "rectangle") {
    if ("x" in shapeUpdates) collider.shape.x = finiteOr(shapeUpdates.x ?? 0, 0);
    if ("y" in shapeUpdates) collider.shape.y = finiteOr(shapeUpdates.y ?? 0, 0);
    if ("width" in shapeUpdates) {
      collider.shape.width = finiteOr(shapeUpdates.width ?? 1, 1);
    }
    if ("height" in shapeUpdates) {
      collider.shape.height = finiteOr(shapeUpdates.height ?? 1, 1);
    }
    return true;
  }

  if (collider.shape.type === "circle") {
    if ("x" in shapeUpdates) collider.shape.x = finiteOr(shapeUpdates.x ?? 0, 0);
    if ("y" in shapeUpdates) collider.shape.y = finiteOr(shapeUpdates.y ?? 0, 0);
    if ("radius" in shapeUpdates) {
      collider.shape.radius = finiteOr(shapeUpdates.radius ?? 1, 1);
    }
    return true;
  }

  if ("meshId" in shapeUpdates && shapeUpdates.meshId !== undefined) {
    collider.shape.meshId = shapeUpdates.meshId;
  }
  return true;
}

export function addMeshCollidersFromSelection(
  project: ProjectData,
  meshIds: readonly LayerId[],
  createId: () => string = defaultCreateId,
): number {
  const allLayers = flattenLayers(project.layers);
  const colliders = getColliders(project);
  let count = 0;

  for (const meshId of meshIds) {
    const layer = allLayers.find((entry) => entry.id === meshId);
    if (!layer || !isViviMesh(layer)) continue;
    if (
      colliders.some(
        (entry) => entry.shape.type === "mesh" && entry.shape.meshId === meshId,
      )
    ) {
      continue;
    }
    colliders.push({
      id: createId(),
      name: layer.name,
      shape: { type: "mesh", meshId },
      enabled: true,
    });
    count++;
  }

  return count;
}
