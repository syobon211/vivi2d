import { MESH_OVERLAY } from "@vivi2d/core/constants";
import type { PuppetWarpPinSample } from "@vivi2d/core/mesh-warp-utils";
import type { PuppetWarpPin } from "@/stores/puppetWarpStore";

export type ViviMeshLike = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mesh: {
    vertices: number[];
    indices: number[];
  };
};

export function getWorldVertices(layer: ViviMeshLike, vertices: number[]): number[] {
  return vertices.map((value, index) =>
    index % 2 === 0 ? value + layer.x : value + layer.y,
  );
}

export function getPinLocalPosition(
  vertices: number[],
  pin: Pick<PuppetWarpPin, "vertexIndex">,
): { x: number; y: number } | null {
  const base = pin.vertexIndex * 2;
  const x = vertices[base];
  const y = vertices[base + 1];
  if (x === undefined || y === undefined) return null;
  return { x, y };
}

export function getPinWorldPosition(
  layer: ViviMeshLike,
  vertices: number[],
  pin: Pick<PuppetWarpPin, "vertexIndex">,
): { x: number; y: number } | null {
  const local = getPinLocalPosition(vertices, pin);
  if (!local) return null;
  return { x: local.x + layer.x, y: local.y + layer.y };
}

export function findNearestPuppetPin(
  layer: ViviMeshLike,
  vertices: number[],
  pins: ReadonlyArray<PuppetWarpPin>,
  worldX: number,
  worldY: number,
  zoom: number,
): PuppetWarpPin | null {
  const threshold = MESH_OVERLAY.HIT_THRESHOLD / zoom;
  let bestPin: PuppetWarpPin | null = null;
  let bestDistance = Infinity;
  for (const pin of pins) {
    const position = getPinWorldPosition(layer, vertices, pin);
    if (!position) continue;
    const distance = Math.hypot(position.x - worldX, position.y - worldY);
    if (distance > threshold || distance >= bestDistance) continue;
    bestDistance = distance;
    bestPin = pin;
  }
  return bestPin;
}

export function buildPuppetWarpSamples(
  pins: ReadonlyArray<PuppetWarpPin>,
  draggedPinIds: ReadonlySet<string>,
  deltaX: number,
  deltaY: number,
  symmetryEnabled: boolean,
): PuppetWarpPinSample[] {
  return pins.map((pin) => {
    let dx = 0;
    let dy = 0;
    if (pin.kind === "handle") {
      if (draggedPinIds.has(pin.id)) {
        dx = deltaX;
        dy = deltaY;
      } else if (
        symmetryEnabled &&
        pin.mirrorPinId !== null &&
        draggedPinIds.has(pin.mirrorPinId)
      ) {
        dx = -deltaX;
        dy = deltaY;
      }
    }
    return {
      vertexIndex: pin.vertexIndex,
      kind: pin.kind,
      dx,
      dy,
      radius: pin.radius,
      strength: pin.strength,
      curve: pin.curve,
    };
  });
}

export function normalizeDraggedHandleIds(
  _layer: ViviMeshLike,
  vertices: number[],
  pins: ReadonlyArray<PuppetWarpPin>,
  draggedPinIds: ReadonlyArray<string>,
  activePinId: string,
  symmetryEnabled: boolean,
): string[] {
  if (!symmetryEnabled) return [...draggedPinIds];

  const pinById = new Map(pins.map((pin) => [pin.id, pin]));
  const selectedSet = new Set(draggedPinIds);
  const visited = new Set<string>();
  const normalized: string[] = [];

  for (const pinId of draggedPinIds) {
    if (visited.has(pinId)) continue;
    visited.add(pinId);

    const pin = pinById.get(pinId);
    if (!pin || pin.kind !== "handle") continue;

    const mirrorId = pin.mirrorPinId;
    if (!mirrorId || !selectedSet.has(mirrorId)) {
      normalized.push(pinId);
      continue;
    }

    visited.add(mirrorId);
    if (pinId === activePinId || mirrorId === activePinId) {
      normalized.push(activePinId);
      continue;
    }

    const pinPosition = getPinLocalPosition(vertices, pin);
    const mirrorPosition = getPinLocalPosition(vertices, pinById.get(mirrorId)!);
    if (!pinPosition || !mirrorPosition) {
      normalized.push(pinId);
      continue;
    }

    normalized.push(pinPosition.x <= mirrorPosition.x ? pinId : mirrorId);
  }

  return normalized;
}
