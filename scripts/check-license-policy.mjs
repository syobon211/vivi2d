import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

const ALLOWED_PRODUCTION_LICENSES = new Set([
  "(MIT AND Zlib)",
  "(MIT OR CC0-1.0)",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "MIT",
  "Unlicense",
  "Zlib",
]);

const PROHIBITED_LICENSE_PATTERN =
  /\b(?:AGPL|BUSL|Commercial|GPL|LGPL|Proprietary|SSPL)\b/i;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isWorkspaceLink(packageInfo) {
  return packageInfo.link === true || packageInfo.resolved?.startsWith("packages/");
}

function checkWorkspacePackage(relativePath) {
  const pkg = readJson(relativePath);
  const packageName = pkg.name ?? relativePath;

  if (pkg.private === true) {
    return;
  }

  if (pkg.license !== "Apache-2.0") {
    fail(`${packageName} must use Apache-2.0 before publication.`);
  }
  if (!pkg.files?.includes("dist")) {
    fail(`${packageName} must publish only reviewed dist artifacts.`);
  }
}

function checkPackageLock() {
  const lock = readJson("package-lock.json");
  for (const [packagePath, packageInfo] of Object.entries(lock.packages ?? {})) {
    if (!packagePath.startsWith("node_modules/")) continue;
    if (packageInfo.dev) continue;
    if (isWorkspaceLink(packageInfo)) continue;

    const packageName = packagePath.replace(/^node_modules\//, "");
    const license = packageInfo.license;
    if (typeof license !== "string" || license.length === 0) {
      fail(`${packageName} is missing production dependency license metadata.`);
      continue;
    }
    if (PROHIBITED_LICENSE_PATTERN.test(license)) {
      fail(`${packageName} has prohibited production license expression: ${license}`);
      continue;
    }
    if (!ALLOWED_PRODUCTION_LICENSES.has(license)) {
      warn(`${packageName} uses unreviewed production license expression: ${license}`);
    }
  }
}

function checkReleaseNoticePlaceholders() {
  if (!fileExists("THIRD_PARTY_NOTICES")) {
    fail("THIRD_PARTY_NOTICES is required before public release planning.");
    return;
  }
  const notices = readText("THIRD_PARTY_NOTICES");
  for (const needle of [
    "Generated from package-lock.json",
    "SBOM",
    "provenance",
    "External provider plugins are not bundled",
  ]) {
    if (!notices.includes(needle)) {
      fail(`THIRD_PARTY_NOTICES must mention ${needle}.`);
    }
  }
}

for (const relativePath of [
  "packages/provider-comfyui/package.json",
  "packages/core/package.json",
  "packages/editor-core/package.json",
  "packages/loader/package.json",
  "packages/provider-sdk/package.json",
  "packages/renderer-phaser/package.json",
  "packages/renderer-pixi/package.json",
  "packages/renderer-three/package.json",
  "packages/viewer/package.json",
  "packages/web/package.json",
]) {
  checkWorkspacePackage(relativePath);
}

checkPackageLock();
checkReleaseNoticePlaceholders();

for (const message of warnings) {
  console.warn(`[license-policy] warning: ${message}`);
}

if (failures.length > 0) {
  console.error("[license-policy] failed:");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("[license-policy] passed");
