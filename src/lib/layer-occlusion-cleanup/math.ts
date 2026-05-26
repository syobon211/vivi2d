import type { FloatMask } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function pixelIndex(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

export function maxFilter(
  mask: FloatMask,
  width: number,
  height: number,
  radius: number,
): FloatMask {
  if (radius <= 0) return mask;
  const output = new Float32Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let maxValue = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          maxValue = Math.max(maxValue, mask[ny * width + nx] ?? 0);
        }
      }
      output[y * width + x] = maxValue;
    }
  }
  return output;
}

export function maxFilterHorizontal(
  mask: FloatMask,
  width: number,
  height: number,
  radius: number,
): FloatMask {
  if (radius <= 0) return mask;
  const output = new Float32Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      let maxValue = 0;
      for (let nx = left; nx <= right; nx += 1) {
        maxValue = Math.max(maxValue, mask[rowOffset + nx] ?? 0);
      }
      output[rowOffset + x] = maxValue;
    }
  }
  return output;
}

export function maxFilterVertical(
  mask: FloatMask,
  width: number,
  height: number,
  radius: number,
): FloatMask {
  if (radius <= 0) return mask;
  const output = new Float32Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      let maxValue = 0;
      for (let ny = top; ny <= bottom; ny += 1) {
        maxValue = Math.max(maxValue, mask[ny * width + x] ?? 0);
      }
      output[y * width + x] = maxValue;
    }
  }
  return output;
}

export function maxFilterAnisotropic(
  mask: FloatMask,
  width: number,
  height: number,
  radiusX: number,
  radiusY: number,
): FloatMask {
  if (radiusX <= 0 && radiusY <= 0) return mask;
  return maxFilterVertical(
    maxFilterHorizontal(mask, width, height, radiusX),
    width,
    height,
    radiusY,
  );
}

export function boxBlur(
  mask: FloatMask,
  width: number,
  height: number,
  radius: number,
): FloatMask {
  if (radius <= 0) return mask;
  const output = new Float32Array(mask.length);
  const diameter = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += mask[ny * width + nx] ?? 0;
          count += 1;
        }
      }
      output[y * width + x] = count > 0 ? clamp01((sum / count) * (diameter / 4)) : 0;
    }
  }
  return output;
}

export function getMaskValue(
  mask: FloatMask,
  maskWidth: number,
  maskHeight: number,
  workLeft: number,
  workTop: number,
  x: number,
  y: number,
): number {
  const localX = x - workLeft;
  const localY = y - workTop;
  if (localX < 0 || localY < 0 || localX >= maskWidth || localY >= maskHeight) {
    return 0;
  }
  return mask[localY * maskWidth + localX] ?? 0;
}
