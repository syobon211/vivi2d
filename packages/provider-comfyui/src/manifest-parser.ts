import { validateVivi2dManifestV1 } from "./internal/generated/vivi2d-manifest-v1-validator.mjs";
import {
  VIVI2D_COMPAT_PLUGIN_VERSION,
  type ViviSeeThroughManifest,
  type ViviSeeThroughManifestLayer,
} from "./vivi2d-compat";

export const MAX_VIVI2D_MANIFEST_BYTES = 2 * 1024 * 1024;
export const MAX_VIVI2D_MANIFEST_LAYERS = 127;
// One 4096x4096 RGBA scanline set is 64 MiB plus 4096 filter bytes before
// zlib/PNG framing, so keep enough headroom for a valid incompressible layer.
export const MAX_VIVI2D_LAYER_IMAGE_BYTES = 65 * 1024 * 1024;
export const MAX_VIVI2D_TOTAL_LAYER_IMAGE_BYTES = 198 * 1024 * 1024;
export const MAX_VIVI2D_LAYER_PIXELS = 4096 * 4096;
export const MAX_VIVI2D_TOTAL_LAYER_PIXELS = 64 * 1024 * 1024;

const MAX_IMAGE_SIDE = 8192;
const MAX_CANVAS_PIXELS = 4096 * 4096;
const MAX_IDENTIFIER_UTF8_BYTES = 256;
const MAX_DISPLAY_TEXT_UTF8_BYTES = 1024;
const MAX_IMAGE_PATH_UTF8_BYTES = 4096;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export class ViviSeeThroughManifestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ViviSeeThroughManifestError";
  }
}

export interface ViviSeeThroughLayerResourceBudget {
  encodedBytes: number;
  decodedPixels: number;
}

export function validateViviSeeThroughLayerPng(
  bytes: ArrayBuffer,
  layer: Pick<ViviSeeThroughManifestLayer, "bbox">,
  budget: Readonly<ViviSeeThroughLayerResourceBudget> = {
    encodedBytes: 0,
    decodedPixels: 0,
  },
): ViviSeeThroughLayerResourceBudget {
  if (bytes.byteLength > MAX_VIVI2D_LAYER_IMAGE_BYTES) {
    throw new ViviSeeThroughManifestError(
      "Vivi2D manifest layer image exceeds the maximum encoded size.",
    );
  }
  const encodedBytes = budget.encodedBytes + bytes.byteLength;
  if (
    !Number.isSafeInteger(budget.encodedBytes) ||
    budget.encodedBytes < 0 ||
    encodedBytes > MAX_VIVI2D_TOTAL_LAYER_IMAGE_BYTES
  ) {
    throw new ViviSeeThroughManifestError(
      "Vivi2D manifest layer images exceed the maximum total encoded size.",
    );
  }

  const { width, height } = readPngDimensions(bytes);
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    throw new ViviSeeThroughManifestError(
      "Vivi2D manifest layer image exceeds the maximum supported side.",
    );
  }
  const pixels = width * height;
  if (pixels > MAX_VIVI2D_LAYER_PIXELS) {
    throw new ViviSeeThroughManifestError(
      "Vivi2D manifest layer image exceeds the maximum supported area.",
    );
  }

  const [left, top, right, bottom] = layer.bbox;
  if (width !== right - left || height !== bottom - top) {
    throw new ViviSeeThroughManifestError(
      "Vivi2D manifest layer image dimensions do not match its bbox.",
    );
  }

  const decodedPixels = budget.decodedPixels + pixels;
  if (
    !Number.isSafeInteger(budget.decodedPixels) ||
    budget.decodedPixels < 0 ||
    decodedPixels > MAX_VIVI2D_TOTAL_LAYER_PIXELS
  ) {
    throw new ViviSeeThroughManifestError(
      "Vivi2D manifest layer images exceed the maximum total decoded area.",
    );
  }

  return { encodedBytes, decodedPixels };
}

export function parseViviSeeThroughManifest(bytes: ArrayBuffer): ViviSeeThroughManifest {
  try {
    return parseViviSeeThroughManifestUnsafe(bytes);
  } catch (error) {
    if (error instanceof ViviSeeThroughManifestError) throw error;
    throw new ViviSeeThroughManifestError(
      error instanceof Error ? error.message : "Vivi2D manifest is invalid.",
      { cause: error },
    );
  }
}

function parseViviSeeThroughManifestUnsafe(bytes: ArrayBuffer): ViviSeeThroughManifest {
  if (bytes.byteLength > MAX_VIVI2D_MANIFEST_BYTES) {
    throw new Error("Vivi2D manifest exceeds the maximum supported size.");
  }

  let text: string;
  try {
    text = utf8Decoder.decode(new Uint8Array(bytes));
  } catch (error) {
    throw new Error("Vivi2D manifest is not valid UTF-8.", { cause: error });
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error("Vivi2D manifest is not valid JSON.", { cause: error });
  }

  // Bound schema-validation work before walking every layer in an untrusted
  // document. Shape validation below remains authoritative for the field.
  if (
    isRecord(value) &&
    Array.isArray(value.layers) &&
    value.layers.length > MAX_VIVI2D_MANIFEST_LAYERS
  ) {
    throw new Error("Vivi2D manifest contains too many layers.");
  }

  if (!validateVivi2dManifestV1(value)) {
    throw new Error("Vivi2D manifest does not match the expected schema.");
  }

  const manifest = value as ViviSeeThroughManifest;
  assertManifestSemantics(manifest);
  return manifest;
}

