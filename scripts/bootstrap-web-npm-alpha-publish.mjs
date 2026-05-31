import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readSinglePackEntry } from "./lib/npm-pack-result.mjs";
import { readJson } from "./lib/repo.mjs";

const packageName = "@vivi2d/web";
const bootstrapVersion = "0.1.0-alpha.0";
const confirmToken = "BOOTSTRAP_WEB_NPM_ALPHA_0.1.0-alpha.0";

console.error(
  [
    "[web-npm-alpha-bootstrap] disabled:",
    `${packageName}@${bootstrapVersion} has already been published through the one-time bootstrap path.`,
    "Use npm Trusted Publishing through .github/workflows/publish-web-alpha.yml for later versions.",
  ].join("\n"),
);
process.exit(1);

const args = parseArgs(process.argv.slice(2));
const packResult = args["pack-result"];
const tarball = args.tarball;
const version = args.version;
const dryRun = args["dry-run"] === true;
const confirm = args.confirm;
const failures = [];

if (!packResult) failures.push("--pack-result is required.");
if (!tarball) failures.push("--tarball is required.");
if (!version) failures.push("--version is required.");
if (version && version !== bootstrapVersion) {
  failures.push(
    `Bootstrap publish is allowed only for ${packageName}@${bootstrapVersion}.`,
  );
}
if (packResult && !fs.existsSync(packResult)) {
  failures.push(`Pack result does not exist: ${packResult}`);
}
if (tarball && !fs.existsSync(tarball)) {
  failures.push(`Tarball does not exist: ${tarball}`);
}
if (!dryRun && confirm !== confirmToken) {
  failures.push(`Non-dry-run bootstrap publish requires --confirm ${confirmToken}.`);
}
if (!dryRun && process.env.GITHUB_ACTIONS === "true") {
  failures.push("Bootstrap publish is local-only and must not run in GitHub Actions.");
}

const webPackage = readJson("packages/web/package.json");
if (webPackage.name !== packageName) {
  failures.push(`packages/web/package.json must remain ${packageName}.`);
}
if (webPackage.version !== bootstrapVersion) {
  failures.push(
    `packages/web/package.json version must be ${bootstrapVersion} for bootstrap.`,
  );
}

const packEntry =
  packResult && fs.existsSync(packResult) ? safeReadSinglePackEntry(packResult) : null;
if (packEntry) {
  if (packEntry.name !== packageName) {
    failures.push(`Pack result package ${packEntry.name} does not match ${packageName}.`);
  }
  if (packEntry.version !== bootstrapVersion) {
    failures.push(
      `Pack result version ${packEntry.version} does not match ${bootstrapVersion}.`,
    );
  }
  if (packEntry.filename !== tarball) {
    failures.push(`Tarball ${tarball} does not match pack result ${packEntry.filename}.`);
  }
}

if (failures.length === 0) {
  assertNpmCliVersion({ minNode: "22.14.0", minNpm: "11.5.1" });
  run("node", [
    "scripts/verify-web-npm-alpha-release-record.mjs",
    "--pack-result",
    packResult,
    "--tarball",
    tarball,
    "--version",
    version,
  ]);
  assertPackageDoesNotExist();
}

if (!dryRun && failures.length === 0) {
  assertNpmAuthenticated();
  assertNpmOrganizationAccessible();
}

if (failures.length > 0) {
  console.error("[web-npm-alpha-bootstrap] failed:");
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
  "--provenance=false",
];
if (dryRun) publishArgs.push("--dry-run");

run("npm", publishArgs, {
  env: {
    ...process.env,
    VIVI2D_VERIFIED_WEB_NPM_ALPHA_PUBLISH: "1",
    VIVI2D_WEB_NPM_BOOTSTRAP_PUBLISH: "1",
  },
  stdio: "inherit",
});

console.log(
  dryRun
    ? "[web-npm-alpha-bootstrap] dry-run passed"
    : "[web-npm-alpha-bootstrap] passed",
);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[rawKey] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[rawKey] = true;
      continue;
    }
    parsed[rawKey] = next;
    index += 1;
  }
  return parsed;
}

