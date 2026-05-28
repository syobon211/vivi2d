import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const contractPath = "scripts/internal-contracts/clean-room-coverage.contract.json";
const contract = readJson(contractPath);
const failures = [];

const TEXT_EXTENSIONS = new Set([".c", ".cpp", ".h", ".hpp", ".js", ".mjs", ".ts", ".tsx"]);
const SOURCE_PREFIXES = ["electron/", "packages/", "scripts/", "src/", "e2e/"];
const PUBLICATION_BLOCKING_STATUSES = new Set(["researchOnly", "privateRepoOnly", "blocked"]);
const ALLOWED_STATUSES = new Set([
  "researchOnly",
  "privateRepoOnly",
  "internalOnly",
  "publicOssAllowed",
  "blocked",
]);

assertContract(contract);

const files = listRepoFiles();
for (const algorithm of contract.algorithms) {
  const allowedPrefixes = new Set(algorithm.allowedTrackedSourcePrefixes);
  for (const pattern of algorithm.requiredAbsentPatterns) {
    for (const relativePath of files) {
      if (!isSourceTextFile(relativePath)) continue;
      if (isAllowedPath(relativePath, allowedPrefixes)) continue;
      const absolutePath = path.join(root, relativePath);
      if (!fs.existsSync(absolutePath)) continue;
      const text = fs.readFileSync(absolutePath, "utf8");
      if (text.includes(pattern)) {
        failures.push(
          `${relativePath}: ${algorithm.id} is ${algorithm.status}, but found tracked implementation marker ${pattern}`,
        );
      }
    }
  }

  if (
    PUBLICATION_BLOCKING_STATUSES.has(algorithm.status) &&
    algorithm.allowedTrackedSourcePrefixes.length > 0
  ) {
    failures.push(
      `${algorithm.id}: ${algorithm.status} algorithms cannot list tracked public-source implementation paths`,
    );
  }
}

if (failures.length > 0) {
  console.error("[clean-room-coverage] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[clean-room-coverage] passed");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assertContract(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1) {
    throw new Error(`${contractPath} schemaVersion must be 1`);
  }
  if (!Array.isArray(value.algorithms) || value.algorithms.length === 0) {
    throw new Error(`${contractPath} must define at least one algorithm`);
  }
  const ids = new Set();
  for (const algorithm of value.algorithms) {
    assertString(algorithm.id, "algorithm.id");
    if (ids.has(algorithm.id)) {
      throw new Error(`${contractPath} contains duplicate algorithm id ${algorithm.id}`);
    }
    ids.add(algorithm.id);
    assertString(algorithm.status, `${algorithm.id}.status`);
    if (!ALLOWED_STATUSES.has(algorithm.status)) {
      throw new Error(`${algorithm.id}.status is unsupported: ${algorithm.status}`);
    }
    assertString(algorithm.trackedSourcePolicy, `${algorithm.id}.trackedSourcePolicy`);
    assertStringList(
      algorithm.allowedTrackedSourcePrefixes,
      `${algorithm.id}.allowedTrackedSourcePrefixes`,
    );
    assertStringList(algorithm.requiredAbsentPatterns, `${algorithm.id}.requiredAbsentPatterns`);
    assertString(algorithm.notes, `${algorithm.id}.notes`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${contractPath} ${label} must be a non-empty string`);
  }
}

function assertStringList(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${contractPath} ${label} must be a string[]`);
  }
}

function listRepoFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "git ls-files failed");
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function isSourceTextFile(relativePath) {
  return (
    SOURCE_PREFIXES.some((prefix) => relativePath.startsWith(prefix)) &&
    TEXT_EXTENSIONS.has(path.extname(relativePath))
  );
}

function isAllowedPath(relativePath, allowedPrefixes) {
  for (const allowedPrefix of allowedPrefixes) {
    if (relativePath === allowedPrefix || relativePath.startsWith(`${allowedPrefix}/`)) {
      return true;
    }
  }
  return false;
}
