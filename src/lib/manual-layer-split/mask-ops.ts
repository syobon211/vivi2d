import type { MaskBuffer, Rect } from "./types";

export function createMaskBuffer(
  id: string,
  width: number,
  height: number,
  fill = 0,
): MaskBuffer {
  return {
    id,
    width,
    height,
    alpha: new Uint8ClampedArray(width * height).fill(fill),
  };
}

export function cloneMaskBuffer(buffer: MaskBuffer, id = buffer.id): MaskBuffer {
  return {
    id,
    width: buffer.width,
    height: buffer.height,
    alpha: new Uint8ClampedArray(buffer.alpha),
  };
}

export function countMaskPixels(buffer: MaskBuffer, threshold = 0): number {
  let count = 0;
  for (const value of buffer.alpha) {
    if (value > threshold) count += 1;
  }
  return count;
}

export function getMaskCoverage(buffer: MaskBuffer, threshold = 0): number {
  if (buffer.width <= 0 || buffer.height <= 0) return 0;
  return countMaskPixels(buffer, threshold) / (buffer.width * buffer.height);
}

export function getDirtyRectForCircle(
  buffer: MaskBuffer,
  cx: number,
  cy: number,
  radius: number,
): Rect {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(buffer.width, Math.ceil(cx + radius + 1));
  const y1 = Math.min(buffer.height, Math.ceil(cy + radius + 1));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

export function applyCircleBrush(
  buffer: MaskBuffer,
  cx: number,
  cy: number,
  radius: number,
  mode: "add" | "subtract" | "replace",
  value = 255,
): Rect {
  if (mode === "replace") buffer.alpha.fill(0);
  const bounds = getDirtyRectForCircle(buffer, cx, cy, radius);
  const radiusSq = radius * radius;
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > radiusSq) continue;
      const index = y * buffer.width + x;
      if (mode === "subtract") buffer.alpha[index] = 0;
      else buffer.alpha[index] = value;
    }
  }
  return bounds;
}

export function applyPolygonMask(
  buffer: MaskBuffer,
  points: ReadonlyArray<{ x: number; y: number }>,
  mode: "add" | "subtract" | "replace",
  value = 255,
): Rect {
  if (points.length < 3) return { x: 0, y: 0, width: 0, height: 0 };
  if (mode === "replace") buffer.alpha.fill(0);
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const maxX = Math.min(buffer.width, Math.ceil(Math.max(...points.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(buffer.height, Math.ceil(Math.max(...points.map((point) => point.y))));
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      if (!pointInPolygon(x + 0.5, y + 0.5, points)) continue;
      const index = y * buffer.width + x;
      if (mode === "subtract") buffer.alpha[index] = 0;
      else buffer.alpha[index] = value;
    }
  }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

export function resolveOverlapToActive(
  buffers: readonly MaskBuffer[],
  activeBufferId: string,
): void {
  const active = buffers.find((buffer) => buffer.id === activeBufferId);
  if (!active) return;
  for (const buffer of buffers) {
    if (buffer.id === active.id) continue;
    for (let index = 0; index < active.alpha.length; index += 1) {
      if (active.alpha[index]! > 0 && buffer.alpha[index]! > 0) {
        buffer.alpha[index] = 0;
      }
    }
  }
}

export function growMask(buffer: MaskBuffer, radius: number): void {
  if (radius <= 0) return;
  const source = new Uint8ClampedArray(buffer.alpha);
  const r = Math.ceil(radius);
  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const index = y * buffer.width + x;
      if (source[index]! > 0) continue;
      let found = false;
      for (let dy = -r; dy <= r && !found; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= buffer.width || ny >= buffer.height) continue;
          if (source[ny * buffer.width + nx]! > 0) {
            found = true;
            break;
          }
        }
      }
      if (found) buffer.alpha[index] = 255;
    }
  }
}

export function shrinkMask(buffer: MaskBuffer, radius: number): void {
  if (radius <= 0) return;
  const source = new Uint8ClampedArray(buffer.alpha);
  const r = Math.ceil(radius);
  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const index = y * buffer.width + x;
      if (source[index]! === 0) continue;
      let touchesEmpty = false;
      for (let dy = -r; dy <= r && !touchesEmpty; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= buffer.width ||
            ny >= buffer.height ||
            source[ny * buffer.width + nx]! === 0
          ) {
            touchesEmpty = true;
            break;
          }
        }
      }
      if (touchesEmpty) buffer.alpha[index] = 0;
    }
  }
}

