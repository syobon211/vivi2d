import fs from "node:fs";
import { readJson, readText } from "./lib/repo.mjs";
import {
  expectedWindowsInstallerDownloadableAssetNames,
  WINDOWS_INSTALLER_ARTIFACT_NAME,
  WINDOWS_INSTALLER_ENVIRONMENT,
} from "./lib/windows-installer-alpha.mjs";

const failures = [];
const workflowPath = ".github/workflows/windows-installer-alpha.yml";
const contractPath = "docs/developer/quality/windows-installer-alpha.md";
const releasePolicyPath = "docs/developer/quality/release-policy.md";
const checklistPath = "docs/developer/quality/public-release-checklist.md";
const templatePath = "docs/developer/quality/templates/windows-installer-alpha-notes.md";
const builderConfigPath = "electron-builder.yml";
const prepareScriptPath = "scripts/prepare-windows-installer-assets.mjs";
const verifyScriptPath = "scripts/verify-windows-installer-assets.mjs";
const installerLibPath = "scripts/lib/windows-installer-alpha.mjs";
const reviewPacketScriptPath =
  "scripts/generate-windows-installer-alpha-review-packet.mjs";
const environmentPolicyPath = ".github/release-environments/desktop-installer-alpha.json";
const electronBuilderArtifactNameLine = [
  'artifactName: "vivi2d-',
  ["$", "{env.VERSION}"].join(""),
  "-windows-x64-setup.",
  ["$", "{ext}"].join(""),
  '"',
].join("");
const bashAlphaThresholdCheck = `${["$", "{BASH_REMATCH[4]}"].join("")}" -lt 2`;
const packageJson = readJson("package.json");
const toolManifest = readJson("scripts/release-tool-versions.json");
const workflow = readRequired(workflowPath);
const contract = readRequired(contractPath);
const releasePolicy = readRequired(releasePolicyPath);
const checklist = readRequired(checklistPath);
const template = readRequired(templatePath);
const builderConfig = readRequired(builderConfigPath);
const prepareScript = readRequired(prepareScriptPath);
const verifierScript = readRequired(verifyScriptPath);
const installerLib = readRequired(installerLibPath);

checkPackageScripts();
checkRequiredFiles();
checkToolVersions();
checkElectronBuilderConfig();
checkWorkflow();
checkScripts();
checkDocs();

