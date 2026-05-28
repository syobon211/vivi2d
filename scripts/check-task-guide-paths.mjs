import { exists, gitLsFilesIncludingUntracked, readText } from "./lib/repo.mjs";

const GUIDE_DIR = "docs/developer/contributing/task-guides";
const failures = [];

const repoFiles = gitLsFilesIncludingUntracked().map((file) =>
  file.replaceAll("\\", "/"),
);

for (const guide of repoFiles.filter(
  (file) =>
    file.startsWith(`${GUIDE_DIR}/`) &&
    file.endsWith(".md") &&
    !file.endsWith("/index.md"),
)) {
  const text = readText(guide);
  const section = extractSection(text, "Primary Files");
  if (!section) {
    failures.push(`${guide}: missing "Primary Files" section.`);
    continue;
  }
  const entries = extractCodeSpanBullets(section);
  if (entries.length === 0) {
    failures.push(`${guide}: "Primary Files" must list repository paths.`);
    continue;
  }
  for (const entry of entries) {
    if (entry.startsWith("npm run ")) continue;
    if (!matchesRepoPath(entry)) {
      failures.push(`${guide}: Primary Files entry does not match repo paths: ${entry}`);
    }
  }
}

if (failures.length > 0) {
  console.error("[task-guide-paths] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[task-guide-paths] passed");

function extractSection(text, heading) {
  const match = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m").exec(text);
  if (!match) return "";
  const start = match.index + match[0].length;
  const next = /^##\s+/m.exec(text.slice(start));
  return next ? text.slice(start, start + next.index) : text.slice(start);
}

function extractCodeSpanBullets(section) {
  const entries = [];
  for (const line of section.split(/\r?\n/)) {
    const match = /^\s*-\s+`([^`]+)`/.exec(line);
    if (match) entries.push(match[1].replaceAll("\\", "/"));
  }
  return entries;
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
