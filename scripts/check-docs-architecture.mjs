import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const PLANNING_DOC_PATTERNS = [
  /roadmap/i,
  /(?:^|-)plan\.md$/i,
  /implementation-plan\.md$/i,
  /(?:^|-)audit\.md$/i,
  /review-prompt/i,
];

const UNVERSIONED_API_DOCS = [
  "docs/developer/api/web-sdk.md",
  "docs/developer/api/viewer-api.md",
  "docs/developer/api/provider-sdk.md",
];

const REQUIRED_DEVELOPER_DOCS = [
  "docs/developer/contributing/task-guides/index.md",
  "docs/developer/contributing/task-guides/viewer-api.md",
  "docs/developer/contributing/task-guides/auto-setup.md",
  "docs/developer/contributing/task-guides/i18n.md",
  "docs/developer/contributing/task-guides/sdk-samples.md",
  "docs/developer/contributing/pr-recipes.md",
  "docs/developer/contributing/troubleshooting.md",
  "docs/developer/architecture/system-map.md",
  "docs/developer/architecture/user-docs-site.md",
  "docs/developer/architecture/user-docs-content-production.md",
  "docs/developer/architecture/user-docs-media-production.md",
  "docs/developer/adr/0005-documentation-contributor-guides.md",
  "docs/developer/adr/0006-public-surface-review-gates.md",
];

const DEVELOPER_INDEX_LINKS = [
  "contributing/task-guides/",
  "contributing/pr-recipes.md",
  "contributing/troubleshooting.md",
  "architecture/system-map.md",
  "architecture/user-docs-site.md",
  "architecture/user-docs-content-production.md",
  "architecture/user-docs-media-production.md",
  "adr/0005-documentation-contributor-guides.md",
  "adr/0006-public-surface-review-gates.md",
];

const USER_JSON_ALLOWLIST = [
  /^docs\/user\/publication-manifest\.json$/,
  /^docs\/user\/review-ownership\.json$/,
  /^docs\/user\/assets\/.+\/manifest\.json$/,
  /^docs\/user\/assets\/.+\/captions\.json$/,
  /^docs\/user\/assets\/.+\/transcripts\.json$/,
];

function fail(message) {
  failures.push(message);
}

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

