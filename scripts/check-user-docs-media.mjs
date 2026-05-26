import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const root = process.cwd();
const failures = [];
const locales = ["en", "ja", "zh-Hans", "ko-KR"];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SVG_BYTES = 512 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_IMAGE_DIMENSION_PX = 4096;

const IMAGE_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".webm", ".mp4"]);
const PNG_FORBIDDEN_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "iCCP", "tIME"]);
const JPEG_FORBIDDEN_MARKERS = new Map([
  [0xe1, "APP1 Exif/XMP metadata"],
  [0xe2, "APP2 ICC/MPF metadata"],
  [0xe3, "APP3 metadata"],
  [0xe4, "APP4 metadata"],
  [0xe5, "APP5 metadata"],
  [0xe6, "APP6 metadata"],
  [0xe7, "APP7 metadata"],
  [0xe8, "APP8 metadata"],
  [0xe9, "APP9 metadata"],
  [0xea, "APP10 metadata"],
  [0xeb, "APP11 metadata"],
  [0xec, "APP12 metadata"],
  [0xed, "APP13 Photoshop/IPTC metadata"],
  [0xee, "APP14 metadata"],
  [0xef, "APP15 metadata"],
  [0xfe, "JPEG comment metadata"],
]);
const WEBP_FORBIDDEN_CHUNKS = new Set(["EXIF", "XMP ", "ICCP"]);
const EBML_MASTER_IDS = new Set([
  "1A45DFA3",
  "18538067",
  "1549A966",
  "1654AE6B",
  "AE",
  "1043A770",
  "45B9",
  "B6",
  "80",
  "1941A469",
  "61A7",
  "1254C367",
  "7373",
  "67C8",
]);
const EBML_FORBIDDEN_METADATA_IDS = new Map([
  ["4D80", "MuxingApp"],
  ["5741", "WritingApp"],
  ["4461", "DateUTC"],
  ["1254C367", "Tags"],
  ["7BA9", "Title"],
  ["85", "ChapString"],
  ["437C", "ChapLanguage"],
  ["466E", "FileName"],
  ["467E", "FileDescription"],
  ["4660", "FileMimeType"],
  ["536E", "TrackName"],
  ["22B59C", "TrackLanguage"],
  ["4D54", "TrackDescription"],
]);
const VIDEO_METADATA_TOKENS = [
  "udta",
  "com.apple.quicktime",
  "encoder",
  "ENCODER",
  "Lavf",
  "WritingApp",
  "MuxingApp",
  "TITLE",
  "ARTIST",
  "DESCRIPTION",
  "DATEUTC",
];
const MP4_XMP_METADATA_TOKENS = [
  Buffer.from("BE7ACFCB97A942E89C71999491E3AFAC", "hex"),
  Buffer.from("http://ns.adobe.com/xap/1.0/", "utf8"),
];
const NEUTRAL_ENGLISH_UI_WORDS =
  /\b(?:Apply|Auto Setup|Cancel|Click|Close|Export|Import|Layer|Mask|Open|Review|Save|Select|Setup|Warning)\b/i;