if (failures.length > 0) {
  console.error("[windows-installer-alpha] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[windows-installer-alpha] passed");

function checkPackageScripts() {
  for (const scriptName of [
    "check:windows-installer-alpha",
    "release:windows-installer:prepare",
    "release:windows-installer:review-packet",
    "verify:windows-installer-assets",
    "check:environment-protection",
  ]) {
    if (!packageJson.scripts?.[scriptName]) {
      failures.push(`package.json is missing script: ${scriptName}`);
    }
  }
  if (packageJson.devDependencies?.["electron-builder"] !== "^26.8.1") {
    failures.push("package.json must pin electron-builder to ^26.8.1 for alpha.");
  }
  if (packageJson.devDependencies?.electron !== "41.7.0") {
    failures.push("package.json must pin Electron to 41.7.0 for installer alpha.");
  }
}

function checkRequiredFiles() {
  for (const file of [
    workflowPath,
    contractPath,
    releasePolicyPath,
    checklistPath,
    templatePath,
    builderConfigPath,
    prepareScriptPath,
    verifyScriptPath,
    reviewPacketScriptPath,
    environmentPolicyPath,
    installerLibPath,
  ]) {
    if (!fs.existsSync(file))
      failures.push(`Missing Windows installer alpha file: ${file}`);
  }
}

function checkToolVersions() {
  for (const [toolName, expected] of [
    ["electronBuilder", "26.8.1"],
    ["electron", "41.7.0"],
    ["electronGet", "2.0.3"],
  ]) {
    if (toolManifest.tools?.[toolName]?.version !== expected) {
      failures.push(
        `scripts/release-tool-versions.json must pin ${toolName} ${expected}.`,
      );
    }
  }
  if (!toolManifest.tools?.gitleaks?.platforms?.["linux-x64"]) {
    failures.push("gitleaks must remain pinned for linux-x64 release validation.");
  }
}

function checkElectronBuilderConfig() {
  for (const text of [
    "appId: com.vivi2d.editor",
    "productName: Vivi2D",
    "asar: false",
    "publish: null",
    electronBuilderArtifactNameLine,
    "output: dist/windows-installer",
    "electron/main.cjs",
    "THIRD_PARTY_NOTICES.txt",
    "target: nsis",
    "forceCodeSigning: false",
    "signAndEditExecutable: false",
    "oneClick: true",
  ]) {
    if (!builderConfig.includes(text)) {
      failures.push(`${builderConfigPath}: missing ${text}`);
    }
  }
  if (builderConfig.includes("latest.yml") || builderConfig.includes("app-update.yml")) {
    failures.push(`${builderConfigPath}: must not configure auto-update metadata.`);
  }
}

function checkWorkflow() {
  for (const text of [
    "workflow_dispatch:",
    "chromiumMajorVersion:",
    "electronEmbeddedNodeVersion:",
    "manualReviewJson:",
    "permissions:\n  contents: read",
    "linux-validation:",
    "windows-packaging:",
    "verify-windows-installer-assets:",
    "create-windows-installer-release:",
    WINDOWS_INSTALLER_ARTIFACT_NAME,
    WINDOWS_INSTALLER_ENVIRONMENT,
    "tmp/windows-installer-baseline",
    "gh release create",
    "--draft",
    "--prerelease",
  ]) {
    requireWorkflowText(text);
  }

  const linuxJob = sectionBetween("  linux-validation:", "  windows-packaging:");
  const windowsJob = sectionBetween(
    "  windows-packaging:",
    "  verify-windows-installer-assets:",
  );
  const verifyJob = sectionBetween(
    "  verify-windows-installer-assets:",
    "  create-windows-installer-release:",
  );
  const releaseJob = workflow.slice(
    workflow.indexOf("  create-windows-installer-release:"),
  );
  const linuxSteps = parseWorkflowSteps(linuxJob);
  const windowsSteps = parseWorkflowSteps(windowsJob);
  const releaseSteps = parseWorkflowSteps(releaseJob);

  if (/contents:\s*write/.test(linuxJob)) {
    failures.push("linux-validation must not request contents: write.");
  }
  if (/contents:\s*write/.test(windowsJob)) {
    failures.push("windows-packaging must not request contents: write.");
  }
  if (/contents:\s*write/.test(verifyJob)) {
    failures.push("verify-windows-installer-assets must not request contents: write.");
  }
  if (!/contents:\s*write/.test(releaseJob) || !/actions:\s*read/.test(releaseJob)) {
    failures.push(
      "create-windows-installer-release must request contents: write and actions: read.",
    );
  }
  if (windowsJob.includes("xvfb-run")) {
    failures.push("windows-packaging must not invoke xvfb-run.");
  }
  if (/electron-builder|windows-installer-build|signtool/i.test(linuxJob)) {
    failures.push("linux-validation must not build or sign the Windows installer.");
  }
  if (/gitleaks|install-pinned-gitleaks/.test(windowsJob)) {
    failures.push("windows-packaging must not run Linux-only gitleaks tooling.");
  }
  for (const [jobName, jobText] of [
    ["linux-validation", linuxJob],
    ["windows-packaging", windowsJob],
    ["verify-windows-installer-assets", verifyJob],
  ]) {
    if (!jobText.includes("persist-credentials: false")) {
      failures.push(`${jobName} checkout must set persist-credentials: false.`);
    }
  }
  if (/path:\s*\./.test(windowsJob)) {
    failures.push(
      "windows-packaging must not download baseline artifacts into repo root.",
    );
  }

  for (const command of [
    "xvfb-run -a node scripts/run-release-step.mjs --name check-quality -- npm run check:quality",
    "xvfb-run -a node scripts/run-release-step.mjs --name check-quality-e2e-workflow-record -- npm run check:quality:e2e-workflow-record",
    "npm run check:oss-readiness",
    "npm run check:oss-publication",
    "npm run check:release-surface",
    "npm run check:license-policy",
    "npm run check:source-review-archive",
    "npm run check:viewer-mediapipe-assets",
    "npm run check:history-secrets",
    "gitleaks detect --source . --no-git",
    'gitleaks git --log-opts="--all" .',
    "npm run sbom:generate",
    "npm run archive:source-review",
    "npm run check:windows-installer-alpha",
    "npm run release:windows-installer:review-packet",
    bashAlphaThresholdCheck,
  ]) {
    requireRunStep(linuxSteps, command, "linux-validation");
  }
  requireRunStep(linuxSteps, "tmp/windows-installer-baseline", "linux-validation");

  for (const command of [
    "npm run build",
    "git rev-parse -q --verify $annotatedTagRef",
    "[int]$Matches[4] -lt 2",
    "npx electron-builder --win nsis --x64 --publish never --config electron-builder.yml",
    "npm run release:windows-installer:prepare",
    "npm run verify:windows-installer-assets",
    "--sbom tmp/windows-installer-baseline/vivi2d.cdx.json",
  ]) {
    requireRunStep(windowsSteps, command, "windows-packaging");
  }
  assertRunOrder(
    windowsSteps,
    "npm run build",
    "npx electron-builder",
    "windows-packaging",
  );
  assertRunOrder(
    windowsSteps,
    "npx electron-builder",
    "npm run release:windows-installer:prepare",
    "windows-packaging",
  );
  assertRunOrder(
    windowsSteps,
    "npm run release:windows-installer:prepare",
    "npm run verify:windows-installer-assets",
    "windows-packaging",
  );

  assertReleaseJobShape(releaseSteps, releaseJob);
}

function checkScripts() {
  for (const text of [
    "scanPackagedApp",
    "manualWindowsReview",
    "codeSigning",
    "unsigned",
    "chromium-major-version",
    "electron-embedded-node-version",
    "dist/windows-installer/win-unpacked",
    'options["third-party-notices"]',
    "MANUAL_REVIEW_JSON",
    "WINDOWS_INSTALLER_ENVIRONMENT",
    "MAX_INSTALLER_BYTES",
    "MAX_INSTALLED_FOOTPRINT_BYTES",
  ]) {
    if (!prepareScript.includes(text)) {
      failures.push(`${prepareScriptPath}: missing ${text}`);
    }
  }
  if (!installerLib.includes('".cjs"')) {
    failures.push(`${installerLibPath}: TEXT_FILE_EXTENSIONS must include .cjs.`);
  }
  if (!installerLib.includes("alphaNumber < 2")) {
    failures.push(`${installerLibPath}: must reject alpha.1 installer versions.`);
  }
  for (const text of [
    "lstatSync",
    "isSymbolicLink",
    "real path escapes packaged app root",
  ]) {
    if (!installerLib.includes(text)) {
      failures.push(
        `${installerLibPath}: must fail closed on symlink/non-regular packaged entries.`,
      );
    }
  }
  for (const text of [
    "expectedWindowsInstallerFilesOnDisk",
    "parseChecksums",
    "releaseNotesAttachedAsDownload",
    "manualWindowsReview",
    "publisherName",
    "sha512",
    "explicitAbsences",
  ]) {
    if (!verifierScript.includes(text)) {
      failures.push(`${verifyScriptPath}: missing ${text}`);
    }
  }
}

function checkDocs() {
  for (const text of [
    "v0.1.0-alpha.2",
    "Installer automation must reject `v0.1.0-alpha.1`",
    "desktop-installer-alpha",
    "publish: null",
    "RFC 3161 timestamp",
    "positive allowlist",
    "First-Launch Network Policy",
    "MediaPipe viewer assets must be bundled",
    "manual Windows VM review summary",
    "Signed-build order fixtures",
  ]) {
    if (!contract.includes(text)) failures.push(`${contractPath}: missing ${text}`);
  }
  if (!releasePolicy.includes("windows-installer-alpha.md")) {
    failures.push(
      `${releasePolicyPath}: must link the Windows installer alpha contract.`,
    );
  }
  if (!checklist.includes("Windows installer alpha channel")) {
    failures.push(`${checklistPath}: must mention Windows installer alpha channel.`);
  }
  for (const text of [
    "Windows installer alpha",
    "Signing Status",
    "Manual Windows Review",
    "What Is Not Included",
    "Uninstall",
    "certutil -hashfile",
  ]) {
    if (!template.includes(text)) failures.push(`${templatePath}: missing ${text}`);
  }
  const policy = readJson(environmentPolicyPath);
  if (policy.environment !== WINDOWS_INSTALLER_ENVIRONMENT) {
    failures.push(`${environmentPolicyPath}: environment name mismatch.`);
  }
}

function readRequired(relativePath) {
  if (!fs.existsSync(relativePath)) {
    failures.push(`${relativePath}: referenced file does not exist.`);
    return "";
  }
  return readText(relativePath);
}

function requireWorkflowText(text) {
  if (!workflow.includes(text)) failures.push(`${workflowPath}: missing ${text}`);
}

function sectionBetween(start, end) {
  const startIndex = workflow.indexOf(start);
  if (startIndex < 0) {
    failures.push(`${workflowPath}: missing section ${start}`);
    return "";
  }
  const endIndex = workflow.indexOf(end, startIndex + start.length);
  if (endIndex < 0) {
    failures.push(`${workflowPath}: missing end marker ${end}`);
    return workflow.slice(startIndex);
  }
  return workflow.slice(startIndex, endIndex);
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
    const run = extractRun(rawLines);
    const parsedRun = parseExecutableRun(run);
    return {
      index,
      name: extractScalarField(rawLines, "name"),
      run,
      executableText: [
        ...parsedRun.lines,
        ...parsedRun.heredocs.map((heredoc) => heredoc.body),
      ].join("\n"),
      heredocs: parsedRun.heredocs,
      lines: parsedRun.lines,
      pieces: parsedRun.pieces,
      uses: extractScalarField(rawLines, "uses"),
      raw,
    };
  });
}

