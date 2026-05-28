import {
  assertByteLengthWithinLimit,
  MAX_PSD_FILE_BYTES,
  MAX_PSD_LAYER_COUNT,
  MAX_PSD_LAYER_PIXELS,
  MAX_PSD_PIXELS,
  MAX_PSD_TOTAL_LAYER_PIXELS,
} from "@vivi2d/core/load-limits";
import type { Layer, ReadOptions } from "ag-psd";

export const PSD_METADATA_READ_OPTIONS = {
  useImageData: false,
  skipLayerImageData: true,
  skipCompositeImageData: true,
  skipThumbnail: true,
  skipLinkedFilesData: true,
} as const satisfies ReadOptions;

function countPsdLayers(layers: Layer[] | undefined): number {
  if (!layers || layers.length === 0) return 0;
  let total = 0;
  for (const layer of layers) {
    total += 1;
    total += countPsdLayers(layer.children);
  }
  return total;
}

function layerPixelSize(layer: Layer): number {
  const canvasWidth = layer.canvas?.width;
  const canvasHeight = layer.canvas?.height;
  if (Number.isFinite(canvasWidth) && Number.isFinite(canvasHeight)) {
    return Math.max(0, canvasWidth ?? 0) * Math.max(0, canvasHeight ?? 0);
  }

  const width = (layer.right ?? 0) - (layer.left ?? 0);
  const height = (layer.bottom ?? 0) - (layer.top ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  return Math.max(0, width) * Math.max(0, height);
}

function validatePsdLayerPixels(layers: Layer[] | undefined, path = "layer"): number {
  if (!layers || layers.length === 0) return 0;

  let total = 0;
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]!;
    const layerPath = `${path}[${index}]`;
    const pixels = layerPixelSize(layer);
    if (pixels > MAX_PSD_LAYER_PIXELS) {
      throw new Error(
        `PSD ${layerPath} is too large (${(pixels / 1024 / 1024).toFixed(1)}Mpx, max ${(MAX_PSD_LAYER_PIXELS / 1024 / 1024).toFixed(1)}Mpx).`,
      );
    }
    total += pixels + validatePsdLayerPixels(layer.children, `${layerPath}.children`);
    if (total > MAX_PSD_TOTAL_LAYER_PIXELS) {
      throw new Error(
        `PSD layers are too large in total (${(total / 1024 / 1024).toFixed(1)}Mpx, max ${(MAX_PSD_TOTAL_LAYER_PIXELS / 1024 / 1024).toFixed(1)}Mpx).`,
      );
    }
  }
  return total;
}

export function assertPsdBufferWithinLimit(buffer: ArrayBuffer): void {
  assertByteLengthWithinLimit(buffer.byteLength, MAX_PSD_FILE_BYTES, "PSD file");
}

export function validateParsedPsdDocument(psd: {
  width?: number;
  height?: number;
  children?: Layer[];
}): void {
  const width = psd.width ?? 0;
  const height = psd.height ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("PSD document has invalid dimensions.");
  }

  const pixels = width * height;
  if (pixels > MAX_PSD_PIXELS) {
    throw new Error(
      `PSD document is too large (${(pixels / 1024 / 1024).toFixed(1)}Mpx, max ${(MAX_PSD_PIXELS / 1024 / 1024).toFixed(1)}Mpx).`,
    );
  }

  const layerCount = countPsdLayers(psd.children);
  if (layerCount > MAX_PSD_LAYER_COUNT) {
    throw new Error(
      `PSD document has too many layers (${layerCount}, max ${MAX_PSD_LAYER_COUNT}).`,
    );
  }

  validatePsdLayerPixels(psd.children);
}
