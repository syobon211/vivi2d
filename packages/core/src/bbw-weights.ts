// Computes bounded biharmonic weights by solving the convex-duality form of BBW.
// The implementation keeps the solver self-contained by reducing the problem to
// an NNLS-style dual instead of depending on a general-purpose QP package.

import type { BoneHandle } from "./heat-weights";
import { buildCotangentLaplacian } from "./heat-weights";
import type { SkinWeight } from "./types";

export type { BoneHandle };

interface DenseMat {
  rows: number;
  cols: number;
  data: Float64Array;
}

function denseCreate(rows: number, cols: number): DenseMat {
  return { rows, cols, data: new Float64Array(rows * cols) };
}

function denseGet(m: DenseMat, i: number, j: number): number {
  return m.data[j * m.rows + i]!;
}

function denseSet(m: DenseMat, i: number, j: number, v: number): void {
  m.data[j * m.rows + i] = v;
}

function denseAddTo(m: DenseMat, i: number, j: number, v: number): void {
  const idx = j * m.rows + i;
  m.data[idx] = m.data[idx]! + v;
}

interface LUFactors {
  n: number;
  /** Combined LU matrix stored in column-major order. */
  LU: Float64Array;
  /** Partial-pivot permutation vector. */
  perm: Int32Array;
}

function luDecompose(M: DenseMat): LUFactors {
  const n = M.rows;
  const LU = new Float64Array(M.data);
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;

  for (let k = 0; k < n; k++) {
    let maxVal = Math.abs(LU[k * n + k]!);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(LU[k * n + i]!);
      if (v > maxVal) {
        maxVal = v;
        maxRow = i;
      }
    }
    if (maxRow !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = LU[j * n + k]!;
        LU[j * n + k] = LU[j * n + maxRow]!;
        LU[j * n + maxRow] = tmp;
      }
      const tmp = perm[k]!;
      perm[k] = perm[maxRow]!;
      perm[maxRow] = tmp;
    }
    const pivot = LU[k * n + k]!;
    if (Math.abs(pivot) < 1e-14) continue;
    for (let i = k + 1; i < n; i++) {
      const factor = LU[k * n + i]! / pivot;
      LU[k * n + i] = factor;
      for (let j = k + 1; j < n; j++) {
        const idx = j * n + i;
        LU[idx] = LU[idx]! - factor * LU[j * n + k]!;
      }
    }
  }
  return { n, LU, perm };
}

function luSolve(lu: LUFactors, b: number[]): number[] {
  const { n, LU, perm } = lu;
  const pb = new Array<number>(n);
  for (let i = 0; i < n; i++) pb[i] = b[perm[i]!]!;

  for (let i = 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < i; j++) {
      sum += LU[j * n + i]! * pb[j]!;
    }
    pb[i] = pb[i]! - sum;
  }

  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += LU[j * n + i]! * pb[j]!;
    }
    const diag = LU[i * n + i]!;
    pb[i] = Math.abs(diag) > 1e-14 ? (pb[i]! - sum) / diag : 0;
  }

  return pb;
}

export function buildLumpedMass(vertices: number[], indices: number[]): number[] {
  const n = vertices.length / 2;
  const M = new Array<number>(n).fill(0);
  const numTri = indices.length / 3;

  for (let t = 0; t < numTri; t++) {
    const i = indices[t * 3]!;
    const j = indices[t * 3 + 1]!;
    const k = indices[t * 3 + 2]!;

    const ix = vertices[i * 2]!,
      iy = vertices[i * 2 + 1]!;
    const jx = vertices[j * 2]!,
      jy = vertices[j * 2 + 1]!;
    const kx = vertices[k * 2]!,
      ky = vertices[k * 2 + 1]!;

    const area = 0.5 * Math.abs((jx - ix) * (ky - iy) - (kx - ix) * (jy - iy));
    M[i] = M[i]! + area / 3;
    M[j] = M[j]! + area / 3;
    M[k] = M[k]! + area / 3;
  }

  return M;
}

interface SparseCSR {
  n: number;
  values: number[];
  colIndices: number[];
  rowPointers: number[];
}

export function buildBiharmonicMatrix(Lsparse: SparseCSR, M: number[]): DenseMat {
  const n = Lsparse.n;

  let maxM = 0;
  for (let i = 0; i < n; i++) if (M[i]! > maxM) maxM = M[i]!;
  const scale = maxM > 1e-15 ? 1 / maxM : 1;

  const B = denseCreate(n, n);

  for (let k = 0; k < n; k++) {
    const mk = M[k]!;
    if (mk < 1e-15) continue;
    const invMk = scale / mk;

    const rowStart = Lsparse.rowPointers[k]!;
    const rowEnd = Lsparse.rowPointers[k + 1]!;
    const nnzCount = rowEnd - rowStart;

    for (let a = 0; a < nnzCount; a++) {
      const i = Lsparse.colIndices[rowStart + a]!;
      const Li = Lsparse.values[rowStart + a]! * invMk;
      for (let b = a; b < nnzCount; b++) {
        const j = Lsparse.colIndices[rowStart + b]!;
        const Lj = Lsparse.values[rowStart + b]!;
        const contrib = Li * Lj;
        denseAddTo(B, i, j, contrib);
        if (i !== j) denseAddTo(B, j, i, contrib);
      }
    }
  }

  return B;
}

