import { exists, gitLsFilesIncludingUntracked, readJson, readText } from "./lib/repo.mjs";

const FILE = "docs/developer/contributing/pr-recipes.md";
const failures = [];
const packageScripts = readJson("package.json").scripts ?? {};
const repoFiles = gitLsFilesIncludingUntracked().map((file) =>
  file.replaceAll("\\", "/"),
);

const text = readText(FILE);

for (const script of extractNpmScripts(text)) {
  if (!packageScripts[script]) {
    failures.push(`${FILE}: unknown npm script: ${script}`);
  }
}

for (const entry of extractPathCodeSpans(text)) {
  if (!matchesRepoPath(entry)) {
    failures.push(`${FILE}: referenced path or glob does not match repo paths: ${entry}`);
  }
}

if (failures.length > 0) {
  console.error("[pr-recipe-gates] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[pr-recipe-gates] passed");

function extractNpmScripts(value) {
  return [
    ...new Set(
      [...value.matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g)].map((match) => match[1]),
    ),
  ];
}

function extractPathCodeSpans(value) {
  return [
    ...new Set(
      [...value.matchAll(/`([^`]+)`/g)]
        .map((match) => match[1].replaceAll("\\", "/"))
        .filter((entry) => /^(?:src|docs|examples|packages|scripts|e2e)\//.test(entry)),
    ),
  ];
}

function matchesRepoPath(pattern) {
  if (pattern.includes("*")) {
    const regex = globToRegex(pattern);
    return repoFiles.some((file) => regex.test(file));
  }
  if (exists(pattern)) return true;
  const normalized = pattern.endsWith("/") ? pattern : `${pattern}/`;
  return repoFiles.some((file) => file.startsWith(normalized));
}

function globToRegex(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
