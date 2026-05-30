import fs from "node:fs";
import path from "node:path";
import {
  assertWindowsInstallerTag,
  describeFileForRecord,
  expectedWindowsInstallerDownloadableAssetNames,
  expectedWindowsInstallerFilesOnDisk,
  MAX_INSTALLED_FOOTPRINT_BYTES,
  MAX_INSTALLER_BYTES,
  matchesForbiddenGlob,
  resolveInsideRepo,
  WINDOWS_INSTALLER_ENVIRONMENT,
  WINDOWS_INSTALLER_FORBIDDEN_GLOBS,
  windowsInstallerAssetNames,
} from "./lib/windows-installer-alpha.mjs";

const args = parseArgs(process.argv.slice(2));
const assetDir = resolveInsideRepo(requireOption("asset-dir"));
const version = requireOption("version");
const tag = requireOption("tag");
const sha = requireOption("sha");
assertWindowsInstallerTag(version, tag);

const assetNames = windowsInstallerAssetNames(version);
const expectedFiles = expectedWindowsInstallerFilesOnDisk(version);
const expectedDownloadable = expectedWindowsInstallerDownloadableAssetNames(version);
const actualFiles = fs
  .readdirSync(assetDir, { withFileTypes: true })
  .map((entry) => {
    if (!entry.isFile())
      throw new Error(`Unexpected non-file asset entry: ${entry.name}`);
    return entry.name;
  })
  .sort((a, b) => a.localeCompare(b));
assertSameSet(actualFiles, expectedFiles, "Windows installer asset directory entries");

for (const name of actualFiles) {
  if (expectedDownloadable.includes(name) || name === assetNames.releaseNotes) {
    continue;
  }
  for (const glob of WINDOWS_INSTALLER_FORBIDDEN_GLOBS) {
    if (matchesForbiddenGlob(name, glob)) {
      throw new Error(`${name}: forbidden installer asset matched ${glob}.`);
    }
  }
}

