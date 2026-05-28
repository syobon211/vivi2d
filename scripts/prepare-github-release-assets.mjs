import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { repoRoot, resolveRepoPath, run } from "./lib/repo.mjs";

const args = process.argv.slice(2);
const options = parseArgs(args);

const version = requireOption("version");
const tag = options.tag ?? `v${version}`;
const outputDir = resolveInsideRepo(options.output ?? "tmp/github-release-assets");
const assetNames = {
  sourceReviewZip: `vivi2d-${version}-source-review.zip`,
  sourceReviewManifest: `vivi2d-${version}-source-review-manifest.json`,
  sbom: `vivi2d-${version}.cdx.json`,
  notices: "THIRD_PARTY_NOTICES.txt",
  releaseRecord: `vivi2d-${version}-release-record.json`,
  checksums: "checksums.txt",
  releaseNotes: "release-notes.md",
};

if (!/^\d+\.\d+\.\d+-alpha\.\d+$/.test(version)) {
  throw new Error(
    `GitHub release alpha version must look like 0.1.0-alpha.1: ${version}`,
  );
}
if (tag !== `v${version}`) {
  throw new Error(`GitHub release tag must be v${version}, found ${tag}`);
}

const sourceCommit = run("git", ["rev-parse", "HEAD"]).stdout.trim();
const sourceReviewZip = resolveRepoPath("tmp/source-review/vivi2d-source-review.zip");
const sourceReviewManifest = resolveRepoPath(
  "tmp/source-review/vivi2d-source-review-manifest.json",
);
const sbom = resolveRepoPath("dist/sbom/vivi2d.cdx.json");
const notices = resolveRepoPath("THIRD_PARTY_NOTICES");
const notesTemplate = resolveRepoPath(
  "docs/developer/quality/templates/github-release-alpha-notes.md",
);

for (const required of [
  sourceReviewZip,
  sourceReviewManifest,
  sbom,
  notices,
  notesTemplate,
]) {
  if (!fs.existsSync(required)) {
    throw new Error(
      `Missing release input ${path.relative(repoRoot, required)}. Run sbom:generate and archive:source-review first.`,
    );
  }
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const copiedAssets = [
  copyAsset(sourceReviewZip, assetNames.sourceReviewZip),
  copyAsset(sourceReviewManifest, assetNames.sourceReviewManifest),
  copyAsset(sbom, assetNames.sbom),
  copyAsset(notices, assetNames.notices),
];

const notesPath = path.join(outputDir, assetNames.releaseNotes);
const notes = fs
  .readFileSync(notesTemplate, "utf8")
  .replaceAll("<version>", version)
  .replaceAll("<commit-sha>", sourceCommit);
fs.writeFileSync(notesPath, notes);
const releaseNotesAsset = describeFile(notesPath);

const releaseRecordPath = path.join(outputDir, assetNames.releaseRecord);
const releaseRecord = {
  schemaVersion: 1,
  releaseKind: "github-release-alpha",
  version,
  tag,
  sourceCommit,
  generatedAt: new Date().toISOString(),
  primaryAssets: copiedAssets.map((asset) => ({
    name: asset.name,
    sizeBytes: asset.sizeBytes,
    sha256: asset.sha256,
  })),
  downloadableAssetNames: [
    assetNames.checksums,
    assetNames.notices,
    assetNames.releaseRecord,
    assetNames.sbom,
    assetNames.sourceReviewManifest,
    assetNames.sourceReviewZip,
  ].sort((a, b) => a.localeCompare(b)),
  checksumFile: assetNames.checksums,
  releaseNotesFile: assetNames.releaseNotes,
  releaseNotesAttachedAsDownload: false,
  releaseNotes: {
    name: releaseNotesAsset.name,
    sizeBytes: releaseNotesAsset.sizeBytes,
    sha256: releaseNotesAsset.sha256,
  },
  nonGoals: [
    "desktop installers",
    "standalone native runtime artifacts",
    "standalone WASM runtime artifacts",
    "ComfyUI or See-through bundles",
    "npm package tarball canonical distribution",
  ],
};
fs.writeFileSync(releaseRecordPath, `${JSON.stringify(releaseRecord, null, 2)}\n`);

const releaseRecordAsset = describeFile(releaseRecordPath);
const checksumEntries = [...copiedAssets, releaseRecordAsset].sort((a, b) =>
  a.name.localeCompare(b.name),
);
const checksumsPath = path.join(outputDir, assetNames.checksums);
fs.writeFileSync(
  checksumsPath,
  `${checksumEntries
    .map((entry) => `${entry.sha256.replace(/^sha256:/, "")}  ${entry.name}`)
    .join("\n")}\n`,
);

console.log(`[github-release-assets] wrote ${path.relative(repoRoot, outputDir)}`);
for (const entry of [
  ...checksumEntries,
  describeFile(checksumsPath),
  describeFile(notesPath),
]) {
  console.log(`[github-release-assets] ${entry.name} ${entry.sha256}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requireOption(name) {
  const value = options[name];
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function resolveInsideRepo(relativePath) {
  const resolved = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Output path must stay inside the repository: ${relativePath}`);
  }
  return resolved;
}

function copyAsset(sourcePath, name) {
  const target = path.join(outputDir, name);
  fs.copyFileSync(sourcePath, target);
  return describeFile(target);
}

function describeFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    sizeBytes: bytes.byteLength,
    sha256: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
  };
}