function fail(message) {
  failures.push(message);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function listRepoFiles(prefix) {
  return runGit(["ls-files", "--cached", "--others", "--exclude-standard", prefix])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
}

function absolutePath(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolutePath(relativePath));
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(absolutePath(relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath}: invalid JSON (${error.message}).`);
    return null;
  }
}

function canonicalUserAssetPath(value) {
  if (typeof value !== "string") return null;
  if (value.includes("\\") || value.includes("\0")) return null;
  const normalized = path.posix.normalize(value);
  if (normalized !== value) return null;
  if (!normalized.startsWith("docs/user/assets/")) return null;
  if (normalized === "docs/user/assets/" || normalized.endsWith("/")) return null;
  return normalized;
}

function readBytes(relativePath) {
  try {
    return fs.readFileSync(absolutePath(relativePath));
  } catch (error) {
    fail(`${relativePath}: could not read media file (${error.message}).`);
    return null;
  }
}

function byteLimitForExtension(ext) {
  if (ext === ".svg") return MAX_SVG_BYTES;
  if (IMAGE_EXTENSIONS.has(ext)) return MAX_IMAGE_BYTES;
  if (VIDEO_EXTENSIONS.has(ext)) return MAX_VIDEO_BYTES;
  return null;
}

function checkedMediaFile(relativePath, ext) {
  const abs = absolutePath(relativePath);
  let stat;
  try {
    stat = fs.lstatSync(abs);
  } catch (error) {
    fail(`${relativePath}: could not inspect media file (${error.message}).`);
    return null;
  }
  if (stat.isSymbolicLink()) {
    fail(`${relativePath}: media asset must not be a symlink.`);
    return null;
  }
  if (!stat.isFile()) {
    fail(`${relativePath}: media asset must be a regular file.`);
    return null;
  }
  try {
    const real = fs.realpathSync(abs);
    const assetsRoot = fs.realpathSync(absolutePath("docs/user/assets"));
    const relativeReal = path.relative(assetsRoot, real);
    if (relativeReal.startsWith("..") || path.isAbsolute(relativeReal)) {
      fail(`${relativePath}: media asset real path escapes docs/user/assets.`);
      return null;
    }
  } catch (error) {
    fail(`${relativePath}: could not resolve media real path (${error.message}).`);
    return null;
  }
  const limit = byteLimitForExtension(ext);
  if (limit !== null && stat.size > limit) {
    fail(`${relativePath}: media file exceeds byte limit (${stat.size} > ${limit}).`);
    return null;
  }
  return { abs, stat };
}

function bytesContain(bytes, token) {
  return bytes.includes(Buffer.from(token, "utf8"));
}

function assertByteLimit(file, bytes, limit, label) {
  if (bytes.length > limit) {
    fail(`${file}: ${label} exceeds byte limit (${bytes.length} > ${limit}).`);
  }
}

function assertDimensions(file, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  if (width <= 0 || height <= 0) {
    fail(`${file}: image dimensions must be positive.`);
  }
  if (width > MAX_IMAGE_DIMENSION_PX || height > MAX_IMAGE_DIMENSION_PX) {
    fail(
      `${file}: image dimensions exceed ${MAX_IMAGE_DIMENSION_PX}px (${width}x${height}).`,
    );
  }
}

function parseSvgLength(file, attribute, value) {
  const trimmed = value.trim();
  const match = /^([0-9]+(?:\.[0-9]+)?)(px)?$/.exec(trimmed);
  if (!match) {
    fail(`${file}: SVG ${attribute} must be a unitless px value or explicit px value.`);
    return null;
  }
  return Number(match[1]);
}

function decodeSvgCharacterReferences(text) {
  return text
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, value) => {
      const codePoint =
        value[0].toLowerCase() === "x"
          ? Number.parseInt(value.slice(1), 16)
          : Number.parseInt(value, 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return match;
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    })
    .replace(/&colon;/gi, ":");
}

function normalizeSvgVisibleText(text) {
  return decodeSvgCharacterReferences(
    text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "),
  );
}

function validateSvg(file, bytes, variantName) {
  assertByteLimit(file, bytes, MAX_SVG_BYTES, "SVG");
  let text = "";
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail(`${file}: SVG must not contain a UTF-8 BOM.`);
  }
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${file}: SVG must be valid UTF-8.`);
    return;
  }
  if (!/<svg(?:\s|>|\/)/i.test(text.slice(0, 2048))) {
    fail(`${file}: SVG file must contain an <svg> root near the start.`);
  }
  const svgTextsToScan = [text];
  const decodedText = decodeSvgCharacterReferences(text);
  if (decodedText !== text) {
    svgTextsToScan.push(decodedText);
    const urlNormalizedText = decodedText.replace(/[\t\n\r]/g, "");
    if (urlNormalizedText !== decodedText) svgTextsToScan.push(urlNormalizedText);
  }
  const unsafeSvgPatterns = [
    /<script\b/i,
    /<style\b/i,
    /<foreignObject\b/i,
    /<metadata\b/i,
    /<!DOCTYPE\b/i,
    /<!ENTITY\b/i,
    /<\?xml-stylesheet\b/i,
    /\son[a-z]+\s*=/i,
    /\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|file:|data:|javascript:|\/\/)/i,
    /\b(?:style|filter|clip-path|mask|marker-start|marker-mid|marker-end|fill|stroke|cursor)\s*=\s*["'][^"']*url\s*\(/i,
    /\burl\s*\(\s*['"]?\s*(?:https?:|file:|data:|javascript:|\/\/)/i,
    /\bsrc\s*=\s*["']\s*(?:https?:|file:|data:|javascript:|\/\/)/i,
  ];
  for (const pattern of unsafeSvgPatterns) {
    if (svgTextsToScan.some((svgText) => pattern.test(svgText))) {
      fail(`${file}: SVG contains unsafe markup ${pattern}.`);
    }
  }

  const width = /\bwidth\s*=\s*["']([^"']+)["']/i.exec(text);
  const height = /\bheight\s*=\s*["']([^"']+)["']/i.exec(text);
  if (width && height) {
    assertDimensions(
      file,
      parseSvgLength(file, "width", width[1]),
      parseSvgLength(file, "height", height[1]),
    );
  }

  if (variantName === "neutral") {
    const visibleText = [...text.matchAll(/<(text|title|desc)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((match) => normalizeSvgVisibleText(match[2]))
      .join(" ");
    if (NEUTRAL_ENGLISH_UI_WORDS.test(visibleText)) {
      fail(
        `${file}: neutral SVG variant contains English UI instruction text; use locale-specific media or remove the text.`,
      );
    }
  }
}

function validatePng(file, bytes) {
  assertByteLimit(file, bytes, MAX_IMAGE_BYTES, "PNG");
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes.toString("ascii", 1, 4) !== "PNG" ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    fail(`${file}: PNG magic bytes are invalid.`);
    return;
  }
  let offset = 8;
  let sawIhdr = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const next = dataStart + length + 4;
    if (next > bytes.length) {
      fail(`${file}: PNG chunk ${type} exceeds file length.`);
      return;
    }
    if (PNG_FORBIDDEN_CHUNKS.has(type)) {
      fail(`${file}: PNG contains forbidden metadata chunk ${type}.`);
    }
    if (type === "IHDR" && length >= 8) {
      sawIhdr = true;
      assertDimensions(file, bytes.readUInt32BE(dataStart), bytes.readUInt32BE(dataStart + 4));
    }
    offset = next;
    if (type === "IEND") break;
  }
  if (!sawIhdr) fail(`${file}: PNG is missing IHDR.`);
}

function nextJpegMarkerOffset(bytes, start) {
  let offset = start;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset + 1 < bytes.length && bytes[offset + 1] === 0xff) {
      offset += 1;
    }
    if (offset + 1 >= bytes.length) return bytes.length;
    const marker = bytes[offset + 1];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    return offset;
  }
  return bytes.length;
}

