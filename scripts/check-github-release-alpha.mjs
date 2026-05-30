import fs from "node:fs";
import { readText } from "./lib/repo.mjs";

const failures = [];
const workflowPath = ".github/workflows/github-release-alpha.yml";
const contractPath = "docs/developer/quality/github-release-alpha.md";
const releaseNotesTemplate =
  "docs/developer/quality/templates/github-release-alpha-notes.md";
const prepareScript = "scripts/prepare-github-release-assets.mjs";
const verifyScript = "scripts/verify-github-release-assets.mjs";
const reviewPacketScript = "scripts/generate-github-release-alpha-review-packet.mjs";
const expectedDownloadableAssetNames = [
  "THIRD_PARTY_NOTICES.txt",
  "checksums.txt",
  "vivi2d-$VERSION-release-record.json",
  "vivi2d-$VERSION-source-review.zip",
  "vivi2d-$VERSION-source-review-manifest.json",
  "vivi2d-$VERSION.cdx.json",
];
const expectedWorkflowAssetPaths = expectedDownloadableAssetNames.map(
  (name) => `tmp/github-release-assets/${name}`,
);
const expectedPreparerAssetKeys = [
  "checksums",
  "notices",
  "releaseRecord",
  "sbom",
  "sourceReviewManifest",
  "sourceReviewZip",
];
const requiredValidateCommands = [
  "npx playwright install --with-deps chromium firefox webkit",
  "rustup target add wasm32-unknown-unknown",
  "xvfb-run -a node scripts/run-release-step.mjs --name check-quality -- npm run check:quality",
  "xvfb-run -a node scripts/run-release-step.mjs --name check-quality-e2e-workflow-record -- npm run check:quality:e2e-workflow-record",
  "npm run check:oss-readiness",
  "npm run check:oss-publication",
  "npm run check:release-surface",
  "npm run check:pack-contents",
  "npm run check:ip-product-profile",
  "npm run check:clean-room-coverage",
  "npm run check:license-policy",
  "npm run notices:check",
  "npm run check:sbom",
  "npm run check:publication-history",
  "npm run check:hosted-release-surfaces",
  "npm run check:workflow-artifact-safety",
  "npm run check:source-review-archive",
  "npm run check:viewer-mediapipe-assets",
  "npm run check:history-secrets",
  "gitleaks detect --source . --no-git",
  'gitleaks git --log-opts="--all" .',
  "npm run sbom:generate",
  "npm run archive:source-review",
  "npm run release:github:prepare",
];

const workflow = readRequired(workflowPath);
const contract = readRequired(contractPath);
const template = readRequired(releaseNotesTemplate);
const preparer = readRequired(prepareScript);
const verifier = readRequired(verifyScript);
const reviewPacket = readRequired(reviewPacketScript);
const packageJson = JSON.parse(readRequired("package.json"));

checkPackageScripts();
checkRequiredFiles();
checkWorkflowShape();
checkWorkflowCommands();
checkContract();
checkPreparer();
checkVerifier();

