import type { SkinWeight } from "./types";

// Provides the geometric building blocks used by BBW:
// a cotangent Laplacian, a lightweight conjugate-gradient solver,
// and bone-to-mesh distance helpers for seed weights.
export interface BoneHandle {
  id: string;
  /** Bone head position in mesh-local coordinates. */
  x: number;
  y: number;
  /** Parent bone id, or `null` for root handles. */
  parentId: string | null;
}

interface SparseCSR {
  n: number;
  values: number[];
  colIndices: number[];
  rowPointers: number[];
}

function buildCSR(n: number, triplets: { i: number; j: number; v: number }[]): SparseCSR {
  const rows: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (const { i, j, v } of triplets) {
    rows[i]!.set(j, (rows[i]!.get(j) ?? 0) + v);
  }

  const values: number[] = [];
  const colIndices: number[] = [];
  const rowPointers: number[] = [0];

  for (let i = 0; i < n; i++) {
    const row = rows[i]!;
    const sorted = [...row.entries()].sort((a, b) => a[0] - b[0]);
    for (const [col, val] of sorted) {
      if (Math.abs(val) > 1e-15) {
        colIndices.push(col);
        values.push(val);
      }
    }
    rowPointers.push(values.length);
  }

  return { n, values, colIndices, rowPointers };
}

function csrMulVec(A: SparseCSR, x: number[]): number[] {
  const y = new Array<number>(A.n).fill(0);
  for (let i = 0; i < A.n; i++) {
    let sum = 0;
    for (let k = A.rowPointers[i]!; k < A.rowPointers[i + 1]!; k++) {
      sum += A.values[k]! * x[A.colIndices[k]!]!;
    }
    y[i] = sum;
  }
  return y;
}

function negateCSR(A: SparseCSR): SparseCSR {
  return {
    n: A.n,
    values: A.values.map((v) => -v),
    colIndices: [...A.colIndices],
    rowPointers: [...A.rowPointers],
  };
}

function csrAddDiag(A: SparseCSR, diag: number[]): SparseCSR {
  const values = [...A.values];
  const colIndices = [...A.colIndices];
  const rowPointers = [...A.rowPointers];

  for (let i = 0; i < A.n; i++) {
    let found = false;
    for (let k = rowPointers[i]!; k < rowPointers[i + 1]!; k++) {
      if (colIndices[k] === i) {
        values[k] = values[k]! + diag[i]!;
        found = true;
        break;
      }
    }
    if (!found) {
      const insertPos = rowPointers[i + 1]!;
      values.splice(insertPos, 0, diag[i]!);
      colIndices.splice(insertPos, 0, i);
      for (let r = i + 1; r <= A.n; r++) {
        rowPointers[r] = rowPointers[r]! + 1;
      }
    }
  }

  return { n: A.n, values, colIndices, rowPointers };
}

export function buildCotangentLaplacian(
  vertices: number[],
  indices: number[],
): SparseCSR {
  const n = vertices.length / 2;
  const triplets: { i: number; j: number; v: number }[] = [];

  const numTri = indices.length / 3;
  for (let t = 0; t < numTri; t++) {
    const vi = indices[t * 3]!;
    const vj = indices[t * 3 + 1]!;
    const vk = indices[t * 3 + 2]!;

    const ix = vertices[vi * 2]!;
    const iy = vertices[vi * 2 + 1]!;
    const jx = vertices[vj * 2]!;
    const jy = vertices[vj * 2 + 1]!;
    const kx = vertices[vk * 2]!;
    const ky = vertices[vk * 2 + 1]!;

    const area2 = Math.abs((jx - ix) * (ky - iy) - (kx - ix) * (jy - iy));
    if (area2 < 1e-12) continue;

    const cotI = cotAngle(ix, iy, jx, jy, kx, ky);
    const cotJ = cotAngle(jx, jy, kx, ky, ix, iy);
    const cotK = cotAngle(kx, ky, ix, iy, jx, jy);

    addEdgeWeight(triplets, vj, vk, cotI * 0.5);
    addEdgeWeight(triplets, vk, vi, cotJ * 0.5);
    addEdgeWeight(triplets, vi, vj, cotK * 0.5);
  }

  const offDiag = buildCSR(n, triplets);

  const diagVals = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let k = offDiag.rowPointers[i]!; k < offDiag.rowPointers[i + 1]!; k++) {
      rowSum += offDiag.values[k]!;
    }
    diagVals[i] = -rowSum;
  }

  const diagTriplets = diagVals.map((v, i) => ({ i, j: i, v }));
  return buildCSR(n, [...triplets, ...diagTriplets]);
}

function cotAngle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const acx = cx - ax;
  const acy = cy - ay;

  const dot = abx * acx + aby * acy;
  const cross = abx * acy - aby * acx;

  if (Math.abs(cross) < 1e-10) return 0;
  return dot / cross;
}

function addEdgeWeight(
  triplets: { i: number; j: number; v: number }[],
  i: number,
  j: number,
  w: number,
): void {
  triplets.push({ i, j, v: w });
  triplets.push({ i: j, j: i, v: w });
}

