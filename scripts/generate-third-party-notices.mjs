import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lockPath = path.join(root, "package-lock.json");
const outputPath = path.join(root, "THIRD_PARTY_NOTICES");
const mediaPipeAssetLockPath = path.join(
  root,
  "packages/viewer/mediapipe-assets.lock.json",
);
const checkOnly = process.argv.includes("--check");
const NOTICE_FILE_PATTERN = /^(?:licen[sc]e|copying|notice)(?:[.-].*)?$/i;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isWorkspaceLink(packageInfo) {
  return packageInfo.link === true || packageInfo.resolved?.startsWith("packages/");
}

function normalizeRepository(repository) {
  if (!repository) return "";
  if (typeof repository === "string") return repository;
  if (typeof repository.url === "string") return repository.url;
  return "";
}

function readPackageMetadata(packagePath) {
  const packageJsonPath = path.join(root, packagePath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return { repository: "", noticeFiles: [] };
  }
  const pkg = readJson(packageJsonPath);
  return {
    repository: normalizeRepository(pkg.repository),
    noticeFiles: collectNoticeFiles(packagePath),
  };
}

function collectNoticeFiles(packagePath) {
  const packageDir = path.join(root, packagePath);
  if (!fs.existsSync(packageDir)) return [];

  return fs
    .readdirSync(packageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && NOTICE_FILE_PATTERN.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const relativePath = path.join(packagePath, entry.name).replaceAll("\\", "/");
      return {
        name: entry.name,
        relativePath,
        text: normalizeNoticeText(fs.readFileSync(path.join(root, relativePath), "utf8")),
      };
    });
}

function normalizeNoticeText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function collectProductionDependencies() {
  const lock = readJson(lockPath);
  const rows = [];
  for (const [packagePath, packageInfo] of Object.entries(lock.packages ?? {})) {
    if (!packagePath.startsWith("node_modules/")) continue;
    if (packageInfo.dev || isWorkspaceLink(packageInfo)) continue;

    const packageName = packagePath.replace(/^node_modules\//, "");
    const metadata = readPackageMetadata(packagePath);
    rows.push({
      name: packageName,
      version: packageInfo.version ?? "",
      license: packageInfo.license ?? "UNKNOWN",
      repository: metadata.repository,
      noticeFiles: metadata.noticeFiles,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function escapeCell(value) {
  return String(value || "").replaceAll("|", "\\|");
}

function renderTextBlock(text) {
  const longestBacktickRun =
    Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length)) + 1;
  const fence = "`".repeat(Math.max(3, longestBacktickRun));
  return `${fence}text\n${text}\n${fence}`;
}

function renderNoticeStatus(row) {
  if (row.noticeFiles.length === 0) return "not found in package root";
  return row.noticeFiles.map((file) => file.name).join(", ");
}

function render() {
  const rows = collectProductionDependencies();
  const lines = [
    "# Third-Party Notices",
    "",
    "Generated from package-lock.json production dependencies. This notice file",
    "is a release artifact input and does not replace legal review, SBOM",
    "generation, or provenance review before public distribution.",
    "",
    "## npm Production Dependencies",
    "",
    "| Package | Version | License | Repository | Notice files |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${escapeCell(row.name)} | ${escapeCell(row.version)} | ${escapeCell(row.license)} | ${escapeCell(row.repository)} | ${escapeCell(renderNoticeStatus(row))} |`,
    );
  }

  lines.push(
    "",
    "## External Provider Plugins",
    "",
    "External provider plugins are not bundled with this Apache-2.0 editor/runtime",
    "distribution. If a provider plugin becomes part of a public artifact,",
    "regenerate this file with its runtime dependencies and review provider/plugin",
    "redistribution obligations.",
    "",
    "## Bundled Assets",
    "",
    "Release artifacts must document any bundled fonts, icons, images, audio, PSD",
    "fixtures, videos, screenshots, model outputs, or generated assets. Assets",
    "without documented redistribution rights must not be shipped.",
    "",
    ...renderMediaPipeAssetNotice(),
    "## SBOM And Provenance",
    "",
    "Before a public release, attach an artifact-specific SBOM and provenance",
    "materials for the exact binary, archive, and package being shipped.",
    "",
    "## Embedded License And Notice Files",
    "",
    "The following files are copied from installed production npm packages where",
    "a package-root LICENSE, LICENCE, COPYING, or NOTICE file was available.",
    "Packages without such a file still require release review against the",
    "published package metadata and source distribution.",
    "",
  );

  for (const row of rows) {
    if (row.noticeFiles.length === 0) continue;
    for (const file of row.noticeFiles) {
      lines.push(
        `### ${row.name}@${row.version} - ${file.name}`,
        "",
        `Source path: \`${file.relativePath}\``,
        "",
        renderTextBlock(file.text),
        "",
      );
    }
  }

  return `${lines.join("\n")}`;
}

function renderMediaPipeAssetNotice() {
  if (!fs.existsSync(mediaPipeAssetLockPath)) return [];
  const mediaPipeLock = readJson(mediaPipeAssetLockPath);
  const lines = [
    "### MediaPipe Tasks Vision viewer assets",
    "",
    "Vivi2D vendors the MediaPipe Tasks Vision viewer runtime assets and task",
    "model files for same-origin tracking in packaged viewer builds. The",
    "reviewed asset set, source locations, byte sizes, and SHA-256 digests are",
    "recorded in `packages/viewer/mediapipe-assets.lock.json` and checked by",
    "`npm run check:viewer-mediapipe-assets`.",
    "",
    `Vendored asset root: \`${mediaPipeLock.vendorRoot}\``,
    "",
    "| Asset | Source | SHA-256 |",
    "| --- | --- | --- |",
  ];
  for (const asset of mediaPipeLock.assets ?? []) {
    lines.push(
      `| \`${escapeCell(asset.path)}\` | \`${escapeCell(asset.source)}\` | \`${escapeCell(asset.sha256)}\` |`,
    );
  }
  lines.push("");
  return lines;
}

const generated = render();

if (checkOnly) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== generated) {
    console.error(
      "[third-party-notices] THIRD_PARTY_NOTICES is stale. Run npm run notices:generate.",
    );
    process.exit(1);
  }
  console.log("[third-party-notices] up to date");
} else {
  fs.writeFileSync(outputPath, generated, "utf8");
  console.log(`[third-party-notices] wrote ${path.relative(root, outputPath)}`);
}
