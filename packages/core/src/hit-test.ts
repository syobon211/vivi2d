import { GEOMETRY } from "./constants";

export function findNearestVertex(
  vertices: number[],
  worldX: number,
  worldY: number,
  threshold: number,
): number | null {
  let bestIndex: number | null = null;
  let bestDist = threshold * threshold;

  for (let i = 0; i < vertices.length; i += GEOMETRY.COORD_STRIDE) {
    const dx = (vertices[i] ?? 0) - worldX;
    const dy = (vertices[i + 1] ?? 0) - worldY;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDist) {
      bestDist = distSq;
      bestIndex = i / GEOMETRY.COORD_STRIDE;
    }
  }

  return bestIndex;
}

export function findNearestControlPoint(
  controlPoints: number[],
  worldX: number,
  worldY: number,
  threshold: number,
): number | null {
  return findNearestVertex(controlPoints, worldX, worldY, threshold);
}
