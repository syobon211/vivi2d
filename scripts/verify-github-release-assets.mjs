import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./lib/repo.mjs";

const args = parseArgs(process.argv.slice(2));
const assetDir = resolveInsideRepo(requireOption("asset-dir"));
const version = requireOption("version");
const tag = requireOption("tag");
const sha = requireOption("sha");

const expectedAssetNames = [
  "THIRD_PARTY_NOTICES.txt",
  "checksums.txt",
  `vivi2d-${version}-release-record.json`,
  `vivi2d-${version}-source-review.zip`,
  `vivi2d-${version}-source-review-manifest.json`,
  `vivi2d-${version}.cdx.json`,
].sort((a, b) => a.localeCompare(b));

const expectedPrimaryAssetNames = expectedAssetNames
  .filter((name) => name !== "checksums.txt" && !name.endsWith("-release-record.json"))
  .sort((a, b) => a.localeCompare(b));
const expectedChecksumNames = expectedAssetNames
  .filter((name) => name !== "checksums.txt")
  .sort((a, b) => a.localeCompare(b));

const expectedFilesOnDisk = [...expectedAssetNames, "release-notes.md"].sort((a, b) =>
  a.localeCompare(b),
);
const actualFilesOnDisk = fs
  .readdirSync(assetDir, { withFileTypes: true })
  .map((entry) => {
    if (!entry.isFile()) {
      throw new Error(`Unexpected non-file release asset entry: ${entry.name}`);
    }
    return entry.name;
  })
  .sort((a, b) => a.localeCompare(b));
assertSameSet(actualFilesOnDisk, expectedFilesOnDisk, "release asset directory entries");

for (const name of expectedFilesOnDisk) {
  const assetPath = path.join(assetDir, name);
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    throw new Error(`Missing GitHub Release asset: ${name}`);
  }
}

const checksums = parseChecksums(path.join(assetDir, "checksums.txt"));
const checksumNames = [...checksums.keys()].sort((a, b) => a.localeCompare(b));
assertSameSet(checksumNames, expectedChecksumNames, "checksums.txt entries");

for (const [name, expectedSha256] of checksums) {
  const actualSha256 = sha256File(path.join(assetDir, name)).replace(/^sha256:/, "");
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${name}: checksum mismatch.`);
  }
}

const releaseRecordName = `vivi2d-${version}-release-record.json`;
const record = JSON.parse(
  fs.readFileSync(path.join(assetDir, releaseRecordName), "utf8"),
);
if (record.schemaVersion !== 1) throw new Error("release record schemaVersion mismatch.");
if (record.releaseKind !== "github-release-alpha") {
  throw new Error("release record kind mismatch.");
}
if (record.version !== version) throw new Error("release record version mismatch.");
if (record.tag !== tag) throw new Error("release record tag mismatch.");
if (record.sourceCommit !== sha) throw new Error("release record sourceCommit mismatch.");
if (record.releaseNotesAttachedAsDownload !== false) {
  throw new Error("release record must not mark release notes as downloadable.");
}
if (record.releaseNotesFile !== "release-notes.md") {
  throw new Error("release record releaseNotesFile mismatch.");
}
if (record.checksumFile !== "checksums.txt") {
  throw new Error("release record checksumFile mismatch.");
}
const releaseNotesActual = describeFile(path.join(assetDir, "release-notes.md"));
if (record.releaseNotes?.name !== "release-notes.md") {
  throw new Error("release record releaseNotes name mismatch.");
}
if (record.releaseNotes?.sizeBytes !== releaseNotesActual.sizeBytes) {
  throw new Error("release notes size mismatch.");
}
if (record.releaseNotes?.sha256 !== releaseNotesActual.sha256) {
  throw new Error("release notes sha256 mismatch.");
}
assertSameSet(
  record.downloadableAssetNames ?? [],
  expectedAssetNames,
  "release record downloadableAssetNames",
);
if ((record.downloadableAssetNames ?? []).includes("release-notes.md")) {
  throw new Error("release-notes.md must not be a downloadable asset.");
}

const primaryAssetNames = (record.primaryAssets ?? [])
  .map((asset) => asset?.name)
  .sort((a, b) => String(a).localeCompare(String(b)));
assertSameSet(
  primaryAssetNames,
  expectedPrimaryAssetNames,
  "release record primaryAssets",
);

for (const asset of record.primaryAssets ?? []) {
  const assetPath = path.join(assetDir, asset.name);
  const actual = describeFile(assetPath);
  if (asset.sizeBytes !== actual.sizeBytes) {
    throw new Error(`${asset.name}: release record size mismatch.`);
  }
  if (asset.sha256 !== actual.sha256) {
    throw new Error(`${asset.name}: release record sha256 mismatch.`);
  }
}

console.log("[github-release-assets] verified");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requireOption(name) {
  const value = args[name];
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function resolveInsideRepo(relativePath) {
  const resolved = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside the repository: ${relativePath}`);
  }
  return resolved;
}

function parseChecksums(filePath) {
  const checksums = new Map();
  for (const [index, line] of fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .entries()) {
    if (!line) continue;
    const match = /^([0-9a-f]{64}) {2}([^\s].*)$/i.exec(line);
    if (!match) throw new Error(`checksums.txt:${index + 1}: invalid checksum line.`);
    const name = match[2];
    if (path.basename(name) !== name || name.includes("\\") || name.includes("/")) {
      throw new Error(`checksums.txt:${index + 1}: checksum path must be a file name.`);
    }
    if (checksums.has(name)) {
      throw new Error(`checksums.txt:${index + 1}: duplicate checksum entry ${name}.`);
    }
    checksums.set(name, match[1].toLowerCase());
  }
  return checksums;
}

function describeFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    sizeBytes: bytes.byteLength,
    sha256: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
  };
}

function sha256File(filePath) {
  return describeFile(filePath).sha256;
}

function assertSameSet(actualValue, expectedValue, label) {
  const actual = [...actualValue].sort((a, b) => String(a).localeCompare(String(b)));
  const expected = [...expectedValue].sort((a, b) => String(a).localeCompare(String(b)));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} must equal ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`,
    );
  }
}
