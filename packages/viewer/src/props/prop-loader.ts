import {
  MAX_PROP_ANIMATION_FRAMES,
  MAX_PROP_BYTES,
  MAX_PROP_DIMENSION,
  SUPPORTED_PROP_MIME_TYPES,
  type ViviProp,
  type SupportedPropMimeType,
} from "./prop-types";

const SUPPORTED_PROP_MIME_TYPE_SET: ReadonlySet<string> = new Set(
  SUPPORTED_PROP_MIME_TYPES,
);

let propIdCounter = 0;

function guessKind(mimeType: string): ViviProp["kind"] {
  return mimeType === "image/gif" ? "animatedImage" : "image";
}

function makePropId(name: string): string {
  const safeName = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const randomId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${(propIdCounter += 1).toString(36)}`;
  return `prop-${safeName || "image"}-${randomId}`;
}

export function assertSupportedPropFile(file: File): void {
  if (!SUPPORTED_PROP_MIME_TYPE_SET.has(file.type as never)) {
    throw new Error("Unsupported prop image type");
  }
  if (file.size > MAX_PROP_BYTES) {
    throw new Error("Prop image exceeds byte limit");
  }
}

export function assertPropImageDimensions(width: number, height: number): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_PROP_DIMENSION ||
    height > MAX_PROP_DIMENSION
  ) {
    throw new Error("Prop image dimensions exceed limit");
  }
}

function countGifGraphicControlExtensions(bytes: Uint8Array): number {
  let frames = 0;
  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) frames += 1;
    if (frames > MAX_PROP_ANIMATION_FRAMES) return frames;
  }
  return frames;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (!isPng) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

function readGifDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 10) return null;
  const isGif =
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38;
  if (!isGif) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
  };
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const b = (index: number) => bytes[index] ?? 0;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (b(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b(offset + 1);
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (b(offset + 2) << 8) | b(offset + 3);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return {
        height: (b(offset + 5) << 8) | b(offset + 6),
        width: (b(offset + 7) << 8) | b(offset + 8),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const b = (index: number) => bytes[index] ?? 0;
  const header = String.fromCharCode(...bytes.slice(0, 4));
  const format = String.fromCharCode(...bytes.slice(8, 12));
  if (header !== "RIFF" || format !== "WEBP") return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + b(24) + (b(25) << 8) + (b(26) << 16),
      height: 1 + b(27) + (b(28) << 8) + (b(29) << 16),
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = b(21) | (b(22) << 8) | (b(23) << 16) | (b(24) << 24);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      width: b(26) | (b(27) << 8),
      height: b(28) | (b(29) << 8),
    };
  }
  return null;
}

export function readPropImageDimensions(
  bytes: Uint8Array,
  mimeType: string,
): { width: number; height: number } | null {
  switch (mimeType) {
    case "image/png":
      return readPngDimensions(bytes);
    case "image/gif":
      return readGifDimensions(bytes);
    case "image/jpeg":
      return readJpegDimensions(bytes);
    case "image/webp":
      return readWebpDimensions(bytes);
    default:
      return null;
  }
}

function assertPropAnimationBytes(file: File, bytes: Uint8Array): void {
  if (file.type !== "image/gif") return;
  const frames = countGifGraphicControlExtensions(bytes);
  if (frames > MAX_PROP_ANIMATION_FRAMES) {
    throw new Error("Prop animation frame count exceeds limit");
  }
}

export async function assertPropAnimationLimits(file: File): Promise<void> {
  if (file.type !== "image/gif") return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertPropAnimationBytes(file, bytes);
}

export async function createPropFromFile(file: File): Promise<ViviProp> {
  assertSupportedPropFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertPropAnimationBytes(file, bytes);
  const headerDimensions = readPropImageDimensions(bytes, file.type);
  if (headerDimensions) {
    assertPropImageDimensions(headerDimensions.width, headerDimensions.height);
  }
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      assertPropImageDimensions(bitmap.width, bitmap.height);
    } finally {
      bitmap.close?.();
    }
  } else if (!headerDimensions) {
    throw new Error("Prop image dimensions could not be inspected");
  }
  const objectUrl = URL.createObjectURL(file);
  return {
    id: makePropId(file.name),
    name: file.name.replace(/\.[^.]+$/, "") || "Prop",
    kind: guessKind(file.type),
    visible: true,
    drawOrder: 100,
    opacity: 1,
    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
    anchor: {
      target: { kind: "screen" },
      offsetX: 0,
      offsetY: 0,
      rotationWeight: 0,
      scaleWeight: 0,
    },
    source: {
      kind: "objectUrl",
      url: objectUrl,
      mimeType: file.type as SupportedPropMimeType,
      bytes: file.size,
      portable: false,
    },
  };
}
