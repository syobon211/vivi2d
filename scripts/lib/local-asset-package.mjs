// Fixed Editor package inputs, separate from the npm-only SBOM.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const LOCAL_ASSET_PACKAGE_DIRECTORY =
  "resources/app/electron/generated/native-local-asset/win32-x64";
export const LOCAL_ASSET_PACKAGE_FILES = Object.freeze([
  "vivi_local_asset_v1.node",
  "manifest.json",
  "NATIVE_LOCAL_ASSET_NOTICES.txt",
  "native-local-asset.cdx.json",
  "vcruntime140.dll",
]);
const runtimeNotices = [
  [
    "LICENSE.electron.txt",
    "LICENSE",
    1096,
    "5154e165bd6c2cc0cfbcd8916498c7abab0497923bafcd5cb07673fe8480087d",
  ],
  [
    "LICENSES.chromium.html",
    "LICENSES.chromium.html",
    20367775,
    "5d545ce8065079f38a82472ab93bd62fcdf73cd319f0771ef51c45c7e243f1d4",
  ],
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidenceScope =
  "Exact unpacked Editor inputs; native SBOM supplements the npm SBOM. Not installer execution, legal clearance or release approval.";
const exactKeys = (value, expected) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
function readRegular(file) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase()
  ) {
    throw Error("Nonregular or redirected native package input");
  }
  return fs.readFileSync(file);
}

export function verifyLocalAssetPackage({ root, appOutDir }) {
  if (fs.readdirSync(appOutDir).some((name) => /^vcruntime140(?:_1)?\.dll$/i.test(name)))
    throw Error("Executable-root CRT duplicate is forbidden");
  const nativeDirectory = path.join(appOutDir, LOCAL_ASSET_PACKAGE_DIRECTORY);
  const entries = fs.readdirSync(nativeDirectory).sort();
  if (JSON.stringify(entries) !== JSON.stringify([...LOCAL_ASSET_PACKAGE_FILES].sort())) {
    throw Error("Native package must contain exactly the five admitted files");
  }
  const files = [];
  const compare = (relative, source, expectedBytes, expectedHash) => {
    const wanted = readRegular(source);
    if (
      (expectedBytes !== undefined && wanted.length !== expectedBytes) ||
      (expectedHash !== undefined && sha256(wanted) !== expectedHash)
    ) {
      throw Error("Fixed native package authority changed");
    }
    const actual = readRegular(path.join(appOutDir, relative));
    if (!actual.equals(wanted)) throw Error(`Native package input differs: ${relative}`);
    files.push({ path: relative, byteLength: actual.length, sha256: sha256(actual) });
  };
  for (const name of LOCAL_ASSET_PACKAGE_FILES) {
    compare(
      `${LOCAL_ASSET_PACKAGE_DIRECTORY}/${name}`,
      path.join(root, "electron/generated/native-local-asset/win32-x64", name),
    );
  }
  for (const [target, source, size, hash] of runtimeNotices) {
    compare(target, path.join(root, "node_modules/electron/dist", source), size, hash);
  }
  compare("resources/app/LICENSE", path.join(root, "LICENSE"));
  compare(
    "resources/app/THIRD_PARTY_NOTICES.txt",
    path.join(root, "THIRD_PARTY_NOTICES"),
  );
  const manifest = JSON.parse(readRegular(path.join(nativeDirectory, "manifest.json")));
  const addon = files.find((item) => item.path.endsWith("/vivi_local_asset_v1.node"));
  if (
    manifest.format !== 1 ||
    manifest.platform !== "win32" ||
    manifest.arch !== "x64" ||
    manifest.addon.byteLength !== addon.byteLength ||
    manifest.addon.sha256 !== addon.sha256
  ) {
    throw Error("Packaged native manifest does not bind the actual addon");
  }
  const sbom = JSON.parse(
    readRegular(path.join(nativeDirectory, "native-local-asset.cdx.json")),
  );
  const properties = sbom.metadata?.properties;
  const property = (name) => {
    const matches = Array.isArray(properties)
      ? properties.filter((item) => item?.name === `vivi:native:${name}`)
      : [];
    return matches.length === 1 ? matches[0].value : null;
  };
  const digestOf = (name) =>
    files.find((item) => item.path === `${LOCAL_ASSET_PACKAGE_DIRECTORY}/${name}`).sha256;
  if (
    sbom.bomFormat !== "CycloneDX" ||
    sbom.specVersion !== "1.6" ||
    !sbom.metadata?.component?.hashes?.some(
      (item) => item.alg === "SHA-256" && item.content === addon.sha256,
    ) ||
    property("buildManifestSha256") !== digestOf("manifest.json") ||
    property("noticeSha256") !== digestOf("NATIVE_LOCAL_ASSET_NOTICES.txt") ||
    property("cargoLockSha256") !== manifest.inputs?.lock?.sha256
  ) {
    throw Error("Native supplement does not bind the exact packaged inputs");
  }
  const evidence = {
    format: 1,
    kind: "editor-local-asset-native-package-inputs",
    files,
    scope: evidenceScope,
  };
  assertLocalAssetPackageEvidence(evidence);
  return evidence;
}

// The Linux release verifier can validate the evidence shape, not re-open a
// Windows installer. Actual bytes are checked above before package preparation.
export function assertLocalAssetPackageEvidence(evidence) {
  const expected = [
    ...LOCAL_ASSET_PACKAGE_FILES.map(
      (name) => `${LOCAL_ASSET_PACKAGE_DIRECTORY}/${name}`,
    ),
    "LICENSE.electron.txt",
    "LICENSES.chromium.html",
    "resources/app/LICENSE",
    "resources/app/THIRD_PARTY_NOTICES.txt",
  ].sort();
  if (
    !exactKeys(evidence, ["format", "kind", "files", "scope"]) ||
    evidence.format !== 1 ||
    evidence.kind !== "editor-local-asset-native-package-inputs" ||
    evidence.scope !== evidenceScope ||
    !Array.isArray(evidence.files) ||
    evidence.files.length !== expected.length ||
    JSON.stringify(evidence.files.map((item) => item?.path).sort()) !==
      JSON.stringify(expected) ||
    evidence.files.some(
      (item) =>
        !exactKeys(item, ["path", "byteLength", "sha256"]) ||
        !Number.isSafeInteger(item.byteLength) ||
        item.byteLength <= 0 ||
        typeof item.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(item.sha256),
    )
  ) {
    throw Error("Invalid native package input evidence");
  }
}
