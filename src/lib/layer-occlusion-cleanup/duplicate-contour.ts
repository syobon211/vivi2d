import { alphaGradientAt, computeEdgeScore, luminance } from "./edge-metrics";
import {
  boxBlur,
  clamp01,
  maxFilter,
  maxFilterAnisotropic,
  pixelIndex,
} from "./math";
import type { FloatMask, LayerBounds, ResolvedOptions } from "./types";

function computeForegroundContourScore(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  alphaThreshold: number,
): number {
  const index = pixelIndex(width, x, y);
  const alpha = data[index + 3] ?? 0;
  if (alpha <= alphaThreshold) return 0;

  const alphaEdge = alphaGradientAt(data, width, height, x, y);
  const foregroundEdge = computeEdgeScore(data, width, height, x, y);
  const lineInk = 1 - luminance(data, index) / 255;

  return clamp01(
    alphaEdge * 0.92 +
      foregroundEdge * alphaEdge * 0.42 +
      lineInk * alphaEdge * 0.18,
  );
}

export function buildForegroundContourOwnershipMask(
  foregroundLayer: LayerBounds,
  foregroundImageData: ImageData,
  lowerLayer: LayerBounds,
  workLeft: number,
  workTop: number,
  workWidth: number,
  workHeight: number,
  seedMask: FloatMask,
  options: ResolvedOptions,
): FloatMask | null {
  if (options.duplicateContourRadius <= 0 || options.duplicateContourStrength <= 0) {
    return null;
  }

  let hasContour = false;
  const contourSeed = new Float32Array(workWidth * workHeight);
  for (let y = 0; y < workHeight; y += 1) {
    for (let x = 0; x < workWidth; x += 1) {
      const globalX = lowerLayer.x + workLeft + x;
      const globalY = lowerLayer.y + workTop + y;
      const fgX = Math.floor(globalX - foregroundLayer.x);
      const fgY = Math.floor(globalY - foregroundLayer.y);
      if (
        fgX < 0 ||
        fgY < 0 ||
        fgX >= foregroundImageData.width ||
        fgY >= foregroundImageData.height
      ) {
        continue;
      }

      const seedValue = seedMask[y * workWidth + x] ?? 0;
      if (seedValue <= 0.02) continue;
      const contourScore = computeForegroundContourScore(
        foregroundImageData.data,
        foregroundImageData.width,
        foregroundImageData.height,
        fgX,
        fgY,
        options.alphaThreshold,
      );
      if (contourScore <= 0.04) continue;
      contourSeed[y * workWidth + x] = contourScore * seedValue;
      hasContour = true;
    }
  }
  if (!hasContour) return null;

  let contourMask = maxFilter(
    contourSeed,
    workWidth,
    workHeight,
    options.duplicateContourRadius,
  );
  if (options.motionSweepRadiusX > 0 || options.motionSweepRadiusY > 0) {
    const sweptContourMask = maxFilterAnisotropic(
      contourSeed,
      workWidth,
      workHeight,
      Math.max(options.duplicateContourRadius, options.motionSweepRadiusX),
      Math.max(options.duplicateContourRadius, options.motionSweepRadiusY),
    );
    for (let index = 0; index < contourMask.length; index += 1) {
      contourMask[index] = Math.max(
        contourMask[index] ?? 0,
        (sweptContourMask[index] ?? 0) * options.motionSweepStrength * 0.85,
      );
    }
  }
  const blurRadius = Math.min(1, Math.floor(options.duplicateContourRadius / 2));
  return blurRadius > 0
    ? boxBlur(contourMask, workWidth, workHeight, blurRadius)
    : contourMask;
}
