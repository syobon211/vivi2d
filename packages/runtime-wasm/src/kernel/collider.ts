import type {
  ColliderData,
  ColliderHitResult,
  MeshRenderState,
} from "@vivi2d/core";

const COORD_STRIDE = 2;
const TRIANGLE_VERTS = 3;

export function pointRuntimeInTriangle(
  pointX: number,
  pointY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): boolean {
  const denominator = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  if (Math.abs(denominator) < 1e-10) return false;

  const u =
    ((y2 - y3) * (pointX - x3) + (x3 - x2) * (pointY - y3)) /
    denominator;
  const v =
    ((y3 - y1) * (pointX - x3) + (x1 - x3) * (pointY - y3)) /
    denominator;
  const w = 1 - u - v;

  return u >= 0 && v >= 0 && w >= 0;
}

export function pointRuntimeInRect(
  pointX: number,
  pointY: number,
  rectX: number,
  rectY: number,
  width: number,
  height: number,
): boolean {
  return (
    pointX >= rectX &&
    pointX <= rectX + width &&
    pointY >= rectY &&
    pointY <= rectY + height
  );
}

export function pointRuntimeInCircle(
  pointX: number,
  pointY: number,
  centerX: number,
  centerY: number,
  radius: number,
): boolean {
  const dx = pointX - centerX;
  const dy = pointY - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

export function hitTestRuntimeMesh(
  state: MeshRenderState,
  worldX: number,
  worldY: number,
): boolean {
  const verticesAreModelSpace = state.verticesSpace === "model";
  const localX = verticesAreModelSpace ? worldX : worldX - state.x;
  const localY = verticesAreModelSpace ? worldY : worldY - state.y;
  const vertices = state.vertices;
  const indices = state.indices;

  for (let index = 0; index < indices.length; index += TRIANGLE_VERTS) {
    const i0 = indices[index]!;
    const i1 = indices[index + 1]!;
    const i2 = indices[index + 2]!;

    const x1 = vertices[i0 * COORD_STRIDE]!;
    const y1 = vertices[i0 * COORD_STRIDE + 1]!;
    const x2 = vertices[i1 * COORD_STRIDE]!;
    const y2 = vertices[i1 * COORD_STRIDE + 1]!;
    const x3 = vertices[i2 * COORD_STRIDE]!;
    const y3 = vertices[i2 * COORD_STRIDE + 1]!;

    if (pointRuntimeInTriangle(localX, localY, x1, y1, x2, y2, x3, y3)) {
      return true;
    }
  }

  return false;
}

export function hitTestRuntimeColliders(
  colliders: readonly ColliderData[],
  meshStates: ReadonlyMap<string, MeshRenderState>,
  worldX: number,
  worldY: number,
): ColliderHitResult | null {
  for (const collider of sortRuntimeEnabledColliders(colliders, meshStates)) {
    const hit = testRuntimeCollider(collider, meshStates, worldX, worldY);
    if (hit) return hit;
  }
  return null;
}

export function hitTestRuntimeCollidersAll(
  colliders: readonly ColliderData[],
  meshStates: ReadonlyMap<string, MeshRenderState>,
  worldX: number,
  worldY: number,
): ColliderHitResult[] {
  const results: ColliderHitResult[] = [];
  for (const collider of sortRuntimeEnabledColliders(colliders, meshStates)) {
    const hit = testRuntimeCollider(collider, meshStates, worldX, worldY);
    if (hit) results.push(hit);
  }
  return results;
}

function sortRuntimeEnabledColliders(
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
      const priorityA = getRuntimeColliderPriority(a.collider);
      const priorityB = getRuntimeColliderPriority(b.collider);
      if (priorityA !== priorityB) return priorityB - priorityA;

      const orderA = getRuntimeMeshColliderDrawOrder(a.collider, meshDrawOrder);
      const orderB = getRuntimeMeshColliderDrawOrder(b.collider, meshDrawOrder);
      if (orderA !== orderB) return orderB - orderA;

      return a.index - b.index;
    })
    .map((entry) => entry.collider);
}

function testRuntimeCollider(
  collider: ColliderData,
  meshStates: ReadonlyMap<string, MeshRenderState>,
  worldX: number,
  worldY: number,
): ColliderHitResult | null {
  const shape = collider.shape;
  switch (shape.type) {
    case "rectangle":
      return pointRuntimeInRect(
        worldX,
        worldY,
        shape.x,
        shape.y,
        shape.width,
        shape.height,
      )
        ? toRuntimeHitResult(collider)
        : null;
    case "circle":
      return pointRuntimeInCircle(worldX, worldY, shape.x, shape.y, shape.radius)
        ? toRuntimeHitResult(collider)
        : null;
    case "mesh": {
      const state = meshStates.get(shape.meshId);
      if (state?.visible && hitTestRuntimeMesh(state, worldX, worldY)) {
        return toRuntimeHitResult(collider, shape.meshId);
      }
      return null;
    }
  }
}

function getRuntimeColliderPriority(collider: ColliderData): number {
  return collider.shape.type === "mesh" ? 0 : 1;
}

function getRuntimeMeshColliderDrawOrder(
  collider: ColliderData,
  meshDrawOrder: ReadonlyMap<string, number>,
): number {
  return collider.shape.type === "mesh"
    ? (meshDrawOrder.get(collider.shape.meshId) ?? 0)
    : 0;
}

function toRuntimeHitResult(
  collider: ColliderData,
  meshId?: string,
): ColliderHitResult {
  return {
    colliderId: collider.id,
    colliderName: collider.name,
    tag: collider.tag,
    meshId,
  };
}
