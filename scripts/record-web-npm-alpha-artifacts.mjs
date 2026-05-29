import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readSinglePackEntry } from "./lib/npm-pack-result.mjs";
import { readJson, run } from "./lib/repo.mjs";

const args = parseArgs(process.argv.slice(2));
const packResultPath = args["pack-result"];
const transcriptDir = args["gate-transcript"];
const workspaceName = args.workspace;
const outputPath = args.output ?? "web-npm-alpha-release-record.json";
const packAllowlistPath = "docs/developer/quality/web-npm-alpha-pack-allowlist.json";
const failures = [];

if (!packResultPath) failures.push("--pack-result is required.");
if (!transcriptDir) failures.push("--gate-transcript is required.");
if (workspaceName !== "@vivi2d/web") failures.push("--workspace must be @vivi2d/web.");

const packEntry = packResultPath ? safeReadSinglePackEntry(packResultPath) : null;
const tarballPath = packEntry?.filename;
if (tarballPath && !fs.existsSync(tarballPath)) {
  failures.push(`Packed tarball does not exist: ${tarballPath}`);
}
if (transcriptDir && !fs.existsSync(transcriptDir)) {
  failures.push(`Gate transcript directory does not exist: ${transcriptDir}`);
}

if (failures.length > 0) finish();

const tarballBytes = fs.readFileSync(tarballPath);
const sbomPath = "dist/sbom/vivi2d.cdx.json";
const sbomDigest = fs.existsSync(sbomPath) ? sha256File(sbomPath) : null;
const webPackage = readJson("packages/web/package.json");
const packAllowlist = readJson(packAllowlistPath);
validatePackEntry(packEntry, packAllowlist);
const packFiles = describePackFiles(packEntry.files ?? []);
if (failures.length > 0) finish();
const record = {
  schemaVersion: 1,
  packageName: webPackage.name,
  version: webPackage.version,
  distTag: "alpha",
  sourceCommit: run("git", ["rev-parse", "HEAD"]).stdout.trim(),
  releaseTag: `web-v${webPackage.version}`,
  github: {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    workflow: process.env.GITHUB_WORKFLOW ?? null,
    workflowRef: process.env.GITHUB_WORKFLOW_REF ?? null,
    workflowSha: process.env.GITHUB_WORKFLOW_SHA ?? null,
    ref: process.env.GITHUB_REF ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runnerEnvironment: process.env.RUNNER_ENVIRONMENT ?? null,
  },
  tarball: {
    filename: tarballPath,
    size: tarballBytes.byteLength,
    unpackedSize: packEntry.unpackedSize ?? null,
    sha256: crypto.createHash("sha256").update(tarballBytes).digest("hex"),
    npmIntegrity: packEntry.integrity ?? null,
    npmShasum: packEntry.shasum ?? null,
  },
  packAllowlist: {
    path: packAllowlistPath,
    schemaVersion: packAllowlist.schemaVersion,
  },
  packFiles,
  sbom: sbomDigest
    ? {
        path: sbomPath,
        sha256: sbomDigest,
        scope: "repository-wide-root-lockfile",
      }
    : null,
  gates: summarizeTranscripts(transcriptDir),
  createdAt: new Date().toISOString(),
};

fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`[web-npm-alpha-record] wrote ${outputPath}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function validatePackEntry(entry, allowlist) {
  if (allowlist.schemaVersion !== 1) {
    failures.push(`${packAllowlistPath} schemaVersion must be 1.`);
  }
  if (entry.name !== allowlist.packageName) {
    failures.push(
      `Pack result package ${entry.name} does not match ${allowlist.packageName}.`,
    );
  }
  if (entry.version !== allowlist.version) {
    failures.push(
      `Pack result version ${entry.version} does not match ${allowlist.version}.`,
    );
  }
  if (entry.size > allowlist.maxTarballBytes) {
    failures.push(
      `Packed tarball is too large: ${entry.size} > ${allowlist.maxTarballBytes}.`,
    );
  }
  if (entry.unpackedSize > allowlist.maxUnpackedBytes) {
    failures.push(
      `Packed tarball unpacked size is too large: ${entry.unpackedSize} > ${allowlist.maxUnpackedBytes}.`,
    );
  }

  const actual = (entry.files ?? []).map((file) => file.path).sort();
  const expected = [...allowlist.files].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `Packed file list does not match ${packAllowlistPath}.\nExpected:\n${expected.join("\n")}\nActual:\n${actual.join("\n")}`,
    );
  }
}

function describePackFiles(files) {
  return files
    .map((file) => {
      const fullPath = path.join("packages/web", file.path);
      if (!fs.existsSync(fullPath)) {
        failures.push(`Packed file is missing from workspace: ${fullPath}`);
        return null;
      }
      return {
        path: file.path,
        sizeBytes: file.size,
        sha256: sha256File(fullPath),
      };
    })
    .filter(Boolean);
}

function safeReadSinglePackEntry(file) {
  try {
    return readSinglePackEntry(file);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}

function summarizeTranscripts(directory) {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
    .map((entry) => {
      const relativePath = path.join(directory, entry.name).replaceAll("\\", "/");
      const text = fs.readFileSync(relativePath, "utf8");
      const status = /^status:\s*(\d+)/m.exec(text)?.[1] ?? "unknown";
      return {
        name: entry.name.replace(/\.log$/, ""),
        path: relativePath,
        sha256: sha256File(relativePath),
        status,
      };
    });
  if (entries.length === 0) {
    failures.push(`${directory} must contain release gate transcripts.`);
    finish();
  }
  return entries;
}

function finish() {
  if (failures.length > 0) {
    console.error("[web-npm-alpha-record] failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
}
