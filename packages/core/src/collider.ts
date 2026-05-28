import { GEOMETRY } from "./constants";
import type { ColliderData, ColliderHitResult, MeshRenderState } from "./types";

export function pointInTriangle(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): boolean {
  const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  if (Math.abs(d) < 1e-10) return false;

  const u = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / d;
  const v = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / d;
  const w = 1 - u - v;

  return u >= 0 && v >= 0 && w >= 0;
}

export function pointInRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function pointInCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

export function hitTestMesh(
  state: MeshRenderState,
  worldX: number,
  worldY: number,
): boolean {
  // Skinned snapshots are already emitted in model space; unskinned snapshots
  // keep local vertices plus layer offsets for renderer compatibility.
  const verticesAreModelSpace = state.verticesSpace === "model";
  const localX = verticesAreModelSpace ? worldX : worldX - state.x;
  const localY = verticesAreModelSpace ? worldY : worldY - state.y;

  const verts = state.vertices;
  const indices = state.indices;
  const stride = GEOMETRY.COORD_STRIDE;

  for (let i = 0; i < indices.length; i += GEOMETRY.TRIANGLE_VERTS) {
    const i0 = indices[i]!;
    const i1 = indices[i + 1]!;
    const i2 = indices[i + 2]!;

    const x1 = verts[i0 * stride]!;
    const y1 = verts[i0 * stride + 1]!;
    const x2 = verts[i1 * stride]!;
    const y2 = verts[i1 * stride + 1]!;
    const x3 = verts[i2 * stride]!;
    const y3 = verts[i2 * stride + 1]!;

    if (pointInTriangle(localX, localY, x1, y1, x2, y2, x3, y3)) {
      return true;
    }
  }

  return false;
}

export function hitTestColliders(
  colliders: readonly ColliderData[],
  meshStates: ReadonlyMap<string, MeshRenderState>,
  worldX: number,
  worldY: number,
): ColliderHitResult | null {
  const sorted = sortEnabledColliders(colliders, meshStates);

  for (const collider of sorted) {
    const hit = testSingleCollider(collider, meshStates, worldX, worldY);
    if (hit) return hit;
  }

  return null;
}

export function hitTestCollidersAll(
  colliders: readonly ColliderData[],
  meshStates: ReadonlyMap<string, MeshRenderState>,
  worldX: number,
  worldY: number,
): ColliderHitResult[] {
  const sorted = sortEnabledColliders(colliders, meshStates);

  const results: ColliderHitResult[] = [];
  for (const collider of sorted) {
    const hit = testSingleCollider(collider, meshStates, worldX, worldY);
    if (hit) results.push(hit);
  }
  return results;
}

function sortEnabledColliders(
  colliders: readonly ColliderData[],
  meshStates: ReadonlyMap<string, MeshRenderState>,
): ColliderData[] {
  const meshDrawOrder = new Map<string, number>();
  for (const [id, state] of meshStates) {
    meshDrawOrder.set(id, state.drawOrder);
  }

  return colliders
    .map((collider, index) => ({ collider, index }))
    .filter((entry) => entry.collider.enabled)
    .sort((a, b) => {
      const priorityA = getColliderPriority(a.collider);
      const priorityB = getColliderPriority(b.collider);
      if (priorityA !== priorityB) return priorityB - priorityA;

      const orderA = getMeshColliderDrawOrder(a.collider, meshDrawOrder);
      const orderB = getMeshColliderDrawOrder(b.collider, meshDrawOrder);
      if (orderA !== orderB) return orderB - orderA;

      return a.index - b.index;
    })
    .map((entry) => entry.collider);
}

function testSingleCollider(
  collider: ColliderData,
  meshStates: ReadonlyMap<string, MeshRenderState>,
  worldX: number,
  worldY: number,
): ColliderHitResult | null {
  const shape = collider.shape;

  switch (shape.type) {
    case "rectangle":
      if (pointInRect(worldX, worldY, shape.x, shape.y, shape.width, shape.height)) {
        return toResult(collider);
      }
      break;

    case "circle":
      if (pointInCircle(worldX, worldY, shape.x, shape.y, shape.radius)) {
        return toResult(collider);
      }
      break;

    case "mesh": {
      const state = meshStates.get(shape.meshId);
      if (state?.visible && hitTestMesh(state, worldX, worldY)) {
        return toResult(collider, shape.meshId);
      }
      break;
    }
  }

  return null;
}

function getColliderPriority(collider: ColliderData): number {
  return collider.shape.type === "mesh" ? 0 : 1;
}

function getMeshColliderDrawOrder(
  collider: ColliderData,
  meshDrawOrder: Map<string, number>,
): number {
  if (collider.shape.type === "mesh") {
    return meshDrawOrder.get(collider.shape.meshId) ?? 0;
  }
  return 0;
}

function toResult(collider: ColliderData, meshId?: string): ColliderHitResult {
  return {
    colliderId: collider.id,
    colliderName: collider.name,
    tag: collider.tag,
    meshId,
  };
}
