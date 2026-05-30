import { requireDefined } from "@vivi2d/core/type-guards";
import { writePsd } from "ag-psd";
import type { PositionedSeethroughLayer, SeethroughLayer } from "./types";

const SEETHROUGH_CATEGORY_MAP: Record<string, string> = {
  face: "face",
  iris_left: "eyeLeft",
  iris_right: "eyeRight",
  eye_white_left: "eyeLeft",
  eye_white_right: "eyeRight",
  eyelash_left: "eyeLeft",
  eyelash_right: "eyeRight",
  eyebrow_left: "eyebrowLeft",
  eyebrow_right: "eyebrowRight",
  eyewear: "accessory",
  nose: "nose",
  mouth: "mouth",
  ear_left: "ear",
  ear_right: "ear",
  ear_accessory_left: "accessory",
  ear_accessory_right: "accessory",

  hair_front: "hairFront",
  hair_back: "hairBack",

  neck: "body",
  torso_wear: "body",
  hand_accessory_left: "handLeft",
  hand_accessory_right: "handRight",
  leg_wear: "body",
  foot_wear: "body",

  headwear: "accessory",
  tail: "tail",
  wings: "accessory",
};

export function mapSeethroughCategory(seethroughName: string): string {
  return SEETHROUGH_CATEGORY_MAP[seethroughName] ?? "unknown";
}

export function toLayerName(seethroughName: string): string {
  return `st:${seethroughName}`;
}

export function toCompatPsdLayerName(
  psdLeafToken: string,
  seethroughName: string,
): string {
  return `v2d[${psdLeafToken}] ${seethroughName}`;
}

async function decodeRgbaImage(
  pngBuffer: ArrayBuffer,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  if (typeof createImageBitmap !== "undefined") {
    const blob = new Blob([pngBuffer], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = requireDefined(
      canvas.getContext("2d"),
      "Failed to get an OffscreenCanvas 2D context",
    );
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  }

  if (typeof Image === "undefined" || typeof document === "undefined") {
    return decodePngRgbaInNode(pngBuffer);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = requireDefined(
        canvas.getContext("2d"),
        "Failed to get an HTMLCanvas 2D context",
      );
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      resolve({ width: imageData.width, height: imageData.height, data: imageData.data });
    };
    img.onerror = () => reject(new Error("Failed to decode image"));
    const blob = new Blob([pngBuffer], { type: "image/png" });
    img.src = URL.createObjectURL(blob);
  });
}

