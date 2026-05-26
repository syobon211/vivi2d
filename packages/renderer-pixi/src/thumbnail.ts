export interface ThumbnailOptions {
  width?: number;

  height?: number;

  format?: "png" | "jpeg" | "webp";

  quality?: number;
}

const DEFAULTS: Required<ThumbnailOptions> = {
  width: 256,
  height: 256,
  format: "png",
  quality: 0.85,
};

export function generateThumbnail(
  sourceCanvas: HTMLCanvasElement,
  options?: ThumbnailOptions,
): string {
  const opts = { ...DEFAULTS, ...options };

  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = opts.width;
  thumbCanvas.height = opts.height;

  const ctx = thumbCanvas.getContext("2d");
  if (!ctx) return "";

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const scale = Math.min(opts.width / srcW, opts.height / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offsetX = (opts.width - drawW) / 2;
  const offsetY = (opts.height - drawH) / 2;

  ctx.clearRect(0, 0, opts.width, opts.height);
  ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH);

  const mimeType = `image/${opts.format}`;
  return thumbCanvas.toDataURL(mimeType, opts.quality);
}

export function generateThumbnailBlob(
  sourceCanvas: HTMLCanvasElement,
  options?: ThumbnailOptions,
): Promise<Blob | null> {
  const opts = { ...DEFAULTS, ...options };

  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = opts.width;
  thumbCanvas.height = opts.height;

  const ctx = thumbCanvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const scale = Math.min(opts.width / srcW, opts.height / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offsetX = (opts.width - drawW) / 2;
  const offsetY = (opts.height - drawH) / 2;

  ctx.clearRect(0, 0, opts.width, opts.height);
  ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH);

  const mimeType = `image/${opts.format}`;
  return new Promise((resolve) => {
    thumbCanvas.toBlob((blob) => resolve(blob), mimeType, opts.quality);
  });
}

export function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

export function base64ToDataUrl(
  base64: string,
  format: "png" | "jpeg" | "webp" = "png",
): string {
  return `data:image/${format};base64,${base64}`;
}
