import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  failures.push(message);
}

const readme = readText("README.md");
const security = readText("SECURITY.md");

const currentReleaseMatch =
  /The current public release is `(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`/.exec(readme);

if (!currentReleaseMatch) {
  fail("README.md must identify the current public release tag in semver form.");
}

function hasSupportedRow(version, supported) {
  const pattern = new RegExp(
    `^\\|\\s*\`${escapeRegExp(version)}\`\\s*\\|\\s*${escapeRegExp(supported)}\\s*\\|\\s*$`,
    "m",
  );
  return pattern.test(security);
}

function hasPlainSupportedRow(version, supported) {
  const pattern = new RegExp(
    `^\\|\\s*${escapeRegExp(version)}\\s*\\|\\s*${escapeRegExp(supported)}\\s*\\|\\s*$`,
    "m",
  );
  return pattern.test(security);
}

if (!hasSupportedRow("main", "Yes")) {
  fail("SECURITY.md must list `main` as supported.");
}

if (currentReleaseMatch && !hasSupportedRow(currentReleaseMatch[1], "Yes")) {
  fail(
    `SECURITY.md must list the current public release ${currentReleaseMatch[1]} as supported.`,
  );
}

if (!hasPlainSupportedRow("Local snapshots and older commits", "No")) {
  fail("SECURITY.md must keep local snapshots and older commits outside support.");
}

if (failures.length > 0) {
  console.error("[security-supported-versions] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[security-supported-versions] passed");
