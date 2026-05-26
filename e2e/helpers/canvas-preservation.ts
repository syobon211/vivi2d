import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "playwright";
import { waitForStableFrame } from "./app";

export type CanvasPreservationStats = {
  width: number;
  height: number;
  inkPixels: number;
  inkBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } | null;
  thumbnailSize: number;
  thumbnail: number[];
};

export type CanvasPreservationThresholds = {
  minInkDensityRatio?: number;
  minBoundsRatio?: number;
  maxCenterShiftRatio?: number;
  maxBoundsGrowthRatio?: number;
  minThumbnailSimilarity?: number;
};

const DEFAULT_THRESHOLDS: Required<CanvasPreservationThresholds> = {
  minInkDensityRatio: 0.9,
  minBoundsRatio: 0.75,
  maxCenterShiftRatio: 0.12,
  maxBoundsGrowthRatio: 1.2,
  minThumbnailSimilarity: 0.68,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function boundsCenter(bounds: NonNullable<CanvasPreservationStats["inkBounds"]>) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

export async function captureCanvasGateScreenshot(
  window: Page,
  directory: string,
  fileName: string,
): Promise<void> {
  fs.mkdirSync(directory, { recursive: true });
  const screenshotPath = path.join(directory, fileName);
  await window.locator(".canvas-container canvas").screenshot({
    path: screenshotPath,
  });
  await test.info().attach(fileName, {
    contentType: "image/png",
    path: screenshotPath,
  });
}

export async function readCanvasPreservationStats(
  window: Page,
  thumbnailSize = 64,
): Promise<CanvasPreservationStats> {
  await window.evaluate(() => {
    (
      window.__vivi2d as { forceEditorCanvasRender?: () => void } | undefined
    )?.forceEditorCanvasRender?.();
  });
  await waitForStableFrame(window, 4);

  return window.evaluate(async (size) => {
    const sourceCanvas = document.querySelector(
      ".canvas-container canvas",
    ) as HTMLCanvasElement | null;
    if (!sourceCanvas) throw new Error("Canvas is not available");

    const image = new Image();
    image.src = sourceCanvas.toDataURL("image/png");
    await image.decode();

    const readback = document.createElement("canvas");
    readback.width = sourceCanvas.width;
    readback.height = sourceCanvas.height;
    const ctx = readback.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas readback context is not available");
    ctx.drawImage(image, 0, 0);

    const data = ctx.getImageData(0, 0, readback.width, readback.height).data;
    let inkPixels = 0;
    let minX = readback.width;
    let minY = readback.height;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const a = data[i + 3]!;
      const isInk = a > 0 && (r < 230 || g < 230 || b < 230);
      if (!isInk) continue;
      const pixelIndex = i / 4;
      const x = pixelIndex % readback.width;
      const y = Math.floor(pixelIndex / readback.width);
      inkPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const thumbCtx = thumbCanvas.getContext("2d", { willReadFrequently: true });
    if (!thumbCtx) throw new Error("Thumbnail readback context is not available");
    thumbCtx.drawImage(readback, 0, 0, size, size);
    const thumbData = thumbCtx.getImageData(0, 0, size, size).data;
    const thumbnail: number[] = [];
    for (let i = 0; i < thumbData.length; i += 4) {
      const r = thumbData[i]!;
      const g = thumbData[i + 1]!;
      const b = thumbData[i + 2]!;
      const a = thumbData[i + 3]!;
      const darkness = a <= 0 ? 0 : 1 - (r + g + b) / (255 * 3);
      thumbnail.push(Math.max(0, Math.min(1, darkness)));
    }

    return {
      width: readback.width,
      height: readback.height,
      inkPixels,
      inkBounds:
        inkPixels > 0
          ? {
              minX,
              minY,
              maxX,
              maxY,
              width: maxX - minX + 1,
              height: maxY - minY + 1,
            }
          : null,
      thumbnailSize: size,
      thumbnail,
    };
  }, thumbnailSize);
}

export function calculateThumbnailSimilarity(
  before: CanvasPreservationStats,
  after: CanvasPreservationStats,
): number {
  const length = Math.min(before.thumbnail.length, after.thumbnail.length);
  if (length === 0) return 0;

  let diff = 0;
  let mass = 0;
  for (let index = 0; index < length; index += 1) {
    const a = before.thumbnail[index] ?? 0;
    const b = after.thumbnail[index] ?? 0;
    diff += Math.abs(a - b);
    mass += Math.max(a, b, 0.08);
  }
  return clamp01(1 - diff / Math.max(1e-6, mass));
}

export function expectCanvasSourcePreserved(
  before: CanvasPreservationStats,
  after: CanvasPreservationStats,
  thresholds: CanvasPreservationThresholds = {},
): void {
  const resolved = { ...DEFAULT_THRESHOLDS, ...thresholds };
  expect(after.inkPixels).toBeGreaterThan(0);
  expect(before.inkBounds).not.toBeNull();
  expect(after.inkBounds).not.toBeNull();

  const beforeInkDensity = before.inkPixels / (before.width * before.height);
  const afterInkDensity = after.inkPixels / (after.width * after.height);
  expect(afterInkDensity).toBeGreaterThanOrEqual(
    beforeInkDensity * resolved.minInkDensityRatio,
  );

  const beforeBounds = before.inkBounds!;
  const afterBounds = after.inkBounds!;
  expect(afterBounds.width).toBeGreaterThanOrEqual(
    beforeBounds.width * resolved.minBoundsRatio,
  );
  expect(afterBounds.height).toBeGreaterThanOrEqual(
    beforeBounds.height * resolved.minBoundsRatio,
  );

  const beforeCenter = boundsCenter(beforeBounds);
  const afterCenter = boundsCenter(afterBounds);
  expect(Math.abs(afterCenter.x / after.width - beforeCenter.x / before.width))
    .toBeLessThanOrEqual(resolved.maxCenterShiftRatio);
  expect(Math.abs(afterCenter.y / after.height - beforeCenter.y / before.height))
    .toBeLessThanOrEqual(resolved.maxCenterShiftRatio);

  expect(afterBounds.width / after.width).toBeLessThanOrEqual(
    (beforeBounds.width / before.width) * resolved.maxBoundsGrowthRatio,
  );
  expect(afterBounds.height / after.height).toBeLessThanOrEqual(
    (beforeBounds.height / before.height) * resolved.maxBoundsGrowthRatio,
  );

  expect(calculateThumbnailSimilarity(before, after)).toBeGreaterThanOrEqual(
    resolved.minThumbnailSimilarity,
  );
}