function assertPackageDoesNotExist() {
  const result = runNpm(
    ["view", `${packageName}@${bootstrapVersion}`, "version", "--json"],
    {
      allowFailure: true,
    },
  );
  if (result.status === 0 && result.stdout.trim()) {
    failures.push(
      `${packageName}@${bootstrapVersion} already exists. Use Trusted Publishing for later versions.`,
    );
    return;
  }
  const output = `${result.stderr}\n${result.stdout}`;
  if (/E404|404 Not Found|No match found/i.test(output)) return;
  failures.push(result.stderr || result.stdout || "npm view failed.");
}

function assertNpmCliVersion({ minNode, minNpm }) {
  if (compareVersions(process.versions.node, minNode) < 0) {
    failures.push(`Node ${process.versions.node} is below required ${minNode}.`);
  }
  const result = runNpm(["--version"], { allowFailure: true });
  if (result.status !== 0) {
    failures.push(result.stderr || result.stdout || "npm --version failed.");
    return;
  }
  const npmVersion = result.stdout.trim();
  if (compareVersions(npmVersion, minNpm) < 0) {
    failures.push(`npm ${npmVersion} is below required ${minNpm}.`);
  }
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

function assertNpmAuthenticated() {
  const result = runNpm(["whoami"], { allowFailure: true });
  if (result.status === 0 && result.stdout.trim()) return;
  failures.push("Non-dry-run bootstrap publish requires an npm login with 2FA enabled.");
}

function assertNpmOrganizationAccessible() {
  const result = runNpm(["org", "ls", "vivi2d", "--json"], { allowFailure: true });
  if (result.status === 0) return;
  failures.push(
    "Non-dry-run bootstrap publish requires access to the npm organization scope: vivi2d.",
  );
}

function run(command, commandArgs, options = {}) {
  const { executable, args: resolvedArgs } = resolveCommand(command, commandArgs);
  const result = spawnSync(executable, resolvedArgs, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    const detail =
      result.stderr || result.stdout || `${command} exited with ${result.status}`;
    console.error(detail.trim());
    process.exit(result.status ?? 1);
  }
  return result;
}

function runNpm(commandArgs, { allowFailure = false } = {}) {
  const { executable, args: resolvedArgs } = resolveCommand("npm", commandArgs);
  const result = spawnSync(executable, resolvedArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!allowFailure && result.status !== 0) {
    const detail = result.stderr || result.stdout || `npm exited with ${result.status}`;
    throw new Error(detail.trim());
  }
  return result;
}

function resolveCommand(command, commandArgs) {
  if (process.platform !== "win32" || command !== "npm") {
    return { executable: command, args: commandArgs };
  }
  const candidateNpmCliPaths = [
    process.env.npm_execpath ||
      path.join(
        path.dirname(process.execPath),
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      ),
  ];
  const fallbackNpmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  const normalizedCandidates = new Set(
    candidateNpmCliPaths
      .filter((candidate) => typeof candidate === "string")
      .map((candidate) => path.normalize(candidate).toLowerCase()),
  );
  if (!normalizedCandidates.has(path.normalize(fallbackNpmCli).toLowerCase())) {
    candidateNpmCliPaths.push(fallbackNpmCli);
  }
  const npmCli = candidateNpmCliPaths.find((candidate) => {
    return (
      typeof candidate === "string" &&
      candidate.endsWith(".js") &&
      isExistingFile(candidate)
    );
  });
  if (!npmCli) {
    console.error(
      [
        "Unable to locate npm CLI JavaScript entrypoint.",
        "Checked:",
        ...candidateNpmCliPaths.map((candidate) => `- ${candidate}`),
      ].join("\n"),
    );
    process.exit(1);
  }
  return {
    executable: process.execPath,
    args: [npmCli, ...commandArgs],
  };
}

function isExistingFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
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
