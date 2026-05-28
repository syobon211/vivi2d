import crypto from "node:crypto";
import fs from "node:fs";
import { readSinglePackEntry } from "./lib/npm-pack-result.mjs";
import { readJson, run } from "./lib/repo.mjs";

const args = parseArgs(process.argv.slice(2));
const packResultPath = args["pack-result"];
const tarballPath = args.tarball;
const version = args.version;
const packAllowlistPath = "docs/developer/quality/web-npm-alpha-pack-allowlist.json";
const packAllowlist = readJson(packAllowlistPath);
const failures = [];

if (!packResultPath) failures.push("--pack-result is required.");
if (!tarballPath) failures.push("--tarball is required.");
if (!version) failures.push("--version is required.");

const packEntry = packResultPath ? safeReadSinglePackEntry(packResultPath) : null;
if (packEntry && packEntry.filename !== tarballPath) {
  failures.push(
    `Tarball ${tarballPath} does not match pack result ${packEntry.filename}.`,
  );
}
if (tarballPath && !fs.existsSync(tarballPath)) {
  failures.push(`Tarball does not exist: ${tarballPath}`);
}
if (packEntry && packEntry.version !== version) {
  failures.push(`Pack result version ${packEntry.version} does not match ${version}.`);
}
if (packEntry) {
  validatePackEntry(packEntry, packAllowlist);
}

if (fs.existsSync("web-npm-alpha-release-record.json") && tarballPath) {
  const record = JSON.parse(fs.readFileSync("web-npm-alpha-release-record.json", "utf8"));
  const sha256 = sha256File(tarballPath);
  const head = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  if (record.version !== version)
    failures.push(`Release record version ${record.version} does not match ${version}.`);
  if (record.sourceCommit !== head)
    failures.push(
      `Release record sourceCommit ${record.sourceCommit} does not match HEAD ${head}.`,
    );
  if (record.tarball?.filename !== tarballPath)
    failures.push("Release record tarball filename does not match.");
  if (record.tarball?.sha256 !== sha256)
    failures.push("Release record tarball sha256 does not match.");
  if (record.tarball?.unpackedSize !== packEntry?.unpackedSize)
    failures.push("Release record tarball unpacked size does not match pack result.");
  if (record.packAllowlist?.path !== packAllowlistPath)
    failures.push("Release record pack allowlist path does not match.");
  if (record.packAllowlist?.schemaVersion !== packAllowlist.schemaVersion)
    failures.push("Release record pack allowlist schemaVersion does not match.");
  validatePackFiles(record.packFiles, packEntry?.files ?? []);
  if (!Array.isArray(record.gates) || record.gates.length === 0) {
    failures.push("Release record must include gate transcript summaries.");
  }
} else {
  failures.push("web-npm-alpha-release-record.json is required.");
}

if (failures.length > 0) {
  console.error("[web-npm-alpha-release-record] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[web-npm-alpha-release-record] passed");

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
    failures.push(`Pack result package ${entry.name} does not match ${allowlist.packageName}.`);
  }
  if (entry.version !== allowlist.version) {
    failures.push(`Pack result version ${entry.version} does not match ${allowlist.version}.`);
  }
  if (entry.size > allowlist.maxTarballBytes) {
    failures.push(`Packed tarball is too large: ${entry.size} > ${allowlist.maxTarballBytes}.`);
  }
  if (entry.unpackedSize > allowlist.maxUnpackedBytes) {
    failures.push(
      `Packed tarball unpacked size is too large: ${entry.unpackedSize} > ${allowlist.maxUnpackedBytes}.`,
    );
  }
  const actual = (entry.files ?? []).map((file) => file.path).sort();
  const expected = [...allowlist.files].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`Pack result file list does not match ${packAllowlistPath}.`);
  }
}

function validatePackFiles(recordFiles, packFiles) {
  if (!Array.isArray(recordFiles)) {
    failures.push("Release record must include packFiles.");
    return;
  }
  const expectedByPath = new Map(packFiles.map((file) => [file.path, file]));
  const recordByPath = new Map(recordFiles.map((file) => [file.path, file]));
  const expectedPaths = [...expectedByPath.keys()].sort();
  const recordPaths = [...recordByPath.keys()].sort();
  if (JSON.stringify(expectedPaths) !== JSON.stringify(recordPaths)) {
    failures.push("Release record packFiles path list does not match pack result.");
    return;
  }
  for (const expectedPath of expectedPaths) {
    const expected = expectedByPath.get(expectedPath);
    const actual = recordByPath.get(expectedPath);
    if (actual.sizeBytes !== expected.size) {
      failures.push(`Release record packFiles size mismatch for ${expectedPath}.`);
    }
    if (typeof actual.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(actual.sha256)) {
      failures.push(`Release record packFiles sha256 is invalid for ${expectedPath}.`);
    }
  }
}

function safeReadSinglePackEntry(file) {
  try {
    return readSinglePackEntry(file);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}
