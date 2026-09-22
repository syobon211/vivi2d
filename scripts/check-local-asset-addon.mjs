// Mandatory Windows job: actual native linking and actual Electron, never Node-only.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLocalAssetAddon,
  buildLocalAssetManifestSeeder,
  buildLocalAssetTestAddon,
  checkLocalAssetNativeNotices,
} from "./build-local-asset-addon.mjs";
import {
  assertLocalAssetPackageEvidence,
  LOCAL_ASSET_PACKAGE_FILES,
  verifyLocalAssetPackage,
} from "./lib/local-asset-package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = [
  "electron/native-local-asset/addon.c",
  "electron/native-local-asset/delay-load.c",
  "electron/native-local-asset/addon.def",
  "electron/native-local-asset.cjs",
  "scripts/build-local-asset-addon.mjs",
  "scripts/check-local-asset-addon.mjs",
  "scripts/fixtures/local-asset-addon-electron.cjs",
  "scripts/fixtures/local-asset-addon-regressions.cjs",
  "scripts/fixtures/local-asset-manifest-seed.rs",
  "electron/__tests__/native-local-asset-loader.test.ts",
  "scripts/lib/local-asset-native-notices.mjs",
  "scripts/fixtures/local-asset-native-notices-v1.json",
  "scripts/local-asset-native-notices.node-test.mjs",
  "scripts/lib/local-asset-package.mjs",
  "scripts/check-local-asset-after-pack.cjs",
  "scripts/fixtures/local-asset-ports-electron.cjs",
  "scripts/build-local-exchange-host.mjs",
  "electron/local-asset-copy.ts",
  "electron/local-exchange-host.ts",
  "electron-builder.yml",
  "packages/runtime-c-abi/include/vivi_local_asset_preview.h",
  "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/local_asset/preview.rs",
  "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/local_asset/preview/tests.rs",
  "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/local_asset.rs",
];
function sourcePin(file) {
  const full = path.join(root, file),
    stat = fs.lstatSync(full),
    bytes = fs.readFileSync(full);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(full).toLowerCase() !== full.toLowerCase()
  )
    throw Error("Redirected check source");
  return {
    path: file,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const sourcePinsBefore = sourceFiles.map(sourcePin);
if (process.platform !== "win32" || process.arch !== "x64")
  throw Error("Required local Asset addon job needs Windows x64; no substitute PASS");
const previousRustc = process.env.RUSTC;
const hostileRustc = path.join(
  root,
  "target/local-asset-addon-v1/intentionally-not-a-compiler.exe",
);
if (fs.existsSync(hostileRustc))
  throw Error("Compiler regression sentinel must not exist");
let manifest;
try {
  process.env.RUSTC = hostileRustc;
  manifest = await buildLocalAssetAddon();
} finally {
  if (previousRustc === undefined) delete process.env.RUSTC;
  else process.env.RUSTC = previousRustc;
}
const testAddons = buildLocalAssetTestAddon(manifest);
const testAddon = testAddons.addon;
const seeder = buildLocalAssetManifestSeeder(manifest);
const output = fs.mkdtempSync(path.join(root, "target/local-asset-addon-v1/check-"));
// All Electron launches use an empty owned directory outside both app layouts.
const launchCwd = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-local-asset-cwd-"));
const nativeNotices = await checkLocalAssetNativeNotices(manifest);
const generated = path.join(root, "electron/generated/native-local-asset/win32-x64");
const electronDist = path.join(root, "node_modules/electron/dist");
const sourceExecutable = path.join(electronDist, "electron.exe");
const driver = path.join(root, "scripts/fixtures/local-asset-addon-electron.cjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidence = [];
function run(executable, args, name, timeout = 120000, cwd = root) {
  const env = { ...process.env, UV_THREADPOOL_SIZE: "1" };
  for (const key of Object.keys(env))
    if (/^(ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH)$/i.test(key)) delete env[key];
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const log = `${result.stdout || ""}${result.stderr || ""}`;
  fs.writeFileSync(path.join(output, `${name}.log`), log, { flag: "wx" });
  if (result.error || result.status !== 0) {
    process.stderr.write(log);
    throw Error(`${name} failed (${result.status}); owned evidence retained`);
  }
  return log;
}
const regressionDirectory = path.join(output, "review-regressions");
run(
  process.execPath,
  ["--test", path.join(root, "scripts/local-asset-native-notices.node-test.mjs")],
  "native-notice-regressions",
);
fs.mkdirSync(regressionDirectory);
const regressionReportPath = path.join(regressionDirectory, "report.json");
const regressionConfig = path.join(regressionDirectory, "config.json");
fs.writeFileSync(
  regressionConfig,
  JSON.stringify({
    ownedDirectory: regressionDirectory,
    reportPath: regressionReportPath,
    testAddon,
    releaseAddon: path.join(generated, "vivi_local_asset_v1.node"),
  }),
  { flag: "wx" },
);
run(
  sourceExecutable,
  [
    path.join(root, "scripts/fixtures/local-asset-addon-regressions.cjs"),
    regressionConfig,
  ],
  "review-regressions",
  120000,
  launchCwd,
);
const reviewRegressions = JSON.parse(fs.readFileSync(regressionReportPath, "utf8"));
if (reviewRegressions.status !== "PASS" || reviewRegressions.failures.length !== 0)
  throw Error("Native review regression failed");
function actualElectron(executable, appRoot, name, withTestControls) {
  const ownedDirectory = path.join(output, name);
  fs.mkdirSync(ownedDirectory);
  const reportPath = path.join(ownedDirectory, "report.json"),
    config = path.join(ownedDirectory, "config.json");
  const manifestSource = path.join(ownedDirectory, "manifest-source");
  fs.mkdirSync(manifestSource);
  const manifestRef = JSON.parse(
    run(
      seeder.executable,
      ["seed", path.join(manifestSource, "store.sqlite3"), "manifest-source"],
      `${name}-manifest-seed`,
    ).trim(),
  );
  fs.writeFileSync(
    config,
    JSON.stringify({
      appRoot,
      ownedDirectory,
      reportPath,
      manifestRef,
      testAddon: withTestControls ? testAddon : null,
      initializationFailureAddon: withTestControls
        ? testAddons.initializationFailure
        : null,
      crtSha256: nativeNotices.crt.sha256,
    }),
    { flag: "wx" },
  );
  run(executable, ["--js-flags=--expose-gc", driver, config], name, 120000, launchCwd);
  const verified = JSON.parse(
    run(
      seeder.executable,
      [
        "verify",
        path.join(ownedDirectory, "manifest-receiver/store.sqlite3"),
        "manifest-receiver",
      ],
      `${name}-manifest-verify`,
    ).trim(),
  );
  if (JSON.stringify(verified) !== JSON.stringify(manifestRef))
    throw Error("Transferred manifest reference changed");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (
    report.status !== "PASS" ||
    report.electron !== "42.9.3" ||
    !report.realNativeStoreOperations ||
    report.applicationMainIpcConnected !== false
  )
    throw Error("Actual Electron evidence mismatch");
  evidence.push(report);
}
run(
  process.execPath,
  [
    path.join(root, "node_modules/vitest/vitest.mjs"),
    "run",
    "electron/__tests__/native-local-asset-loader.test.ts",
  ],
  "loader-unit",
);
actualElectron(sourceExecutable, root, "source-electron", true);

// A standalone production-style resources/app layout and renamed executable
// prove the delay-load hook does not depend on the filename electron.exe. This
// is not described as an installer/UI test: that downstream gate remains separate.
const installed = path.join(output, "renamed-runtime");
fs.cpSync(electronDist, installed, { recursive: true, errorOnExist: true, force: false });
const renamed = path.join(installed, "Vivi2DLocalAssetCheck.exe");
fs.renameSync(path.join(installed, "electron.exe"), renamed);
const appRoot = path.join(installed, "resources/app");
const nativeDirectory = path.join(
  appRoot,
  "electron/generated/native-local-asset/win32-x64",
);
fs.mkdirSync(nativeDirectory, { recursive: true });
for (const name of LOCAL_ASSET_PACKAGE_FILES)
  fs.copyFileSync(
    path.join(generated, name),
    path.join(nativeDirectory, name),
    fs.constants.COPYFILE_EXCL,
  );
fs.copyFileSync(
  path.join(root, "electron/native-local-asset.cjs"),
  path.join(appRoot, "electron/native-local-asset.cjs"),
  fs.constants.COPYFILE_EXCL,
);
actualElectron(renamed, appRoot, "renamed-resource-electron", false);
// Exercise the exact package validator with the builder's filename convention,
// then prove a missing full native notice rejects preparation. The actual builder
// afterPack invocation is verified separately on a genuine --dir package.
fs.renameSync(
  path.join(installed, "LICENSE"),
  path.join(installed, "LICENSE.electron.txt"),
);
fs.copyFileSync(
  path.join(root, "LICENSE"),
  path.join(appRoot, "LICENSE"),
  fs.constants.COPYFILE_EXCL,
);
fs.copyFileSync(
  path.join(root, "THIRD_PARTY_NOTICES"),
  path.join(appRoot, "THIRD_PARTY_NOTICES.txt"),
  fs.constants.COPYFILE_EXCL,
);
const packageInputs = verifyLocalAssetPackage({ root, appOutDir: installed });
const noticeFile = path.join(nativeDirectory, "NATIVE_LOCAL_ASSET_NOTICES.txt");
fs.renameSync(noticeFile, `${noticeFile}.held`);
let omittedNoticeRejected = false;
try {
  verifyLocalAssetPackage({ root, appOutDir: installed });
} catch {
  omittedNoticeRejected = true;
} finally {
  fs.renameSync(`${noticeFile}.held`, noticeFile);
}
if (!omittedNoticeRejected) throw Error("Missing native notice was accepted");
const chromiumNotice = path.join(installed, "LICENSES.chromium.html");
fs.renameSync(chromiumNotice, `${chromiumNotice}.held`);
let omittedRuntimeNoticeRejected = false;
try {
  verifyLocalAssetPackage({ root, appOutDir: installed });
} catch {
  omittedRuntimeNoticeRejected = true;
} finally {
  fs.renameSync(`${chromiumNotice}.held`, chromiumNotice);
}
if (!omittedRuntimeNoticeRejected) throw Error("Missing runtime notice was accepted");
const duplicateCrt = path.join(installed, "VCRUNTIME140.dll");
fs.copyFileSync(
  path.join(nativeDirectory, "vcruntime140.dll"),
  duplicateCrt,
  fs.constants.COPYFILE_EXCL,
);
let executableRootCrtRejected = false;
try {
  verifyLocalAssetPackage({ root, appOutDir: installed });
} catch {
  executableRootCrtRejected = true;
} finally {
  fs.unlinkSync(duplicateCrt);
}
if (!executableRootCrtRejected) throw Error("Executable-root CRT was accepted");
const coercibleDigest = structuredClone(packageInputs);
coercibleDigest.files[0].sha256 = [coercibleDigest.files[0].sha256];
let coercibleDigestRejected = false;
try {
  assertLocalAssetPackageEvidence(coercibleDigest);
} catch {
  coercibleDigestRejected = true;
}
if (!coercibleDigestRejected) throw Error("Non-string digest was accepted");

run(
  process.execPath,
  [path.join(root, "scripts/build-local-exchange-host.mjs")],
  "build-real-main-ports",
);
for (const name of ["local-exchange-host.cjs", "local-asset-copy.cjs"])
  fs.copyFileSync(
    path.join(root, "electron/generated", name),
    path.join(appRoot, "electron/generated", name),
    fs.constants.COPYFILE_EXCL,
  );
const mainPorts = [];
for (const [name, executable, selectedRoot] of [
  ["source", sourceExecutable, root],
  ["renamed", renamed, appRoot],
]) {
  const owned = path.join(output, `${name}-main-ports`);
  fs.mkdirSync(owned);
  for (const phase of ["seed", "reopen"]) {
    const config = path.join(owned, `${phase}-config.json`);
    const report = path.join(owned, `${phase}-report.json`);
    fs.writeFileSync(
      config,
      JSON.stringify({
        appRoot: selectedRoot,
        userData: path.join(owned, "profile"),
        state: path.join(owned, "state.json"),
        phase,
        report,
      }),
      { flag: "wx" },
    );
    run(
      executable,
      [path.join(root, "scripts/fixtures/local-asset-ports-electron.cjs"), config],
      `${name}-ports-${phase}`,
      120000,
      launchCwd,
    );
    const actual = JSON.parse(fs.readFileSync(report, "utf8"));
    if (
      actual.status !== "PASS" ||
      actual.phase !== phase ||
      actual.electron !== "42.9.3"
    )
      throw Error("Main ports evidence mismatch");
    mainPorts.push(actual);
  }
}
const addon = fs.readFileSync(path.join(nativeDirectory, "vivi_local_asset_v1.node"));
if (addon.length !== manifest.addon.byteLength || hash(addon) !== manifest.addon.sha256)
  throw Error("Resource copy changed addon");
function actualUnavailable(name) {
  const ownedDirectory = path.join(output, name);
  fs.mkdirSync(ownedDirectory);
  const reportPath = path.join(ownedDirectory, "report.json"),
    config = path.join(ownedDirectory, "config.json");
  fs.writeFileSync(
    config,
    JSON.stringify({ appRoot, ownedDirectory, reportPath, expectUnavailable: true }),
    { flag: "wx" },
  );
  run(renamed, [driver, config], name, 120000, launchCwd);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (
    report.status !== "PASS" ||
    report.realNativeStoreOperations !== false ||
    report.checks[0] !== "actual-resource-unavailable-with-no-fallback"
  )
    throw Error("Missing actual unavailable evidence");
  evidence.push(report);
}
const resourceAddon = path.join(nativeDirectory, "vivi_local_asset_v1.node");
const tampered = Buffer.from(addon);
tampered[4096] ^= 1;
try {
  fs.writeFileSync(resourceAddon, tampered);
  actualUnavailable("tampered-resource-electron");
} finally {
  fs.writeFileSync(resourceAddon, addon);
}
fs.renameSync(resourceAddon, `${resourceAddon}.held`);
try {
  actualUnavailable("missing-resource-electron");
} finally {
  fs.renameSync(`${resourceAddon}.held`, resourceAddon);
}
const summary = {
  status: "PASS",
  shippingAddon: manifest.addon,
  exports: manifest.pe.exports,
  delayedNodeApiImports: manifest.pe.imports.find((item) => item.dll === "node.exe")
    .symbols,
  sourceAndResourceElectron: evidence,
  loaderUnitTests: 12,
  reviewRegressions,
  nativeNotices,
  packageInputs,
  omittedNoticeRejected,
  omittedRuntimeNoticeRejected,
  executableRootCrtRejected,
  coercibleDigestRejected,
  mainPorts,
  hostileInheritedRustcIgnored: true,
  testAddon: {
    byteLength: fs.statSync(testAddon).size,
    sha256: hash(fs.readFileSync(testAddon)),
  },
  manifestSeeder: {
    source: seeder.source,
    linkedRlibs: seeder.linkedRlibs,
    binary: seeder.binary,
    canonicalLock: manifest.inputs.lock,
    receiverRawBytesVerified: true,
  },
  limits: [
    "Test-only pre-entry synchronization and failure controls are absent from shipping addon",
    "No configured external service",
    "Real main adapter/F/native ports exercised; no preload/UI/C2 Project copy success asserted",
    "Renamed resource-layout test is not an installer run",
  ],
  sourcePinsBefore,
  sourcePinsAfter: sourceFiles.map(sourcePin),
};
if (JSON.stringify(summary.sourcePinsAfter) !== JSON.stringify(sourcePinsBefore))
  throw Error("Source changed during native check");
fs.writeFileSync(
  path.join(output, "report.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  { flag: "wx" },
);
fs.rmdirSync(launchCwd);
process.stdout.write(
  `${JSON.stringify({ status: "PASS", report: path.relative(root, path.join(output, "report.json")).replaceAll("\\", "/"), addon: manifest.addon, checks: evidence.map((item) => item.checks.length) })}\n`,
);
