import { computeEdgeScore } from "./edge-metrics";
import { clamp01, pixelIndex } from "./math";
import type { ContextualUnderpaintBuffer, FloatMask, ResolvedOptions } from "./types";

export function buildContextualUnderpaintBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: FloatMask,
  maskWidth: number,
  maskHeight: number,
  workLeft: number,
  workTop: number,
  options: ResolvedOptions,
): ContextualUnderpaintBuffer | null {
  if (options.contextUnderpaintPasses <= 0 || options.contextUnderpaintStrength <= 0) {
    return null;
  }

  const length = maskWidth * maskHeight;
  const r = new Float32Array(length);
  const g = new Float32Array(length);
  const b = new Float32Array(length);
  const a = new Float32Array(length);
  const confidence = new Float32Array(length);
  const hole = new Uint8Array(length);
  const edgeWeight = new Float32Array(length);
  let hasHole = false;

  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const localIndex = y * maskWidth + x;
      const targetX = workLeft + x;
      const targetY = workTop + y;
      const index = pixelIndex(width, targetX, targetY);
      const alpha = data[index + 3] ?? 0;
      r[localIndex] = data[index] ?? 0;
      g[localIndex] = data[index + 1] ?? 0;
      b[localIndex] = data[index + 2] ?? 0;
      a[localIndex] = alpha;

      if (alpha <= 2) continue;
      if ((mask[localIndex] ?? 0) > 0.12) {
        hole[localIndex] = 1;
        hasHole = true;
        continue;
      }

      confidence[localIndex] = 1;
      edgeWeight[localIndex] = computeEdgeScore(data, width, height, targetX, targetY);
    }
  }

  if (!hasHole) return null;

  let currentR = r;
  let currentG = g;
  let currentB = b;
  let currentConfidence = confidence;
  let nextR = new Float32Array(length);
  let nextG = new Float32Array(length);
  let nextB = new Float32Array(length);
  let nextConfidence = new Float32Array(length);
  const neighbors = [
    [-1, 0, 1],
    [1, 0, 1],
    [0, -1, 1],
    [0, 1, 1],
    [-1, -1, 0.72],
    [1, -1, 0.72],
    [-1, 1, 0.72],
    [1, 1, 0.72],
  ] as const;

  for (let pass = 0; pass < options.contextUnderpaintPasses; pass += 1) {
    nextR.set(currentR);
    nextG.set(currentG);
    nextB.set(currentB);
    nextConfidence.set(currentConfidence);
    let changed = false;

    for (let y = 0; y < maskHeight; y += 1) {
      for (let x = 0; x < maskWidth; x += 1) {
        const localIndex = y * maskWidth + x;
        if (hole[localIndex] !== 1 || (a[localIndex] ?? 0) <= 2) continue;

        let totalWeight = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;

        for (const [dx, dy, baseWeight] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= maskWidth || ny >= maskHeight) continue;
          const neighborIndex = ny * maskWidth + nx;
          const neighborConfidence = currentConfidence[neighborIndex] ?? 0;
          if (neighborConfidence <= 0.04 || (a[neighborIndex] ?? 0) <= 2) continue;

          const edgePenalty = edgeWeight[neighborIndex] ?? 0;
          const alphaWeight = (a[neighborIndex] ?? 0) / 255;
          const weight =
            baseWeight *
            neighborConfidence *
            alphaWeight *
            (1 - edgePenalty * 0.72);
          if (weight <= 0.001) continue;

          totalWeight += weight;
          sumR += (currentR[neighborIndex] ?? 0) * weight;
          sumG += (currentG[neighborIndex] ?? 0) * weight;
          sumB += (currentB[neighborIndex] ?? 0) * weight;
        }

        if (totalWeight <= 0) continue;
        nextR[localIndex] = sumR / totalWeight;
        nextG[localIndex] = sumG / totalWeight;
        nextB[localIndex] = sumB / totalWeight;
        nextConfidence[localIndex] = Math.max(
          currentConfidence[localIndex] ?? 0,
          clamp01(totalWeight / 2.2) * 0.96,
        );
        changed = true;
      }
    }

    [currentR, nextR] = [nextR, currentR];
    [currentG, nextG] = [nextG, currentG];
    [currentB, nextB] = [nextB, currentB];
    [currentConfidence, nextConfidence] = [nextConfidence, currentConfidence];
    if (!changed) break;
  }

  return {
    r: currentR,
    g: currentG,
    b: currentB,
    confidence: currentConfidence,
  };
}
