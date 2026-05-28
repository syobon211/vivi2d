import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const base = argValue("--base", "HEAD^");
const head = argValue("--head", "HEAD");

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

function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
  if (!match) return { frontmatter: "", body: normalized.trim() };
  return { frontmatter: match[1].trim(), body: match[2].trim() };
}

function printMarkdown(file) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const { frontmatter, body } = parseFrontmatter(text);
  console.log(`\n## ${file}`);
  if (frontmatter) {
    console.log("\n### frontmatter");
    console.log(frontmatter);
  }
  if (body) {
    console.log("\n### body");
    console.log(body);
  }
}

function printJson(file) {
  console.log(`\n## ${file}`);
  console.log(fs.readFileSync(path.join(root, file), "utf8").trim());
}

const diffArgs =
  head === "WORKTREE"
    ? ["diff", "--name-only", base, "--", "docs/user"]
    : ["diff", "--name-only", base, head, "--", "docs/user"];

const changedFiles = runGit(diffArgs)
  .split(/\r?\n/)
  .filter(Boolean)
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => fs.existsSync(path.join(root, file)))
  .sort();

for (const file of changedFiles) {
  if (file.endsWith(".md")) {
    printMarkdown(file);
  } else if (file.endsWith(".json")) {
    printJson(file);
  }
}
