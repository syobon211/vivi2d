import crypto from "node:crypto";
import path from "node:path";
import { TextDecoder } from "node:util";

export const USER_DOC_LOCALES = Object.freeze(["en", "ja", "zh-Hans", "ko-KR"]);

export function decodeUserDocUtf8(bytes, file, fail) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail(`${file}: UTF-8 BOM is not allowed.`);
    return "";
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${file}: invalid UTF-8 byte sequence.`);
    return "";
  }
}

export function canonicalUserAssetPath(value) {
  if (typeof value !== "string") return null;
  if (value.includes("\\") || value.includes("\0")) return null;
  const normalized = path.posix.normalize(value);
  if (normalized !== value) return null;
  if (!normalized.startsWith("docs/user/assets/")) return null;
  if (normalized === "docs/user/assets/" || normalized.endsWith("/")) return null;
  return normalized;
}

function parseScalar(value, file, context, fail) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      fail(`${file}: malformed JSON array in frontmatter ${context}.`);
      return null;
    }
  }
  return trimmed;
}

// This is the existing limited frontmatter dialect, not a general YAML parser.
export function parseUserDocFrontmatter(raw, file, fail) {
  if (raw.charCodeAt(0) === 0xfeff) fail(`${file}: UTF-8 BOM is not allowed.`);
  const text = raw.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    fail(`${file}: missing opening frontmatter delimiter.`);
    return { data: {}, body: text };
  }
  const closeIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closeIndex === -1) {
    fail(`${file}: missing closing frontmatter delimiter.`);
    return { data: {}, body: "" };
  }

  const data = {};
  const seen = new Set();
  const nestedSeen = new Map();
  let currentKey = null;
  for (let lineIndex = 1; lineIndex < closeIndex; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.trim() === "") continue;
    if (line.startsWith("  - ")) {
      if (!currentKey || !Array.isArray(data[currentKey])) {
        fail(`${file}: list item has no array parent in frontmatter.`);
        continue;
      }
      data[currentKey].push(parseScalar(line.slice(4), file, currentKey, fail));
      continue;
    }
    if (line.startsWith("  ")) {
      if (
        !currentKey ||
        !data[currentKey] ||
        typeof data[currentKey] !== "object" ||
        Array.isArray(data[currentKey])
      ) {
        fail(`${file}: nested field has no object parent in frontmatter.`);
        continue;
      }
      const match = /^ {2}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
      if (!match) {
        fail(`${file}: unsupported nested frontmatter syntax.`);
        continue;
      }
      const field = `${currentKey}.${match[1]}`;
      if (nestedSeen.get(currentKey)?.has(match[1])) {
        fail(`${file}: duplicate nested frontmatter field: ${field}`);
        continue;
      }
      if (!nestedSeen.has(currentKey)) nestedSeen.set(currentKey, new Set());
      nestedSeen.get(currentKey).add(match[1]);
      data[currentKey][match[1]] = parseScalar(match[2], file, field, fail);
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) {
      fail(`${file}: unsupported frontmatter syntax.`);
      continue;
    }
    const [, key, rawValue] = match;
    if (seen.has(key)) fail(`${file}: duplicate frontmatter field: ${key}`);
    seen.add(key);
    if (rawValue === "") {
      const following = lines
        .slice(lineIndex + 1, closeIndex)
        .find((candidate) => candidate.trim() !== "");
      data[key] = following?.startsWith("  - ") ? [] : {};
    } else {
      data[key] = parseScalar(rawValue, file, key, fail);
    }
    currentKey = key;
  }
  return { data, body: lines.slice(closeIndex + 1).join("\n"), closeIndex };
}

function localizedRecordForHash(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = {};
  for (const locale of USER_DOC_LOCALES) {
    record[locale] = typeof value[locale] === "string" ? value[locale] : null;
  }
  return record;
}

function localizedOrScalarRecordForHash(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return localizedRecordForHash(value);
}

function mediaSourceRecordForHash(mediaId, mediaManifests, fileSha256) {
  const record = mediaManifests.get(mediaId);
  if (!record) return { id: mediaId, missing: true };
  const manifest = record.manifest;
  const variants = {};
  for (const variantName of Object.keys(manifest.variants ?? {}).sort()) {
    const variant = manifest.variants[variantName] ?? {};
    const variantPath = canonicalUserAssetPath(variant.path);
    variants[variantName] = {
      fileSha256: variantPath ? fileSha256(variantPath) : null,
      path: variantPath,
      alt: localizedRecordForHash(variant.alt),
      caption: localizedRecordForHash(variant.caption),
      captions: localizedOrScalarRecordForHash(variant.captions),
      transcript: localizedOrScalarRecordForHash(variant.transcript),
    };
  }
  return {
    id: mediaId,
    kind: manifest.kind ?? null,
    status: manifest.status ?? null,
    topicSlugs: Array.isArray(manifest.topicSlugs) ? manifest.topicSlugs : null,
    variants,
  };
}

export function sourceContentHashForPage({ data, body }, mediaManifests, fileSha256) {
  const included = {};
  for (const key of ["title", "description", "audience", "media", "workflow"]) {
    if (data[key] !== undefined) included[key] = data[key];
  }
  if (Array.isArray(data.media)) {
    included.mediaMetadata = data.media.map((mediaId) =>
      mediaSourceRecordForHash(mediaId, mediaManifests, fileSha256),
    );
  }
  const prefix = Object.keys(included)
    .sort()
    .map((key) => `${key}=${JSON.stringify(included[key])}`)
    .join("\n");
  const payload = `${prefix}\n\n${body.replace(/\r\n?/g, "\n")}`;
  return `sha256:v1:${crypto.createHash("sha256").update(payload, "utf8").digest("hex")}`;
}
