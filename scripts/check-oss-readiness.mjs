import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  comfyUiTrackedSourceRecordReasons,
  validateComfyUiSourceRecord,
} from "./lib/comfyui-source-record.mjs";
import {
  exists,
  readJson,
  readText,
  repoRoot,
  resolveRepoPath,
  run,
} from "./lib/repo.mjs";

const failures = [];
const warnings = [];
const publicSourcePublication =
  process.argv.includes("--public-source-publication") ||
  process.env.VIVI2D_PUBLIC_OSS_SOURCE_PUBLICATION === "1";

function fileExists(relativePath) {
  return exists(relativePath);
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function requireFile(relativePath) {
  if (!fileExists(relativePath)) fail(`Missing required file: ${relativePath}`);
}

function runGit(args) {
  try {
    const result = run("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, stdout: "", stderr: error.message };
  }
}

function checkRequiredFiles() {
  [
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    ".github/CODEOWNERS",
    "THIRD_PARTY_NOTICES",
    ".editorconfig",
    ".gitattributes",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/dependabot.yml",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/ISSUE_TEMPLATE/gate_failure.yml",
    ".github/ISSUE_TEMPLATE/provider_integration.yml",
    ".github/ISSUE_TEMPLATE/runtime_conformance.yml",
    ".github/workflows/codeql.yml",
    ".github/workflows/github-release-alpha.yml",
    ".github/workflows/publish-web-alpha.yml",
    ".github/workflows/windows-installer-alpha.yml",
    ".github/release-environments/npm-alpha.json",
    ".github/release-environments/desktop-installer-alpha.json",
    "docs/developer/index.md",
    "docs/developer/documentation-architecture.md",
    "docs/developer/architecture/comfyui-plugin-layout.md",
    "docs/developer/architecture/overview.md",
    "docs/developer/architecture/system-map.md",
    "docs/developer/architecture/user-docs-site.md",
    "docs/developer/contributing/package-boundaries.md",
    "docs/developer/contributing/task-guides/index.md",
    "docs/developer/contributing/task-guides/viewer-api.md",
    "docs/developer/contributing/task-guides/auto-setup.md",
    "docs/developer/contributing/task-guides/i18n.md",
    "docs/developer/contributing/task-guides/sdk-samples.md",
    "docs/developer/contributing/pr-recipes.md",
    "docs/developer/contributing/troubleshooting.md",
    "docs/developer/security/threat-model.md",
    "docs/developer/quality/public-api-status.md",
    "docs/developer/quality/comfyui-plugin-source-record.json",
    "docs/developer/ip/policy.md",
    "docs/developer/quality/release-policy.md",
    "docs/developer/quality/public-release-checklist.md",
    "docs/developer/quality/github-release-alpha.md",
    "docs/developer/quality/templates/github-release-alpha-notes.md",
    "docs/developer/quality/windows-installer-alpha.md",
    "docs/developer/quality/templates/windows-installer-alpha-notes.md",
    "electron-builder.yml",
    "scripts/check-github-release-alpha.mjs",
    "scripts/generate-github-release-alpha-review-packet.mjs",
    "scripts/prepare-github-release-assets.mjs",
    "scripts/verify-github-release-assets.mjs",
    "scripts/check-windows-installer-alpha.mjs",
    "scripts/generate-windows-installer-alpha-review-packet.mjs",
    "scripts/prepare-windows-installer-assets.mjs",
    "scripts/verify-windows-installer-assets.mjs",
    "scripts/lib/windows-installer-alpha.mjs",
    "docs/developer/quality/web-npm-alpha-release.md",
    "docs/developer/quality/templates/web-npm-alpha-release-notes.md",
    "docs/developer/quality/docs-migration-manifest.json",
    "docs/user/index.md",
    "docs/user/publication-manifest.json",
    "docs/developer/adr/0001-package-graph.md",
    "docs/developer/adr/0002-provider-boundary.md",
    "docs/developer/adr/0003-runtime-native-boundary.md",
    "docs/developer/adr/0004-release-policy.md",
    "docs/developer/adr/0005-documentation-contributor-guides.md",
    "docs/developer/adr/0006-public-surface-review-gates.md",
  ].forEach(requireFile);
}

function checkPackageMetadata() {
  const pkg = readJson("package.json");
  if (pkg.license !== "Apache-2.0") {
    fail(`package.json license must be Apache-2.0, found ${pkg.license}`);
  }
  for (const scriptName of [
    "audit:prod",
    "audit:all",
    "notices:check",
    "notices:generate",
    "check:architecture-boundaries",
    "check:auto-setup-ip-compliance",
    "check:docs-architecture",
    "check:docs-public-surface",
    "check:content-safety-integrity",
    "check:escalation-template",
    "docs:user:check",
    "docs:user:check:release",
    "check:history-secrets",
    "check:ipc-contract",
    "check:ipc-contract-sync",
    "check:ip-markers",
    "check:ip-product-profile",
    "check:license-policy",
    "check:native-artifact-policy",
    "check:oss-readiness",
    "check:oss-publication",
    "check:web-npm-alpha-release",
    "check:github-release-alpha",
    "check:windows-installer-alpha",
    "release:github:prepare",
    "release:github:review-packet",
    "release:windows-installer:prepare",
    "release:windows-installer:review-packet",
    "verify:windows-installer-assets",
    "check:npm-token-hygiene",
    "check:environment-protection",
    "check:packages-types",
    "check:package-boundaries",
    "check:pack-contents",
    "check:pr-recipe-gates",
    "check:publication-history",
    "check:quality",
    "check:quality:coverage",
    "check:quality:e2e-smoke",
    "check:release-surface",
    "check:samples-public-surface",
    "check:security-patterns",
    "check:secrets",
    "check:sbom",
    "check:source-review-archive",
    "check:task-guide-gates",
    "check:task-guide-paths",
    "check:troubleshooting-content",
    "check:viewer-mediapipe-assets",
    "sbom:generate",
    "test:runtime-wasm:browser",
    "archive:source-review",
  ]) {
    if (!pkg.scripts?.[scriptName]) {
      fail(`package.json is missing script: ${scriptName}`);
    }
  }
  checkWebPackageMetadata();
  checkViewerMediaPipeAssetLock();
  if (pkg.private !== true) {
    fail("Root package must remain private until public package scope is decided.");
  }
}

function checkViewerMediaPipeAssetLock() {
  const lockPath = "packages/viewer/mediapipe-assets.lock.json";
  if (!fileExists(lockPath)) {
    fail(`${lockPath}: MediaPipe asset lock is required.`);
    return;
  }
  const lock = readJson(lockPath);
  if (lock.schemaVersion !== 1) {
    fail(`${lockPath}: schemaVersion must be 1.`);
  }
  if (lock.tasksVisionVersion !== "0.10.35") {
    fail(`${lockPath}: tasksVisionVersion must be 0.10.35.`);
  }
  if (
    lock.vendorRoot !== "packages/viewer/public/vendor/mediapipe/tasks-vision-0.10.35"
  ) {
    fail(`${lockPath}: vendorRoot points at the wrong public asset directory.`);
  }
  if (!Array.isArray(lock.assets) || lock.assets.length < 9) {
    fail(`${lockPath}: expected WASM and model asset entries.`);
    return;
  }
  for (const entry of lock.assets) {
    if (!isNonEmptyString(entry.path) || !fileExists(entry.path)) {
      fail(`${lockPath}: locked asset is missing from the source tree: ${entry.path}`);
      continue;
    }
    if (!/^sha256:[0-9a-f]{64}$/i.test(String(entry.sha256 ?? ""))) {
      fail(`${lockPath}: ${entry.path} must include a sha256 digest.`);
      continue;
    }
    const bytes = fs.readFileSync(resolveRepoPath(entry.path));
    const actualSha256 = `sha256:${crypto
      .createHash("sha256")
      .update(bytes)
      .digest("hex")}`;
    if (entry.sha256 !== actualSha256) {
      fail(`${lockPath}: ${entry.path} sha256 does not match the vendored file.`);
    }
    if (entry.sizeBytes !== bytes.byteLength) {
      fail(`${lockPath}: ${entry.path} sizeBytes does not match the vendored file.`);
    }
  }
}

function checkWebPackageMetadata() {
  if (!fileExists("packages/web/package.json")) return;
  const webPackage = readJson("packages/web/package.json");
  if (webPackage.name !== "@vivi2d/web") return;

  const repository = webPackage.repository;
  if (
    !repository ||
    repository.type !== "git" ||
    typeof repository.url !== "string" ||
    !repository.url.startsWith("git+https://github.com/")
  ) {
    fail("packages/web/package.json must declare a public GitHub repository URL.");
  }
  if (repository?.directory !== "packages/web") {
    fail("packages/web/package.json repository.directory must be packages/web.");
  }
  if (
    typeof webPackage.bugs?.url !== "string" ||
    !webPackage.bugs.url.startsWith("https://github.com/")
  ) {
    fail("packages/web/package.json must declare a public GitHub bugs URL.");
  }
  if (
    typeof webPackage.homepage !== "string" ||
    !webPackage.homepage.startsWith("https://github.com/")
  ) {
    fail("packages/web/package.json must declare a public GitHub homepage.");
  }
  if (webPackage.publishConfig?.access !== "public") {
    fail("packages/web/package.json publishConfig.access must be public.");
  }
  if (webPackage.publishConfig?.provenance !== true) {
    fail("packages/web/package.json publishConfig.provenance must be true.");
  }
}

function checkPublicSourcePublicationBoundaries() {
  if (!publicSourcePublication) return;

  const trackedSourceReasons = comfyUiTrackedSourceRecordReasons(repoRoot);
  if (trackedSourceReasons.length > 0) {
    for (const failure of validateComfyUiSourceRecord(repoRoot, [
      "public repository publication",
      "source archive publication",
      ...trackedSourceReasons,
    ])) {
      fail(failure);
    }
  }

  checkCleanRoomSourcePublicationBoundaries();
}

function checkCleanRoomSourcePublicationBoundaries() {
  const contractPath = "scripts/internal-contracts/clean-room-coverage.contract.json";
  if (!fileExists(contractPath)) {
    fail(`${contractPath}: clean-room publication contract is required.`);
    return;
  }

  const contract = readJson(contractPath);
  if (!contract || !Array.isArray(contract.algorithms)) {
    fail(`${contractPath}: algorithms must be an array.`);
    return;
  }

  for (const algorithm of contract.algorithms) {
    const trackedPrefixes = Array.isArray(algorithm.allowedTrackedSourcePrefixes)
      ? algorithm.allowedTrackedSourcePrefixes
      : [];
    if (trackedPrefixes.length === 0 || algorithm.status === "publicOssAllowed") {
      continue;
    }

    if (algorithm.status === "internalOnly") {
      if (isValidCleanRoomQuarantineRecord(algorithm.sourcePublicationQuarantine)) {
        continue;
      }
      fail(
        `${contractPath}: ${algorithm.id} is internalOnly with tracked source; public OSS source publication requires an explicit sourcePublicationQuarantine record.`,
      );
      continue;
    }

    fail(
      `${contractPath}: ${algorithm.id} is ${algorithm.status} with tracked source; public OSS source publication requires publicOssAllowed or explicit internalOnly quarantine.`,
    );
  }
}

function isValidCleanRoomQuarantineRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    value.status === "explicitQuarantine" &&
    isNonEmptyString(value.rationale) &&
    isNonEmptyString(value.ftoStatus) &&
    isNonEmptyString(value.publicReachabilityGate) &&
    value.codeownersApprovalRequired === true
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function checkWorkflowPermissions() {
  const workflowsDir = resolveRepoPath(path.join(".github", "workflows"));
  if (!fs.existsSync(workflowsDir)) return;
  for (const fileName of fs.readdirSync(workflowsDir)) {
    if (!fileName.endsWith(".yml") && !fileName.endsWith(".yaml")) continue;
    const relativePath = path.join(".github", "workflows", fileName).replace(/\\/g, "/");
    const text = readText(relativePath);
    if (!/^permissions:\s*$/m.test(text)) {
      fail(`${relativePath} must declare top-level GitHub token permissions.`);
      continue;
    }
    if (!/^\s{2}contents:\s*read\s*$/m.test(text)) {
      fail(
        `${relativePath} must set contents: read unless a stronger permission is justified.`,
      );
    }
  }
}

function checkIgnoredBacklog() {
  const gitignore = readText(".gitignore");
  if (!/(^|\n)docs\/backlog\/(\n|$)/.test(gitignore)) {
    fail(".gitignore must keep docs/backlog/ out of git.");
  }

  const trackedBacklog = runGit(["ls-files", "docs/backlog"]);
  if (!trackedBacklog.ok) {
    warn(`Could not check tracked docs/backlog files: ${trackedBacklog.stderr.trim()}`);
  } else if (trackedBacklog.stdout.trim()) {
    fail("docs/backlog/ contains tracked files; it must remain local-only.");
  }
}

function checkCodeownersCoverage() {
  const codeowners = readText(".github/CODEOWNERS");
  for (const pattern of [
    "/.github/ISSUE_TEMPLATE/",
    "/.github/workflows/",
    "/docs/developer/",
    "/docs/user/",
    "/docs/developer/adr/",
    "/docs/developer/contributing/package-boundaries.md",
    "/docs/developer/quality/release-policy.md",
    "/electron/",
    "/packages/runtime*/",
    "/packages/web/",
    "/scripts/",
  ]) {
    if (!codeowners.includes(pattern)) {
      fail(`.github/CODEOWNERS should cover ${pattern}`);
    }
  }
}

function checkDocMap() {
  const readme = readText("README.md");
  for (const docPath of [
    "docs/developer/index.md",
    "docs/user/index.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
  ]) {
    if (!readme.includes(docPath)) {
      fail(`README.md should link ${docPath}`);
    }
  }
  const contributing = readText("CONTRIBUTING.md");
  for (const docPath of [
    "docs/developer/architecture/overview.md",
    "docs/developer/architecture/system-map.md",
    "docs/developer/architecture/user-docs-site.md",
    "docs/developer/contributing/task-guides/index.md",
    "docs/developer/contributing/pr-recipes.md",
    "docs/developer/contributing/troubleshooting.md",
    "docs/developer/contributing/package-boundaries.md",
    "docs/developer/security/threat-model.md",
    "docs/developer/quality/public-api-status.md",
    "docs/developer/api/viewer-api.md",
    "docs/developer/ip/policy.md",
    "docs/developer/quality/release-policy.md",
    "docs/developer/quality/public-release-checklist.md",
  ]) {
    if (!contributing.includes(docPath)) {
      fail(`CONTRIBUTING.md should link ${docPath}`);
    }
  }
}

function checkSecurityDocs() {
  if (fileExists("SECURITY.md")) {
    const security = readText("SECURITY.md");
    const normalizedSecurity = security.toLowerCase();
    for (const needle of [
      "Private Vulnerability Reporting",
      "CodeQL",
      "supported versions",
      "Do not disclose",
    ]) {
      if (!normalizedSecurity.includes(needle.toLowerCase())) {
        fail(`SECURITY.md should mention: ${needle}`);
      }
    }
  }
  if (fileExists("docs/developer/quality/public-release-checklist.md")) {
    const checklist = readText("docs/developer/quality/public-release-checklist.md");
    for (const needle of [
      "git history",
      "Actions logs",
      "Secret Scanning",
      "Push Protection",
      "ComfyUI",
    ]) {
      if (!checklist.includes(needle)) {
        fail(
          `docs/developer/quality/public-release-checklist.md should mention: ${needle}`,
        );
      }
    }
  }
  if (fileExists("docs/developer/quality/public-api-status.md")) {
    const publicApi = readText("docs/developer/quality/public-api-status.md");
    for (const needle of ["src/*", "dist", "@vivi2d/web", "private: true"]) {
      if (!publicApi.includes(needle)) {
        fail(`docs/developer/quality/public-api-status.md should mention: ${needle}`);
      }
    }
  }
  if (fileExists("docs/developer/quality/release-policy.md")) {
    const releasePolicy = readText("docs/developer/quality/release-policy.md");
    for (const needle of [
      "GitHub Releases",
      "trusted publishing",
      "CycloneDX",
      "SBOM",
      "native",
      "WASM",
    ]) {
      if (!releasePolicy.includes(needle)) {
        fail(`docs/developer/quality/release-policy.md should mention: ${needle}`);
      }
    }
  }
  if (fileExists("THIRD_PARTY_NOTICES")) {
    const notices = readText("THIRD_PARTY_NOTICES");
    for (const needle of ["Generated from package-lock.json", "SBOM", "provenance"]) {
      if (!notices.includes(needle)) {
        fail(`THIRD_PARTY_NOTICES should mention: ${needle}`);
      }
    }
  }
}

checkRequiredFiles();
checkPackageMetadata();
checkWorkflowPermissions();
checkWorkflowActionPins();
checkIgnoredBacklog();
checkCodeownersCoverage();
checkDocMap();
checkSecurityDocs();
checkPublicSourcePublicationBoundaries();

function checkWorkflowActionPins() {
  const workflowsDir = resolveRepoPath(path.join(".github", "workflows"));
  if (!fs.existsSync(workflowsDir)) return;

  for (const fileName of fs.readdirSync(workflowsDir)) {
    if (!fileName.endsWith(".yml") && !fileName.endsWith(".yaml")) continue;
    const relativePath = path.join(".github", "workflows", fileName).replace(/\\/g, "/");
    const lines = readText(relativePath).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^\s*-\s+uses:\s+([^\s#]+)/.exec(lines[index]);
      if (!match) continue;
      const specifier = match[1].trim();
      if (specifier.startsWith("./")) continue;
      const atIndex = specifier.lastIndexOf("@");
      if (atIndex < 0) {
        fail(`${relativePath}:${index + 1} GitHub Action must pin a commit SHA.`);
        continue;
      }
      const ref = specifier.slice(atIndex + 1);
      if (!/^[0-9a-f]{40}$/i.test(ref)) {
        fail(
          `${relativePath}:${index + 1} GitHub Action must use a full commit SHA, not ${ref}.`,
        );
      }
      if (!/#\s*v\d+/i.test(lines[index])) {
        fail(
          `${relativePath}:${index + 1} pinned GitHub Action must comment the source tag.`,
        );
      }
    }
  }
}

for (const message of warnings) {
  console.warn(`[oss-readiness] warning: ${message}`);
}

if (failures.length > 0) {
  console.error("[oss-readiness] failed:");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("[oss-readiness] passed");
