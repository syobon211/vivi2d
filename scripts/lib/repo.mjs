import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export function resolveRepoPath(relativePath = ".") {
  return path.join(repoRoot, relativePath);
}

export function readText(relativePath) {
  return fs.readFileSync(resolveRepoPath(relativePath), "utf8");
}

export function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function exists(relativePath) {
  return fs.existsSync(resolveRepoPath(relativePath));
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    const detail =
      result.stderr || result.stdout || `${command} exited with ${result.status}`;
    throw new Error(detail.trim());
  }
  return result;
}

export function gitLsFiles(args = []) {
  return run("git", ["ls-files", ...args])
    .stdout.split(/\r?\n/)
    .filter(Boolean);
}

export function gitLsFilesIncludingUntracked(args = []) {
  const tracked = gitLsFiles(args);
  const untracked = run("git", [
    "ls-files",
    "--others",
    "--exclude-standard",
    ...args,
  ])
    .stdout.split(/\r?\n/)
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort((a, b) =>
    a.localeCompare(b),
  );
}