function validateJpeg(file, bytes) {
  assertByteLimit(file, bytes, MAX_IMAGE_BYTES, "JPEG");
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    fail(`${file}: JPEG magic bytes are invalid.`);
    return;
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset + 1 < bytes.length && bytes[offset + 1] === 0xff) {
      offset += 1;
    }
    if (offset + 1 >= bytes.length) break;
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0x00) continue;
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      fail(`${file}: JPEG segment 0x${marker.toString(16)} exceeds file length.`);
      return;
    }
    if (JPEG_FORBIDDEN_MARKERS.has(marker)) {
      fail(`${file}: JPEG contains forbidden ${JPEG_FORBIDDEN_MARKERS.get(marker)}.`);
    }
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker) &&
      segmentLength >= 7
    ) {
      assertDimensions(file, bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
    }
    if (marker === 0xda) {
      offset = nextJpegMarkerOffset(bytes, offset + segmentLength);
      continue;
    }
    offset += segmentLength;
  }
}

function validateWebp(file, bytes) {
  assertByteLimit(file, bytes, MAX_IMAGE_BYTES, "WebP");
  if (
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    fail(`${file}: WebP magic bytes are invalid.`);
    return;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const next = dataStart + length + (length % 2);
    if (next > bytes.length) {
      fail(`${file}: WebP chunk ${type} exceeds file length.`);
      return;
    }
    if (WEBP_FORBIDDEN_CHUNKS.has(type)) {
      fail(`${file}: WebP contains forbidden metadata chunk ${type}.`);
    }
    if (type === "VP8X" && length >= 10) {
      const width = 1 + bytes.readUIntLE(dataStart + 4, 3);
      const height = 1 + bytes.readUIntLE(dataStart + 7, 3);
      assertDimensions(file, width, height);
    } else if (
      type === "VP8 " &&
      length >= 10 &&
      bytes[dataStart + 3] === 0x9d &&
      bytes[dataStart + 4] === 0x01 &&
      bytes[dataStart + 5] === 0x2a
    ) {
      const width = bytes.readUInt16LE(dataStart + 6) & 0x3fff;
      const height = bytes.readUInt16LE(dataStart + 8) & 0x3fff;
      assertDimensions(file, width, height);
    } else if (type === "VP8L" && length >= 5 && bytes[dataStart] === 0x2f) {
      const bits = bytes.readUInt32LE(dataStart + 1);
      const width = 1 + (bits & 0x3fff);
      const height = 1 + ((bits >> 14) & 0x3fff);
      assertDimensions(file, width, height);
    }
    offset = next;
  }
}

