import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export const COMFYUI_ROUTE_SLUG = "integrations/comfyui";
export const COMFYUI_SOURCE_RECORD_FILE =
  "docs/developer/quality/comfyui-plugin-source-record.json";
export const COMFYUI_COMPAT_PLUGIN_SOURCE_DIR =
  "integrations/comfyui/vivi2d_compat_plugin";

const RELEASE_NOTE_SURFACES = [
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "docs/release-notes",
  "docs/developer/releases",
];

function repoPath(root, relativePath) {
  return path.join(root, relativePath);
}

function exists(root, relativePath) {
  return fs.existsSync(repoPath(root, relativePath));
}

function readJson(root, relativePath, failures) {
  try {
    return JSON.parse(fs.readFileSync(repoPath(root, relativePath), "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: invalid JSON (${error.message})`);
    return null;
  }
}

function listFiles(root, relativePath) {
  const absolutePath = repoPath(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [relativePath];
  if (!stat.isDirectory()) return [];

  const files = [];
  const stack = [relativePath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(repoPath(root, current), { withFileTypes: true })) {
      const child = path.posix.join(current.replaceAll("\\", "/"), entry.name);
      if (entry.isDirectory()) {
        stack.push(child);
      } else if (entry.isFile()) {
        files.push(child);
      }
    }
  }
  return files;
}

function hasCompatPluginSource(root) {
  return fs.existsSync(repoPath(root, COMFYUI_COMPAT_PLUGIN_SOURCE_DIR));
}

function isIgnoredSourceHashEntry(file) {
  const normalized = file.replaceAll("\\", "/");
  return (
    normalized.includes("/__pycache__/") ||
    normalized.endsWith(".pyc") ||
    normalized.includes("/.pytest_cache/") ||
    normalized.includes("/.tmp-tests/")
  );
}

function listSourceFilesForHash(root, relativePath, failures) {
  const absolutePath = repoPath(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  if (isIgnoredSourceHashEntry(relativePath)) return [];

  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    failures.push(`${relativePath}: symlinks are not allowed in ComfyUI compat plugin source.`);
    return [];
  }
  if (stat.isFile()) return [relativePath];
  if (!stat.isDirectory()) {
    failures.push(`${relativePath}: non-regular source entry is not allowed.`);
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const child = path.posix.join(relativePath.replaceAll("\\", "/"), entry.name);
    files.push(...listSourceFilesForHash(root, child, failures));
  }
  return files;
}

export function hashComfyUiCompatPluginSourceTree(root, failures = []) {
  const initialFailureCount = failures.length;
  const files = listSourceFilesForHash(
    root,
    COMFYUI_COMPAT_PLUGIN_SOURCE_DIR,
    failures,
  ).sort();
  if (failures.length > initialFailureCount) return null;
  if (files.length === 0) return null;

  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const sourceRelativePath = file
      .slice(COMFYUI_COMPAT_PLUGIN_SOURCE_DIR.length + 1)
      .replaceAll("\\", "/");
    hash.update(sourceRelativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(repoPath(root, file)));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function releaseNoteMentionsComfyUiInstall(root) {
  const textExtensions = new Set([".md", ".txt", ".json"]);
  for (const surface of RELEASE_NOTE_SURFACES) {
    for (const file of listFiles(root, surface)) {
      if (!textExtensions.has(path.extname(file))) continue;
      const text = fs.readFileSync(repoPath(root, file), "utf8");
      const blocks = text.split(/\r?\n\s*\r?\n/);
      if (blocks.some(isComfyUiInstallGuidanceBlock)) {
        return file;
      }
    }
  }
  return null;
}

function isComfyUiInstallGuidanceBlock(text) {
  return (
    /\bComfyUI\b/i.test(text) &&
    /\b(?:vivi2d_compat_plugin|compat plugin|custom_nodes|install)\b/i.test(text)
  );
}

export function comfyUiSourceRecordRequiredReasons(
  root,
  { publicationRoutes = new Map(), releaseCandidate = false } = {},
) {
  const reasons = [];
  if (releaseCandidate && publicationRoutes.get(COMFYUI_ROUTE_SLUG)?.published) {
    reasons.push(`published ${COMFYUI_ROUTE_SLUG} route`);
  }
  const releaseNoteFile = releaseNoteMentionsComfyUiInstall(root);
  if (releaseNoteFile) {
    reasons.push(`${releaseNoteFile} install guidance`);
  }
  return reasons;
}

export function comfyUiTrackedSourceRecordReasons(root) {
  return hasCompatPluginSource(root)
    ? [`tracked ${COMFYUI_COMPAT_PLUGIN_SOURCE_DIR} source`]
    : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function requireNonEmptyString(failures, value, pathLabel) {
  if (!isNonEmptyString(value)) {
    failures.push(`${COMFYUI_SOURCE_RECORD_FILE}: ${pathLabel} must be a non-empty string.`);
  }
}

function readSourceRecord(root, failures) {
  if (!exists(root, COMFYUI_SOURCE_RECORD_FILE)) {
    return null;
  }
  const record = readJson(root, COMFYUI_SOURCE_RECORD_FILE, failures);
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    failures.push(`${COMFYUI_SOURCE_RECORD_FILE}: source record must be a JSON object.`);
    return null;
  }
  return record;
}

function validateCompatPluginRecord(failures, compatPlugin, { releaseReady }) {
  if (
    !compatPlugin ||
    typeof compatPlugin !== "object" ||
    Array.isArray(compatPlugin)
  ) {
    failures.push(`${COMFYUI_SOURCE_RECORD_FILE}: compatPlugin record is required.`);
    return;
  }

  if (compatPlugin.installDirectory !== "vivi2d_compat_plugin") {
    failures.push(
      `${COMFYUI_SOURCE_RECORD_FILE}: compatPlugin.installDirectory must be vivi2d_compat_plugin.`,
    );
  }
  requireNonEmptyString(failures, compatPlugin.sourceLocation, "compatPlugin.sourceLocation");
  requireNonEmptyString(failures, compatPlugin.version, "compatPlugin.version");
  requireNonEmptyString(failures, compatPlugin.licenseSpdx, "compatPlugin.licenseSpdx");
  requireNonEmptyString(
    failures,
    compatPlugin.supportedVivi2DBuildRange,
    "compatPlugin.supportedVivi2DBuildRange",
  );
  const hasSha256 =
    typeof compatPlugin.sha256 === "string" &&
    /^sha256:[a-f0-9]{64}$/i.test(compatPlugin.sha256);
  const hasSignature = isNonEmptyString(compatPlugin.signature);
  if (!hasSha256 && !hasSignature) {
    failures.push(
      `${COMFYUI_SOURCE_RECORD_FILE}: compatPlugin.sha256 or compatPlugin.signature is required before publishing ComfyUI install docs.`,
    );
  }

  if (!releaseReady) return;

  if (
    compatPlugin.licenseSpdx === "NOASSERTION" ||
    /review\s*pending|review-pending/i.test(String(compatPlugin.licenseSpdx))
  ) {
    failures.push(
      `${COMFYUI_SOURCE_RECORD_FILE}: compatPlugin.licenseSpdx must be release-reviewed before publishing ComfyUI install docs.`,
    );
  }
  if (compatPlugin.reviewed !== true) {
    failures.push(`${COMFYUI_SOURCE_RECORD_FILE}: compatPlugin.reviewed must be true.`);
  }
}

function validateSeeThroughRecord(failures, seeThrough, { releaseReady }) {
  if (!seeThrough || typeof seeThrough !== "object" || Array.isArray(seeThrough)) {
    failures.push(`${COMFYUI_SOURCE_RECORD_FILE}: seeThrough record is required.`);
    return;
  }

  if (seeThrough.upstreamRepo !== "jtydhr88/ComfyUI-See-through") {
    failures.push(
      `${COMFYUI_SOURCE_RECORD_FILE}: seeThrough.upstreamRepo must be jtydhr88/ComfyUI-See-through.`,
    );
  }
  requireNonEmptyString(
    failures,
    seeThrough.thirdPartyNotice,
    "seeThrough.thirdPartyNotice",
  );

  if (!releaseReady) return;

  requireNonEmptyString(
    failures,
    seeThrough.testedTagOrCommit,
    "seeThrough.testedTagOrCommit",
  );
  if (seeThrough.reviewed !== true) {
    failures.push(`${COMFYUI_SOURCE_RECORD_FILE}: seeThrough.reviewed must be true.`);
  }
}

function validateRepoSourceHash(root, failures, record) {
  if (record.compatPlugin?.sourceLocation !== `repo:${COMFYUI_COMPAT_PLUGIN_SOURCE_DIR}`) {
    return;
  }
  const actualHash = hashComfyUiCompatPluginSourceTree(root, failures);
  if (!actualHash) {
    if (!failures.some((failure) => failure.includes(COMFYUI_COMPAT_PLUGIN_SOURCE_DIR))) {
      failures.push(
        `${COMFYUI_SOURCE_RECORD_FILE}: compatPlugin.sourceLocation points to ${COMFYUI_COMPAT_PLUGIN_SOURCE_DIR}, but no source files were found.`,
      );
    }
    return;
  }
  if (record.compatPlugin.sha256 !== actualHash) {
    failures.push(
      `${COMFYUI_SOURCE_RECORD_FILE}: compatPlugin.sha256 does not match ${COMFYUI_COMPAT_PLUGIN_SOURCE_DIR} source tree (${actualHash}).`,
    );
  }
}

export function validateComfyUiTrackedSourceRecord(root, trackedReasons) {
  const failures = [];
  if (trackedReasons.length === 0) return failures;

  if (!exists(root, COMFYUI_SOURCE_RECORD_FILE)) {
    failures.push(
      `${COMFYUI_SOURCE_RECORD_FILE}: ComfyUI compat plugin source record is required for ${trackedReasons.join(", ")}.`,
    );
    return failures;
  }

  const record = readSourceRecord(root, failures);
  if (!record) return failures;

  validateCompatPluginRecord(failures, record.compatPlugin, { releaseReady: false });
  validateSeeThroughRecord(failures, record.seeThrough, { releaseReady: false });
  validateRepoSourceHash(root, failures, record);

  return failures;
}

export function validateComfyUiSourceRecord(root, requiredReasons) {
  const failures = [];
  if (requiredReasons.length === 0) return failures;

  if (!exists(root, COMFYUI_SOURCE_RECORD_FILE)) {
    failures.push(
      `${COMFYUI_SOURCE_RECORD_FILE}: complete ComfyUI compat plugin source record is required for ${requiredReasons.join(", ")}.`,
    );
    return failures;
  }

  const record = readSourceRecord(root, failures);
  if (!record) return failures;

  validateCompatPluginRecord(failures, record.compatPlugin, { releaseReady: true });
  validateSeeThroughRecord(failures, record.seeThrough, { releaseReady: true });
  validateRepoSourceHash(root, failures, record);

  return failures;
}
