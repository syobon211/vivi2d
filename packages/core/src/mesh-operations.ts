import Delaunay from "delaunator";
import { GEOMETRY } from "./constants";
import type { MeshData } from "./types";

const S = GEOMETRY.COORD_STRIDE;

function pointInPolygon(px: number, py: number, poly: number[]): boolean {
  const n = poly.length / S;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * S]!;
    const yi = poly[i * S + 1]!;
    const xj = poly[j * S]!;
    const yj = poly[j * S + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function selectVerticesInPolygon(vertices: number[], polygon: number[]): number[] {
  if (polygon.length < 6) return [];
  const result: number[] = [];
  for (let i = 0; i < vertices.length; i += S) {
    const vx = vertices[i]!;
    const vy = vertices[i + 1]!;
    if (pointInPolygon(vx, vy, polygon)) {
      result.push(i / S);
    }
  }
  return result;
}

export function mergeVertices(
  mesh: MeshData,
  selectedIndices: number[],
): MeshData | null {
  if (selectedIndices.length < 2) return null;

  const sorted = [...selectedIndices].sort((a, b) => a - b);
  const keepIdx = sorted[0]!;
  const removeSet = new Set(sorted.slice(1));
  const vertCount = mesh.vertices.length / S;

  let cx = 0;
  let cy = 0;
  let cu = 0;
  let cv = 0;
  for (const idx of sorted) {
    cx += mesh.vertices[idx * S]!;
    cy += mesh.vertices[idx * S + 1]!;
    cu += mesh.uvs[idx * S]!;
    cv += mesh.uvs[idx * S + 1]!;
  }
  const n = sorted.length;
  cx /= n;
  cy /= n;
  cu /= n;
  cv /= n;

  const newVertices: number[] = [];
  const newUvs: number[] = [];
  const indexRemap = new Map<number, number>();
  let newIdx = 0;

  for (let i = 0; i < vertCount; i++) {
    if (removeSet.has(i)) {
      indexRemap.set(i, -1);
      continue;
    }
    indexRemap.set(i, newIdx);
    if (i === keepIdx) {
      newVertices.push(cx, cy);
      newUvs.push(cu, cv);
    } else {
      newVertices.push(mesh.vertices[i * S]!, mesh.vertices[i * S + 1]!);
      newUvs.push(mesh.uvs[i * S]!, mesh.uvs[i * S + 1]!);
    }
    newIdx++;
  }

  const keepNewIdx = indexRemap.get(keepIdx)!;
  for (const removed of removeSet) {
    indexRemap.set(removed, keepNewIdx);
  }

  const newIndices: number[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = indexRemap.get(mesh.indices[i]!)!;
    const b = indexRemap.get(mesh.indices[i + 1]!)!;
    const c = indexRemap.get(mesh.indices[i + 2]!)!;
    if (a !== b && b !== c && a !== c) {
      newIndices.push(a, b, c);
    }
  }

  return {
    vertices: newVertices,
    uvs: newUvs,
    indices: newIndices,
    divisionsX: 0,
    divisionsY: 0,
  };
}

export function mirrorMesh(
  mesh: MeshData,
  axis: "x" | "y",
  width: number,
  height: number,
): MeshData {
  const newVertices = [...mesh.vertices];
  const newUvs = [...mesh.uvs];
  const vertCount = newVertices.length / S;

  for (let i = 0; i < vertCount; i++) {
    if (axis === "x") {
      newVertices[i * S] = width - newVertices[i * S]!;
      newUvs[i * S] = 1 - newUvs[i * S]!;
    } else {
      newVertices[i * S + 1] = height - newVertices[i * S + 1]!;
      newUvs[i * S + 1] = 1 - newUvs[i * S + 1]!;
    }
  }

  const newIndices = [...mesh.indices];
  for (let i = 0; i < newIndices.length; i += 3) {
    const tmp = newIndices[i + 1]!;
    newIndices[i + 1] = newIndices[i + 2]!;
    newIndices[i + 2] = tmp;
  }

  return {
    vertices: newVertices,
    uvs: newUvs,
    indices: newIndices,
    divisionsX: 0,
    divisionsY: 0,
  };
}

export function retriangulateMesh(
  mesh: MeshData,
  width: number,
  height: number,
): MeshData {
  const vertCount = mesh.vertices.length / S;
  if (vertCount < 3) return mesh;

  const d = new Delaunay(mesh.vertices);
  const triangles = d.triangles;

  const filtered: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i]!;
    const b = triangles[i + 1]!;
    const c = triangles[i + 2]!;
    const cx =
      (mesh.vertices[a * S]! + mesh.vertices[b * S]! + mesh.vertices[c * S]!) / 3;
    const cy =
      (mesh.vertices[a * S + 1]! +
        mesh.vertices[b * S + 1]! +
        mesh.vertices[c * S + 1]!) /
      3;
    if (cx >= 0 && cx <= width && cy >= 0 && cy <= height) {
      filtered.push(a, b, c);
    }
  }

  return {
    vertices: [...mesh.vertices],
    uvs: [...mesh.uvs],
    indices: filtered.length > 0 ? filtered : [...mesh.indices],
    divisionsX: 0,
    divisionsY: 0,
  };
}
