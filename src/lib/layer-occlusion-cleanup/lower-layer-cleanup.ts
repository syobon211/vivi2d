import { buildContextualUnderpaintBuffer } from "./contextual-underpaint";
import { buildForegroundContourOwnershipMask } from "./duplicate-contour";
import { computeEdgeScore } from "./edge-metrics";
import { intersectBounds } from "./geometry";
import {
  boxBlur,
  clamp01,
  getMaskValue,
  lerp,
  maxFilter,
  maxFilterAnisotropic,
  pixelIndex,
} from "./math";
import { resolveOptions } from "./options";
import type {
  CleanupPairResult,
  FloatMask,
  LayerBounds,
  LayerOcclusionCleanupOptions,
} from "./types";

function sampleUnderpaintColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: FloatMask,
  maskWidth: number,
  maskHeight: number,
  workLeft: number,
  workTop: number,
  x: number,
  y: number,
  radius: number,
): { r: number; g: number; b: number } {
  for (const preferUnmasked of [true, false]) {
    let totalWeight = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        const localMask = getMaskValue(mask, maskWidth, maskHeight, workLeft, workTop, nx, ny);
        if (preferUnmasked && localMask > 0.18) continue;

        const index = pixelIndex(width, nx, ny);
        const alpha = data[index + 3] ?? 0;
        if (alpha <= 2) continue;
        const weight = (1 - distance / (radius + 1)) * (alpha / 255);
        totalWeight += weight;
        r += (data[index] ?? 0) * weight;
        g += (data[index + 1] ?? 0) * weight;
        b += (data[index + 2] ?? 0) * weight;
      }
    }
    if (totalWeight > 0) {
      return { r: r / totalWeight, g: g / totalWeight, b: b / totalWeight };
    }
  }

  const index = pixelIndex(width, x, y);
  return {
    r: data[index] ?? 0,
    g: data[index + 1] ?? 0,
    b: data[index + 2] ?? 0,
  };
}