export function conjugateGradient(
  A: SparseCSR,
  b: number[],
  maxIter?: number,
  tol = 1e-8,
): number[] {
  const n = A.n;
  const iterLimit = maxIter ?? Math.min(n, 1000);

  const x = new Array<number>(n).fill(0);
  const r = [...b];
  const p = [...r];
  let rsOld = dot(r, r);

  if (Math.sqrt(rsOld) < tol) return x;

  for (let iter = 0; iter < iterLimit; iter++) {
    const Ap = csrMulVec(A, p);
    const pAp = dot(p, Ap);
    if (Math.abs(pAp) < 1e-15) break;

    const alpha = rsOld / pAp;

    for (let i = 0; i < n; i++) {
      x[i]! += alpha * p[i]!;
      r[i]! -= alpha * Ap[i]!;
    }

    const rsNew = dot(r, r);
    if (Math.sqrt(rsNew) < tol) break;

    const beta = rsNew / rsOld;
    for (let i = 0; i < n; i++) {
      p[i] = r[i]! + beta * p[i]!;
    }
    rsOld = rsNew;
  }

  return x;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface BoneSegment {
  id: string;
  /** Segment start in mesh-local coordinates. */
  ax: number;
  ay: number;
  /** Segment end in mesh-local coordinates. */
  bx: number;
  by: number;
  /** `true` when the bone collapses to a point. */
  isPoint: boolean;
}

function buildBoneSegments(bones: BoneHandle[]): BoneSegment[] {
  const boneMap = new Map<string, BoneHandle>();
  for (const b of bones) boneMap.set(b.id, b);

  return bones.map((bone) => {
    const parent = bone.parentId ? boneMap.get(bone.parentId) : null;
    if (parent) {
      const dx = bone.x - parent.x;
      const dy = bone.y - parent.y;
      const isPoint = dx * dx + dy * dy < 1e-6;
      return {
        id: bone.id,
        ax: parent.x,
        ay: parent.y,
        bx: bone.x,
        by: bone.y,
        isPoint,
      };
    }
    return {
      id: bone.id,
      ax: bone.x,
      ay: bone.y,
      bx: bone.x,
      by: bone.y,
      isPoint: true,
    };
  });
}

export interface HeatWeightOptions {
  weightThreshold?: number;

  maxIterations?: number;

  tolerance?: number;

  smoothPasses?: number;
}

export function computeHeatWeights(
  vertices: number[],
  indices: number[],
  bones: BoneHandle[],
  options: HeatWeightOptions = {},
): SkinWeight[][] {
  const {
    weightThreshold = 0.01,
    maxIterations,
    tolerance = 1e-8,
    smoothPasses = 2,
  } = options;

  const vertexCount = vertices.length / 2;
  const boneCount = bones.length;

  if (boneCount === 0 || vertexCount === 0 || indices.length < 3) {
    return Array.from({ length: vertexCount }, () => []);
  }

  const L = buildCotangentLaplacian(vertices, indices);
  const negL = negateCSR(L);

  const segments = buildBoneSegments(bones);
  const nearestBone = new Array<number>(vertexCount);
  const heatCoeff = new Array<number>(vertexCount);

  for (let vi = 0; vi < vertexCount; vi++) {
    const vx = vertices[vi * 2]!;
    const vy = vertices[vi * 2 + 1]!;

    let minDist = Infinity;
    let minBoneIdx = 0;

    for (let bi = 0; bi < boneCount; bi++) {
      const seg = segments[bi]!;
      const d = seg.isPoint
        ? Math.hypot(vx - seg.bx, vy - seg.by)
        : pointToSegmentDist(vx, vy, seg.ax, seg.ay, seg.bx, seg.by);
      if (d < minDist) {
        minDist = d;
        minBoneIdx = bi;
      }
    }

    nearestBone[vi] = minBoneIdx;
    const safeDist = Math.max(minDist, 0.5);
    heatCoeff[vi] = 1.0 / (safeDist * safeDist);
  }

  const A = csrAddDiag(negL, heatCoeff);

  const rawWeights: number[][] = [];

  for (let bi = 0; bi < boneCount; bi++) {
    const rhs = new Array<number>(vertexCount).fill(0);
    for (let vi = 0; vi < vertexCount; vi++) {
      if (nearestBone[vi] === bi) {
        rhs[vi] = heatCoeff[vi]!;
      }
    }

    const w = conjugateGradient(A, rhs, maxIterations, tolerance);
    rawWeights.push(w);
  }

  if (smoothPasses > 0) {
    const adjacency = buildAdjacency(indices, vertexCount);
    for (let pass = 0; pass < smoothPasses; pass++) {
      for (let bi = 0; bi < boneCount; bi++) {
        const w = rawWeights[bi]!;
        const smoothed = new Array<number>(vertexCount);
        for (let vi = 0; vi < vertexCount; vi++) {
          const neighbors = adjacency[vi]!;
          if (neighbors.length === 0) {
            smoothed[vi] = w[vi]!;
            continue;
          }
          let neighborSum = 0;
          for (const ni of neighbors) {
            neighborSum += w[ni]!;
          }
          smoothed[vi] = 0.6 * w[vi]! + 0.4 * (neighborSum / neighbors.length);
        }
        rawWeights[bi] = smoothed;
      }
    }
  }

  const result: SkinWeight[][] = [];

  for (let vi = 0; vi < vertexCount; vi++) {
    const weights: { boneId: string; weight: number }[] = [];
    let total = 0;

    for (let bi = 0; bi < boneCount; bi++) {
      const w = Math.max(0, rawWeights[bi]![vi]!);
      if (w > weightThreshold) {
        weights.push({ boneId: bones[bi]!.id, weight: w });
        total += w;
      }
    }

    if (total > 0) {
      for (const w of weights) {
        w.weight /= total;
      }
    } else if (boneCount > 0) {
      weights.push({ boneId: bones[nearestBone[vi]!]!.id, weight: 1.0 });
    }

    result.push(weights);
  }

  return result;
}

function buildAdjacency(indices: number[], vertexCount: number): number[][] {
  const adj: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    adj[a]!.add(b);
    adj[a]!.add(c);
    adj[b]!.add(a);
    adj[b]!.add(c);
    adj[c]!.add(a);
    adj[c]!.add(b);
  }
  return adj.map((s) => [...s]);
}
