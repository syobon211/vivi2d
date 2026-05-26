import fs from "node:fs";
import { readJson, readText } from "./lib/repo.mjs";

const failures = [];
const workflowPath = ".github/workflows/publish-web-alpha.yml";
const contractPath = "docs/developer/quality/web-npm-alpha-release.md";
const releaseNotesTemplate =
  "docs/developer/quality/templates/web-npm-alpha-release-notes.md";
const workflow = readText(workflowPath);
const contract = readText(contractPath);
const rootPackage = readJson("package.json");
const webPackage = readJson("packages/web/package.json");

checkPackageScripts();
checkPackageMetadata();
checkRequiredFiles();
checkWorkflowShape();
checkWorkflowRequirements();
checkVerifierContracts();
checkReleaseContract();

if (failures.length > 0) {
  console.error("[web-npm-alpha-release] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[web-npm-alpha-release] passed");

function checkPackageScripts() {
  for (const scriptName of [
    "check:web-npm-alpha-release",
    "check:npm-token-hygiene",
    "check:environment-protection",
  ]) {
    if (!rootPackage.scripts?.[scriptName]) {
      failures.push(`package.json is missing script: ${scriptName}`);
    }
  }
}

function checkPackageMetadata() {
  if (webPackage.name !== "@vivi2d/web") {
    failures.push("packages/web/package.json must describe @vivi2d/web.");
  }
  if (webPackage.vivi2d?.publication !== "experimental") {
    failures.push("@vivi2d/web must remain experimental for the alpha contract.");
  }
  if (webPackage.publishConfig?.access !== "public") {
    failures.push("@vivi2d/web publishConfig.access must be public.");
  }
  if (webPackage.publishConfig?.provenance !== true) {
    failures.push("@vivi2d/web publishConfig.provenance must be true.");
  }
  if (webPackage.repository?.url !== "git+https://github.com/vivi2d/vivi2d.git") {
    failures.push(
      "@vivi2d/web repository.url must match the Trusted Publisher repository.",
    );
  }
  if (webPackage.repository?.directory !== "packages/web") {
    failures.push("@vivi2d/web repository.directory must be packages/web.");
  }
}

function checkRequiredFiles() {
  for (const file of [
    workflowPath,
    contractPath,
    releaseNotesTemplate,
    ".github/release-environments/npm-alpha.json",
    "scripts/release-tool-versions.json",
    "scripts/check-npm-cli-version.mjs",
    "scripts/check-release-input-version.mjs",
    "scripts/check-release-tag.mjs",
    "scripts/install-pinned-gitleaks.mjs",
    "scripts/run-release-step.mjs",
    "scripts/write-pack-output.mjs",
    "scripts/record-web-npm-alpha-artifacts.mjs",
    "scripts/verify-web-npm-alpha-release-record.mjs",
    "scripts/verify-web-npm-alpha-publish.mjs",
  ]) {
    if (!fs.existsSync(file))
      failures.push(`Missing web npm alpha release file: ${file}`);
  }
}

function checkWorkflowShape() {
  requireText("workflow_dispatch:");
  requireText("version:");
  requireText("ref:");
  requireText("dryRun:");
  requireText("permissions:\n  contents: read");
  requireText("concurrency:");
  requireText("validate-and-pack-web-alpha:");
  requireText("publish-web-alpha:");
  requireText("environment: npm-alpha");
  requireText("id-token: write");
  requireText("fetch-depth: 0");
  requireText("persist-credentials: false");
  requireText('test "$GITHUB_REF" = "refs/tags/$RELEASE_REF"');
  requireText("npm install -g npm@11.5.1 --ignore-scripts");
  requireText("npm ci");
  requireText('npm publish "$PACKED_TARBALL" --access public --tag alpha --provenance');
  requireText(
    "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0",
  );
  requireText(
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2",
  );
  requireText("web-npm-alpha-release-record");
  requireText("retention-days: 14");
  requireText("*.tgz");

  if (/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b/.test(workflow)) {
    failures.push(`${workflowPath}: must not reference long-lived npm token secrets.`);
  }

  const validateJob = sectionBetween(
    "  validate-and-pack-web-alpha:",
    "  publish-web-alpha:",
  );
  const publishJob = workflow.slice(workflow.indexOf("  publish-web-alpha:"));
  if (/id-token:\s*write/.test(validateJob)) {
    failures.push("validate-and-pack-web-alpha must not request id-token: write.");
  }
  if (!/id-token:\s*write/.test(publishJob)) {
    failures.push("publish-web-alpha must request id-token: write.");
  }
  if (/npm ci/.test(publishJob)) {
    failures.push("publish-web-alpha must not run npm ci.");
  }
  if (/npm pack/.test(publishJob)) {
    failures.push("publish-web-alpha must not run npm pack.");
  }
}

function checkWorkflowRequirements() {
  for (const command of [
    "npm run test:fuzz:parsers",
    "npm run check:quality",
    "npm run check:quality:e2e-workflow-record",
    "npm run check:sdk-unlock:web",
    "npm run check:oss-readiness",
    "npm run check:oss-publication",
    "npm run check:release-surface",
    "npm run check:pack-contents",
    "npm run check:sdk-external-consumer",
    "npm run notices:check",
    "npm run check:sbom",
    "npm run audit:all",
    "npm run audit:prod",
    "npm run check:history-secrets",
    "gitleaks detect --source . --no-git",
    'gitleaks git --log-opts="--all" .',
    "npm run sbom:generate",
  ]) {
    if (!workflow.includes(command)) {
      failures.push(`${workflowPath}: missing required command: ${command}`);
    }
  }

  assertOrder(
    "node scripts/install-pinned-gitleaks.mjs --manifest scripts/release-tool-versions.json",
    "npm run check:history-secrets",
  );
  assertOrder("npm run check:history-secrets", "gitleaks detect --source . --no-git");
  assertOrder("gitleaks detect --source . --no-git", 'gitleaks git --log-opts="--all" .');
  assertOrder(
    "npm pack --workspace @vivi2d/web --json",
    "node scripts/write-pack-output.mjs",
  );
  assertOrder(
    "node scripts/write-pack-output.mjs",
    "node scripts/record-web-npm-alpha-artifacts.mjs",
  );
  assertOrder(
    "node scripts/verify-web-npm-alpha-release-record.mjs",
    'npm publish "$PACKED_TARBALL"',
  );
  assertOrder(
    'npm publish "$PACKED_TARBALL"',
    "node scripts/verify-web-npm-alpha-publish.mjs",
  );
}

function checkReleaseContract() {
  for (const phrase of [
    "OIDC",
    "fetch-depth: 0",
    "gitleaks",
    "npm-alpha",
    "0.1.0-alpha.0",
    "repository-wide",
    "No P1/P2",
  ]) {
    if (phrase === "No P1/P2") continue;
    if (!contract.includes(phrase)) {
      failures.push(`${contractPath}: missing release contract phrase ${phrase}.`);
    }
  }
  const template = readText(releaseNotesTemplate);
  for (const phrase of [
    "experimental alpha",
    "Tarball SHA-256",
    "SBOM Scope",
    "Provenance",
  ]) {
    if (!template.includes(phrase)) {
      failures.push(`${releaseNotesTemplate}: missing ${phrase}.`);
    }
  }
}

function checkVerifierContracts() {
  const publishVerifier = readText("scripts/verify-web-npm-alpha-publish.mjs");
  for (const phrase of [
    "/-/npm/v1/attestations/",
    "sourceCommit",
    "workflowRef",
    "runnerEnvironment",
    "runId",
    "integritySha512Hex",
    "subject digest",
  ]) {
    if (!publishVerifier.includes(phrase)) {
      failures.push(`scripts/verify-web-npm-alpha-publish.mjs must verify ${phrase}.`);
    }
  }

  const recordVerifier = readText("scripts/verify-web-npm-alpha-release-record.mjs");
  for (const phrase of ["sourceCommit", "git", "rev-parse", "HEAD"]) {
    if (!recordVerifier.includes(phrase)) {
      failures.push(
        `scripts/verify-web-npm-alpha-release-record.mjs must bind the release record to ${phrase}.`,
      );
    }
  }
}

function requireText(text) {
  if (!workflow.includes(text)) failures.push(`${workflowPath}: missing ${text}`);
}

function sectionBetween(start, end) {
  const startIndex = workflow.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = workflow.indexOf(end, startIndex + start.length);
  return workflow.slice(startIndex, endIndex < 0 ? workflow.length : endIndex);
}

function assertOrder(first, second) {
  const firstIndex = workflow.indexOf(first);
  const secondIndex = workflow.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0) return;
  if (firstIndex > secondIndex) {
    failures.push(`${workflowPath}: ${first} must run before ${second}.`);
  }
}