for (const name of expectedFiles) {
  const filePath = path.join(assetDir, name);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Missing Windows installer release file: ${name}`);
  }
}

const checksums = parseChecksums(path.join(assetDir, assetNames.checksums));
const expectedChecksumNames = expectedDownloadable.filter(
  (name) => name !== assetNames.checksums,
);
for (const algorithm of ["sha256", "sha512"]) {
  assertSameSet(
    [...(checksums.get(algorithm)?.keys() ?? [])],
    expectedChecksumNames,
    `${algorithm} checksums.txt entries`,
  );
}
for (const name of expectedChecksumNames) {
  const actual = describeFileForRecord(path.join(assetDir, name));
  assertDigest(checksums, "sha256", name, actual.sha256);
  assertDigest(checksums, "sha512", name, actual.sha512);
}

const recordPath = path.join(assetDir, assetNames.installerRecord);
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
assertRecord(record);

console.log("[windows-installer-alpha] verified");

function assertRecord(record) {
  if (record.schemaVersion !== 1)
    throw new Error("installer record schemaVersion mismatch.");
  if (record.releaseKind !== "windows-installer-alpha") {
    throw new Error("installer record releaseKind mismatch.");
  }
  if (record.version !== version) throw new Error("installer record version mismatch.");
  if (record.tag !== tag) throw new Error("installer record tag mismatch.");
  if (record.sourceCommit !== sha)
    throw new Error("installer record sourceCommit mismatch.");
  if (record.releaseNotesAttachedAsDownload !== false) {
    throw new Error("release-notes.md must not be a downloadable asset.");
  }
  if (record.releaseNotesFile !== assetNames.releaseNotes) {
    throw new Error("installer record releaseNotesFile mismatch.");
  }
  if (record.checksumFile !== assetNames.checksums) {
    throw new Error("installer record checksumFile mismatch.");
  }
  assertSameSet(
    record.downloadableAssetNames ?? [],
    expectedDownloadable,
    "installer record downloadableAssetNames",
  );
  if ((record.downloadableAssetNames ?? []).includes(assetNames.releaseNotes)) {
    throw new Error("release-notes.md must not be listed as downloadable.");
  }
  if (record.protectedEnvironment?.name !== WINDOWS_INSTALLER_ENVIRONMENT) {
    throw new Error("installer record protected environment mismatch.");
  }
  if (record.codeSigning?.status !== "unsigned") {
    throw new Error(
      "first Windows installer alpha verifier supports unsigned builds only.",
    );
  }
  if (record.codeSigning?.publisherName !== null) {
    throw new Error("unsigned installer must not claim a publisher name.");
  }
  if (record.codeSigning?.certificateSha256 !== null) {
    throw new Error("unsigned installer must not record a certificate digest.");
  }
  if (record.codeSigning?.timestampAuthorityUrl !== null) {
    throw new Error("unsigned installer must not record a timestamp authority.");
  }
  if (!record.codeSigning?.verificationSummary?.includes("unsigned")) {
    throw new Error("unsigned installer record must summarize unsigned approval.");
  }
  if (!record.buildProvenance?.status) {
    throw new Error("installer record must include buildProvenance status.");
  }
  if (
    !record.manualWindowsReview ||
    !["pending", "passed"].includes(record.manualWindowsReview.status)
  ) {
    throw new Error("installer record must include manualWindowsReview status.");
  }
  if (!Array.isArray(record.manualWindowsReview.intentionalRemnants)) {
    throw new Error("manualWindowsReview.intentionalRemnants must be an array.");
  }
  if (record.sizeBudgets?.installerBytes > MAX_INSTALLER_BYTES) {
    throw new Error("installer exceeds size budget.");
  }
  if (record.sizeBudgets?.installedFootprintBytes > MAX_INSTALLED_FOOTPRINT_BYTES) {
    throw new Error("installed app footprint exceeds size budget.");
  }
  if (record.explicitAbsences?.autoUpdateMetadata !== true) {
    throw new Error("installer record must state auto-update metadata absence.");
  }
  for (const key of [
    "bundledComfyUi",
    "bundledSeeThrough",
    "modelWeights",
    "pythonWheels",
    "standaloneNativeRuntime",
    "standaloneWasmRuntime",
  ]) {
    if (record.explicitAbsences?.[key] !== true) {
      throw new Error(`installer record must state explicit absence of ${key}.`);
    }
  }

  const releaseNotesActual = describeFileForRecord(
    path.join(assetDir, assetNames.releaseNotes),
  );
  if (record.releaseNotes?.name !== assetNames.releaseNotes) {
    throw new Error("installer record releaseNotes name mismatch.");
  }
  if (record.releaseNotes?.sizeBytes !== releaseNotesActual.sizeBytes) {
    throw new Error("release notes size mismatch.");
  }
  if (record.releaseNotes?.sha256 !== releaseNotesActual.sha256) {
    throw new Error("release notes sha256 mismatch.");
  }
  if (record.releaseNotes?.sha512 !== releaseNotesActual.sha512) {
    throw new Error("release notes sha512 mismatch.");
  }

  const primaryAssetNames = (record.primaryAssets ?? [])
    .map((asset) => asset?.name)
    .sort((a, b) => String(a).localeCompare(String(b)));
  assertSameSet(
    primaryAssetNames,
    expectedDownloadable.filter(
      (name) => name !== assetNames.checksums && name !== assetNames.installerRecord,
    ),
    "installer record primaryAssets",
  );
  for (const asset of record.primaryAssets ?? []) {
    const actual = describeFileForRecord(path.join(assetDir, asset.name));
    if (asset.sizeBytes !== actual.sizeBytes) {
      throw new Error(`${asset.name}: installer record size mismatch.`);
    }
    if (asset.sha256 !== actual.sha256) {
      throw new Error(`${asset.name}: installer record sha256 mismatch.`);
    }
    if (asset.sha512 !== actual.sha512) {
      throw new Error(`${asset.name}: installer record sha512 mismatch.`);
    }
  }
}

function parseChecksums(filePath) {
  const parsed = new Map([
    ["sha256", new Map()],
    ["sha512", new Map()],
  ]);
  for (const [index, line] of fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .entries()) {
    if (!line) continue;
    const match = /^(sha256|sha512) {2}([0-9a-f]+) {2}([^\s].*)$/i.exec(line);
    if (!match) throw new Error(`checksums.txt:${index + 1}: invalid checksum line.`);
    const algorithm = match[1].toLowerCase();
    const digest = match[2].toLowerCase();
    const name = match[3];
    const expectedLength = algorithm === "sha256" ? 64 : 128;
    if (digest.length !== expectedLength) {
      throw new Error(`checksums.txt:${index + 1}: invalid ${algorithm} digest length.`);
    }
    if (path.basename(name) !== name || name.includes("/") || name.includes("\\")) {
      throw new Error(`checksums.txt:${index + 1}: checksum path must be a file name.`);
    }
    const bucket = parsed.get(algorithm);
    if (bucket.has(name)) {
      throw new Error(
        `checksums.txt:${index + 1}: duplicate ${algorithm} entry ${name}.`,
      );
    }
    bucket.set(name, `${algorithm}:${digest}`);
  }
  return parsed;
}

function assertDigest(checksums, algorithm, name, actual) {
  const expected = checksums.get(algorithm)?.get(name);
  if (expected !== actual) {
    throw new Error(`${name}: ${algorithm} checksum mismatch.`);
  }
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
  const value = args[name];
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function assertSameSet(actualValue, expectedValue, label) {
  const actual = [...actualValue].sort((a, b) => String(a).localeCompare(String(b)));
  const expected = [...expectedValue].sort((a, b) => String(a).localeCompare(String(b)));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} must equal ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`,
    );
  }
}
