// Windows addon checker owns this real-toolchain test, not the root Vitest suite.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  prepareLocalAssetNativeNotices,
  validateNativeCrtIdentity,
  validateNativeNoticeInventory,
  validateNativeNoticeLongNames,
  verifyNativeCrateNotices,
} from "./lib/local-asset-native-notices.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixed = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/fixtures/local-asset-native-notices-v1.json")),
);
const rows = fixed.packages.map(({ noticeFiles, ...row }) => row);
const hash = (b) => createHash("sha256").update(b).digest("hex");

test("fixed normal/build inventory accepts exactly 36 identities and rejects shared drift cases", () => {
  validateNativeNoticeInventory(rows);
  for (const modify of [
    (copy) => copy.pop(),
    (copy) => copy.push({ ...copy[0], name: "unreviewed" }),
    (copy) => {
      copy[0].license = "MIT";
    },
    (copy) => {
      copy[0].checksum = "0".repeat(64);
    },
    (copy) => {
      copy[0].source = "registry+https://invalid.example/index";
    },
  ]) {
    const copy = structuredClone(rows);
    modify(copy);
    assert.throws(() => validateNativeNoticeInventory(copy), /UNREVIEWED_CARGO_GRAPH/);
  }
});

test("actual offline fixed inputs generate deterministic validated outputs and fail closed", {
  skip: process.platform !== "win32" || process.arch !== "x64",
}, async (context) => {
  const run = (args) => {
    const r = spawnSync("cargo", ["+1.94.1", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    assert.equal(r.status, 0);
    return JSON.parse(r.stdout);
  };
  const rustc = spawnSync("rustup", ["which", "--toolchain", "1.94.1", "rustc"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(rustc.status, 0);
  const env = { ...process.env, RUSTC: rustc.stdout.trim() };
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(root, "electron/generated/native-local-asset/win32-x64/manifest.json"),
    ),
  );
  const beforeLock = hash(
    fs.readFileSync(path.join(root, "packages/runtime-native/Cargo.lock")),
  );
  const first = await prepareLocalAssetNativeNotices({ root, manifest, env });
  const second = await prepareLocalAssetNativeNotices({ root, manifest, env });
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first.files), [
    "NATIVE_LOCAL_ASSET_NOTICES.txt",
    "native-local-asset.cdx.json",
    "vcruntime140.dll",
  ]);
  const notice = first.files["NATIVE_LOCAL_ASSET_NOTICES.txt"].toString(),
    bom = JSON.parse(first.files["native-local-asset.cdx.json"]);
  assert.equal(bom.specVersion, "1.6");
  assert.equal(bom.components.length, 41);
  assert.equal(bom.components.filter((c) => c.purl?.startsWith("pkg:cargo/")).length, 30);
  assert.equal(
    bom.components.find((c) => c["bom-ref"] === "vivi:compiler-builtins").licenses[0]
      .expression,
    "MIT AND Apache-2.0 WITH LLVM-exception",
  );
  assert(notice.includes("The author disclaims copyright"));
  for (const input of fixed.rust.upstream) assert(notice.includes(input.text));
  const sysroot = spawnSync(env.RUSTC, ["--print", "sysroot"], {
    encoding: "utf8",
    windowsHide: true,
  }).stdout.trim();
  assert(
    notice.includes(
      fs.readFileSync(
        path.join(sysroot, "share/doc/rust/COPYRIGHT-library.html"),
        "utf8",
      ),
    ),
  );
  assert(!notice.includes(root));
  assert(!notice.includes(sysroot));
  assert(!("timestamp" in bom.metadata));
  assert(!("serialNumber" in bom));
  assert.equal(hash(first.files["vcruntime140.dll"]), fixed.crt.sha256);
  assert.equal(
    bom.components
      .find((c) => c["bom-ref"] === "vivi:msvc-vcruntime")
      .properties.find((p) => p.name === "vivi:native:byteLength").value,
    "124544",
  );
  const crtDetails = {
    version: fixed.crt.version,
    productVersion: fixed.crt.version,
    status: "Valid",
    signer: fixed.crt.signer,
  };
  validateNativeCrtIdentity(first.files["vcruntime140.dll"], crtDetails);
  for (const changed of [
    { version: "0.0.0.0" },
    { status: "NotSigned" },
    { signer: "Unknown" },
  ])
    assert.throws(
      () =>
        validateNativeCrtIdentity(first.files["vcruntime140.dll"], {
          ...crtDetails,
          ...changed,
        }),
      /CRT_SIGNATURE_OR_VERSION/,
    );
  const alteredCrt = Buffer.from(first.files["vcruntime140.dll"]);
  alteredCrt[0] ^= 1;
  assert.throws(
    () => validateNativeCrtIdentity(alteredCrt, crtDetails),
    /INPUT_IDENTITY/,
  );
  await assert.rejects(
    prepareLocalAssetNativeNotices({
      root,
      manifest,
      env: { ...env, RUSTC: path.join(root, "not-the-compiler.exe") },
    }),
    /SELECTED_RUSTC/,
  );
  const wrongManifest = structuredClone(manifest);
  wrongManifest.addon.sha256 = "0".repeat(64);
  await assert.rejects(
    prepareLocalAssetNativeNotices({ root, manifest: wrongManifest, env }),
    /BUILD_MANIFEST_MISMATCH/,
  );
  const wrongFeature = structuredClone(manifest);
  wrongFeature.build.features.push("evaluation-v1");
  await assert.rejects(
    prepareLocalAssetNativeNotices({ root, manifest: wrongFeature, env }),
    /BUILD_PROFILE/,
  );

  const metadata = run([
    "metadata",
    "--manifest-path",
    "packages/runtime-native/Cargo.toml",
    "--no-default-features",
    "--features",
    "local-asset-host-v1",
    "--locked",
    "--offline",
    "--format-version",
    "1",
    "--filter-platform",
    "x86_64-pc-windows-msvc",
  ]);
  const archive = (name) => {
    const pkg = metadata.packages.find((p) => p.name === name),
      source = path.dirname(pkg.manifest_path);
    return fs.readFileSync(
      path.resolve(
        source,
        "../../../cache",
        path.basename(path.dirname(source)),
        `${pkg.name}-${pkg.version}.crate`,
      ),
    );
  };
  const adler = archive("adler2");
  assert.equal(verifyNativeCrateNotices("adler2", adler).size, 3);
  const corrupt = Buffer.from(adler);
  corrupt[20] ^= 1;
  assert.throws(() => verifyNativeCrateNotices("adler2", corrupt), /ARCHIVE_CHECKSUM/);
  // Removing a required notice or SQLite source member cannot be hidden behind
  // valid gzip/tar framing: the authenticated archive identity rejects it.
  for (const [name, member] of [
    ["adler2", "LICENSE-MIT"],
    ["libsqlite3-sys", "sqlite3/sqlite3.h"],
  ]) {
    const data = gunzipSync(archive(name));
    const position = data.indexOf(
      Buffer.from(
        `${name}-${fixed.packages.find((p) => p.name === name).version}/${member}\0`,
      ),
    );
    assert(position >= 0);
    data[position] ^= 1;
    assert.throws(
      () => verifyNativeCrateNotices(name, gzipSync(data)),
      /ARCHIVE_CHECKSUM/,
    );
  }
  const vcpkg = archive("vcpkg"),
    tar = gunzipSync(vcpkg),
    names = [];
  for (let offset = 0; offset + 512 <= tar.length && tar[offset]; ) {
    const size = Number.parseInt(
      tar
        .toString("ascii", offset + 124, offset + 136)
        .replace(/\0.*$/s, "")
        .trim(),
      8,
    );
    if (tar[offset + 156] === 76)
      names.push(Buffer.from(tar.subarray(offset + 512, offset + 512 + size)));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(verifyNativeCrateNotices("vcpkg", vcpkg).size, 2);
  assert.equal(names.length, 99);
  validateNativeNoticeLongNames(names);
  const altered = names.map((n) => Buffer.from(n));
  altered[0][20] ^= 1;
  assert.throws(
    () => validateNativeNoticeLongNames(altered),
    /ARCHIVE_LONG_NAME_IDENTITY/,
  );
  assert.throws(
    () => validateNativeNoticeLongNames(names.slice(1)),
    /ARCHIVE_LONG_NAME_IDENTITY/,
  );

  // Empty, genuinely owned Cargo cache: offline lookup fails without fetching.
  const emptyCache = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-native-notices-empty-"));
  try {
    await assert.rejects(
      prepareLocalAssetNativeNotices({
        root,
        manifest,
        env: { ...env, CARGO_HOME: emptyCache },
      }),
      /INPUT_COMMAND/,
    );
    assert(!fs.existsSync(path.join(emptyCache, "registry/cache")));
  } finally {
    assert.equal(path.dirname(fs.realpathSync(emptyCache)), fs.realpathSync(os.tmpdir()));
    assert(path.basename(emptyCache).startsWith("vivi-native-notices-empty-"));
    fs.rmSync(emptyCache, { recursive: true, force: true });
  }
  assert.equal(
    hash(fs.readFileSync(path.join(root, "packages/runtime-native/Cargo.lock"))),
    beforeLock,
  );
  context.diagnostic(
    JSON.stringify({
      outputs: first.evidence.outputs,
      cargoPackages: 36,
      authenticatedArchives: 30,
      nativeComponents: 41,
      deterministic: true,
      inventoryAndNoticeCorruptionsRejected: true,
      missingOfflineCacheRejected: true,
      actualSignature: first.evidence.crt.signature,
      limits: first.evidence.limits,
    }),
  );
});