if (failures.length > 0) {
  console.error("[github-release-alpha] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[github-release-alpha] passed");

function checkPackageScripts() {
  for (const scriptName of ["check:github-release-alpha", "release:github:prepare"]) {
    if (!packageJson.scripts?.[scriptName]) {
      failures.push(`package.json is missing script: ${scriptName}`);
    }
  }
}

function checkRequiredFiles() {
  for (const file of [
    workflowPath,
    contractPath,
    releaseNotesTemplate,
    prepareScript,
    verifyScript,
    reviewPacketScript,
  ]) {
    if (!fs.existsSync(file)) failures.push(`Missing GitHub release alpha file: ${file}`);
  }
}

function checkWorkflowShape() {
  for (const text of [
    "workflow_dispatch:",
    "version:",
    "ref:",
    "permissions:\n  contents: read",
    "validate-and-package-github-release:",
    "verify-github-release-assets:",
    "create-github-release:",
    "github-release-alpha-assets",
    "gh release create",
    "--verify-tag",
    "--draft",
  ]) {
    requireWorkflowText(text);
  }

  if (/^\s{6}draft:\s*$/m.test(workflow) || workflow.includes("inputs.draft")) {
    failures.push(
      `${workflowPath}: initial alpha workflow must not expose a draft input.`,
    );
  }
  if (workflow.includes("draft_flag")) {
    failures.push(`${workflowPath}: initial alpha workflow must always use --draft.`);
  }

  const { validateJob, verifyJob, verifySteps, releaseJob, releaseSteps } =
    workflowJobs();

  for (const text of [
    "fetch-depth: 0",
    "persist-credentials: false",
    'test "$RELEASE_REF" = "v$VERSION"',
    'test "$GITHUB_REF" = "refs/tags/$RELEASE_REF"',
    'test "$(git rev-list -n 1 "$RELEASE_REF")" = "$GITHUB_SHA"',
    'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
  ]) {
    requireInSection(validateJob, "validate-and-package-github-release", text);
    requireInSection(verifyJob, "verify-github-release-assets", text);
  }

  for (const text of [
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    "retention-days: 14",
    "if-no-files-found: error",
    "path: tmp/github-release-assets/",
  ]) {
    requireInSection(validateJob, "validate-and-package-github-release", text);
  }

  for (const text of [
    "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1",
    "contents: read",
    "Verify downloaded release assets",
    "node scripts/verify-github-release-assets.mjs --asset-dir tmp/github-release-assets --version",
  ]) {
    requireInSection(verifyJob, "verify-github-release-assets", text);
  }

  for (const text of [
    "needs: verify-github-release-assets",
    "contents: write",
    "actions: read",
    'gh run download "$GITHUB_RUN_ID"',
    '--repo "$GH_REPO"',
    "expected_files=(",
    "sha256sum -c checksums.txt",
    "release notes sha256 mismatch",
    'test "$RELEASE_REF" = "v$VERSION"',
    'gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/$RELEASE_REF"',
    'test "$peeled_sha" = "$GITHUB_SHA"',
    "release record sourceCommit mismatch",
    'test -f "$file"',
    "--notes-file tmp/github-release-assets/release-notes.md",
  ]) {
    requireInSection(releaseJob, "create-github-release", text);
  }
  assertExactWorkflowAssetAllowlist(releaseJob);

  if (/contents:\s*write/.test(validateJob)) {
    failures.push(
      "validate-and-package-github-release must not request contents: write.",
    );
  }
  if (/contents:\s*write/.test(verifyJob)) {
    failures.push("verify-github-release-assets must not request contents: write.");
  }
  if (/contents:\s*read/.test(releaseJob) && !/contents:\s*write/.test(releaseJob)) {
    failures.push("create-github-release must request contents: write.");
  }
  if (!/contents:\s*write/.test(releaseJob)) {
    failures.push("create-github-release must request contents: write.");
  }
  if (/\b(?:GH_TOKEN|GITHUB_TOKEN|GITHUB_TOKEN:)\b/.test(validateJob)) {
    failures.push(
      "validate-and-package-github-release must not receive a release token.",
    );
  }
  if (/\b(?:GH_TOKEN|GITHUB_TOKEN|GITHUB_TOKEN:)\b/.test(verifyJob)) {
    failures.push("verify-github-release-assets must not receive a release token.");
  }

  const releaseJobHeader = releaseJob.slice(0, releaseJob.indexOf("\n    steps:"));
  if (/\b(?:GH_TOKEN|GITHUB_TOKEN|GITHUB_TOKEN:)\b/.test(releaseJobHeader)) {
    failures.push("create-github-release must not set GH_TOKEN at job scope.");
  }

  assertNoCheckoutInWriteJob(releaseSteps);
  assertReleaseJobStepShape(releaseSteps);
  assertVerifierJobOrder(verifySteps);
  assertReleaseJobIsConsumerOnly(releaseSteps);
  assertStepLocalReleaseToken(releaseSteps);
  assertReleaseCreationOrder(releaseSteps);
}

function checkWorkflowCommands() {
  const { validateSteps, verifySteps, releaseSteps } = workflowJobs();

  for (const command of requiredValidateCommands) {
    requireRunStep(validateSteps, command, "validate-and-package-github-release");
    if (releaseSteps.some((step) => step.run.includes(command))) {
      failures.push(`${workflowPath}: ${command} must not run in create-github-release.`);
    }
    if (verifySteps.some((step) => step.run.includes(command))) {
      failures.push(
        `${workflowPath}: ${command} must not run in verify-github-release-assets.`,
      );
    }
  }
  assertRunOrder(
    validateSteps,
    "npx playwright install --with-deps chromium firefox webkit",
    "rustup target add wasm32-unknown-unknown",
    "validate-and-package-github-release",
  );
  assertRunOrder(
    validateSteps,
    "rustup target add wasm32-unknown-unknown",
    "xvfb-run -a node scripts/run-release-step.mjs --name check-quality -- npm run check:quality",
    "validate-and-package-github-release",
  );

  assertRunOrder(
    validateSteps,
    "node scripts/install-pinned-gitleaks.mjs --manifest scripts/release-tool-versions.json",
    "gitleaks detect --source . --no-git",
    "validate-and-package-github-release",
  );
  assertRunOrder(
    validateSteps,
    "npm run check:source-review-archive",
    "npm run archive:source-review",
    "validate-and-package-github-release",
  );
  assertRunOrder(
    validateSteps,
    "npm run sbom:generate",
    "npm run release:github:prepare",
    "validate-and-package-github-release",
  );
  assertRunOrder(
    validateSteps,
    "npm run archive:source-review",
    "npm run release:github:prepare",
    "validate-and-package-github-release",
  );
}

function checkContract() {
  for (const phrase of [
    "GitHub Releases are the source-of-truth release index",
    "v0.1.0-alpha.1",
    "Initial Asset Set",
    "must not attach",
    "release:github:prepare",
    "checksums.txt",
    "always creates a draft GitHub Release",
    "downloaded asset set with",
    "read-only verification job",
    "repository token only inside a single shell step",
    "gh run download",
    '--repo "$GH_REPO"',
    "sha256sum -c checksums.txt",
    "tag target with the GitHub API",
    "release record stores a SHA-256 digest",
  ]) {
    if (!contract.includes(phrase)) {
      failures.push(`${contractPath}: missing contract phrase: ${phrase}`);
    }
  }
  for (const phrase of [
    "What Is Included",
    "What Is Not Included",
    "sha256sum -c checksums.txt",
    "SBOM Scope",
    "Security",
  ]) {
    if (!template.includes(phrase)) {
      failures.push(`${releaseNotesTemplate}: missing ${phrase}.`);
    }
  }
}

function checkPreparer() {
  for (const phrase of [
    'run("git", ["rev-parse", "HEAD"])',
    'crypto.createHash("sha256")',
    "tmp/source-review/vivi2d-source-review.zip",
    "tmp/source-review/vivi2d-source-review-manifest.json",
    "dist/sbom/vivi2d.cdx.json",
    "THIRD_PARTY_NOTICES",
    "downloadableAssetNames",
    "primaryAssets",
    "releaseNotesAttachedAsDownload: false",
    "releaseNotes:",
    "checksums.txt",
    "release-notes.md",
    "release-record.json",
    "sourceCommit",
  ]) {
    if (!preparer.includes(phrase)) {
      failures.push(`${prepareScript}: missing ${phrase}.`);
    }
  }
  assertExactPreparerDownloadableAssetList();
}

function checkVerifier() {
  for (const phrase of [
    "parseChecksums",
    "checksums.txt entries",
    "downloadableAssetNames",
    "sourceCommit",
    "releaseNotesAttachedAsDownload",
    "release notes sha256 mismatch",
    "release notes size mismatch",
    "release-notes.md must not be a downloadable asset",
    "release asset directory entries",
    "primaryAssets",
    "release record sha256 mismatch",
  ]) {
    if (!verifier.includes(phrase)) {
      failures.push(`${verifyScript}: missing verifier phrase: ${phrase}.`);
    }
  }
  for (const phrase of [
    "Parsed Workflow Contract",
    "verifyGithubReleaseAssetsJob",
    "Verifier Fixture Results",
    "extra file in asset directory",
    "checksum mismatch",
    "sourceCommit mismatch",
    "releaseNotesAttachedAsDownload true",
    "release notes sha256 mismatch",
    "release notes size mismatch",
  ]) {
    if (!reviewPacket.includes(phrase)) {
      failures.push(`${reviewPacketScript}: missing review packet phrase: ${phrase}.`);
    }
  }
}

function readRequired(relativePath) {
  if (!fs.existsSync(relativePath)) {
    failures.push(`${relativePath}: referenced file does not exist`);
    return "";
  }
  return readText(relativePath);
}

function requireWorkflowText(text) {
  if (!workflow.includes(text)) failures.push(`${workflowPath}: missing ${text}`);
}

function requireInSection(section, sectionName, text) {
  if (!section.includes(text)) {
    failures.push(`${workflowPath}: ${sectionName} is missing ${text}`);
  }
}

function requireSection(start, end, sectionName) {
  const startIndex = workflow.indexOf(start);
  if (startIndex < 0) {
    failures.push(`${workflowPath}: missing section ${sectionName}`);
    return "";
  }
  const endIndex = end === null ? -1 : workflow.indexOf(end, startIndex + start.length);
  if (end !== null && endIndex < 0) {
    failures.push(`${workflowPath}: ${sectionName} is missing end marker ${end}`);
  }
  return workflow.slice(startIndex, endIndex < 0 ? workflow.length : endIndex);
}

function workflowJobs() {
  const validateJob = requireSection(
    "  validate-and-package-github-release:",
    "  verify-github-release-assets:",
    "validate-and-package-github-release",
  );
  const verifyJob = requireSection(
    "  verify-github-release-assets:",
    "  create-github-release:",
    "verify-github-release-assets",
  );
  const releaseJob = requireSection(
    "  create-github-release:",
    null,
    "create-github-release",
  );
  return {
    validateJob,
    verifyJob,
    releaseJob,
    validateSteps: parseWorkflowSteps(validateJob),
    verifySteps: parseWorkflowSteps(verifyJob),
    releaseSteps: parseWorkflowSteps(releaseJob),
  };
}

function parseWorkflowSteps(jobSection) {
  const steps = [];
  let current = null;
  for (const line of jobSection.split(/\r?\n/)) {
    if (/^\s{6}-\s+/.test(line)) {
      if (current) steps.push(current);
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) steps.push(current);

  return steps.map((rawLines, index) => {
    const raw = rawLines.join("\n");
    return {
      index,
      name: extractScalarField(rawLines, "name"),
      uses: extractScalarField(rawLines, "uses"),
      run: extractRun(rawLines),
      raw,
    };
  });
}

function extractScalarField(rawLines, fieldName) {
  const fieldPattern = new RegExp(`^\\s{6}(?:-\\s+)?${fieldName}:\\s*(.*)$`);
  for (const line of rawLines) {
    const match = fieldPattern.exec(line);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function extractRun(rawLines) {
  const runPattern = /^\s*(?:-\s+)?run:\s*(.*)$/;
  const runIndex = rawLines.findIndex((line) => runPattern.test(line));
  if (runIndex < 0) return "";

  const value = runPattern.exec(rawLines[runIndex])?.[1]?.trim() ?? "";
  if (value !== "|" && value !== ">") return value;

  return rawLines
    .slice(runIndex + 1)
    .map((line) => line.replace(/^\s{10}/, ""))
    .join("\n")
    .trim();
}

function requireRunStep(steps, command, jobName) {
  if (findRunStepIndex(steps, command) < 0) {
    failures.push(`${workflowPath}: ${jobName} is missing run step: ${command}`);
  }
}

function assertRunOrder(steps, first, second, jobName) {
  const firstIndex = findRunStepIndex(steps, first);
  const secondIndex = findRunStepIndex(steps, second);
  if (firstIndex < 0) {
    failures.push(`${workflowPath}: ${jobName} is missing ordered run step ${first}`);
    return;
  }
  if (secondIndex < 0) {
    failures.push(`${workflowPath}: ${jobName} is missing ordered run step ${second}`);
    return;
  }
  if (firstIndex > secondIndex) {
    failures.push(`${workflowPath}: ${first} must run before ${second}.`);
  }
}

function findRunStepIndex(steps, command) {
  return steps.findIndex((step) => step.run.includes(command));
}

function assertReleaseJobIsConsumerOnly(releaseSteps) {
  for (const step of releaseSteps) {
    if (/\bnpm ci\b|\bnpm run\b/.test(step.run)) {
      failures.push("create-github-release must not install or run npm scripts.");
    }
    if (
      /verify-github-release-assets|archive:source-review|sbom:generate|prepare-github-release-assets/.test(
        step.run,
      )
    ) {
      failures.push(
        "create-github-release must consume prepared and verified assets, not regenerate or reverify them.",
      );
    }
  }
}

function assertNoCheckoutInWriteJob(releaseSteps) {
  if (releaseSteps.some((step) => step.uses.includes("actions/checkout@"))) {
    failures.push("create-github-release must not run actions/checkout.");
  }
}

function assertReleaseJobStepShape(releaseSteps) {
  if (
    releaseSteps.length !== 1 ||
    !releaseSteps[0].run.includes("gh run download") ||
    !releaseSteps[0].run.includes("gh release create") ||
    releaseSteps[0].uses
  ) {
    failures.push(
      "create-github-release must be one shell step that downloads the prepared artifact and runs gh release create.",
    );
  }
}

function assertStepLocalReleaseToken(releaseSteps) {
  const tokenSteps = releaseSteps.filter((step) =>
    /\b(?:GH_TOKEN|GITHUB_TOKEN|GITHUB_TOKEN:)\b/.test(step.raw),
  );
  if (tokenSteps.length !== 1) {
    failures.push("create-github-release must expose GH_TOKEN to exactly one step.");
    return;
  }
  const tokenStep = tokenSteps[0];
  if (!tokenStep.run.includes("gh release create")) {
    failures.push("GH_TOKEN must be scoped only to the gh release create step.");
  }
  if (!tokenStep.raw.includes("GH_REPO:")) {
    failures.push("Create GitHub Release step must set GH_REPO explicitly.");
  }
}

function assertVerifierJobOrder(verifySteps) {
  const checkoutIndex = verifySteps.findIndex((step) =>
    step.uses.includes("actions/checkout@"),
  );
  const downloadIndex = verifySteps.findIndex((step) =>
    step.uses.includes("actions/download-artifact@"),
  );
  const verifyIndex = findRunStepIndex(
    verifySteps,
    "node scripts/verify-github-release-assets.mjs",
  );
  if (checkoutIndex < 0) {
    failures.push("verify-github-release-assets must checkout verifier source.");
  }
  if (downloadIndex < 0) {
    failures.push("verify-github-release-assets is missing download-artifact.");
    return;
  }
  if (verifyIndex < 0) {
    failures.push("verify-github-release-assets is missing asset verifier.");
    return;
  }
  if (downloadIndex > verifyIndex) {
    failures.push(
      "verify-github-release-assets must download artifacts before verifying.",
    );
  }
}

function assertReleaseCreationOrder(releaseSteps) {
  const releaseIndex = findRunStepIndex(releaseSteps, "gh release create");
  if (releaseIndex < 0) {
    failures.push(`${workflowPath}: create-github-release is missing gh release create.`);
    return;
  }
  const releaseRun = releaseSteps[releaseIndex].run;
  const downloadOffset = releaseRun.indexOf('gh run download "$GITHUB_RUN_ID"');
  const exactFileSetOffset = releaseRun.indexOf("expected_files=(");
  const checksumOffset = releaseRun.indexOf("sha256sum -c checksums.txt");
  const notesDigestOffset = releaseRun.indexOf("release notes sha256 mismatch");
  const releaseOffset = releaseRun.indexOf("gh release create");
  if (downloadOffset < 0) {
    failures.push(
      "create-github-release must download the verified artifact in its release shell step.",
    );
    return;
  }
  if (downloadOffset > releaseOffset) {
    failures.push(
      "create-github-release must download artifacts before creating the release.",
    );
  }
  if (exactFileSetOffset < 0) {
    failures.push("create-github-release must check the exact downloaded file set.");
    return;
  }
  if (checksumOffset < 0) {
    failures.push("create-github-release must run sha256sum -c checksums.txt.");
    return;
  }
  if (notesDigestOffset < 0) {
    failures.push("create-github-release must verify release notes digest.");
    return;
  }
  if (
    !(
      downloadOffset < exactFileSetOffset &&
      exactFileSetOffset < checksumOffset &&
      checksumOffset < notesDigestOffset &&
      notesDigestOffset < releaseOffset
    )
  ) {
    failures.push(
      "create-github-release must download, verify file set, verify checksums, verify release notes, then create the release.",
    );
  }
  if (!releaseRun.includes('gh run download "$GITHUB_RUN_ID" \\\n  --repo "$GH_REPO"')) {
    failures.push('gh run download must pass --repo "$GH_REPO".');
  }
  if (!releaseRun.includes('gh release create "$RELEASE_REF" \\\n  --repo "$GH_REPO"')) {
    failures.push('gh release create must pass --repo "$GH_REPO".');
  }
  if (!releaseRun.includes("--draft")) {
    failures.push("initial alpha workflow must create a draft release.");
  }
  if (!releaseRun.includes('test "$peeled_sha" = "$GITHUB_SHA"')) {
    failures.push("create-github-release must recheck tag target before publishing.");
  }
  if (!releaseRun.includes("release record sourceCommit mismatch")) {
    failures.push("create-github-release must recheck release record sourceCommit.");
  }
}

function assertExactWorkflowAssetAllowlist(releaseJob) {
  const match = /assets=\(\s*(?<body>[\s\S]*?)\s*\)\s*for file in/.exec(releaseJob);
  if (!match?.groups?.body) {
    failures.push(`${workflowPath}: create-github-release must define assets=().`);
    return;
  }

  const actual = [...match.groups.body.matchAll(/"([^"]+)"/g)]
    .map((entry) => entry[1])
    .sort((a, b) => a.localeCompare(b));
  assertSameSet(
    actual,
    [...expectedWorkflowAssetPaths].sort((a, b) => a.localeCompare(b)),
    `${workflowPath}: create-github-release assets=()`,
  );
}

function assertExactPreparerDownloadableAssetList() {
  const match = /downloadableAssetNames:\s*\[\s*(?<body>[\s\S]*?)\s*\]\.sort/.exec(
    preparer,
  );
  if (!match?.groups?.body) {
    failures.push(`${prepareScript}: release record must define downloadableAssetNames.`);
    return;
  }

  const actualKeys = [...match.groups.body.matchAll(/assetNames\.([A-Za-z]+)/g)]
    .map((entry) => entry[1])
    .sort((a, b) => a.localeCompare(b));
  assertSameSet(
    actualKeys,
    [...expectedPreparerAssetKeys].sort((a, b) => a.localeCompare(b)),
    `${prepareScript}: downloadableAssetNames`,
  );
}

function assertSameSet(actual, expected, label) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    failures.push(`${label} must exactly equal ${expectedText}, found ${actualText}.`);
  }
}
