import fs from "node:fs";
import path from "node:path";
import { gitLsFilesIncludingUntracked, readText, repoRoot } from "./lib/repo.mjs";

const failures = [];

for (const file of gitLsFilesIncludingUntracked([
  ".github",
  "docs",
  "package.json",
  "packages/web/package.json",
  "scripts",
])) {
  if (!isTextFile(file)) continue;
  const text = readText(file);
  if (/npm_[A-Za-z0-9]{24,}/i.test(text)) {
    failures.push(`${file}: contains an npm-token-shaped value.`);
  }
  if (/\/\/registry\.npmjs\.org\/:_authToken\s*=/i.test(text)) {
    failures.push(`${file}: must not configure a long-lived npm auth token.`);
  }
}

for (const workflow of workflowFiles()) {
  const text = readText(workflow);
  if (/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b/.test(text)) {
    failures.push(
      `${workflow}: release workflows must use Trusted Publishing OIDC, not npm token secrets.`,
    );
  }
}

const releaseContract = readText("docs/developer/quality/web-npm-alpha-release.md");
if (!/long-lived npm automation tokens/i.test(releaseContract)) {
  failures.push(
    "web npm alpha release contract must mention long-lived npm token hygiene.",
  );
}

if (failures.length > 0) {
  console.error("[npm-token-hygiene] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[npm-token-hygiene] passed");

function workflowFiles() {
  const dir = path.join(repoRoot, ".github", "workflows");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => /\.ya?ml$/i.test(file))
    .map((file) => `.github/workflows/${file}`);
}

function isTextFile(file) {
  return /\.(?:cjs|json|md|mjs|txt|ya?ml)$/i.test(file);
}
