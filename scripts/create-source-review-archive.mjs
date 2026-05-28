import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./lib/repo.mjs";

const CHECK_ONLY = process.argv.includes("--check");
const root = process.env.VIVI2D_SOURCE_ARCHIVE_ROOT
  ? path.resolve(process.env.VIVI2D_SOURCE_ARCHIVE_ROOT)
  : repoRoot;
const OUTPUT_DIR = resolveRootPath("tmp/source-review");
const ARCHIVE_PATH = path.join(OUTPUT_DIR, "vivi2d-source-review.zip");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "vivi2d-source-review-manifest.json");

const FORBIDDEN_TRACKED_PATTERNS = [
  /^node_modules\//,
  /^dist\//,
  /(^|\/)dist\//,
  /^coverage\//,
  /(^|\/)coverage\//,
  /^test-results\//,
  /(^|\/)test-results\//,
  /^playwright-report\//,
  /(^|\/)playwright-report\//,
  /^packages\/runtime-native\/target\//,
  /^tmp\//,
  /^docs\/backlog\//,
  /(^|\/)__pycache__\//,
  /\.py[co]$/i,
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function resolveRootPath(relativePath) {
  return path.join(root, relativePath);
}

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result;
}

function gitLsFilesNul() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.toString("utf8") || "git ls-files failed");
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.replaceAll("\\", "/"))
    .sort((a, b) => a.localeCompare(b));
}

function validateTrackedFile(relativePath) {
  if (path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    fail(`${relativePath}: tracked source path must be a safe relative path.`);
    return null;
  }
  if (relativePath.includes("\\")) {
    fail(`${relativePath}: tracked source path must use POSIX separators.`);
    return null;
  }
  for (const pattern of FORBIDDEN_TRACKED_PATTERNS) {
    if (pattern.test(relativePath)) {
      fail(`${relativePath}: generated or local-only output must not be tracked.`);
      return null;
    }
  }

  const absolutePath = resolveRootPath(relativePath);
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    fail(`${relativePath}: source-review archives must not include symlinks.`);
    return null;
  }
  if (!stat.isFile()) {
    fail(`${relativePath}: source-review archives only include regular files.`);
    return null;
  }
  return { absolutePath, stat };
}

function sha256File(absolutePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(absolutePath));
  return `sha256:${hash.digest("hex")}`;
}

function buildManifest(files) {
  const entries = [];
  for (const relativePath of files) {
    const checked = validateTrackedFile(relativePath);
    if (!checked) continue;
    entries.push({
      path: relativePath,
      sizeBytes: checked.stat.size,
      sha256: sha256File(checked.absolutePath),
    });
  }

  const treeHash = crypto.createHash("sha256");
  for (const entry of entries) {
    treeHash.update(entry.path);
    treeHash.update("\0");
    treeHash.update(String(entry.sizeBytes));
    treeHash.update("\0");
    treeHash.update(entry.sha256);
    treeHash.update("\0");
  }

  return {
    schemaVersion: 1,
    source: "git ls-files",
    fileCount: entries.length,
    treeHash: `sha256:${treeHash.digest("hex")}`,
    entries,
  };
}

function assertCleanTreeForArchive() {
  const status = runGit(["status", "--porcelain"]).stdout.trim();
  if (status) {
    fail(
      "archive:source-review requires a clean working tree so the generated archive matches HEAD.",
    );
  }
}

function writeArchiveAndManifest(manifest) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(`${MANIFEST_PATH}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(`${MANIFEST_PATH}.tmp`, MANIFEST_PATH);

  runGit(["archive", "--format=zip", "--output", ARCHIVE_PATH, "HEAD"]);

  const archiveHash = sha256File(ARCHIVE_PATH);
  const manifestWithArchive = {
    ...manifest,
    archive: {
      path: path.relative(repoRoot, ARCHIVE_PATH).replaceAll("\\", "/"),
      sourceRootRelativePath: path.relative(root, ARCHIVE_PATH).replaceAll("\\", "/"),
      sha256: archiveHash,
    },
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifestWithArchive, null, 2)}\n`);
}

const manifest = buildManifest(gitLsFilesNul());

if (!CHECK_ONLY) {
  assertCleanTreeForArchive();
}

if (failures.length > 0) {
  console.error("[source-review-archive] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log(
    `[source-review-archive] passed (${manifest.fileCount} tracked files, ${manifest.treeHash})`,
  );
} else {
  writeArchiveAndManifest(manifest);
  console.log(`[source-review-archive] wrote ${path.relative(root, ARCHIVE_PATH)}`);
  console.log(`[source-review-archive] wrote ${path.relative(root, MANIFEST_PATH)}`);
}
