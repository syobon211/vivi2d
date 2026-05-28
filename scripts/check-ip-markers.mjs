import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);
const ZUNDAMON_MARKER_PATTERN =
  /zundamon|zunmon|zunda|\u305a\u3093\u3060|\u7e3a\u58f9\uff53/i;
const THIRD_PARTY_STANDARD_PATTERN =
  /Live2D(?:\u6a19\u6e96| standard|\u5f62\u5f0f|\u3067\u3088\u304f\u4f7f\u308f\u308c\u308b)|Live2D standard/i;

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function shouldScan(relativePath) {
  if (
    relativePath === "scripts/check-ip-markers.mjs" ||
    relativePath === "scripts/check-pack-contents.mjs" ||
    relativePath === "scripts/check-publication-history.mjs" ||
    relativePath === "scripts/check-release-surface.mjs"
  )
    return false;
  if (relativePath.startsWith("docs/backlog/")) return false;
  if (relativePath.startsWith("dist/")) return false;
  if (relativePath.startsWith("coverage/")) return false;
  if (relativePath.includes("__pycache__")) return false;
  return TEXT_EXTENSIONS.has(path.extname(relativePath));
}

const tracked = runGit(["ls-files", "--cached", "--others", "--exclude-standard"])
  .split(/\r?\n/)
  .filter(Boolean);
for (const relativePath of tracked) {
  if (!shouldScan(relativePath)) continue;
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;

  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (ZUNDAMON_MARKER_PATTERN.test(lines[index])) {
      failures.push(`${relativePath}:${index + 1}: Zundamon/local character marker`);
    }
    if (THIRD_PARTY_STANDARD_PATTERN.test(lines[index])) {
      failures.push(
        `${relativePath}:${index + 1}: third-party product standard-parameter phrasing`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("[ip-markers] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[ip-markers] passed");
