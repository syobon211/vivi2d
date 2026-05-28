import { alphaGradientAt, luminance } from "./edge-metrics";
import { clamp01, lerp, pixelIndex } from "./math";
import { resolveOptions } from "./options";
import type { CleanupPairResult, LayerOcclusionCleanupOptions } from "./types";

function lightFringeScore(data: Uint8ClampedArray, index: number): number {
  const r = data[index] ?? 0;
  const g = data[index + 1] ?? 0;
  const b = data[index + 2] ?? 0;
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const chroma = maxChannel - minChannel;
  const lightness = luminance(data, index);
  return clamp01(((lightness - 176) / 72) * ((92 - chroma) / 92));
}

function computeForegroundEdgeScore(
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
  const transparency = 1 - alpha / 255;
  return clamp01(alphaGradientAt(data, width, height, x, y) * 0.72 + transparency * 0.46);
}

function sampleForegroundInteriorColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): { r: number; g: number; b: number } | null {
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
      if (distance <= 0 || distance > radius) continue;
      const index = pixelIndex(width, nx, ny);
      const alpha = data[index + 3] ?? 0;
      if (alpha < 230) continue;
      const alphaGradient = alphaGradientAt(data, width, height, nx, ny);
      if (alphaGradient > 0.24) continue;
      const weight = (1 - distance / (radius + 1)) * (alpha / 255);
      totalWeight += weight;
      r += (data[index] ?? 0) * weight;
      g += (data[index + 1] ?? 0) * weight;
      b += (data[index + 2] ?? 0) * weight;
    }
  }

  if (totalWeight <= 0) return null;
  return { r: r / totalWeight, g: g / totalWeight, b: b / totalWeight };
}

export function decontaminateForegroundEdges(
  imageData: ImageData,
  options?: LayerOcclusionCleanupOptions,
): CleanupPairResult {
  const resolved = resolveOptions(options);
  if (resolved.edgeDecontaminationStrength <= 0) {
    return { imageData, affectedPixels: 0 };
  }

  const source = imageData.data;
  const output = new ImageData(
    new Uint8ClampedArray(source),
    imageData.width,
    imageData.height,
  );
  const data = output.data;
  let affectedPixels = 0;

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const index = pixelIndex(imageData.width, x, y);
      const alpha = source[index + 3] ?? 0;
      if (alpha <= resolved.alphaThreshold) continue;

      const edgeScore = computeForegroundEdgeScore(
        source,
        imageData.width,
        imageData.height,
        x,
        y,
        resolved.alphaThreshold,
      );
      const fringeScore = lightFringeScore(source, index);
      const softAlphaScore = alpha < 245 ? 0.42 : 0;
      const contaminantScore = Math.max(fringeScore, softAlphaScore);
      if (edgeScore <= 0.04 || contaminantScore <= 0.08) continue;

      const interior = sampleForegroundInteriorColor(
        source,
        imageData.width,
        imageData.height,
        x,
        y,
        resolved.edgeDecontaminationRadius,
      );
      if (!interior) continue;

      const blendAmount =
        resolved.edgeDecontaminationStrength *
        clamp01(contaminantScore * 0.92 + edgeScore * 0.22);
      data[index] = Math.round(lerp(source[index] ?? 0, interior.r, blendAmount));
      data[index + 1] = Math.round(
        lerp(source[index + 1] ?? 0, interior.g, blendAmount),
      );
      data[index + 2] = Math.round(
        lerp(source[index + 2] ?? 0, interior.b, blendAmount),
      );

      const trimAmount =
        fringeScore *
        edgeScore *
        resolved.edgeAlphaTrimStrength *
        resolved.edgeDecontaminationStrength;
      if (trimAmount > 0.005) {
        data[index + 3] = Math.round(alpha * (1 - trimAmount));
      }
      affectedPixels += 1;
    }
  }

  return { imageData: affectedPixels > 0 ? output : imageData, affectedPixels };
}
