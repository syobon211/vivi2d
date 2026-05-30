import fs from "node:fs";
import path from "node:path";
import { readJson, repoRoot, run } from "./lib/repo.mjs";
import {
  assertWindowsInstallerTag,
  describeFileForRecord,
  directorySizeBytes,
  expectedWindowsInstallerDownloadableAssetNames,
  MAX_INSTALLED_FOOTPRINT_BYTES,
  MAX_INSTALLER_BYTES,
  resolveInsideRepo,
  TEXT_FILE_EXTENSIONS,
  WINDOWS_APP_FORBIDDEN_FILE_NAMES,
  WINDOWS_APP_FORBIDDEN_PATH_PATTERNS,
  WINDOWS_APP_FORBIDDEN_TEXT_PATTERNS,
  WINDOWS_INSTALLER_ENVIRONMENT,
  walkFiles,
  windowsInstallerAssetNames,
} from "./lib/windows-installer-alpha.mjs";

const options = parseArgs(process.argv.slice(2));
const version = requireOption("version");
const tag = options.tag ?? `v${version}`;
assertWindowsInstallerTag(version, tag);

const assetNames = windowsInstallerAssetNames(version);
const outputDir = resolveInsideRepo(
  options.output ?? "tmp/windows-installer-alpha-assets",
);
const installerInput = resolveInsideRepo(
  options.installer ?? `dist/windows-installer/${assetNames.installer}`,
);
const packagedAppDir = resolveInsideRepo(
  options["packaged-app-dir"] ?? "dist/windows-installer/win-unpacked",
);
const sourceReviewZip = resolveInsideRepo(
  options["source-review-zip"] ?? "tmp/source-review/vivi2d-source-review.zip",
);
const sourceReviewManifest = resolveInsideRepo(
  options["source-review-manifest"] ??
    "tmp/source-review/vivi2d-source-review-manifest.json",
);
const sbom = resolveInsideRepo(options.sbom ?? "dist/sbom/vivi2d.cdx.json");
const notices = resolveInsideRepo(
  options["third-party-notices"] ?? options.notices ?? "THIRD_PARTY_NOTICES",
);
const releaseNotesTemplate = resolveInsideRepo(
  options["release-notes-template"] ??
    "docs/developer/quality/templates/windows-installer-alpha-notes.md",
);
const signingStatus = options["signing-status"] ?? "unsigned";
const chromiumMajorVersion = requireOption("chromium-major-version");
const electronEmbeddedNodeVersion = requireOption("electron-embedded-node-version");
const manualReview = parseManualReview(options["manual-review-json"]);

if (signingStatus !== "unsigned") {
  throw new Error(
    "The first Windows installer alpha implementation supports unsigned builds only.",
  );
}

for (const required of [
  installerInput,
  packagedAppDir,
  sourceReviewZip,
  sourceReviewManifest,
  sbom,
  notices,
  releaseNotesTemplate,
]) {
  if (!fs.existsSync(required)) {
    throw new Error(`Missing Windows installer release input: ${relative(required)}`);
  }
}

const installerInputStats = fs.statSync(installerInput);
if (!installerInputStats.isFile()) {
  throw new Error(`Installer input must be a file: ${relative(installerInput)}`);
}
if (installerInputStats.size > MAX_INSTALLER_BYTES) {
  throw new Error(
    `${relative(installerInput)} exceeds the 300 MiB installer alpha budget.`,
  );
}

const installedFootprintBytes = directorySizeBytes(packagedAppDir);
if (installedFootprintBytes > MAX_INSTALLED_FOOTPRINT_BYTES) {
  throw new Error(
    `${relative(packagedAppDir)} exceeds the 700 MiB installed footprint budget.`,
  );
}
scanPackagedApp(packagedAppDir);

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const copiedAssets = [
  copyAsset(installerInput, assetNames.installer),
  copyAsset(sourceReviewZip, assetNames.sourceReviewZip),
  copyAsset(sourceReviewManifest, assetNames.sourceReviewManifest),
  copyAsset(sbom, assetNames.sbom),
  copyAsset(notices, assetNames.notices),
];

