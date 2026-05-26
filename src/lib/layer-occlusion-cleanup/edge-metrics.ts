import { clamp01, pixelIndex } from "./math";

export function luminance(data: Uint8ClampedArray, index: number): number {
  return (
    (data[index] ?? 0) * 0.2126 +
    (data[index + 1] ?? 0) * 0.7152 +
    (data[index + 2] ?? 0) * 0.0722
  );
}

function alphaAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return data[pixelIndex(width, x, y) + 3] ?? 0;
}

export function alphaGradientAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const index = pixelIndex(width, x, y);
  const alpha = data[index + 3] ?? 0;
  return (
    Math.max(
      Math.abs(alpha - alphaAt(data, width, height, x - 1, y)),
      Math.abs(alpha - alphaAt(data, width, height, x + 1, y)),
      Math.abs(alpha - alphaAt(data, width, height, x, y - 1)),
      Math.abs(alpha - alphaAt(data, width, height, x, y + 1)),
    ) / 255
  );
}

export function computeEdgeScore(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const index = pixelIndex(width, x, y);
  const alpha = data[index + 3] ?? 0;
  if (alpha <= 2) return 0;

  const centerLum = luminance(data, index);
  let maxContrast = 0;
  const samples = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ] as const;

  for (const [dx, dy] of samples) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const neighborIndex = pixelIndex(width, nx, ny);
    maxContrast = Math.max(
      maxContrast,
      Math.abs(centerLum - luminance(data, neighborIndex)),
    );
  }

  const darkness = 1 - centerLum / 255;
  const alphaGradient =
    Math.max(
      Math.abs(alpha - alphaAt(data, width, height, x - 1, y)),
      Math.abs(alpha - alphaAt(data, width, height, x + 1, y)),
      Math.abs(alpha - alphaAt(data, width, height, x, y - 1)),
      Math.abs(alpha - alphaAt(data, width, height, x, y + 1)),
    ) / 255;

  return clamp01(maxContrast / 72 + darkness * 0.22 + alphaGradient * 0.32);
}
