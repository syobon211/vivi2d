import {
  assertByteLengthWithinLimit,
  MAX_PSD_FILE_BYTES,
  MAX_PSD_PIXELS,
} from "@vivi2d/core/load-limits";

export type TrimmedCanvasResult = {
  canvas: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
  trimmed: boolean;
};

function createCanvasContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available");
  }
  return ctx;
}

function validateImageDimensions(width: number, height: number, label: string): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`${label} has invalid dimensions.`);
  }
  const pixels = width * height;
  if (pixels > MAX_PSD_PIXELS) {
    throw new Error(
      `${label} is too large (${(pixels / 1024 / 1024).toFixed(1)}Mpx, max ${(MAX_PSD_PIXELS / 1024 / 1024).toFixed(1)}Mpx).`,
    );
  }
}

async function decodeImageBlobToCanvas(
  blob: Blob,
  label: string,
): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap !== "undefined") {
    const bitmap = await createImageBitmap(blob);
    try {
      validateImageDimensions(bitmap.width, bitmap.height, label);
      const ctx = createCanvasContext(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      return ctx.canvas;
    } finally {
      bitmap.close();
    }
  }

  return await new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      try {
        validateImageDimensions(image.width, image.height, label);
        const ctx = createCanvasContext(image.width, image.height);
        ctx.drawImage(image, 0, 0);
        resolve(ctx.canvas);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode ${label.toLowerCase()}.`));
    };
    image.src = objectUrl;
  });
}

export async function decodePngToCanvas(buffer: ArrayBuffer): Promise<HTMLCanvasElement> {
  assertByteLengthWithinLimit(buffer.byteLength, MAX_PSD_FILE_BYTES, "PNG file");
  const blob = new Blob([buffer], { type: "image/png" });
  return decodeImageBlobToCanvas(blob, "PNG image");
}

export function trimTransparentBounds(source: HTMLCanvasElement): TrimmedCanvasResult {
  const width = source.width;
  const height = source.height;
  validateImageDimensions(width, height, "PNG image");

  const ctx = source.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available");
  }

  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("PNG image contains no visible pixels.");
  }

  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
    return {
      canvas: source,
      offsetX: 0,
      offsetY: 0,
      originalWidth: width,
      originalHeight: height,
      trimmed: false,
    };
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmedCtx = createCanvasContext(trimmedWidth, trimmedHeight);
  trimmedCtx.drawImage(
    source,
    minX,
    minY,
    trimmedWidth,
    trimmedHeight,
    0,
    0,
    trimmedWidth,
    trimmedHeight,
  );

  return {
    canvas: trimmedCtx.canvas,
    offsetX: minX,
    offsetY: minY,
    originalWidth: width,
    originalHeight: height,
    trimmed: true,
  };
}
