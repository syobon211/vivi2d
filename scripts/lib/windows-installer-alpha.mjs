import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./repo.mjs";

export const WINDOWS_INSTALLER_ENVIRONMENT = "desktop-installer-alpha";
export const WINDOWS_INSTALLER_ARTIFACT_NAME = "windows-installer-alpha-assets";
export const WINDOWS_INSTALLER_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)-alpha\.(\d+)$/;
export const MAX_INSTALLER_BYTES = 300 * 1024 * 1024;
export const MAX_INSTALLED_FOOTPRINT_BYTES = 700 * 1024 * 1024;

export const WINDOWS_INSTALLER_FORBIDDEN_GLOBS = [
  "*.msi",
  "*.msix",
  "*.appx",
  "*.dmg",
  "*.pkg",
  "*.cab",
  "*.wim",
  "*.iso",
  "*.7z",
  "*.AppImage",
  "*.deb",
  "*.rpm",
  "*.snap",
  "*.nupkg",
  "*.blockmap",
  "latest.yml",
  "latest-*.yml",
  "RELEASES",
  "*.pth",
  "*.safetensors",
  "*.ckpt",
  "*.onnx",
  "*.whl",
  "*.tar.gz",
  "*.zip",
];

export const WINDOWS_APP_FORBIDDEN_FILE_NAMES = new Set([
  "app-update.yml",
  "electron-builder.yml",
  "electron-builder.yaml",
  "builder-effective-config.yaml",
]);

export const WINDOWS_APP_FORBIDDEN_PATH_PATTERNS = [
  {
    label: "packaged electron-builder resources",
    pattern: /(^|[/\\])resources[/\\]electron-builder([/\\]|$)/i,
  },
  {
    label: "docs backlog",
    pattern: /(^|[/\\])docs[/\\]backlog([/\\]|$)/i,
  },
  {
    label: "Playwright trace or workflow recording",
    pattern: /(^|[/\\])(?:playwright-report|test-results|workflow-recordings)([/\\]|$)/i,
  },
  {
    label: "temporary release output",
    pattern: /(^|[/\\])tmp([/\\]|$)/i,
  },
];

export const WINDOWS_APP_FORBIDDEN_TEXT_PATTERNS = [
  { label: "dev server env name", pattern: /VITE_DEV_SERVER_URL/ },
  {
    label: "Vite dev server URL",
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1):1420/i,
  },
  { label: "localhost dev server port", pattern: /\b(?:localhost|127\.0\.0\.1):1420\b/i },
  { label: "autoUpdater runtime config", pattern: /\bautoUpdater\b/ },
  { label: "update feed URL", pattern: /\b(?:latest\.ya?ml|app-update\.ya?ml)\b/i },
  {
    label: "MediaPipe CDN URL",
    pattern: /\b(?:cdn\.jsdelivr\.net|storage\.googleapis\.com)\b/i,
  },
  {
    label: "telemetry endpoint",
    pattern:
      /\b(?:sentry|telemetry|crashpad|crashlytics|analytics)[-.A-Za-z0-9]*\.(?:io|com|net)\b/i,
  },
  {
    label: "local user path",
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+(?!User(?:[\\/]|$))[^\\/]+[\\/]/,
  },
  {
    label: "private credential marker",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|password|credential)\b/i,
  },
];

export const TEXT_FILE_EXTENSIONS = new Set([
  ".css",
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".ts",
  ".txt",
  ".xml",
  ".yml",
  ".yaml",
]);

export function assertWindowsInstallerVersion(version) {
  const match = WINDOWS_INSTALLER_VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(
      `Windows installer alpha version must look like 0.1.0-alpha.2: ${version}`,
    );
  }
  const alphaNumber = Number(match[4]);
  if (!Number.isInteger(alphaNumber) || alphaNumber < 2) {
    throw new Error(
      `Windows installer alpha must not target ${version}; v0.1.0-alpha.1 is source/provenance-only.`,
    );
  }
}

export function assertWindowsInstallerTag(version, tag) {
  assertWindowsInstallerVersion(version);
  if (tag !== `v${version}`) {
    throw new Error(`Windows installer alpha tag must be v${version}, found ${tag}`);
  }
}

export function windowsInstallerAssetNames(version) {
  return {
    checksums: "checksums.txt",
    installer: `vivi2d-${version}-windows-x64-setup.exe`,
    installerRecord: `vivi2d-${version}-windows-installer-record.json`,
    notices: "THIRD_PARTY_NOTICES.txt",
    releaseNotes: "release-notes.md",
    sbom: `vivi2d-${version}.cdx.json`,
    sourceReviewManifest: `vivi2d-${version}-source-review-manifest.json`,
    sourceReviewZip: `vivi2d-${version}-source-review.zip`,
  };
}

export function expectedWindowsInstallerDownloadableAssetNames(version) {
  const names = windowsInstallerAssetNames(version);
  return [
    names.checksums,
    names.installer,
    names.installerRecord,
    names.notices,
    names.sbom,
    names.sourceReviewManifest,
    names.sourceReviewZip,
  ].sort((a, b) => a.localeCompare(b));
}

export function expectedWindowsInstallerFilesOnDisk(version) {
  return [
    ...expectedWindowsInstallerDownloadableAssetNames(version),
    windowsInstallerAssetNames(version).releaseNotes,
  ].sort((a, b) => a.localeCompare(b));
}

export function describeFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    sizeBytes: bytes.byteLength,
    sha256: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
    sha512: `sha512:${crypto.createHash("sha512").update(bytes).digest("hex")}`,
  };
}

export function describeFileForRecord(filePath) {
  const description = describeFile(filePath);
  return {
    name: description.name,
    sizeBytes: description.sizeBytes,
    sha256: description.sha256,
    sha512: description.sha512,
  };
}

export function resolveInsideRepo(relativePath) {
  const resolved = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside the repository: ${relativePath}`);
  }
  return resolved;
}

export function walkFiles(rootDir) {
  const rootStat = fs.lstatSync(rootDir);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`${rootDir}: symlinks are not allowed in installer app contents.`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`${rootDir}: packaged app root must be a directory.`);
  }
  const rootReal = fs.realpathSync(rootDir);
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        throw new Error(
          `${fullPath}: symlinks and junctions are not allowed in installer app contents.`,
        );
      }
      if (stat.isDirectory()) {
        assertRealPathInsideRoot(fullPath, rootReal);
        stack.push(fullPath);
      } else if (stat.isFile()) {
        assertRealPathInsideRoot(fullPath, rootReal);
        files.push(fullPath);
      } else {
        throw new Error(
          `${fullPath}: non-regular files are not allowed in installer app contents.`,
        );
      }
    }
  }
  return files;
}

export function directorySizeBytes(rootDir) {
  let total = 0;
  for (const filePath of walkFiles(rootDir)) total += fs.lstatSync(filePath).size;
  return total;
}

function assertRealPathInsideRoot(targetPath, rootReal) {
  const real = fs.realpathSync(targetPath);
  const relative = path.relative(rootReal, real);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${targetPath}: real path escapes packaged app root.`);
  }
}

export function matchesForbiddenGlob(name, glob) {
  if (glob.includes("*")) {
    const [prefix, suffix] = glob.split("*", 2);
    return (
      name.startsWith(prefix) &&
      name.endsWith(suffix) &&
      name.length >= prefix.length + suffix.length
    );
  }
  return name === glob;
}
