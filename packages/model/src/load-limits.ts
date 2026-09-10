import type { AtlasData } from "./types";

export const MAX_VIVI_TEXT_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_VIVID_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_VIVIB_FILE_BYTES = 512 * 1024 * 1024;
export const MAX_PSD_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_PSD_PIXELS = 64 * 1024 * 1024;
export const MAX_PSD_LAYER_PIXELS = 64 * 1024 * 1024;
export const MAX_PSD_TOTAL_LAYER_PIXELS = 256 * 1024 * 1024;
export const MAX_PSD_LAYER_COUNT = 5000;

/** Preflight live image allocations without narrowing the serialized file schema. */
export function assertAtlasImageAllocationWithinLimits(atlases: readonly AtlasData[]): void {
  let totalPixels = 0;
  const account = (width: number, height: number, label: string, allowEmpty = false) => {
    if (
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < (allowEmpty ? 0 : 1) || height < (allowEmpty ? 0 : 1) ||
      width > MAX_PSD_PIXELS || height > MAX_PSD_PIXELS ||
      width * height > MAX_PSD_PIXELS
    ) {
      throw new Error(`${label} exceeds the image allocation limit or has invalid dimensions.`);
    }
    totalPixels += width * height;
    if (totalPixels > MAX_PSD_TOTAL_LAYER_PIXELS) {
      throw new Error("Atlas images exceed the total image allocation limit.");
    }
  };
  for (const atlas of atlases) {
    account(atlas.width, atlas.height, "Atlas canvas");
    // Inspect IHDR before assigning Image.src: declared canvas dimensions do
    // not bound the browser's allocation for the actual encoded PNG.
    const actual = readAtlasPngDimensions(atlas.image);
    account(actual.width, actual.height, "Atlas PNG");
    for (const entry of atlas.entries) {
      account(entry.width, entry.height, "Atlas entry canvas", true);
    }
  }
}

function readAtlasPngDimensions(base64: string): { width: number; height: number } {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const header = new Uint8Array(24);
  let written = 0;
  let bits = 0;
  let buffer = 0;
  for (let index = 0; index < base64.length && written < header.length; index++) {
    const char = base64[index]!;
    if (char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f") continue;
    const value = alphabet.indexOf(char);
    if (value < 0) break;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      header[written++] = (buffer >> bits) & 0xff;
    }
  }
  const prefix = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (written !== header.length || prefix.some((value, index) => header[index] !== value)) {
    throw new Error("Atlas image must contain a PNG IHDR header.");
  }
  const view = new DataView(header.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function formatMegabytes(byteLength: number): string {
  return `${(byteLength / 1024 / 1024).toFixed(1)}MB`;
}

export function assertByteLengthWithinLimit(
  byteLength: number,
  maxByteLength: number,
  label: string,
): void {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error(`${label} has an invalid size.`);
  }
  if (byteLength > maxByteLength) {
    throw new Error(
      `${label} is too large (${formatMegabytes(byteLength)}, max ${formatMegabytes(maxByteLength)}).`,
    );
  }
}

export function assertTextLengthWithinLimit(
  text: string,
  maxByteLength: number,
  label: string,
): void {
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > maxByteLength) {
    throw new Error(
      `${label} is too large (${formatMegabytes(byteLength)}, max ${formatMegabytes(maxByteLength)}).`,
    );
  }
}