function readEbmlId(bytes, offset) {
  const first = bytes[offset];
  if (first === undefined) return null;
  const length = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : first >= 0x10 ? 4 : 0;
  if (length === 0 || offset + length > bytes.length) return null;
  return {
    hex: bytes.subarray(offset, offset + length).toString("hex").toUpperCase(),
    length,
  };
}

function readEbmlSize(bytes, offset) {
  const first = bytes[offset];
  if (first === undefined) return null;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = BigInt(first & (mask - 1));
  for (let index = 1; index < length; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  const unknown = value === (1n << BigInt(7 * length)) - 1n;
  if (unknown) return { length, value: null };
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { length, value: Number(value) };
}

function scanEbmlMetadata(file, bytes, start, end, depth = 0) {
  if (depth > 12) {
    fail(`${file}: WebM EBML nesting is too deep.`);
    return;
  }
  let offset = start;
  while (offset < end) {
    const id = readEbmlId(bytes, offset);
    if (!id) return;
    const size = readEbmlSize(bytes, offset + id.length);
    if (!size) return;
    const dataStart = offset + id.length + size.length;
    const dataEnd = size.value === null ? end : dataStart + size.value;
    if (dataEnd > end || dataEnd < dataStart) {
      fail(`${file}: WebM EBML element ${id.hex} exceeds container bounds.`);
      return;
    }
    const forbidden = EBML_FORBIDDEN_METADATA_IDS.get(id.hex);
    if (forbidden && dataEnd > dataStart) {
      fail(`${file}: WebM contains forbidden ${forbidden} metadata element.`);
    }
    if (EBML_MASTER_IDS.has(id.hex) && dataEnd > dataStart) {
      scanEbmlMetadata(file, bytes, dataStart, dataEnd, depth + 1);
    }
    if (size.value === null) return;
    offset = dataEnd;
  }
}

function validateWebm(file, bytes) {
  assertByteLimit(file, bytes, MAX_VIDEO_BYTES, "WebM");
  if (bytes.length < 4 || !bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    fail(`${file}: WebM/EBML magic bytes are invalid.`);
    return;
  }
  scanEbmlMetadata(file, bytes, 0, bytes.length);
  for (const token of VIDEO_METADATA_TOKENS) {
    if (bytesContain(bytes, token)) {
      fail(`${file}: video contains metadata token ${token}; strip container metadata.`);
    }
  }
}

function validateMp4(file, bytes) {
  assertByteLimit(file, bytes, MAX_VIDEO_BYTES, "MP4");
  if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") {
    fail(`${file}: MP4 magic bytes are invalid.`);
    return;
  }
  for (const token of VIDEO_METADATA_TOKENS) {
    if (bytesContain(bytes, token)) {
      fail(`${file}: video contains metadata token ${token}; strip container metadata.`);
    }
  }
  for (const token of MP4_XMP_METADATA_TOKENS) {
    if (bytes.includes(token)) {
      fail(`${file}: MP4 contains XMP metadata; strip container metadata.`);
    }
  }
}

