import type { ArtPathControlPoint, ArtPathStyle } from "./types";

export interface TessellatedPoint {
  x: number;
  y: number;

  width: number;

  opacity: number;
}

export interface StrokeMeshData {
  vertices: Float32Array;

  uvs: Float32Array;

  indices: Uint32Array;
}

export function tessellateSegment(
  p0: ArtPathControlPoint,
  p1: ArtPathControlPoint,
  segments: number,
): TessellatedPoint[] {
  const points: TessellatedPoint[] = [];

  const ax = p0.x;
  const ay = p0.y;
  const bx = p0.x + p0.handleOutX;
  const by = p0.y + p0.handleOutY;
  const cx = p1.x + p1.handleInX;
  const cy = p1.y + p1.handleInY;
  const dx = p1.x;
  const dy = p1.y;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;

    const x =
      mt * mt * mt * ax + 3 * mt * mt * t * bx + 3 * mt * t * t * cx + t * t * t * dx;
    const y =
      mt * mt * mt * ay + 3 * mt * mt * t * by + 3 * mt * t * t * cy + t * t * t * dy;

    const width = p0.width * mt + p1.width * t;
    const opacity = p0.opacity * mt + p1.opacity * t;

    points.push({ x, y, width, opacity });
  }

  return points;
}

export function tessellateArtPath(
  controlPoints: ArtPathControlPoint[],
  closed: boolean,
  segmentsPerCurve = 16,
): TessellatedPoint[] {
  if (controlPoints.length < 2) return [];

  const points: TessellatedPoint[] = [];
  const count = controlPoints.length;
  const segmentCount = closed ? count : count - 1;

  for (let i = 0; i < segmentCount; i++) {
    const p0 = controlPoints[i]!;
    const p1 = controlPoints[(i + 1) % count]!;
    const segPoints = tessellateSegment(p0, p1, segmentsPerCurve);
    if (i < segmentCount - 1) {
      points.push(...segPoints.slice(0, -1));
    } else {
      points.push(...segPoints);
    }
  }

  return points;
}

export function buildStrokeMesh(
  points: TessellatedPoint[],
  style: ArtPathStyle,
): StrokeMeshData {
  if (points.length < 2) {
    return {
      vertices: new Float32Array(0),
      uvs: new Float32Array(0),
      indices: new Uint32Array(0),
    };
  }

  const n = points.length;
  const vertices = new Float32Array(n * 4);
  const uvs = new Float32Array(n * 4);

  let totalLength = 0;
  const lengths = new Array<number>(n);
  lengths[0] = 0;
  for (let i = 1; i < n; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
    lengths[i] = totalLength;
  }
  if (totalLength === 0) totalLength = 1;

  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const halfWidth = (p.width * style.baseWidth) / 2;

    let tx: number, ty: number;
    if (i === 0) {
      tx = points[1]!.x - points[0]!.x;
      ty = points[1]!.y - points[0]!.y;
    } else if (i === n - 1) {
      tx = points[n - 1]!.x - points[n - 2]!.x;
      ty = points[n - 1]!.y - points[n - 2]!.y;
    } else {
      tx = points[i + 1]!.x - points[i - 1]!.x;
      ty = points[i + 1]!.y - points[i - 1]!.y;
    }

    const len = Math.sqrt(tx * tx + ty * ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;

    const idx = i * 4;
    vertices[idx] = p.x + nx * halfWidth;
    vertices[idx + 1] = p.y + ny * halfWidth;
    vertices[idx + 2] = p.x - nx * halfWidth;
    vertices[idx + 3] = p.y - ny * halfWidth;

    const u = lengths[i]! / totalLength;
    uvs[idx] = u;
    uvs[idx + 1] = 0;
    uvs[idx + 2] = u;
    uvs[idx + 3] = 1;
  }

  const triCount = (n - 1) * 2;
  const indices = new Uint32Array(triCount * 3);
  for (let i = 0; i < n - 1; i++) {
    const base = i * 6;
    const v0 = i * 2;
    indices[base] = v0;
    indices[base + 1] = v0 + 1;
    indices[base + 2] = v0 + 2;
    indices[base + 3] = v0 + 1;
    indices[base + 4] = v0 + 3;
    indices[base + 5] = v0 + 2;
  }

  return { vertices, uvs, indices };
}

export function artPathToMesh(
  controlPoints: ArtPathControlPoint[],
  closed: boolean,
  style: ArtPathStyle,
  segmentsPerCurve = 16,
): StrokeMeshData {
  const points = tessellateArtPath(controlPoints, closed, segmentsPerCurve);
  return buildStrokeMesh(points, style);
}
