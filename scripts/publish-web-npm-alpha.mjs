import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

assertHostedPublishContext({ dryRun, version });

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

function assertHostedPublishContext({ dryRun, version }) {
  if (dryRun) return;

  const expectedRef = `refs/tags/web-v${version}`;
  const contextFailures = [];
  if (process.env.GITHUB_ACTIONS !== "true") {
    contextFailures.push("non-dry-run publish must run in GitHub Actions.");
  }
  if (process.env.GITHUB_REPOSITORY !== "syobon211/vivi2d") {
    contextFailures.push("non-dry-run publish must run in syobon211/vivi2d.");
  }
  if (process.env.GITHUB_REF_TYPE !== "tag") {
    contextFailures.push("non-dry-run publish must run from a tag ref.");
  }
  if (process.env.GITHUB_REF !== expectedRef) {
    contextFailures.push(`non-dry-run publish must run from ${expectedRef}.`);
  }
  if (
    !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ||
    !process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  ) {
    contextFailures.push(
      "non-dry-run publish requires GitHub Actions OIDC token availability.",
    );
  }
  if (contextFailures.length === 0) return;

  console.error("[web-npm-alpha-publish] hosted publish context check failed:");
  for (const failure of contextFailures) console.error(`- ${failure}`);
  process.exit(1);
}

function resolveCommand(command, commandArgs) {
  if (process.platform !== "win32" || command !== "npm") {
    return { executable: command, args: commandArgs };
  }
  // Windows resolves npm through shell shims; run the JS entrypoint directly.
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
        "Unable to locate npm CLI JavaScript entrypoint for Windows publish dry-run.",
        "Checked:",
        ...candidateNpmCliPaths.map((candidate) => `- ${candidate}`),
        "Run this command from an npm-managed Node.js installation or ensure npm-cli.js is available.",
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
