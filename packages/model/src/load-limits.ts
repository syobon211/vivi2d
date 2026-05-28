export const MAX_VIVI_TEXT_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_VIVID_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_VIVIB_FILE_BYTES = 512 * 1024 * 1024;
export const MAX_PSD_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_PSD_PIXELS = 64 * 1024 * 1024;
export const MAX_PSD_LAYER_PIXELS = 64 * 1024 * 1024;
export const MAX_PSD_TOTAL_LAYER_PIXELS = 256 * 1024 * 1024;
export const MAX_PSD_LAYER_COUNT = 5000;

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
