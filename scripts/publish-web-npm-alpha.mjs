import { spawnSync } from "node:child_process";
import fs from "node:fs";

const args = parseArgs(process.argv.slice(2));
const packResult = args["pack-result"];
const tarball = args.tarball;
const version = args.version;
const dryRun = args["dry-run"] === true;
const failures = [];

if (!packResult) failures.push("--pack-result is required.");
if (!tarball) failures.push("--tarball is required.");
if (!version) failures.push("--version is required.");
if (version && !/^\d+\.\d+\.\d+-alpha\.\d+$/.test(version)) {
  failures.push("--version must be an alpha prerelease.");
}
if (packResult && !fs.existsSync(packResult)) {
  failures.push(`Pack result does not exist: ${packResult}`);
}
if (tarball && !fs.existsSync(tarball)) {
  failures.push(`Tarball does not exist: ${tarball}`);
}

if (failures.length === 0) {
  run("node", [
    "scripts/verify-web-npm-alpha-release-record.mjs",
    "--pack-result",
    packResult,
    "--tarball",
    tarball,
    "--version",
    version,
  ]);
}

if (failures.length > 0) {
  console.error("[web-npm-alpha-publish] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const publishArgs = [
  "publish",
  tarball,
  "--access",
  "public",
  "--tag",
  "alpha",
  "--provenance",
];
if (dryRun) publishArgs.push("--dry-run");

run("npm", publishArgs, {
  env: {
    ...process.env,
    VIVI2D_VERIFIED_WEB_NPM_ALPHA_PUBLISH: "1",
  },
  stdio: "inherit",
});

console.log(
  dryRun ? "[web-npm-alpha-publish] dry-run passed" : "[web-npm-alpha-publish] passed",
);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    ...options,
  });
  if (result.status !== 0) {
    const detail =
      result.stderr || result.stdout || `${command} exited with ${result.status}`;
    console.error(detail.trim());
    process.exit(result.status ?? 1);
  }
  return result;
}
