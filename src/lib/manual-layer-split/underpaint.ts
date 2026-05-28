import type { MaskBuffer, Rect, UnderpaintBuffer } from "./types";

export interface TrimapBuffer {
  width: number;
  height: number;
  values: Uint8ClampedArray;
}

export interface LocalUnderpaintOptions {
  underpaintId: string;
  sourceMaskId?: string;
  occludedByMaskId?: string;
  radius?: number;
}

export function createBoundaryTrimap(
  mask: MaskBuffer,
  radius: number,
): TrimapBuffer {
  const values = new Uint8ClampedArray(mask.width * mask.height);
  const r = Math.max(1, Math.ceil(radius));
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const index = y * mask.width + x;
      const inside = mask.alpha[index]! > 0;
      let nearBoundary = false;
      for (let dy = -r; dy <= r && !nearBoundary; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx * dx + dy * dy > r * r) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= mask.width || ny >= mask.height) continue;
          const neighborInside = mask.alpha[ny * mask.width + nx]! > 0;
          if (neighborInside !== inside) {
            nearBoundary = true;
            break;
          }
        }
      }
      values[index] = inside ? (nearBoundary ? 128 : 255) : nearBoundary ? 128 : 0;
    }
  }
  return { width: mask.width, height: mask.height, values };
}

export function createLocalUnderpaintPreview(
  source: ImageData,
  occlusionMask: MaskBuffer,
  options: LocalUnderpaintOptions,
): UnderpaintBuffer | null {
  if (source.width !== occlusionMask.width || source.height !== occlusionMask.height) {
    return null;
  }
  const bounds = findMaskBounds(occlusionMask);
  if (!bounds) return null;
  const radius = Math.max(1, Math.ceil(options.radius ?? 8));
  const padded = padRect(bounds, radius, source.width, source.height);
  const rgba = new Uint8ClampedArray(padded.width * padded.height * 4);
  for (let y = 0; y < padded.height; y += 1) {
    for (let x = 0; x < padded.width; x += 1) {
      const sourceX = padded.x + x;
      const sourceY = padded.y + y;
      const sourceIndex = sourceY * source.width + sourceX;
      const targetIndex = (y * padded.width + x) * 4;
      if (occlusionMask.alpha[sourceIndex]! === 0) {
        copySourcePixel(source.data, sourceIndex, rgba, targetIndex);
        continue;
      }
      const replacement = sampleNearestUnmaskedPixel(source, occlusionMask, sourceX, sourceY, radius);
      if (replacement) {
        rgba[targetIndex] = replacement[0];
        rgba[targetIndex + 1] = replacement[1];
        rgba[targetIndex + 2] = replacement[2];
        rgba[targetIndex + 3] = replacement[3];
      }
    }
  }
  return {
    id: options.underpaintId,
    x: padded.x,
    y: padded.y,
    width: padded.width,
    height: padded.height,
    rgba,
    provenance: "generatedHidden",
    sourceMaskId: options.sourceMaskId,
    occludedByMaskId: options.occludedByMaskId,
    generation: 0,
    reviewState: "preview",
    generatorProvenance: "local",
  };
}

export function acceptUnderpaintBuffer(buffer: UnderpaintBuffer): UnderpaintBuffer {
  return {
    ...buffer,
    rgba: new Uint8ClampedArray(buffer.rgba),
    generation: buffer.generation + 1,
    reviewState: "accepted",
  };
}

function findMaskBounds(mask: MaskBuffer): Rect | null {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.alpha[y * mask.width + x]! === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function padRect(rect: Rect, padding: number, maxWidth: number, maxHeight: number): Rect {
  const x = Math.max(0, rect.x - padding);
  const y = Math.max(0, rect.y - padding);
  const right = Math.min(maxWidth, rect.x + rect.width + padding);
  const bottom = Math.min(maxHeight, rect.y + rect.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

function copySourcePixel(
  source: Uint8ClampedArray,
  sourcePixelIndex: number,
  target: Uint8ClampedArray,
  targetRgbaIndex: number,
): void {
  const sourceRgbaIndex = sourcePixelIndex * 4;
  target[targetRgbaIndex] = source[sourceRgbaIndex]!;
  target[targetRgbaIndex + 1] = source[sourceRgbaIndex + 1]!;
  target[targetRgbaIndex + 2] = source[sourceRgbaIndex + 2]!;
  target[targetRgbaIndex + 3] = source[sourceRgbaIndex + 3]!;
}

function sampleNearestUnmaskedPixel(
  source: ImageData,
  mask: MaskBuffer,
  x: number,
  y: number,
  radius: number,
): [number, number, number, number] | null {
  for (let r = 1; r <= radius; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
        const index = ny * source.width + nx;
        if (mask.alpha[index]! > 0) continue;
        const rgbaIndex = index * 4;
        return [
          source.data[rgbaIndex]!,
          source.data[rgbaIndex + 1]!,
          source.data[rgbaIndex + 2]!,
          source.data[rgbaIndex + 3]!,
        ];
      }
    }
  }
  return null;
}
