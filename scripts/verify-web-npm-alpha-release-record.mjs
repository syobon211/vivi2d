import crypto from "node:crypto";
import fs from "node:fs";
import { readSinglePackEntry } from "./lib/npm-pack-result.mjs";
import { run } from "./lib/repo.mjs";

const args = parseArgs(process.argv.slice(2));
const packResultPath = args["pack-result"];
const tarballPath = args.tarball;
const version = args.version;
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

function safeReadSinglePackEntry(file) {
  try {
    return readSinglePackEntry(file);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}
