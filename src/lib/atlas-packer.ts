import { ATLAS } from "@vivi2d/core/constants";
import type { AtlasData, AtlasEntry } from "@vivi2d/core/types";

export interface PackRect {
  id: string;
  width: number;
  height: number;
}

export interface PackedRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  atlasIndex: number;
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function packRects(
  rects: readonly PackRect[],
  maxSize: number = ATLAS.MAX_SIZE,
  padding: number = ATLAS.PADDING,
): PackedRect[] {
  if (rects.length === 0) return [];

  const padded = rects.map((r) => ({
    id: r.id,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
    origWidth: r.width,
    origHeight: r.height,
  }));

  for (const r of padded) {
    if (r.width > maxSize || r.height > maxSize) {
      throw new Error(
        `Texture "${r.id}" (${r.origWidth}x${r.origHeight}) exceeds the atlas max size ${maxSize}`,
      );
    }
  }

  const sorted = [...padded].sort((a, b) => b.width * b.height - a.width * a.height);

  const result: PackedRect[] = [];
  let remaining = sorted;
  let atlasIndex = 0;

  while (remaining.length > 0) {
    const freeRects: FreeRect[] = [{ x: 0, y: 0, width: maxSize, height: maxSize }];
    const placed: typeof remaining = [];
    const notPlaced: typeof remaining = [];

    for (const rect of remaining) {
      const best = findBestPosition(freeRects, rect.width, rect.height);
      if (best) {
        result.push({
          id: rect.id,
          x: best.x + padding,
          y: best.y + padding,
          width: rect.origWidth,
          height: rect.origHeight,
          atlasIndex,
        });
        splitFreeRects(freeRects, {
          x: best.x,
          y: best.y,
          width: rect.width,
          height: rect.height,
        });
        pruneFreeRects(freeRects);
        placed.push(rect);
      } else {
        notPlaced.push(rect);
      }
    }

    if (placed.length === 0) {
      throw new Error("Atlas packing failed");
    }

    remaining = notPlaced;
    atlasIndex++;
  }

  return result;
}

function findBestPosition(
  freeRects: readonly FreeRect[],
  width: number,
  height: number,
): { x: number; y: number } | null {
  let bestScore = Number.POSITIVE_INFINITY;
  let bestPos: { x: number; y: number } | null = null;

  for (const fr of freeRects) {
    if (width <= fr.width && height <= fr.height) {
      const leftoverH = fr.width - width;
      const leftoverV = fr.height - height;
      const shortSide = Math.min(leftoverH, leftoverV);
      if (shortSide < bestScore) {
        bestScore = shortSide;
        bestPos = { x: fr.x, y: fr.y };
      }
    }
  }

  return bestPos;
}

function splitFreeRects(freeRects: FreeRect[], placed: FreeRect): void {
  for (let i = freeRects.length - 1; i >= 0; i--) {
    const fr = freeRects[i];
    if (!fr || !intersects(fr, placed)) continue;

    freeRects.splice(i, 1);

    if (placed.x > fr.x) {
      freeRects.push({ x: fr.x, y: fr.y, width: placed.x - fr.x, height: fr.height });
    }
    const placedRight = placed.x + placed.width;
    const frRight = fr.x + fr.width;
    if (placedRight < frRight) {
      freeRects.push({
        x: placedRight,
        y: fr.y,
        width: frRight - placedRight,
        height: fr.height,
      });
    }
    if (placed.y > fr.y) {
      freeRects.push({ x: fr.x, y: fr.y, width: fr.width, height: placed.y - fr.y });
    }
    const placedBottom = placed.y + placed.height;
    const frBottom = fr.y + fr.height;
    if (placedBottom < frBottom) {
      freeRects.push({
        x: fr.x,
        y: placedBottom,
        width: fr.width,
        height: frBottom - placedBottom,
      });
    }
  }
}