interface ConstraintInfo {
  /** Constraint matrix that pins one vertex per bone. */
  C: DenseMat;
  /** One-hot target values for the pinned vertices. */
  D: DenseMat;
  /** Maps each generated constraint row back to its source bone. */
  constraintMap: { vertexIdx: number; boneIdx: number }[];
}

function buildConstraints(vertices: number[], bones: BoneHandle[]): ConstraintInfo {
  const n = vertices.length / 2;
  const m = bones.length;

  const constraintMap: { vertexIdx: number; boneIdx: number }[] = [];
  const usedVertices = new Set<number>();

  for (let bi = 0; bi < m; bi++) {
    const bx = bones[bi]!.x;
    const by = bones[bi]!.y;

    let bestDist = Infinity;
    let bestVi = 0;
    for (let vi = 0; vi < n; vi++) {
      if (usedVertices.has(vi)) continue;
      const dx = vertices[vi * 2]! - bx;
      const dy = vertices[vi * 2 + 1]! - by;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestVi = vi;
      }
    }
    usedVertices.add(bestVi);
    constraintMap.push({ vertexIdx: bestVi, boneIdx: bi });
  }

  const k = constraintMap.length;
  const C = denseCreate(k, n);
  const D = denseCreate(k, m);

  for (let ci = 0; ci < k; ci++) {
    const { vertexIdx, boneIdx } = constraintMap[ci]!;
    denseSet(C, ci, vertexIdx, 1);
    denseSet(D, ci, boneIdx, 1);
  }

  return { C, D, constraintMap };
}

function buildAndFactorKKT(B: DenseMat, C: DenseMat): LUFactors {
  const n = B.rows;
  const k = C.rows;
  const size = n + k;

  const K = denseCreate(size, size);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      denseSet(K, i, j, denseGet(B, i, j));
    }
    denseAddTo(K, i, i, 1e-9);
  }

  for (let ci = 0; ci < k; ci++) {
    for (let vi = 0; vi < n; vi++) {
      const v = denseGet(C, ci, vi);
      if (v !== 0) {
        denseSet(K, vi, n + ci, v); // C^T
        denseSet(K, n + ci, vi, v);
      }
    }
  }

  return luDecompose(K);
}

function applyQ11(lu: LUFactors, X: DenseMat, n: number): DenseMat {
  const size = lu.n;
  const result = denseCreate(n, X.cols);

  for (let j = 0; j < X.cols; j++) {
    const rhs = new Array<number>(size).fill(0);
    for (let i = 0; i < n; i++) rhs[i] = denseGet(X, i, j);
    // rhs[n..size] = 0
    const sol = luSolve(lu, rhs);
    for (let i = 0; i < n; i++) denseSet(result, i, j, sol[i]!);
  }

  return result;
}

function computeQ12D(lu: LUFactors, D: DenseMat, n: number): DenseMat {
  const size = lu.n;
  const k = D.rows;
  const result = denseCreate(n, D.cols);

  for (let j = 0; j < D.cols; j++) {
    const rhs = new Array<number>(size).fill(0);
    for (let i = 0; i < k; i++) rhs[n + i] = denseGet(D, i, j);
    const sol = luSolve(lu, rhs);
    for (let i = 0; i < n; i++) denseSet(result, i, j, sol[i]!);
  }

  return result;
}

function rightMultiplyPm(X: DenseMat, m: number): DenseMat {
  const result = denseCreate(X.rows, m);
  for (let i = 0; i < X.rows; i++) {
    let rowMean = 0;
    for (let j = 0; j < m; j++) rowMean += denseGet(X, i, j);
    rowMean /= m;
    for (let j = 0; j < m; j++) {
      denseSet(result, i, j, denseGet(X, i, j) - rowMean);
    }
  }
  return result;
}

function computeR(Q12D: DenseMat, m: number, n: number): DenseMat {
  const Q12DPm = rightMultiplyPm(Q12D, m);
  const R = denseCreate(n, m);
  const oneOverM = 1 / m;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      denseSet(R, i, j, denseGet(Q12DPm, i, j) + oneOverM);
    }
  }
  return R;
}

export interface BBWOptions {
  /** Maximum projected-gradient iterations used by the NNLS dual solve. */
  maxIterations?: number;
  /** Convergence threshold for the projected-gradient norm. */
  tolerance?: number;
  /** Weights below this threshold are dropped after normalization. */
  weightThreshold?: number;
}

function nnlsObjectiveFull(
  kktLU: LUFactors,
  R: DenseMat,
  Y: DenseMat,
  n: number,
  m: number,
): number {
  const YPm = rightMultiplyPm(Y, m);
  const Q11YPm = applyQ11(kktLU, YPm, n);
  let val = 0;
  for (let i = 0; i < n * m; i++) {
    val += 0.5 * Y.data[i]! * Q11YPm.data[i]! + R.data[i]! * Y.data[i]!;
  }
  return val;
}