const sourceCommit = run("git", ["rev-parse", "HEAD"]).stdout.trim();
const rootPackage = readJson("package.json");
const electronPackage = readJson("node_modules/electron/package.json");
const electronBuilderPackage = readJson("node_modules/electron-builder/package.json");
const electronGetPackage = readJson("node_modules/@electron/get/package.json");
const toolManifest = readJson("scripts/release-tool-versions.json");
assertToolVersion("electronBuilder", electronBuilderPackage.version);
assertToolVersion("electron", electronPackage.version);
assertToolVersion("electronGet", electronGetPackage.version);

const releaseNotesPath = path.join(outputDir, assetNames.releaseNotes);
const releaseNotes = fs
  .readFileSync(releaseNotesTemplate, "utf8")
  .replaceAll("<version>", version)
  .replaceAll("<tag>", tag)
  .replaceAll("<commit-sha>", sourceCommit)
  .replaceAll("<electron-version>", electronPackage.version)
  .replaceAll("<chromium-major-version>", chromiumMajorVersion)
  .replaceAll("<signing-status>", signingStatus)
  .replaceAll("<manual-review-status>", manualReview.status);
fs.writeFileSync(releaseNotesPath, releaseNotes);
const releaseNotesAsset = describeFileForRecord(releaseNotesPath);

const installerRecordPath = path.join(outputDir, assetNames.installerRecord);
const releaseRecord = {
  schemaVersion: 1,
  releaseKind: "windows-installer-alpha",
  version,
  tag,
  sourceCommit,
  generatedAt: new Date().toISOString(),
  platform: {
    os: "windows",
    architecture: "x64",
    installerFormat: "nsis",
  },
  packageVersion: rootPackage.version,
  runtimeVersions: {
    electron: electronPackage.version,
    chromiumMajor: chromiumMajorVersion,
    electronEmbeddedNode: electronEmbeddedNodeVersion,
    packagingNode: process.version.replace(/^v/, ""),
  },
  packager: {
    name: "electron-builder",
    version: electronBuilderPackage.version,
    electronGetVersion: electronGetPackage.version,
  },
  electronBinary: {
    source: "npm electron package",
    checksumMechanism: "node_modules/electron/checksums.json",
    exception: null,
  },
  primaryAssets: copiedAssets.map((asset) => ({
    name: asset.name,
    sizeBytes: asset.sizeBytes,
    sha256: asset.sha256,
    sha512: asset.sha512,
  })),
  downloadableAssetNames: expectedWindowsInstallerDownloadableAssetNames(version),
  checksumFile: assetNames.checksums,
  releaseNotesFile: assetNames.releaseNotes,
  releaseNotesAttachedAsDownload: false,
  releaseNotes: releaseNotesAsset,
  codeSigning: {
    status: "unsigned",
    publisherName: null,
    certificateSha256: null,
    timestampAuthorityUrl: null,
    verificationSummary: "unsigned alpha approved by protected environment",
  },
  protectedEnvironment: {
    name: WINDOWS_INSTALLER_ENVIRONMENT,
    approvalSummary: "owner approval required before publishing",
  },
  buildProvenance: {
    status: "exception",
    attestationUrl: null,
    exception:
      "GitHub artifact attestation attachment is deferred until its exact filename is allowlisted.",
  },
  manualWindowsReview: manualReview,
  sizeBudgets: {
    maxInstallerBytes: MAX_INSTALLER_BYTES,
    installerBytes: installerInputStats.size,
    maxInstalledFootprintBytes: MAX_INSTALLED_FOOTPRINT_BYTES,
    installedFootprintBytes,
  },
  explicitAbsences: {
    autoUpdateMetadata: true,
    bundledComfyUi: true,
    bundledSeeThrough: true,
    modelWeights: true,
    pythonWheels: true,
    standaloneNativeRuntime: true,
    standaloneWasmRuntime: true,
  },
  requiredGateTranscripts: [
    "check-quality",
    "check-quality-e2e-workflow-record",
    "check-oss-readiness",
    "check-oss-publication",
    "check-release-surface",
    "check-license-policy",
    "check-sbom",
    "check-source-review-archive",
    "check-viewer-mediapipe-assets",
    "check-history-secrets",
    "windows-installer-build",
    "verify-windows-installer-assets",
  ],
};
fs.writeFileSync(installerRecordPath, `${JSON.stringify(releaseRecord, null, 2)}\n`);