function assertManifestSemantics(manifest: ViviSeeThroughManifest): void {
  const { width, height } = manifest.canvas;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new Error("Vivi2D manifest canvas dimensions must be safe integers.");
  }
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    throw new Error("Vivi2D manifest canvas exceeds the maximum supported side.");
  }
  if (width * height > MAX_CANVAS_PIXELS) {
    throw new Error("Vivi2D manifest canvas exceeds the maximum supported area.");
  }

  assertBoundedString(
    manifest.generator.plugin_version,
    "generator.plugin_version",
    MAX_IDENTIFIER_UTF8_BYTES,
  );
  if (manifest.generator.plugin_version !== VIVI2D_COMPAT_PLUGIN_VERSION) {
    throw new Error("Vivi2D manifest generator version is unsupported.");
  }
  assertBoundedString(
    manifest.generator.model,
    "generator.model",
    MAX_IDENTIFIER_UTF8_BYTES,
  );
  assertBoundedString(
    manifest.generator.model_version,
    "generator.model_version",
    MAX_IDENTIFIER_UTF8_BYTES,
  );

  const ids = new Set<string>();
  const leafTokens = new Set<string>();
  let totalLayerPixels = 0;

  for (const [index, layer] of manifest.layers.entries()) {
    const path = `layers[${index}]`;
    assertBoundedString(layer.id, `${path}.id`, MAX_IDENTIFIER_UTF8_BYTES);
    assertBoundedString(layer.name, `${path}.name`, MAX_DISPLAY_TEXT_UTF8_BYTES);
    assertBoundedString(layer.label, `${path}.label`, MAX_DISPLAY_TEXT_UTF8_BYTES);
    assertBoundedString(
      layer.psd_leaf_token,
      `${path}.psd_leaf_token`,
      MAX_IDENTIFIER_UTF8_BYTES,
    );
    assertBoundedString(
      layer.image_path,
      `${path}.image_path`,
      MAX_IMAGE_PATH_UTF8_BYTES,
    );

    if (ids.has(layer.id)) {
      throw new Error(`Vivi2D manifest contains a duplicate layer id at ${path}.id.`);
    }
    ids.add(layer.id);
    if (leafTokens.has(layer.psd_leaf_token)) {
      throw new Error(
        `Vivi2D manifest contains a duplicate PSD leaf token at ${path}.psd_leaf_token.`,
      );
    }
    leafTokens.add(layer.psd_leaf_token);

    if (!Number.isSafeInteger(layer.order)) {
      throw new Error(`Vivi2D manifest ${path}.order must be a safe integer.`);
    }
    assertRelativeImagePath(layer.image_path, `${path}.image_path`);

    const [left, top, right, bottom] = layer.bbox;
    if (![left, top, right, bottom].every(Number.isSafeInteger)) {
      throw new Error(`Vivi2D manifest ${path}.bbox must contain safe integers.`);
    }
    if (
      left < 0 ||
      top < 0 ||
      right <= left ||
      bottom <= top ||
      right > width ||
      bottom > height
    ) {
      throw new Error(`Vivi2D manifest ${path}.bbox is outside the canvas.`);
    }
    totalLayerPixels += (right - left) * (bottom - top);
    if (totalLayerPixels > MAX_VIVI2D_TOTAL_LAYER_PIXELS) {
      throw new Error("Vivi2D manifest layers exceed the maximum total area.");
    }

    const { min, mean, max } = layer.depth_stats;
    if (![min, mean, max].every(Number.isFinite)) {
      throw new Error(`Vivi2D manifest ${path}.depth_stats must be finite.`);
    }
    if (!(min <= mean && mean <= max)) {
      throw new Error(`Vivi2D manifest ${path}.depth_stats is inconsistent.`);
    }
  }
}

function readPngDimensions(bytes: ArrayBuffer): { width: number; height: number } {
  const view = new Uint8Array(bytes);
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    view.byteLength < 33 ||
    pngSignature.some((value, index) => view[index] !== value) ||
    view[8] !== 0 ||
    view[9] !== 0 ||
    view[10] !== 0 ||
    view[11] !== 13 ||
    view[12] !== 0x49 ||
    view[13] !== 0x48 ||
    view[14] !== 0x44 ||
    view[15] !== 0x52
  ) {
    throw new ViviSeeThroughManifestError(
      "Vivi2D manifest layer image is not a valid PNG with an IHDR header.",
    );
  }

  const dataView = new DataView(bytes);
  const width = dataView.getUint32(16);
  const height = dataView.getUint32(20);
  if (width === 0 || height === 0) {
    throw new ViviSeeThroughManifestError(
      "Vivi2D manifest layer image has invalid dimensions.",
    );
  }
  return { width, height };
}

function assertBoundedString(value: string, path: string, maxBytes: number): void {
  if (value.trim().length === 0 || value.includes("\0")) {
    throw new Error(`Vivi2D manifest ${path} is invalid.`);
  }
  if (utf8Encoder.encode(value).byteLength > maxBytes) {
    throw new Error(`Vivi2D manifest ${path} exceeds the maximum supported length.`);
  }
}

function assertRelativeImagePath(value: string, path: string): void {
  const normalized = value.replace(/\\/g, "/").trim();
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalized)
  ) {
    throw new Error(`Vivi2D manifest ${path} must be a relative path.`);
  }
  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Vivi2D manifest ${path} contains invalid traversal.`);
  }
  if (segments[0] === "output" || segments[0] === "temp") {
    throw new Error(`Vivi2D manifest ${path} uses a reserved output namespace.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