/** Solves the non-negative dual with projected gradient descent and backtracking. */
function solveNNLSDual(
  kktLU: LUFactors,
  R: DenseMat,
  n: number,
  m: number,
  maxIter: number,
  tol: number,
): DenseMat {
  const nm = n * m;

  let Y = denseCreate(n, m);

  // Estimate a conservative first step size from the magnitude of the Q11 operator.
  const probe = denseCreate(n, m);
  for (let i = 0; i < nm; i++) probe.data[i] = 1 / Math.sqrt(nm);
  const Q11probe = applyQ11(kktLU, probe, n);
  let lipEst = 0;
  for (let i = 0; i < nm; i++) lipEst += Q11probe.data[i]! * Q11probe.data[i]!;
  lipEst = Math.sqrt(lipEst) * nm;
  let alpha = lipEst > 1e-10 ? 1 / lipEst : 0.01;

  for (let iter = 0; iter < maxIter; iter++) {
    const YPm = rightMultiplyPm(Y, m);
    const Q11YPm = applyQ11(kktLU, YPm, n);

    let gradNorm = 0;
    const G = new Float64Array(nm);
    for (let i = 0; i < nm; i++) {
      G[i] = R.data[i]! + Q11YPm.data[i]!;
      const yi = Y.data[i]!;
      const gi = G[i]!;
      const pg = yi > 0 ? gi : Math.min(0, gi);
      gradNorm += pg * pg;
    }
    gradNorm = Math.sqrt(gradNorm);

    if (gradNorm < tol) break;

    const fCur = nnlsObjectiveFull(kktLU, R, Y, n, m);
    const c1 = 1e-4;
    let step = alpha * 2;

    for (let ls = 0; ls < 20; ls++) {
      // Y_trial = max(0, Y - step * G)
      const Ytrial = denseCreate(n, m);
      let descent = 0;
      for (let i = 0; i < nm; i++) {
        const yi = Math.max(0, Y.data[i]! - step * G[i]!);
        Ytrial.data[i] = yi;
        descent += G[i]! * (Y.data[i]! - yi);
      }

      const fTrial = nnlsObjectiveFull(kktLU, R, Ytrial, n, m);
      if (fTrial <= fCur - c1 * descent) {
        Y = Ytrial;
        alpha = step;
        break;
      }
      step *= 0.5;
      if (ls === 19) {
        for (let i = 0; i < nm; i++) {
          Y.data[i] = Math.max(0, Y.data[i]! - step * G[i]!);
        }
        alpha = step;
      }
    }
  }

  return Y;
}

export function computeBBWWeights(
  vertices: number[],
  indices: number[],
  bones: BoneHandle[],
  options: BBWOptions = {},
): SkinWeight[][] {
  const { maxIterations = 2000, tolerance = 1e-6, weightThreshold = 0.01 } = options;

  const n = vertices.length / 2;
  const m = bones.length;

  if (m === 0 || n === 0 || indices.length < 3) {
    return Array.from({ length: n }, () => []);
  }

  if (m === 1) {
    return Array.from({ length: n }, () => [{ boneId: bones[0]!.id, weight: 1.0 }]);
  }

  // 1. Cotangent Laplacian
  const Lsparse = buildCotangentLaplacian(vertices, indices);

  // 2. Lumped mass matrix
  const M = buildLumpedMass(vertices, indices);

  // 3. Biharmonic matrix B = L^T M^{-1} L
  const B = buildBiharmonicMatrix(Lsparse, M);

  const { C, D } = buildConstraints(vertices, bones);

  const kktLU = buildAndFactorKKT(B, C);

  const Q12D = computeQ12D(kktLU, D, n);
  const R = computeR(Q12D, m, n);

  const Yopt = solveNNLSDual(kktLU, R, n, m, maxIterations, tolerance);

  const YPm = rightMultiplyPm(Yopt, m);
  const Q11YPm = applyQ11(kktLU, YPm, n);
  const W = denseCreate(n, m);
  for (let i = 0; i < n * m; i++) {
    W.data[i] = R.data[i]! + Q11YPm.data[i]!;
  }

  // Clamp and renormalize the recovered weights so every vertex stays within
  // the standard partition-of-unity constraints.
  const result: SkinWeight[][] = [];

  for (let vi = 0; vi < n; vi++) {
    const weights: SkinWeight[] = [];
    let total = 0;

    for (let bi = 0; bi < m; bi++) {
      const w = Math.max(0, Math.min(1, denseGet(W, vi, bi)));
      if (w > weightThreshold) {
        weights.push({ boneId: bones[bi]!.id, weight: w });
        total += w;
      }
    }

    if (total > 0) {
      for (const w of weights) w.weight /= total;
    } else {
      let bestDist = Infinity;
      let bestBi = 0;
      for (let bi = 0; bi < m; bi++) {
        const dx = vertices[vi * 2]! - bones[bi]!.x;
        const dy = vertices[vi * 2 + 1]! - bones[bi]!.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bestBi = bi;
        }
      }
      weights.push({ boneId: bones[bestBi]!.id, weight: 1.0 });
    }

    result.push(weights);
  }

  return result;
}
