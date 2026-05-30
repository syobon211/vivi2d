import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const checklistPath = path.join(
  root,
  "docs/developer/quality/public-release-checklist.md",
);
const workflowsDir = path.join(root, ".github/workflows");

const ALLOWED_ARTIFACT_PATHS = new Set([
  "coverage/",
  "*.tgz",
  "dist/sbom/",
  "playwright-report/",
  "test-results/",
  "transcripts/",
  "tmp/github-release-assets/",
  "tmp/windows-installer-baseline/",
  "tmp/windows-installer-alpha-assets/",
  "web-npm-alpha-release-record.json",
  "web-pack-result.json",
]);

const ALLOWED_ARTIFACT_NAME_PREFIXES = [
  "coverage-",
  "github-release-alpha-assets",
  "perf-playwright-",
  "playwright-report-",
  "web-npm-alpha-release-record",
  "windows-installer-alpha-assets",
  "windows-installer-alpha-baseline",
];

function fail(message) {
  failures.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function checkChecklist() {
  if (!fs.existsSync(checklistPath)) {
    fail("docs/developer/quality/public-release-checklist.md is missing.");
    return;
  }
  const text = readText("docs/developer/quality/public-release-checklist.md");
  for (const pattern of [
    /Full git history scanned/i,
    /Actions logs, workflow summaries, and retained artifacts reviewed/i,
    /Hosted-surface findings remediated/i,
    /workflow artifacts do not include private paths/i,
    /provider payloads/i,
    /synthetic public fixtures/i,
    /gitleaks/i,
  ]) {
    if (!pattern.test(text)) {
      fail(`public release checklist is missing hosted-surface item ${pattern}.`);
    }
  }
}

function checkWorkflowArtifactRetention() {
  if (!fs.existsSync(workflowsDir)) {
    fail(".github/workflows is missing.");
    return;
  }
  for (const entry of fs.readdirSync(workflowsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const relativePath = `.github/workflows/${entry.name}`;
    const lines = readText(relativePath).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!/actions\/upload-artifact@/i.test(lines[index])) continue;
      const windowText = lines.slice(index, index + 14).join("\n");
      const match = /retention-days:\s*(\d+)/i.exec(windowText);
      if (!match) {
        fail(`${relativePath}:${index + 1} upload-artifact must set retention-days.`);
        continue;
      }
      const retentionDays = Number(match[1]);
      if (!Number.isInteger(retentionDays) || retentionDays <= 0 || retentionDays > 14) {
        fail(
          `${relativePath}:${index + 1} upload-artifact retention-days must be 1..14.`,
        );
      }
      validateArtifactName(relativePath, index + 1, windowText);
      const artifactPaths = validateArtifactPaths(relativePath, index + 1, windowText);
      validateArtifactPreflight(relativePath, index + 1, lines, index, artifactPaths);
    }
  }
}

function validateArtifactName(relativePath, lineNumber, windowText) {
  const match = /^\s*name:\s*([^\n]+)$/im.exec(windowText);
  if (!match) {
    fail(`${relativePath}:${lineNumber} upload-artifact must set a stable name.`);
    return;
  }
  const name = match[1].trim().replace(/^["']|["']$/g, "");
  if (!ALLOWED_ARTIFACT_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    fail(
      `${relativePath}:${lineNumber} upload-artifact name is not allowlisted: ${name}`,
    );
  }
}

function validateArtifactPaths(relativePath, lineNumber, windowText) {
  const pathMatch =
    /^\s*path:\s*(?:\|\s*\n(?<block>(?:\s{12,}.+\n?)+)|(?<inline>[^\n]+))$/im.exec(
      windowText,
    );
  if (!pathMatch) {
    fail(`${relativePath}:${lineNumber} upload-artifact must declare path.`);
    return [];
  }

  const paths = pathMatch.groups?.inline
    ? [pathMatch.groups.inline.trim()]
    : (pathMatch.groups?.block ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

  if (paths.length === 0) {
    fail(`${relativePath}:${lineNumber} upload-artifact must declare at least one path.`);
  }

  const normalizedPaths = [];
  for (const artifactPath of paths) {
    const normalized = artifactPath.replaceAll("\\", "/").replace(/^\.\//, "");
    normalizedPaths.push(normalized);
    if (!ALLOWED_ARTIFACT_PATHS.has(normalized)) {
      fail(
        `${relativePath}:${lineNumber} upload-artifact path is not public-safe allowlisted: ${artifactPath}`,
      );
    }
  }
  return normalizedPaths;
}

function validateArtifactPreflight(
  relativePath,
  lineNumber,
  lines,
  uploadIndex,
  artifactPaths,
) {
  if (
    !artifactPaths.some(
      (artifactPath) =>
        artifactPath === "playwright-report/" || artifactPath === "test-results/",
    )
  ) {
    return;
  }
  const prior = lines.slice(Math.max(0, uploadIndex - 40), uploadIndex).join("\n");
  if (!prior.includes("npm run check:release-surface")) {
    fail(
      `${relativePath}:${lineNumber} Playwright/test artifacts require npm run check:release-surface before upload.`,
    );
  }
}

checkChecklist();
checkWorkflowArtifactRetention();

if (failures.length > 0) {
  console.error("[hosted-release-surfaces] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[hosted-release-surfaces] passed");