async function decodePngRgbaInNode(
  pngBuffer: ArrayBuffer,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const { inflateSync } = await import("node:zlib");
  const bytes = new Uint8Array(pngBuffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) {
    throw new Error("Unsupported image format: expected PNG");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compressionMethod = 0;
  let filterMethod = 0;
  let interlaceMethod = 0;
  const idatChunks: Uint8Array[] = [];
  let offset = signature.length;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    offset += 4;
    const type = String.fromCharCode(...bytes.slice(offset, offset + 4));
    offset += 4;
    const data = bytes.slice(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      compressionMethod = data[10] ?? 0;
      filterMethod = data[11] ?? 0;
      interlaceMethod = data[12] ?? 0;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8) {
    throw new Error("Unsupported PNG dimensions or bit depth");
  }
  if (compressionMethod !== 0 || filterMethod !== 0 || interlaceMethod !== 0) {
    throw new Error("Unsupported PNG encoding");
  }

  const channels = pngChannelCount(colorType);
  const scanlineBytes = width * channels;
  const inflated = inflateSync(concatUint8Arrays(idatChunks));
  const expectedInflatedBytes = height * (scanlineBytes + 1);
  if (inflated.byteLength !== expectedInflatedBytes) {
    throw new Error("Unexpected PNG scanline length");
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  const previous = new Uint8Array(scanlineBytes);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? -1;
    sourceOffset += 1;
    const scanline = Uint8Array.from(
      inflated.subarray(sourceOffset, sourceOffset + scanlineBytes),
    );
    sourceOffset += scanlineBytes;
    unfilterPngScanline(scanline, previous, filter, channels);
    writePngScanlineAsRgba(scanline, rgba, y * width * 4, colorType);
    previous.set(scanline);
  }

  return { width, height, data: rgba };
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function pngChannelCount(colorType: number): number {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type: ${colorType}`);
}

function unfilterPngScanline(
  scanline: Uint8Array,
  previous: Uint8Array,
  filter: number,
  bytesPerPixel: number,
): void {
  for (let index = 0; index < scanline.length; index += 1) {
    const left = index >= bytesPerPixel ? (scanline[index - bytesPerPixel] ?? 0) : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? (previous[index - bytesPerPixel] ?? 0) : 0;
    const value = scanline[index] ?? 0;
    if (filter === 1) scanline[index] = (value + left) & 0xff;
    else if (filter === 2) scanline[index] = (value + up) & 0xff;
    else if (filter === 3) scanline[index] = (value + ((left + up) >> 1)) & 0xff;
    else if (filter === 4) {
      scanline[index] = (value + paethPredictor(left, up, upLeft)) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`);
    }
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function writePngScanlineAsRgba(
  scanline: Uint8Array,
  rgba: Uint8ClampedArray,
  rgbaOffset: number,
  colorType: number,
): void {
  let sourceOffset = 0;
  let targetOffset = rgbaOffset;
  while (sourceOffset < scanline.length) {
    if (colorType === 0) {
      const gray = scanline[sourceOffset] ?? 0;
      rgba[targetOffset++] = gray;
      rgba[targetOffset++] = gray;
      rgba[targetOffset++] = gray;
      rgba[targetOffset++] = 255;
      sourceOffset += 1;
    } else if (colorType === 2) {
      rgba[targetOffset++] = scanline[sourceOffset++] ?? 0;
      rgba[targetOffset++] = scanline[sourceOffset++] ?? 0;
      rgba[targetOffset++] = scanline[sourceOffset++] ?? 0;
      rgba[targetOffset++] = 255;
    } else if (colorType === 4) {
      const gray = scanline[sourceOffset++] ?? 0;
      rgba[targetOffset++] = gray;
      rgba[targetOffset++] = gray;
      rgba[targetOffset++] = gray;
      rgba[targetOffset++] = scanline[sourceOffset++] ?? 255;
    } else {
      rgba[targetOffset++] = scanline[sourceOffset++] ?? 0;
      rgba[targetOffset++] = scanline[sourceOffset++] ?? 0;
      rgba[targetOffset++] = scanline[sourceOffset++] ?? 0;
      rgba[targetOffset++] = scanline[sourceOffset++] ?? 255;
    }
  }
}

export async function assemblePsd(
  layers: SeethroughLayer[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<ArrayBuffer> {
  const sorted = [...layers].sort((a, b) => a.order - b.order);

  const positionedLayers: PositionedSeethroughLayer[] = sorted.map((layer) => ({
    ...layer,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  }));

  return assemblePositionedPsd(positionedLayers, canvasWidth, canvasHeight);
}

export async function assemblePositionedPsd(
  layers: PositionedSeethroughLayer[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<ArrayBuffer> {
  const sorted = [...layers].sort((a, b) => a.order - b.order);
  const psdLayers = [];

  for (const layer of sorted) {
    const decoded = await decodeRgbaImage(layer.imageData);
    const left = layer.left;
    const top = layer.top;
    const right = layer.right > left ? layer.right : left + decoded.width;
    const bottom = layer.bottom > top ? layer.bottom : top + decoded.height;

    psdLayers.push({
      name:
        layer.psdLeafToken && layer.psdLeafToken.length > 0
          ? toCompatPsdLayerName(layer.psdLeafToken, layer.name)
          : toLayerName(layer.name),
      left,
      top,
      right,
      bottom,
      imageData: {
        width: decoded.width,
        height: decoded.height,
        data: decoded.data,
      } as ImageData,
      opacity: 1,
      blendMode: "normal" as const,
    });
  }

  const psd = {
    width: canvasWidth,
    height: canvasHeight,
    children: psdLayers,
  };

  return writePsd(psd);
}