function extractScalarField(rawLines, fieldName) {
  const pattern = new RegExp(`^\\s{6}(?:-\\s+)?${fieldName}:\\s*(.*)$`);
  for (const line of rawLines) {
    const match = pattern.exec(line);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function extractRun(rawLines) {
  const pattern = /^\s*(?:-\s+)?run:\s*(.*)$/;
  const runIndex = rawLines.findIndex((line) => pattern.test(line));
  if (runIndex < 0) return "";
  const value = pattern.exec(rawLines[runIndex])?.[1]?.trim() ?? "";
  if (value !== "|" && value !== ">") return value;
  return rawLines
    .slice(runIndex + 1)
    .map((line) => line.replace(/^\s{10}/, ""))
    .join("\n")
    .trim();
}

function requireRunStep(steps, command, jobName) {
  if (!steps.some((step) => step.lines.some((line) => line.includes(command)))) {
    failures.push(`${workflowPath}: ${jobName} is missing run step: ${command}`);
  }
}

function assertRunOrder(steps, first, second, jobName) {
  const firstIndex = steps.findIndex((step) =>
    step.lines.some((line) => line.includes(first)),
  );
  const secondIndex = steps.findIndex((step) =>
    step.lines.some((line) => line.includes(second)),
  );
  if (firstIndex < 0 || secondIndex < 0) return;
  if (firstIndex > secondIndex) {
    failures.push(`${workflowPath}: ${jobName} must run ${first} before ${second}.`);
  }
}

function parseExecutableRun(run) {
  const lines = [];
  const heredocs = [];
  const pieces = [];
  const rawLines = run.split(/\r?\n/);
  for (let index = 0; index < rawLines.length; index += 1) {
    const trimmed = rawLines[index].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^(?:echo|printf|Write-Host|Write-Output)\b/i.test(trimmed)) continue;
    if (/\bif\s+(?:false|\[\s*"?false"?\s*=|\[\[\s*"?false"?)/i.test(trimmed)) {
      failures.push(
        `${workflowPath}: release-critical run block contains an unreachable false branch.`,
      );
    }
    const heredocMatch = /<<['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(trimmed);
    if (!heredocMatch) {
      lines.push(trimmed);
      pieces.push({ kind: "shell", text: trimmed });
      continue;
    }
    const delimiter = heredocMatch[1];
    const body = [];
    for (index += 1; index < rawLines.length; index += 1) {
      if (rawLines[index].trim() === delimiter) break;
      body.push(rawLines[index]);
    }
    lines.push(trimmed);
    pieces.push({ kind: "shell", text: trimmed });
    heredocs.push({
      body: body.join("\n"),
      commandLine: trimmed,
      delimiter,
    });
    pieces.push({ kind: "heredoc", text: body.join("\n") });
  }
  return { heredocs, lines, pieces };
}

function assertReleaseJobShape(releaseSteps, releaseJob) {
  if (releaseSteps.length !== 1) {
    failures.push("create-windows-installer-release must have exactly one shell step.");
    return;
  }
  const step = releaseSteps[0];
  if (step.uses)
    failures.push("create-windows-installer-release must not run reusable Actions.");
  for (const text of [
    "GH_REPO:",
    "GH_TOKEN:",
    'gh run download "$GITHUB_RUN_ID"',
    '--repo "$GH_REPO"',
    '[[ "$VERSION" =~ ^([0-9]+)\\.([0-9]+)\\.([0-9]+)-alpha\\.([0-9]+)$ ]]',
    bashAlphaThresholdCheck,
    "expected_files=(",
    "checksums.txt",
    "release notes sha512 mismatch",
    "checksum filename must be a basename",
    "expectedChecksumNames",
    "checksumsByAlgorithm",
    "checksums.txt entries mismatch",
    'if [ "$tag_type" != "tag" ]',
    'test "$peeled_sha" = "$GITHUB_SHA"',
    'gh release create "$RELEASE_REF"',
    "--draft",
    "--prerelease",
  ]) {
    if (!hasExecutableReleaseText(step, text)) {
      failures.push(`create-windows-installer-release is missing ${text}.`);
    }
  }
  assertExecutableOrder(
    step,
    'gh run download "$GITHUB_RUN_ID"',
    "checksums.txt entries mismatch",
    "create-windows-installer-release",
  );
  assertExecutableOrder(
    step,
    "checksums.txt entries mismatch",
    'gh release create "$RELEASE_REF"',
    "create-windows-installer-release",
  );
  if (/actions\/checkout|actions\/download-artifact|npm ci|npm run/.test(releaseJob)) {
    failures.push(
      "create-windows-installer-release must not checkout, download via action, install, or run npm scripts.",
    );
  }
  const assetsMatch = /assets=\(\s*(?<body>[\s\S]*?)\s*\)\s*for file in/.exec(releaseJob);
  if (!assetsMatch?.groups?.body) {
    failures.push("create-windows-installer-release must define assets=().");
    return;
  }
  const actual = [...assetsMatch.groups.body.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1].replace("tmp/windows-installer-alpha-assets/", ""))
    .sort((a, b) => a.localeCompare(b));
  assertSameSet(
    actual,
    expectedWindowsInstallerDownloadableAssetNames("$VERSION"),
    "create-windows-installer-release assets=()",
  );
}

function hasExecutableReleaseText(step, text) {
  if (step.raw.includes(text) && /^(?:GH_REPO|GH_TOKEN):/.test(text)) return true;
  if (step.lines.some((line) => line.includes(text))) return true;
  return step.heredocs.some(
    (heredoc) => heredoc.commandLine.includes("node") && heredoc.body.includes(text),
  );
}

function assertExecutableOrder(step, first, second, jobName) {
  const firstIndex = step.pieces.findIndex((piece) => piece.text.includes(first));
  const secondIndex = step.pieces.findIndex((piece) => piece.text.includes(second));
  if (firstIndex < 0 || secondIndex < 0) return;
  if (firstIndex > secondIndex) {
    failures.push(`${workflowPath}: ${jobName} must run ${first} before ${second}.`);
  }
}

function assertSameSet(actualValue, expectedValue, label) {
  const actual = [...actualValue].sort((a, b) => String(a).localeCompare(String(b)));
  const expected = [...expectedValue].sort((a, b) => String(a).localeCompare(String(b)));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${label} must equal ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`,
    );
  }
}