function listRepoFiles() {
  return runGit(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function isTextFile(relativePath) {
  return /\.(?:cjs|css|html|js|json|md|mjs|ts|tsx|txt|ya?ml)$/.test(relativePath);
}

const repoFiles = listRepoFiles();
const repoFileSet = new Set(repoFiles);

function readJsonFile(relativePath) {
  return JSON.parse(readText(relativePath));
}

function parseCodeowners(text) {
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    entries.push({ owners, pattern });
  }
  return entries;
}

function codeownersHasPattern(entries, pattern) {
  return entries.some((entry) => entry.pattern === pattern);
}

function codeownersLastMatch(entries, patterns) {
  let match = null;
  for (const entry of entries) {
    if (patterns.includes(entry.pattern)) match = entry;
  }
  return match;
}

function gitShowText(ref, relativePath) {
  const result = spawnSync("git", ["show", `${ref}:${relativePath}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout : null;
}

function hasReviewedUserDocsContent() {
  for (const file of repoFiles) {
    if (
      file.startsWith("docs/user/en/") ||
      !file.startsWith("docs/user/") ||
      !file.endsWith(".md") ||
      !exists(file)
    ) {
      continue;
    }
    if (/^status:\s*["']?reviewed["']?\s*$/m.test(readText(file))) return true;
  }
  for (const file of repoFiles) {
    if (!file.startsWith("docs/user/assets/") || !file.endsWith("manifest.json")) {
      continue;
    }
    if (exists(file) && /"status"\s*:\s*"reviewed"/.test(readText(file))) return true;
  }
  return false;
}

function validateReviewOwnershipCoverage(entries, context) {
  const requiredPatterns = [
    "/docs/user/ja/",
    "/docs/user/zh-Hans/",
    "/docs/user/ko-KR/",
    "/docs/user/assets/",
    "/docs/user/review-ownership.json",
  ];
  for (const pattern of requiredPatterns) {
    if (!codeownersHasPattern(entries, pattern)) {
      fail(`${context}: CODEOWNERS must explicitly cover ${pattern}.`);
    }
  }
  const lastMatch = codeownersLastMatch(entries, [
    "/docs/user/",
    "/docs/user/review-ownership.json",
  ]);
  if (!lastMatch || lastMatch.pattern !== "/docs/user/review-ownership.json") {
    fail(
      `${context}: /docs/user/review-ownership.json must appear after broader docs/user rules because GitHub uses last-match-wins.`,
    );
    return [];
  }
  return lastMatch.owners;
}

for (const file of REQUIRED_DEVELOPER_DOCS) {
  if (!exists(file)) fail(`Missing required developer doc: ${file}`);
}

if (exists("docs/developer/index.md")) {
  const index = readText("docs/developer/index.md");
  for (const link of DEVELOPER_INDEX_LINKS) {
    if (!index.includes(link)) {
      fail(`docs/developer/index.md should link ${link}`);
    }
  }
}

const trackedBacklog = runGit(["ls-files", "docs/backlog"]).trim();
if (trackedBacklog) {
  fail("docs/backlog/ contains tracked files; backlog must remain ignored.");
}

for (const file of repoFiles) {
  if (!file.startsWith("docs/") || file.startsWith("docs/backlog/")) continue;
  const base = path.basename(file);
  if (PLANNING_DOC_PATTERNS.some((pattern) => pattern.test(base))) {
    fail(
      `Tracked planning/backlog-style doc is not allowed outside docs/backlog/: ${file}`,
    );
  }
}

for (const file of repoFiles) {
  if (!file.startsWith("docs/developer/adr/") || !file.endsWith(".md")) continue;
  const text = readText(file);
  if (/^#{1,3}\s*Phase\s+\d+/im.test(text) || /\bonce implemented\b/i.test(text)) {
    fail(`${file}: ADRs must record decisions, not implementation roadmaps.`);
  }
}

const manifestPath = "docs/developer/quality/docs-migration-manifest.json";
if (!exists(manifestPath)) {
  fail(`${manifestPath} is missing.`);
} else {
  const manifest = JSON.parse(readText(manifestPath));
  const entries = manifest.archivedFiles;
  if (!Array.isArray(entries) || entries.length === 0) {
    fail(`${manifestPath} must contain a non-empty archivedFiles array.`);
  } else {
    const seenSources = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        fail(`${manifestPath} contains a non-object archivedFiles entry.`);
        continue;
      }
      if (typeof entry.source !== "string" || entry.source.length === 0) {
        fail(`${manifestPath} entry is missing source.`);
        continue;
      }
      if (seenSources.has(entry.source)) {
        fail(`${manifestPath} contains duplicate source entry: ${entry.source}`);
      }
      seenSources.add(entry.source);
      if (repoFileSet.has(entry.source)) {
        fail(`Archived source is still tracked: ${entry.source}`);
      }
      if (
        typeof entry.archivedToIgnoredBacklog !== "string" ||
        !entry.archivedToIgnoredBacklog.startsWith("docs/backlog/")
      ) {
        fail(`${entry.source}: archivedToIgnoredBacklog must point under docs/backlog/.`);
      }
      const promotedTargets = Array.isArray(entry.promotedTargets)
        ? entry.promotedTargets
        : [];
      const droppedSections = Array.isArray(entry.droppedSections)
        ? entry.droppedSections
        : [];
      if (promotedTargets.length === 0 && droppedSections.length === 0) {
        fail(`${entry.source}: must have promoted targets or explicit dropped sections.`);
      }
      for (const target of promotedTargets) {
        if (typeof target !== "string" || !exists(target)) {
          fail(`${entry.source}: promoted target does not exist: ${target}`);
        }
      }
      for (const dropped of droppedSections) {
        if (!dropped?.section || !dropped?.reason) {
          fail(`${entry.source}: dropped sections need section and reason.`);
        }
      }
      if (!entry.reviewedBy || !entry.reviewDate) {
        fail(`${entry.source}: reviewedBy and reviewDate are required.`);
      }
    }

    for (const source of seenSources) {
      for (const file of repoFiles) {
        if (file === manifestPath || !isTextFile(file) || !exists(file)) continue;
        if (readText(file).includes(source)) {
          fail(`${file} still references archived source path ${source}.`);
        }
      }
    }
  }
}

for (const file of UNVERSIONED_API_DOCS) {
  if (!exists(file)) {
    fail(`Missing API doc: ${file}`);
    continue;
  }
  if (/^stability:\s*stable\s*$/m.test(readText(file))) {
    fail(`${file} must be renamed to an explicit *-v1.md before becoming stable.`);
  }
}

if (!exists(".github/CODEOWNERS")) {
  fail(".github/CODEOWNERS is missing.");
} else {
  const codeowners = readText(".github/CODEOWNERS");
  const codeownersEntries = parseCodeowners(codeowners);
  const reviewOwnershipOwners = validateReviewOwnershipCoverage(
    codeownersEntries,
    ".github/CODEOWNERS",
  );
  if (!exists(".github/docs-maintainers.json")) {
    fail(".github/docs-maintainers.json is missing.");
  } else {
    const maintainers = readJsonFile(".github/docs-maintainers.json");
    const allowedOwners = new Set(maintainers.reviewOwnershipOwners ?? []);
    if (allowedOwners.size === 0) {
      fail(".github/docs-maintainers.json must list reviewOwnershipOwners.");
    }
    for (const owner of reviewOwnershipOwners) {
      if (!allowedOwners.has(owner)) {
        fail(
          `/docs/user/review-ownership.json CODEOWNER ${owner} is not listed in .github/docs-maintainers.json.`,
        );
      }
    }
  }
  const baseRef = process.env.DOCS_REVIEW_OWNERSHIP_BASE_REF;
  if (baseRef && hasReviewedUserDocsContent()) {
    const baseCodeowners = gitShowText(baseRef, ".github/CODEOWNERS");
    const baseReviewOwnership = gitShowText(baseRef, "docs/user/review-ownership.json");
    if (baseCodeowners === null) {
      fail(
        `Reviewed user docs require pre-existing CODEOWNERS on ${baseRef}; .github/CODEOWNERS was not found there.`,
      );
    } else {
      validateReviewOwnershipCoverage(
        parseCodeowners(baseCodeowners),
        `.github/CODEOWNERS at ${baseRef}`,
      );
    }
    if (baseReviewOwnership === null) {
      fail(
        `Reviewed user docs require pre-existing docs/user/review-ownership.json on ${baseRef}.`,
      );
    }
  }
}

for (const file of repoFiles) {
  if (!file.startsWith("docs/user/") || !file.endsWith(".json")) continue;
  if (!USER_JSON_ALLOWLIST.some((pattern) => pattern.test(file))) {
    fail(`Unregistered user-doc JSON metadata surface: ${file}`);
  }
}

if (failures.length > 0) {
  console.error("[docs-architecture] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[docs-architecture] passed");