export function featherMask(buffer: MaskBuffer, radius: number): void {
  if (radius <= 0) return;
  const source = new Uint8ClampedArray(buffer.alpha);
  const r = Math.ceil(radius);
  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      let total = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= buffer.width || ny >= buffer.height) continue;
          total += source[ny * buffer.width + nx]!;
          count += 1;
        }
      }
      buffer.alpha[y * buffer.width + x] = count > 0 ? Math.round(total / count) : source[y * buffer.width + x]!;
    }
  }
}

export function removeSmallIslands(buffer: MaskBuffer, minArea: number): void {
  visitConnectedComponents(buffer, true, (pixels) => {
    if (pixels.length >= minArea) return;
    for (const index of pixels) buffer.alpha[index] = 0;
  });
}

export function fillSmallHoles(buffer: MaskBuffer, maxArea: number): void {
  visitConnectedComponents(buffer, false, (pixels, touchesEdge) => {
    if (touchesEdge || pixels.length > maxArea) return;
    for (const index of pixels) buffer.alpha[index] = 255;
  });
}

export function regionGrowFromPoint(
  source: ImageData,
  buffer: MaskBuffer,
  x: number,
  y: number,
  tolerance: number,
  mode: "add" | "subtract" | "replace" = "add",
): void {
  if (source.width !== buffer.width || source.height !== buffer.height) return;
  const startX = Math.floor(x);
  const startY = Math.floor(y);
  if (startX < 0 || startY < 0 || startX >= source.width || startY >= source.height) {
    return;
  }
  if (mode === "replace") buffer.alpha.fill(0);
  const startIndex = (startY * source.width + startX) * 4;
  const seed: [number, number, number, number] = [
    source.data[startIndex]!,
    source.data[startIndex + 1]!,
    source.data[startIndex + 2]!,
    source.data[startIndex + 3]!,
  ];
  const queue = [startY * source.width + startX];
  const seen = new Uint8Array(source.width * source.height);
  seen[queue[0]!] = 1;
  while (queue.length > 0) {
    const index = queue.shift()!;
    const pixelIndex = index * 4;
    const distance =
      Math.abs(source.data[pixelIndex]! - seed[0]) +
      Math.abs(source.data[pixelIndex + 1]! - seed[1]) +
      Math.abs(source.data[pixelIndex + 2]! - seed[2]) +
      Math.abs(source.data[pixelIndex + 3]! - seed[3]);
    if (distance > tolerance) continue;
    buffer.alpha[index] = mode === "subtract" ? 0 : 255;
    const px = index % source.width;
    const py = Math.floor(index / source.width);
    for (const next of [
      [px - 1, py],
      [px + 1, py],
      [px, py - 1],
      [px, py + 1],
    ] as const) {
      const [nx, ny] = next;
      if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
      const nextIndex = ny * source.width + nx;
      if (seen[nextIndex]) continue;
      seen[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }
}

function visitConnectedComponents(
  buffer: MaskBuffer,
  foreground: boolean,
  visit: (pixels: number[], touchesEdge: boolean) => void,
): void {
  const seen = new Uint8Array(buffer.alpha.length);
  for (let start = 0; start < buffer.alpha.length; start += 1) {
    if (seen[start]) continue;
    const isTarget = foreground ? buffer.alpha[start]! > 0 : buffer.alpha[start]! === 0;
    if (!isTarget) continue;
    const queue = [start];
    const pixels: number[] = [];
    let touchesEdge = false;
    seen[start] = 1;
    while (queue.length > 0) {
      const index = queue.shift()!;
      pixels.push(index);
      const x = index % buffer.width;
      const y = Math.floor(index / buffer.width);
      touchesEdge ||= x === 0 || y === 0 || x === buffer.width - 1 || y === buffer.height - 1;
      for (const next of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        const [nx, ny] = next;
        if (nx < 0 || ny < 0 || nx >= buffer.width || ny >= buffer.height) continue;
        const nextIndex = ny * buffer.width + nx;
        if (seen[nextIndex]) continue;
        const matches = foreground
          ? buffer.alpha[nextIndex]! > 0
          : buffer.alpha[nextIndex]! === 0;
        if (!matches) continue;
        seen[nextIndex] = 1;
        queue.push(nextIndex);
      }
    }
    visit(pixels, touchesEdge);
  }
}

function pointInPolygon(
  x: number,
  y: number,
  points: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const pi = points[i]!;
    const pj = points[j]!;
    const intersects =
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y || Number.EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