function pruneFreeRects(freeRects: FreeRect[]): void {
  for (let i = freeRects.length - 1; i >= 0; i--) {
    const fri = freeRects[i];
    if (!fri) continue;
    for (let j = 0; j < freeRects.length; j++) {
      if (i === j) continue;
      const frj = freeRects[j];
      if (!frj) continue;
      if (contains(frj, fri)) {
        freeRects.splice(i, 1);
        break;
      }
    }
  }
}

function intersects(a: FreeRect, b: FreeRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function contains(a: FreeRect, b: FreeRect): boolean {
  return (
    a.x <= b.x &&
    a.y <= b.y &&
    a.x + a.width >= b.x + b.width &&
    a.y + a.height >= b.y + b.height
  );
}

export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  let v = n - 1;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return v + 1;
}

function computeAtlasSize(
  packed: readonly PackedRect[],
  atlasIndex: number,
  padding: number,
  maxSize: number,
  minSize: number,
): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const r of packed) {
    if (r.atlasIndex !== atlasIndex) continue;
    const right = r.x + r.width + padding;
    const bottom = r.y + r.height + padding;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  return {
    width: Math.min(Math.max(nextPowerOfTwo(maxX), minSize), maxSize),
    height: Math.min(Math.max(nextPowerOfTwo(maxY), minSize), maxSize),
  };
}

export function renderAtlases(
  packed: readonly PackedRect[],
  textures: ReadonlyMap<string, HTMLCanvasElement>,
  atlasCount: number,
  padding: number = ATLAS.PADDING,
  maxSize: number = ATLAS.MAX_SIZE,
  minSize: number = ATLAS.MIN_SIZE,
): HTMLCanvasElement[] {
  const canvases: HTMLCanvasElement[] = [];

  for (let i = 0; i < atlasCount; i++) {
    const size = computeAtlasSize(packed, i, padding, maxSize, minSize);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get a Canvas 2D context");

    for (const r of packed) {
      if (r.atlasIndex !== i) continue;
      const tex = textures.get(r.id);
      if (tex) {
        ctx.drawImage(tex, r.x, r.y);
      }
    }

    canvases.push(canvas);
  }

  return canvases;
}

export function remapUvs(
  localUvs: readonly number[],
  entry: AtlasEntry,
  atlasWidth: number,
  atlasHeight: number,
): number[] {
  const result = new Array<number>(localUvs.length);
  for (let i = 0; i < localUvs.length; i += 2) {
    const u = localUvs[i] ?? 0;
    const v = localUvs[i + 1] ?? 0;
    result[i] = (entry.x + u * entry.width) / atlasWidth;
    result[i + 1] = (entry.y + v * entry.height) / atlasHeight;
  }
  return result;
}

export function unremapUvs(
  atlasUvs: readonly number[],
  entry: AtlasEntry,
  atlasWidth: number,
  atlasHeight: number,
): number[] {
  const result = new Array<number>(atlasUvs.length);
  for (let i = 0; i < atlasUvs.length; i += 2) {
    const u = atlasUvs[i] ?? 0;
    const v = atlasUvs[i + 1] ?? 0;
    result[i] = (u * atlasWidth - entry.x) / entry.width;
    result[i + 1] = (v * atlasHeight - entry.y) / entry.height;
  }
  return result;
}

export function buildAtlases(
  textures: ReadonlyMap<string, HTMLCanvasElement>,
): AtlasData[] {
  if (textures.size === 0) return [];

  const rects: PackRect[] = [];
  for (const [id, canvas] of textures) {
    rects.push({ id, width: canvas.width, height: canvas.height });
  }

  const packed = packRects(rects);
  const atlasCount = packed.reduce((max, r) => Math.max(max, r.atlasIndex), 0) + 1;
  const canvases = renderAtlases(packed, textures, atlasCount);

  const atlases: AtlasData[] = [];
  for (let i = 0; i < atlasCount; i++) {
    const canvas = canvases[i];
    if (!canvas) continue;
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");

    const entries: AtlasEntry[] = packed
      .filter((r) => r.atlasIndex === i)
      .map((r) => ({
        layerId: r.id,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      }));

    atlases.push({
      image: base64,
      width: canvas.width,
      height: canvas.height,
      entries,
    });
  }

  return atlases;
}
