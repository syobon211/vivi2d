import type { Affine2D } from "./bone-utils";
import { multiplyAffine } from "./bone-utils";
import type { SkinData, SkinWeight } from "./types";

export function computeSkinnedVertices(
  restVertices: number[],
  skin: SkinData,
  worldTransforms: Map<string, Affine2D>,
): number[] {
  const vertexCount = restVertices.length / 2;
  const result = new Array<number>(restVertices.length).fill(0);

  for (let vi = 0; vi < vertexCount; vi++) {
    const rx = restVertices[vi * 2]!;
    const ry = restVertices[vi * 2 + 1]!;
    const vertexWeights = skin.weights[vi];

    if (!vertexWeights || vertexWeights.length === 0) {
      result[vi * 2] = rx;
      result[vi * 2 + 1] = ry;
      continue;
    }

    let sumX = 0;
    let sumY = 0;
    let appliedWeight = 0;

    for (const sw of vertexWeights) {
      const world = worldTransforms.get(sw.boneId);
      const bindInv = skin.bindPoseInverse[sw.boneId];
      if (!world || !bindInv) continue;

      const skinMatrix = multiplyAffine(world, bindInv);

      const tx = skinMatrix[0] * rx + skinMatrix[2] * ry + skinMatrix[4];
      const ty = skinMatrix[1] * rx + skinMatrix[3] * ry + skinMatrix[5];

      sumX += tx * sw.weight;
      sumY += ty * sw.weight;
      appliedWeight += sw.weight;
    }

    if (appliedWeight <= 1e-12) {
      result[vi * 2] = rx;
      result[vi * 2 + 1] = ry;
      continue;
    }

    // Malformed or partially remapped skins should not collapse the source image.
    if (appliedWeight < 1) {
      const restWeight = 1 - appliedWeight;
      sumX += rx * restWeight;
      sumY += ry * restWeight;
    }

    result[vi * 2] = sumX;
    result[vi * 2 + 1] = sumY;
  }

  return result;
}

export function normalizeWeights(
  weights: { boneId: string; weight: number }[],
): { boneId: string; weight: number }[] {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  if (total < 1e-12) return weights;
  return weights.map((w) => ({ boneId: w.boneId, weight: w.weight / total }));
}

export interface BonePosition {
  id: string;
  x: number;
  y: number;
}

export function computeDistanceWeights(
  vertices: number[],
  bones: BonePosition[],
): SkinWeight[][] {
  const vertexCount = vertices.length / 2;
  if (bones.length === 0) {
    return Array.from({ length: vertexCount }, () => []);
  }

  const result: SkinWeight[][] = [];
  for (let vi = 0; vi < vertexCount; vi++) {
    const vx = vertices[vi * 2]!;
    const vy = vertices[vi * 2 + 1]!;

    const weights: SkinWeight[] = [];
    let totalInvDist = 0;

    for (const bone of bones) {
      const dx = vx - bone.x;
      const dy = vy - bone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const invDist = 1 / Math.max(dist, 0.001);
      weights.push({ boneId: bone.id, weight: invDist });
      totalInvDist += invDist;
    }

    if (totalInvDist > 0) {
      for (const w of weights) {
        w.weight /= totalInvDist;
      }
    }

    const filtered = weights.filter((w) => w.weight > 0.01);
    result.push(normalizeWeights(filtered));
  }

  return result;
}

export function findVerticesInRadius(
  vertices: number[],
  cx: number,
  cy: number,
  radius: number,
): { index: number; distance: number }[] {
  const result: { index: number; distance: number }[] = [];
  const vertexCount = vertices.length / 2;
  const r2 = radius * radius;

  for (let i = 0; i < vertexCount; i++) {
    const dx = vertices[i * 2]! - cx;
    const dy = vertices[i * 2 + 1]! - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) {
      result.push({ index: i, distance: Math.sqrt(d2) });
    }
  }

  return result;
}

export function smoothWeights(
  weights: SkinWeight[][],
  indices: number[],
  iterations: number,
): SkinWeight[][] {
  let current = weights.map((vw) => vw.map((w) => ({ ...w })));

  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      if (!adjacency.has(x)) adjacency.set(x, new Set());
      if (!adjacency.has(y)) adjacency.set(y, new Set());
      adjacency.get(x)!.add(y);
      adjacency.get(y)!.add(x);
    }
  }

  for (let iter = 0; iter < iterations; iter++) {
    const next = current.map((vw) => vw.map((w) => ({ ...w })));

    for (let vi = 0; vi < current.length; vi++) {
      const neighbors = adjacency.get(vi);
      if (!neighbors || neighbors.size === 0) continue;

      const boneWeightMap = new Map<string, number>();
      const selfWeights = current[vi]!;
      for (const sw of selfWeights) {
        boneWeightMap.set(sw.boneId, (boneWeightMap.get(sw.boneId) ?? 0) + sw.weight);
      }
      for (const ni of neighbors) {
        for (const nw of current[ni]!) {
          boneWeightMap.set(nw.boneId, (boneWeightMap.get(nw.boneId) ?? 0) + nw.weight);
        }
      }

      const divisor = 1 + neighbors.size;
      const averaged: SkinWeight[] = [];
      for (const [boneId, totalW] of boneWeightMap) {
        const avg = totalW / divisor;
        if (avg > 0.01) averaged.push({ boneId, weight: avg });
      }
      next[vi] = normalizeWeights(averaged);
    }

    current = next;
  }

  return current;
}
