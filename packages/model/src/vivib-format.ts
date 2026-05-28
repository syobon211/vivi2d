import { decode, encode } from "@msgpack/msgpack";
import { ViviFileDataSchema } from "./project-schema";
import {
  assertPublicRawViviFileProfile,
  assertPublicViviFileProfile,
  PUBLIC_PROJECT_PROFILE,
} from "./public-profile";
import type { AtlasData, ViviFileData } from "./types";

const MAGIC = new Uint8Array([0x56, 0x49, 0x56, 0x42]); // "VIVB"
const FORMAT_VERSION = 1;
const HEADER_LENGTH = 4 + 1 + 4; // magic(4) + version(1) + metadataLength(4) = 9

const MAX_DECODE_SIZE = 512 * 1024 * 1024;

interface ViviBinaryMeta {
  version: number;
  profile?: ViviFileData["profile"];
  project: ViviFileData["project"];
  atlases: Array<{
    width: number;
    height: number;
    entries: AtlasData["entries"];
  }>;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]! |
      (buf[offset + 1]! << 8) |
      (buf[offset + 2]! << 16) |
      (buf[offset + 3]! << 24)) >>>
    0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeForBinaryMetadata(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : normalizeForBinaryMetadata(item),
    );
  }
  if (!isRecord(value)) return value;

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    normalized[key] = normalizeForBinaryMetadata(child);
  }
  return normalized;
}

function assertViviBinaryMeta(value: unknown): asserts value is ViviBinaryMeta {
  if (!isRecord(value)) {
    throw new Error(".vivb file metadata is invalid: root value is not an object");
  }
  if (
    value.version !== 1 &&
    value.version !== 2 &&
    value.version !== 3 &&
    value.version !== 4 &&
    value.version !== 5 &&
    value.version !== 6 &&
    value.version !== 7 &&
    value.version !== 8 &&
    value.version !== 9 &&
    value.version !== 10
  ) {
    throw new Error(".vivb file metadata is invalid: unsupported project version");
  }
  if (value.profile !== undefined && value.profile !== PUBLIC_PROJECT_PROFILE) {
    throw new Error(".vivb file metadata is invalid: unsupported project profile");
  }
  if (!isRecord(value.project)) {
    throw new Error(".vivb file metadata is invalid: project is not an object");
  }
  if (!Array.isArray(value.atlases)) {
    throw new Error(".vivb file metadata is invalid: atlases is not an array");
  }
  for (const [index, atlas] of value.atlases.entries()) {
    if (!isRecord(atlas)) {
      throw new Error(
        `.vivb file metadata is invalid: atlases[${index}] is not an object`,
      );
    }
    if (!Number.isFinite(atlas.width) || !Number.isFinite(atlas.height)) {
      throw new Error(
        `.vivb file metadata is invalid: atlases[${index}] width/height is invalid`,
      );
    }
    if (!Array.isArray(atlas.entries)) {
      throw new Error(
        `.vivb file metadata is invalid: atlases[${index}].entries is not an array`,
      );
    }
  }
}

export function encodeViviBinary(fileData: ViviFileData): Uint8Array {
  const meta: ViviBinaryMeta = {
    version: fileData.version,
    project: fileData.project,
    atlases: fileData.atlases.map((a) => ({
      width: a.width,
      height: a.height,
      entries: a.entries,
    })),
  };
  if (fileData.profile !== undefined) {
    meta.profile = fileData.profile;
  }

  const metaBytes = encode(normalizeForBinaryMetadata(meta));

  const pngChunks: Uint8Array[] = [];
  let totalPngSize = 0;
  for (const atlas of fileData.atlases) {
    const pngBytes = base64ToBytes(atlas.image);
    pngChunks.push(pngBytes);
    totalPngSize += 4 + pngBytes.length;
  }

  const totalSize = HEADER_LENGTH + metaBytes.length + totalPngSize;
  const result = new Uint8Array(totalSize);

  result.set(MAGIC, 0);
  result[4] = FORMAT_VERSION;
  writeUint32LE(result, 5, metaBytes.length);

  result.set(metaBytes, HEADER_LENGTH);

  let offset = HEADER_LENGTH + metaBytes.length;
  for (const pngBytes of pngChunks) {
    writeUint32LE(result, offset, pngBytes.length);
    offset += 4;
    result.set(pngBytes, offset);
    offset += pngBytes.length;
  }

  return result;
}

export function decodeViviBinary(data: ArrayBuffer): ViviFileData {
  const bytes = new Uint8Array(data);

  if (bytes.length < HEADER_LENGTH) {
    throw new Error(".vivb file is too small");
  }

  if (bytes.length > MAX_DECODE_SIZE) {
    throw new Error(
      `.vivb file is too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB, max ${MAX_DECODE_SIZE / 1024 / 1024}MB)`,
    );
  }

  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error("Invalid .vivb file");
    }
  }

  const version = bytes[4];
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported .vivb version: ${version}`);
  }

  const metaLength = readUint32LE(bytes, 5);
  const metaEnd = HEADER_LENGTH + metaLength;

  if (metaEnd > bytes.length) {
    throw new Error(".vivb file is corrupted: metadata length exceeds file size");
  }

  const metaBytes = bytes.subarray(HEADER_LENGTH, metaEnd);
  const meta = decode(metaBytes);
  assertViviBinaryMeta(meta);

  const atlases: AtlasData[] = [];
  let offset = metaEnd;

  for (const atlasMeta of meta.atlases) {
    if (offset + 4 > bytes.length) {
      throw new Error(".vivb file is corrupted: PNG chunk is missing");
    }

    const pngLength = readUint32LE(bytes, offset);
    offset += 4;

    if (offset + pngLength > bytes.length) {
      throw new Error(".vivb file is corrupted: PNG data is truncated");
    }

    const pngBytes = bytes.subarray(offset, offset + pngLength);
    offset += pngLength;

    atlases.push({
      image: bytesToBase64(pngBytes),
      width: atlasMeta.width,
      height: atlasMeta.height,
      entries: atlasMeta.entries,
    });
  }

  const fileData: ViviFileData = {
    version: meta.version as ViviFileData["version"],
    project: meta.project,
    atlases,
  };
  if (meta.profile !== undefined) {
    fileData.profile = meta.profile;
  }

  if (fileData.profile === PUBLIC_PROJECT_PROFILE) {
    assertPublicRawViviFileProfile(fileData);
  }

  const result = ViviFileDataSchema.safeParse(fileData);
  if (!result.success) {
    throw new Error(".vivb file metadata is invalid: schema validation failed");
  }
  if (result.data.profile === PUBLIC_PROJECT_PROFILE) {
    assertPublicViviFileProfile(result.data as ViviFileData);
  }
  return result.data as ViviFileData;
}

export function isViviBinaryFormat(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data);
  if (bytes.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) return false;
  }
  return true;
}