export function cleanupLowerLayerImageDataByForegroundMask(
  lowerLayer: LayerBounds,
  lowerImageData: ImageData,
  foregroundLayer: LayerBounds,
  foregroundImageData: ImageData,
  options?: LayerOcclusionCleanupOptions,
): CleanupPairResult {
  const resolved = resolveOptions(options);
  const overlap = intersectBounds(lowerLayer, foregroundLayer);
  if (!overlap) return { imageData: lowerImageData, affectedPixels: 0 };

  const paddingX =
    Math.max(
      resolved.expandRadius,
      resolved.motionSweepRadiusX,
      resolved.contextUnderpaintPasses,
      resolved.duplicateContourRadius,
    ) +
    resolved.featherRadius;
  const paddingY =
    Math.max(
      resolved.expandRadius,
      resolved.motionSweepRadiusY,
      resolved.contextUnderpaintPasses,
      resolved.duplicateContourRadius,
    ) +
    resolved.featherRadius;
  const workLeft = Math.max(0, Math.floor(overlap.x - lowerLayer.x - paddingX));
  const workTop = Math.max(0, Math.floor(overlap.y - lowerLayer.y - paddingY));
  const workRight = Math.min(
    lowerImageData.width,
    Math.ceil(overlap.x + overlap.width - lowerLayer.x + paddingX),
  );
  const workBottom = Math.min(
    lowerImageData.height,
    Math.ceil(overlap.y + overlap.height - lowerLayer.y + paddingY),
  );
  const workWidth = workRight - workLeft;
  const workHeight = workBottom - workTop;
  if (workWidth <= 0 || workHeight <= 0) {
    return { imageData: lowerImageData, affectedPixels: 0 };
  }

  let hasMask = false;
  let mask: FloatMask = new Float32Array(workWidth * workHeight);
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
      const alpha =
        foregroundImageData.data[pixelIndex(foregroundImageData.width, fgX, fgY) + 3] ?? 0;
      if (alpha <= resolved.alphaThreshold) continue;
      const value = clamp01(
        (alpha - resolved.alphaThreshold) / (255 - resolved.alphaThreshold),
      );
      mask[y * workWidth + x] = value;
      hasMask = true;
    }
  }
  if (!hasMask) return { imageData: lowerImageData, affectedPixels: 0 };

  const seedMask = mask;
  const foregroundContourOwnershipMask = buildForegroundContourOwnershipMask(
    foregroundLayer,
    foregroundImageData,
    lowerLayer,
    workLeft,
    workTop,
    workWidth,
    workHeight,
    seedMask,
    resolved,
  );
  mask = maxFilter(seedMask, workWidth, workHeight, resolved.expandRadius);
  if (resolved.motionSweepRadiusX > 0 || resolved.motionSweepRadiusY > 0) {
    const sweptMask = maxFilterAnisotropic(
      seedMask,
      workWidth,
      workHeight,
      resolved.motionSweepRadiusX,
      resolved.motionSweepRadiusY,
    );
    for (let index = 0; index < mask.length; index += 1) {
      mask[index] = Math.max(
        mask[index] ?? 0,
        (sweptMask[index] ?? 0) * resolved.motionSweepStrength,
      );
    }
  }
  mask = boxBlur(mask, workWidth, workHeight, resolved.featherRadius);

  const source = lowerImageData.data;
  const contextualUnderpaint = buildContextualUnderpaintBuffer(
    source,
    lowerImageData.width,
    lowerImageData.height,
    mask,
    workWidth,
    workHeight,
    workLeft,
    workTop,
    resolved,
  );
  const output = new ImageData(
    new Uint8ClampedArray(source),
    lowerImageData.width,
    lowerImageData.height,
  );
  const data = output.data;
  let affectedPixels = 0;

  for (let y = 0; y < workHeight; y += 1) {
    for (let x = 0; x < workWidth; x += 1) {
      const maskValue = mask[y * workWidth + x] ?? 0;
      if (maskValue <= 0.08) continue;
      const targetX = workLeft + x;
      const targetY = workTop + y;
      const index = pixelIndex(lowerImageData.width, targetX, targetY);
      const alpha = source[index + 3] ?? 0;
      if (alpha <= 2) continue;

      const edgeScore = computeEdgeScore(
        source,
        lowerImageData.width,
        lowerImageData.height,
        targetX,
        targetY,
      );
      const duplicateContourScore =
        (foregroundContourOwnershipMask?.[y * workWidth + x] ?? 0) *
        resolved.duplicateContourStrength *
        clamp01(edgeScore * 1.12);
      const underpaint = sampleUnderpaintColor(
        source,
        lowerImageData.width,
        lowerImageData.height,
        mask,
        workWidth,
        workHeight,
        workLeft,
        workTop,
        targetX,
        targetY,
        resolved.underpaintRadius,
      );
      const completionConfidence =
        contextualUnderpaint?.confidence[y * workWidth + x] ?? 0;
      if (contextualUnderpaint && completionConfidence > 0.04) {
        const completionAmount =
          completionConfidence * resolved.contextUnderpaintStrength;
        underpaint.r = lerp(
          underpaint.r,
          contextualUnderpaint.r[y * workWidth + x] ?? underpaint.r,
          completionAmount,
        );
        underpaint.g = lerp(
          underpaint.g,
          contextualUnderpaint.g[y * workWidth + x] ?? underpaint.g,
          completionAmount,
        );
        underpaint.b = lerp(
          underpaint.b,
          contextualUnderpaint.b[y * workWidth + x] ?? underpaint.b,
          completionAmount,
        );
      }

      const underpaintAmount =
        clamp01(
          maskValue *
            resolved.underpaintStrength *
            Math.max(
              0.16 + edgeScore * 0.84,
              completionConfidence * resolved.contextUnderpaintStrength * 0.48,
            ) +
            duplicateContourScore * 0.74,
        );
      data[index] = Math.round(lerp(source[index] ?? 0, underpaint.r, underpaintAmount));
      data[index + 1] = Math.round(
        lerp(source[index + 1] ?? 0, underpaint.g, underpaintAmount),
      );
      data[index + 2] = Math.round(
        lerp(source[index + 2] ?? 0, underpaint.b, underpaintAmount),
      );

      const holdoutAmount =
        clamp01(
          maskValue * resolved.holdoutStrength * (0.18 + edgeScore * 0.82) +
            duplicateContourScore * 0.42,
        );
      data[index + 3] = Math.round(alpha * (1 - holdoutAmount));
      affectedPixels += 1;
    }
  }

  return { imageData: output, affectedPixels };
}
