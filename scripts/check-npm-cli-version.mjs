import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const minNode = args["min-node"];
const minNpm = args["min-npm"];
const failures = [];

if (!minNode) failures.push("--min-node is required.");
if (!minNpm) failures.push("--min-npm is required.");

if (minNode && compareVersions(process.versions.node, minNode) < 0) {
  failures.push(`Node ${process.versions.node} is below required ${minNode}.`);
}

if (minNpm) {
  const npmVersion = runNpmVersion();
  if (compareVersions(npmVersion, minNpm) < 0) {
    failures.push(`npm ${npmVersion} is below required ${minNpm}.`);
  }
}

if (failures.length > 0) {
  console.error("[npm-cli-version] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[npm-cli-version] passed");

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

function runNpmVersion() {
  const result = spawnSync("npm", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || "npm --version failed");
  }
  return result.stdout.trim();
}

function compareVersions(actual, expected) {
  const actualParts = parseVersion(actual);
  const expectedParts = parseVersion(expected);
  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index] > expectedParts[index]) return 1;
    if (actualParts[index] < expectedParts[index]) return -1;
  }
  return 0;
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value));
  if (!match) throw new Error(`Invalid semver version: ${value}`);
  return match.slice(1).map((part) => Number(part));
}
