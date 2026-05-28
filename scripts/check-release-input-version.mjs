import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readJson, repoRoot } from "./lib/repo.mjs";

const args = parseArgs(process.argv.slice(2));
const failures = [];
const workspaceName = args.workspace;
const expectedVersion = args.version;
const distTag = args["dist-tag"];

if (!workspaceName) failures.push("--workspace is required.");
if (!expectedVersion) failures.push("--version is required.");
if (distTag !== "alpha") failures.push("--dist-tag must be alpha.");
if (expectedVersion && !/^\d+\.\d+\.\d+-alpha\.\d+$/.test(expectedVersion)) {
  failures.push(`Release version must be an alpha prerelease, found ${expectedVersion}.`);
}

const workspace = workspaceName ? findWorkspacePackage(workspaceName) : null;
if (!workspace) {
  failures.push(`Could not find workspace package ${workspaceName}.`);
} else if (workspace.pkg.version !== expectedVersion) {
  failures.push(
    `${workspaceName} package.json version ${workspace.pkg.version} does not match ${expectedVersion}.`,
  );
}

if (workspaceName && expectedVersion && isPublished(workspaceName, expectedVersion)) {
  failures.push(
    `${workspaceName}@${expectedVersion} is already present in the npm registry.`,
  );
}

if (failures.length > 0) {
  console.error("[release-input-version] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[release-input-version] passed");

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

function findWorkspacePackage(name) {
  const rootPackage = readJson("package.json");
  for (const pattern of rootPackage.workspaces ?? []) {
    if (!pattern.endsWith("/*")) continue;
    const workspaceRoot = path.join(repoRoot, pattern.slice(0, -2));
    for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packagePath = path.join(workspaceRoot, entry.name, "package.json");
      if (!fs.existsSync(packagePath)) continue;
      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      if (pkg.name === name) return { packagePath, pkg };
    }
  }
  return null;
}

function isPublished(name, version) {
  const result = spawnNpm(["view", `${name}@${version}`, "version", "--json"]);
  if (result.status === 0 && result.stdout.trim()) return true;
  if (result.error) throw result.error;
  const output = `${result.stderr}\n${result.stdout}`;
  if (/E404|404 Not Found|No match found/i.test(output)) return false;
  throw new Error(result.stderr || result.stdout || "npm view failed");
}

function spawnNpm(args) {
  if (process.platform !== "win32") {
    return spawnSync("npm", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  const command = ["npm", ...args].map(quoteCmdArg).join(" ");
  return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function quoteCmdArg(value) {
  if (/^[A-Za-z0-9@/:._-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