function validateMediaFile(manifestFile, manifest, variantName, variant) {
  const mediaPath = canonicalUserAssetPath(variant?.path);
  if (!mediaPath) {
    fail(`${manifestFile}: variant ${variantName} path must be canonical under docs/user/assets/.`);
    return;
  }
  if (!exists(mediaPath)) {
    fail(`${manifestFile}: variant ${variantName} path does not exist.`);
    return;
  }
  const ext = path.posix.extname(mediaPath).toLowerCase();
  if (manifest.kind === "image" && !IMAGE_EXTENSIONS.has(ext)) {
    fail(`${manifestFile}: image variant ${variantName} uses unsupported extension ${ext}.`);
    return;
  }
  if (manifest.kind === "video" && !VIDEO_EXTENSIONS.has(ext)) {
    fail(`${manifestFile}: video variant ${variantName} uses unsupported extension ${ext}.`);
    return;
  }
  if (manifest.kind === "image" && VIDEO_EXTENSIONS.has(ext)) {
    fail(`${manifestFile}: image variant ${variantName} points at a video file.`);
    return;
  }
  if (manifest.kind === "video" && IMAGE_EXTENSIONS.has(ext)) {
    fail(`${manifestFile}: video variant ${variantName} points at an image file.`);
    return;
  }

  const checked = checkedMediaFile(mediaPath, ext);
  if (!checked) return;
  const bytes = readBytes(mediaPath);
  if (!bytes) return;
  if (ext === ".svg") validateSvg(mediaPath, bytes, variantName);
  else if (ext === ".png") validatePng(mediaPath, bytes);
  else if (ext === ".jpg" || ext === ".jpeg") validateJpeg(mediaPath, bytes);
  else if (ext === ".webp") validateWebp(mediaPath, bytes);
  else if (ext === ".webm") validateWebm(mediaPath, bytes);
  else if (ext === ".mp4") validateMp4(mediaPath, bytes);
}

function validateManifest(file, manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail(`${file}: media manifest must be a JSON object.`);
    return;
  }
  if (!["image", "video"].includes(manifest.kind)) {
    fail(`${file}: manifest kind must be image or video.`);
  }
  if (manifest.kind === "video" && manifest.status === "reviewed") {
    fail(`${file}: reviewed videos remain blocked until poster and localized caption/transcript schema is enforced.`);
  }
  if (!manifest.variants || typeof manifest.variants !== "object" || Array.isArray(manifest.variants)) {
    fail(`${file}: variants object is required.`);
    return;
  }
  if (Object.keys(manifest.variants).length === 0) {
    fail(`${file}: variants object must contain at least one variant.`);
    return;
  }
  for (const [variantName, variant] of Object.entries(manifest.variants)) {
    if (![...locales, "neutral"].includes(variantName)) {
      fail(`${file}: unsupported media variant ${variantName}.`);
    }
    validateMediaFile(file, manifest, variantName, variant);
  }
}

for (const file of listRepoFiles("docs/user/assets")) {
  if (!file.endsWith("/manifest.json")) continue;
  validateManifest(file, readJson(file));
}

if (failures.length > 0) {
  console.error("[user-docs-media] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[user-docs-media] passed");