const installerRecordAsset = describeFileForRecord(installerRecordPath);
const downloadableAssets = [...copiedAssets, installerRecordAsset].sort((a, b) =>
  a.name.localeCompare(b.name),
);
writeChecksums(path.join(outputDir, assetNames.checksums), downloadableAssets);

console.log(`[windows-installer-alpha] wrote ${relative(outputDir)}`);
for (const asset of [
  ...downloadableAssets,
  describeFileForRecord(path.join(outputDir, assetNames.checksums)),
  releaseNotesAsset,
]) {
  console.log(`[windows-installer-alpha] ${asset.name} ${asset.sha256}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requireOption(name) {
  const value = options[name];
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function copyAsset(sourcePath, name) {
  const target = path.join(outputDir, name);
  fs.copyFileSync(sourcePath, target);
  return describeFileForRecord(target);
}

function writeChecksums(checksumsPath, assets) {
  const lines = [];
  for (const asset of assets) {
    lines.push(`sha256  ${asset.sha256.replace(/^sha256:/, "")}  ${asset.name}`);
    lines.push(`sha512  ${asset.sha512.replace(/^sha512:/, "")}  ${asset.name}`);
  }
  fs.writeFileSync(checksumsPath, `${lines.join("\n")}\n`);
}

function scanPackagedApp(appDir) {
  const failures = [];
  for (const filePath of walkFiles(appDir)) {
    const relativePath = path.relative(appDir, filePath).replaceAll("\\", "/");
    const basename = path.basename(filePath);
    if (WINDOWS_APP_FORBIDDEN_FILE_NAMES.has(basename)) {
      failures.push(`${relativePath}: forbidden packaged app file.`);
    }
    if (basename.endsWith(".map")) {
      failures.push(`${relativePath}: sourcemaps are forbidden in installer alpha.`);
    }
    for (const rule of WINDOWS_APP_FORBIDDEN_PATH_PATTERNS) {
      if (rule.pattern.test(relativePath))
        failures.push(`${relativePath}: ${rule.label}.`);
    }
    if (!TEXT_FILE_EXTENSIONS.has(path.extname(filePath))) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rule of WINDOWS_APP_FORBIDDEN_TEXT_PATTERNS) {
      if (rule.pattern.test(text)) failures.push(`${relativePath}: ${rule.label}.`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Packaged app scan failed:\n- ${failures.join("\n- ")}`);
  }
}

function parseManualReview(rawValue) {
  const fallback = {
    firstLaunchNetworkPassed: false,
    installPassed: false,
    intentionalRemnants: [],
    reviewedBy: "",
    reviewDate: "",
    status: "pending",
    uninstallPassed: false,
    windowsVersion: "",
  };
  const rawJson =
    rawValue ??
    process.env.VIVI2D_WINDOWS_MANUAL_REVIEW_JSON ??
    process.env.MANUAL_REVIEW_JSON;
  const value = rawJson ? JSON.parse(rawJson) : fallback;
  if (!["pending", "passed"].includes(value.status)) {
    throw new Error("manualWindowsReview.status must be pending or passed.");
  }
  if (!Array.isArray(value.intentionalRemnants)) {
    throw new Error("manualWindowsReview.intentionalRemnants must be an array.");
  }
  return {
    firstLaunchNetworkPassed: Boolean(value.firstLaunchNetworkPassed),
    installPassed: Boolean(value.installPassed),
    intentionalRemnants: value.intentionalRemnants,
    reviewedBy: String(value.reviewedBy ?? ""),
    reviewDate: String(value.reviewDate ?? ""),
    status: value.status,
    uninstallPassed: Boolean(value.uninstallPassed),
    windowsVersion: String(value.windowsVersion ?? ""),
  };
}

function assertToolVersion(toolName, actualVersion) {
  const expectedVersion = toolManifest.tools?.[toolName]?.version;
  if (!expectedVersion) {
    throw new Error(`scripts/release-tool-versions.json is missing ${toolName}.`);
  }
  if (expectedVersion !== actualVersion) {
    throw new Error(
      `${toolName} version mismatch: expected ${expectedVersion}, found ${actualVersion}.`,
    );
  }
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}
