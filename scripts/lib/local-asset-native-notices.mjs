// Fixed Windows local-asset notice inputs. No writes, downloads or builds.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Validation } from "@cyclonedx/cyclonedx-library";

const inventoryFile = fileURLToPath(
  new URL("../fixtures/local-asset-native-notices-v1.json", import.meta.url),
);
const inventoryHash = "789871e40680652c4ef2e791b7a562ff2fcbe8e2ce6a2dc4372e771a33c00cd5";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (label) => {
  throw Error(`LOCAL_ASSET_NOTICE_${label}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pin = (bytes) => ({ bytes: bytes.length, sha256: hash(bytes) });
const properties = (values) =>
  Object.entries(values).map(([name, value]) => ({
    name: `vivi:native:${name}`,
    value: String(value),
  }));

function read(file, limit = 64 * 1024 * 1024) {
  try {
    const resolved = path.resolve(file),
      stat = fs.lstatSync(resolved);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > limit ||
      fs.realpathSync(resolved).toLowerCase() !== resolved.toLowerCase()
    )
      fail("REDIRECTED_OR_OVERSIZE_INPUT");
    return fs.readFileSync(resolved);
  } catch (error) {
    if (error.message.startsWith("LOCAL_ASSET_NOTICE_")) throw error;
    fail("MISSING_INPUT");
  }
}
function verified(bytes, expected) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== expected.bytes ||
    hash(bytes) !== expected.sha256
  )
    fail("INPUT_IDENTITY");
  return bytes;
}
function readPinned(file, expected) {
  return verified(read(file), expected);
}
function inventory() {
  const bytes = read(inventoryFile, 128 * 1024);
  if (hash(bytes) !== inventoryHash) fail("UNREVIEWED_INVENTORY");
  return JSON.parse(bytes);
}
function command(root, env, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    windowsHide: true,
    shell: false,
    timeout: 60000,
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
  if (result.error || result.signal || result.status !== 0) fail("INPUT_COMMAND");
  return result.stdout.trim();
}

// The exact same comparison is used by prepare and the small corruption tests.
export function validateNativeNoticeInventory(rows) {
  const expected = inventory().packages.map(({ noticeFiles, ...row }) => row);
  const ordered = [...rows].sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (!same(ordered, expected)) fail("UNREVIEWED_CARGO_GRAPH");
}

export function validateNativeNoticeLongNames(names) {
  const expected = inventory().vcpkgLongNameMetadata;
  if (
    !Array.isArray(names) ||
    names.some((bytes) => !Buffer.isBuffer(bytes)) ||
    names.length !== expected.count ||
    hash(Buffer.concat(names)) !== expected.sha256
  )
    fail("ARCHIVE_LONG_NAME_IDENTITY");
}

export function validateNativeCrtIdentity(bytes, details) {
  const expected = inventory().crt;
  verified(bytes, expected);
  if (
    details.version !== expected.version ||
    details.productVersion !== expected.version ||
    details.status !== "Valid" ||
    details.signer !== expected.signer
  )
    fail("CRT_SIGNATURE_OR_VERSION");
}

function tarMembers(compressed, row, requested) {
  if (compressed.length > 64 * 1024 * 1024 || hash(compressed) !== row.checksum)
    fail("ARCHIVE_CHECKSUM");
  const tar = gunzipSync(compressed, { maxOutputLength: 128 * 1024 * 1024 });
  const members = new Map(),
    seen = new Set(),
    prefix = `${row.name}-${row.version}/`;
  let offset = 0,
    count = 0,
    ended = false,
    pendingName;
  const longNames = [];
  const ascii = (bytes) => {
    if (bytes.some((b) => b > 127)) fail("ARCHIVE_HEADER");
    return bytes.toString("ascii").replace(/\0.*$/s, "");
  };
  const octal = (bytes) => {
    const s = ascii(bytes).trim();
    if (!/^[0-7]+$/.test(s)) fail("ARCHIVE_HEADER");
    return Number.parseInt(s, 8);
  };
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (tar.length - offset < 1024 || tar.subarray(offset).some((b) => b !== 0))
        fail("ARCHIVE_TRAILER");
      ended = true;
      break;
    }
    if (++count > 20000) fail("ARCHIVE_BOUNDS");
    const expectedSum = octal(header.subarray(148, 156));
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
    if (sum !== expectedSum) fail("ARCHIVE_HEADER");
    const shortName = ascii(header.subarray(0, 100));
    if (ascii(header.subarray(345, 500))) fail("ARCHIVE_PATH");
    const size = octal(header.subarray(124, 136)),
      type = header[156];
    const end = offset + 512 + size,
      next = offset + 512 + Math.ceil(size / 512) * 512;
    if (
      !Number.isSafeInteger(next) ||
      next > tar.length ||
      ascii(header.subarray(157, 257))
    )
      fail("ARCHIVE_BOUNDS");
    if (type === 76) {
      // Only the authenticated vcpkg archive has this exact inert GNU name list.
      const bytes = tar.subarray(offset + 512, end);
      if (
        row.name !== "vcpkg" ||
        shortName !== "././@LongLink" ||
        pendingName ||
        size < 2 ||
        size > 512 ||
        bytes.at(-1) !== 0 ||
        bytes.subarray(0, -1).includes(0)
      )
        fail("ARCHIVE_LONG_NAME");
      pendingName = ascii(bytes);
      longNames.push(Buffer.from(bytes));
      offset = next;
      continue;
    }
    if (![0, 48, 53].includes(type) || (pendingName && type !== 0 && type !== 48))
      fail("ARCHIVE_LINK_OR_EXTENSION");
    if (pendingName && pendingName.slice(0, 100) !== shortName) fail("ARCHIVE_LONG_NAME");
    const name = pendingName || shortName;
    pendingName = undefined;
    if (
      !name.startsWith(prefix) ||
      name.includes("\\") ||
      name.includes(":") ||
      name.split("/").some((p) => p === ".." || p === ".")
    )
      fail("ARCHIVE_PATH");
    if (seen.has(name) || (type === 53 && size !== 0)) fail("ARCHIVE_BOUNDS");
    seen.add(name);
    const relative = name.slice(prefix.length);
    if (requested.has(relative)) {
      if (type === 53) fail("ARCHIVE_NOTICE_DIRECTORY");
      members.set(relative, Buffer.from(tar.subarray(offset + 512, end)));
    }
    offset = next;
  }
  if (!ended || pendingName || members.size !== requested.size)
    fail("ARCHIVE_REQUIRED_MEMBER");
  if (row.name === "vcpkg") {
    validateNativeNoticeLongNames(longNames);
  } else if (longNames.length) fail("ARCHIVE_LONG_NAME_IDENTITY");
  return members;
}

export function verifyNativeCrateNotices(name, compressed) {
  const fixed = inventory(),
    row = fixed.packages.find((p) => p.name === name && p.source);
  if (!row) fail("UNREVIEWED_CARGO_GRAPH");
  const expected = [
    ...row.noticeFiles,
    ...(name === "libsqlite3-sys" ? fixed.sqlite.members : []),
  ];
  const members = tarMembers(compressed, row, new Set(expected.map((p) => p.name)));
  for (const member of expected) verified(members.get(member.name), member);
  return members;
}

function lockRows(text) {
  return text
    .split(/^\[\[package\]\]\r?$/m)
    .slice(1)
    .map((block) => {
      const get = (key) =>
        block.match(new RegExp(`^${key} = "([^"\\r\\n]+)"$`, "m"))?.[1] ?? null;
      return {
        name: get("name"),
        version: get("version"),
        source: get("source"),
        checksum: get("checksum"),
      };
    });
}
function cargoInputs(root, env, fixed, lockBytes) {
  const args = [
    "--manifest-path",
    "packages/runtime-native/Cargo.toml",
    "--no-default-features",
    "--features",
    fixed.profile.feature,
    "--locked",
    "--offline",
  ];
  const tree = command(root, env, "cargo", [
    "+1.94.1",
    "tree",
    ...args,
    "-p",
    fixed.profile.root,
    "--target",
    fixed.profile.target,
    "--edges",
    "normal,build",
    "--prefix",
    "none",
    "--format",
    "{p}|{l}",
  ]);
  const selected = new Map();
  for (const line of tree.split(/\r?\n/)) {
    const match = line
      .replace(/ \(\*\)$/, "")
      .match(/^([a-z0-9_-]+) v([0-9.]+)(?: \([^|]+\))?\|(.+)$/);
    if (!match) fail("CARGO_TREE_SHAPE");
    const [, name, version, license] = match,
      key = `${name}@${version}`;
    if (selected.has(key) && selected.get(key).license !== license)
      fail("CARGO_TREE_SHAPE");
    selected.set(key, { name, version, license });
  }
  const metadata = JSON.parse(
    command(root, env, "cargo", [
      "+1.94.1",
      "metadata",
      ...args,
      "--format-version",
      "1",
      "--filter-platform",
      fixed.profile.target,
    ]),
  );
  const locked = lockRows(lockBytes.toString("utf8")),
    rows = [],
    locations = new Map();
  for (const selectedRow of selected.values()) {
    const candidates = metadata.packages.filter(
      (p) => p.name === selectedRow.name && p.version === selectedRow.version,
    );
    if (candidates.length !== 1) fail("CARGO_METADATA_SHAPE");
    const pkg = candidates[0],
      matches = locked.filter(
        (p) =>
          p.name === pkg.name && p.version === pkg.version && p.source === pkg.source,
      );
    if (matches.length !== 1 || pkg.license !== selectedRow.license)
      fail("CARGO_METADATA_SHAPE");
    const row = { ...selectedRow, source: pkg.source, checksum: matches[0].checksum };
    rows.push(row);
    locations.set(pkg.name, path.dirname(pkg.manifest_path));
    if (
      !pkg.source &&
      path.resolve(pkg.manifest_path).toLowerCase() !==
        path
          .join(root, "packages/runtime-native/crates", pkg.name, "Cargo.toml")
          .toLowerCase()
    )
      fail("LOCAL_PACKAGE_PATH");
  }
  validateNativeNoticeInventory(rows);
  return locations;
}

function textSection(title, bytes) {
  return `\n===== ${title} | ${bytes.length} bytes | SHA-256 ${hash(bytes)} =====\n${bytes.toString("utf8")}\n===== END ${title} =====\n`;
}
function component(ref, name, version, extra = {}) {
  return { type: "library", "bom-ref": ref, name, version, ...extra };
}
const hashes = (sha256) => [{ alg: "SHA-256", content: sha256 }];

/** Reads only fixed public inputs and returns three new bytestrings. The caller
 * owns publication/comparison beside the existing addon and format-1 manifest.
 * No returned evidence is a license entitlement or packaged-load assertion. */
export async function prepareLocalAssetNativeNotices({ root, manifest, env }) {
  if (process.platform !== "win32" || process.arch !== "x64")
    fail("WINDOWS_X64_REQUIRED");
  root = path.resolve(root);
  const fixed = inventory(),
    selectedEnv = { ...env };
  const rustc = command(root, selectedEnv, "rustup", [
    "which",
    "--toolchain",
    "1.94.1",
    "rustc",
  ]);
  if (
    !path.isAbsolute(rustc) ||
    path.resolve(selectedEnv.RUSTC || "").toLowerCase() !==
      path.resolve(rustc).toLowerCase()
  )
    fail("SELECTED_RUSTC");
  read(rustc);
  const verbose = command(root, selectedEnv, rustc, ["-vV"]);
  if (
    !verbose.includes(`release: ${fixed.rust.version}`) ||
    !verbose.includes(`commit-hash: ${fixed.rust.commit}`) ||
    !verbose.includes(`host: ${fixed.profile.target}`)
  )
    fail("RUST_TOOLCHAIN");
  if (
    manifest.format !== 1 ||
    manifest.electronVersion !== fixed.electron.version ||
    manifest.build.target !== fixed.profile.target ||
    manifest.build.defaultFeatures !== false ||
    !same(manifest.build.features, [fixed.profile.feature]) ||
    manifest.build.rustc !== command(root, selectedEnv, rustc, ["--version"])
  )
    fail("BUILD_PROFILE");
  const directory = path.join(root, "electron/generated/native-local-asset/win32-x64");
  const buildManifest = read(path.join(directory, "manifest.json"), 65536);
  if (!same(JSON.parse(buildManifest), manifest)) fail("BUILD_MANIFEST_MISMATCH");
  const addon = verified(read(path.join(directory, "vivi_local_asset_v1.node")), {
    bytes: manifest.addon.byteLength,
    sha256: manifest.addon.sha256,
  });
  const lock = verified(read(path.join(root, "packages/runtime-native/Cargo.lock")), {
    bytes: manifest.inputs.lock.byteLength,
    sha256: manifest.inputs.lock.sha256,
  });
  const locations = cargoInputs(root, selectedEnv, fixed, lock);
  const records = [],
    components = [];
  let notice = `Vivi2D local Asset native supplement\nProfile: ${fixed.profile.root}; ${fixed.profile.target}; default features off; ${fixed.profile.feature}.\nInventory scope: selected normal/build Cargo dependencies, not a linked-only attribution claim.\nAddon SHA-256: ${hash(addon)}\nCargo.lock SHA-256: ${hash(lock)}\nNo legal clearance or redistribution entitlement is asserted.\n`;
  const localLicense = readPinned(path.join(root, "LICENSE"), fixed.repositoryLicense);
  notice += textSection(
    "Repository Apache-2.0 license (six local packages)",
    localLicense,
  );
  let sqliteHeader;
  for (const row of fixed.packages) {
    const ref = row.source
      ? `pkg:cargo/${row.name}@${row.version}`
      : `vivi:local:${row.name}@${row.version}`;
    notice += `\nPackage: ${row.name}@${row.version}\nSource: ${row.source || "https://github.com/syobon211/vivi2d"}\nOriginal license expression: ${row.license}\n`;
    const texts = [];
    if (row.source) {
      const source = locations.get(row.name),
        index = path.basename(path.dirname(source)),
        registry = path.resolve(source, "../../..");
      if (
        path.basename(registry) !== "registry" ||
        path.basename(path.resolve(source, "../..")) !== "src" ||
        !/^[a-z0-9.-]+$/.test(index)
      )
        fail("REGISTRY_CACHE_LAYOUT");
      const archive = read(
        path.join(registry, "cache", index, `${row.name}-${row.version}.crate`),
      );
      const members = verifyNativeCrateNotices(row.name, archive);
      for (const member of row.noticeFiles) {
        const bytes = members.get(member.name);
        readPinned(path.join(source, member.name), member);
        notice += textSection(`${row.name}@${row.version}/${member.name}`, bytes);
        texts.push({ name: member.name, ...pin(bytes) });
      }
      if (row.name === "libsqlite3-sys") {
        for (const member of fixed.sqlite.members)
          readPinned(path.join(source, member.name), member);
        const header = members.get("sqlite3/sqlite3.h").toString("utf8");
        if (
          !header.includes(`#define SQLITE_VERSION        "${fixed.sqlite.version}"`) ||
          !header.includes(fixed.sqlite.checkin)
        )
          fail("SQLITE_VERSION");
        const end = header.indexOf("*/");
        if (
          end < 0 ||
          end > 4096 ||
          !header.slice(0, end).includes("The author disclaims copyright")
        )
          fail("SQLITE_NOTICE");
        sqliteHeader = Buffer.from(header.slice(0, end + 2));
      }
    } else texts.push({ name: "repository/LICENSE", ...pin(localLicense) });
    records.push({ name: row.name, version: row.version, notices: texts });
    components.push(
      component(ref, row.name, row.version, {
        ...(row.source ? { purl: ref, hashes: hashes(row.checksum) } : {}),
        licenses: [
          { expression: row.license.replaceAll("MIT/Apache-2.0", "MIT OR Apache-2.0") },
        ],
        properties: properties({
          classification: "selected Cargo normal/build inventory; not linked-only",
          source: row.source || "local public workspace",
          originalLicenseExpression: row.license,
          noticeMembers: JSON.stringify(texts),
        }),
      }),
    );
  }
  if (!sqliteHeader) fail("SQLITE_NOTICE");
  notice += textSection(
    `SQLite ${fixed.sqlite.version} upstream disclaimer (not the wrapper MIT license)`,
    sqliteHeader,
  );
  components.push(
    component("vivi:sqlite-upstream", "SQLite", fixed.sqlite.version, {
      licenses: [
        {
          license: {
            name: "SQLite upstream copyright disclaimer",
            text: {
              contentType: "text/plain",
              encoding: "base64",
              content: sqliteHeader.toString("base64"),
            },
          },
        },
      ],
      properties: properties({
        sourceMembers: JSON.stringify(fixed.sqlite.members),
        checkin: fixed.sqlite.checkin,
      }),
    }),
  );
  const sysroot = command(root, selectedEnv, rustc, ["--print", "sysroot"]);
  if (!path.isAbsolute(sysroot)) fail("RUST_SYSROOT");
  readPinned(
    path.join(sysroot, fixed.rust.targetManifest.name),
    fixed.rust.targetManifest,
  );
  const rustNotices = [];
  for (const expected of fixed.rust.notices) {
    const bytes = readPinned(
      path.join(sysroot, "share/doc/rust", expected.name),
      expected,
    );
    notice += textSection(
      `Rust ${fixed.rust.version} standard-library source-notice collection/${expected.name}`,
      bytes,
    );
    rustNotices.push({ name: expected.name, ...pin(bytes) });
  }
  for (const expected of fixed.rust.upstream) {
    const bytes = verified(Buffer.from(expected.text), expected);
    notice +=
      `\nOfficial pinned source: ${expected.source}\n` +
      textSection(expected.name, bytes);
    rustNotices.push({ name: expected.name, source: expected.source, ...pin(bytes) });
  }
  notice +=
    "\nRust collection includes cross-target source dependencies; it does not assert every described routine is linked. Compiler-builtins: MIT AND Apache-2.0 WITH LLVM-exception; its libm-derived attributions are retained in full.\n";
  components.push(
    component(
      "vivi:rust-stdlib",
      "Rust standard-library conservative notice collection",
      fixed.rust.version,
      {
        properties: properties({
          sourceCommit: fixed.rust.commit,
          targetManifest: JSON.stringify(fixed.rust.targetManifest),
          noticeMembers: JSON.stringify(rustNotices),
          classification:
            "cross-target source notices; not a per-object linked classification",
        }),
      },
    ),
  );
  components.push(
    component(
      "vivi:compiler-builtins",
      "compiler-builtins conservative source notice",
      fixed.rust.commit,
      {
        licenses: [{ expression: "MIT AND Apache-2.0 WITH LLVM-exception" }],
        properties: properties({
          source: fixed.rust.upstream[0].source,
          noticeSha256: fixed.rust.upstream[0].sha256,
          libmNoticeSha256: fixed.rust.upstream[1].sha256,
        }),
      },
    ),
  );
  for (const expected of fixed.electron.notices)
    readPinned(path.join(root, "node_modules/electron/dist", expected.name), expected);
  notice += `\nElectron ${fixed.electron.version} / Node ${fixed.electron.nodeVersion}: retain the companion complete Electron LICENSE (installer: LICENSE.electron.txt) and LICENSES.chromium.html, including the complete Node and externally maintained library notices.\n${JSON.stringify(fixed.electron.notices)}\nNode section identity: ${JSON.stringify(fixed.electron.nodeLicenseSection)}\n`;
  components.push(
    component(
      "vivi:electron-runtime",
      "Electron runtime and full companion notices",
      fixed.electron.version,
      {
        properties: properties({
          nodeVersion: fixed.electron.nodeVersion,
          retainedNotices: JSON.stringify(fixed.electron.notices),
          nodeNoticeSection: JSON.stringify(fixed.electron.nodeLicenseSection),
        }),
      },
    ),
  );
  const vswhere = "C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe";
  read(vswhere);
  const installation = command(root, selectedEnv, vswhere, [
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "-property",
    "installationPath",
  ]);
  if (!path.isAbsolute(installation) || /[\r\n]/.test(installation))
    fail("MSVC_INSTALLATION");
  const crtPath = path.join(installation, fixed.crt.relativeSource),
    crt = readPinned(crtPath, fixed.crt);
  const signatureEnv = { ...selectedEnv, VIVI_NOTICE_CRT_PATH: crtPath };
  // PowerShell 7's inherited module search path cannot load its Security module
  // into the fixed Windows PowerShell host. Use that host's built-in module only.
  for (const key of Object.keys(signatureEnv))
    if (/^PSModulePath$/i.test(key)) delete signatureEnv[key];
  const crtInfo = JSON.parse(
    command(
      root,
      signatureEnv,
      "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; Import-Module ($PSHOME+'/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1'); $f=Get-Item -LiteralPath $env:VIVI_NOTICE_CRT_PATH; $s=Get-AuthenticodeSignature -LiteralPath $env:VIVI_NOTICE_CRT_PATH; @{ version=$f.VersionInfo.FileVersion; productVersion=$f.VersionInfo.ProductVersion; status=[string]$s.Status; signer=$s.SignerCertificate.Subject } | ConvertTo-Json -Compress",
      ],
    ),
  );
  validateNativeCrtIdentity(crt, crtInfo);
  readPinned(crtPath, fixed.crt);
  notice += `\nMicrosoft VCRUNTIME140 ${fixed.crt.version}\nCopyright Microsoft Corporation. All rights reserved.\nRetail origin: ${fixed.crt.relativeSource}\n${JSON.stringify(pin(crt))}\nAuthority: ${fixed.crt.authority.join("\n")}\nValid Authenticode identity is not redistribution entitlement. Existing owner license/release approval remains required. Windows 10/11 x64 uses its OS-serviced UCRT. This one DLL is beside the addon, with no executable-root duplicate.\n`;
  components.push(
    component("vivi:msvc-vcruntime", "Microsoft VCRUNTIME140", fixed.crt.version, {
      hashes: hashes(fixed.crt.sha256),
      licenses: [
        {
          license: {
            name: "Microsoft Visual Studio C++ Runtime terms; owner entitlement required",
            url: fixed.crt.authority[1],
          },
        },
      ],
      properties: properties({
        source: fixed.crt.relativeSource,
        byteLength: fixed.crt.bytes,
        placement: "beside addon",
        systemDependencies: JSON.stringify(fixed.crt.systemDependencies),
      }),
    }),
  );
  const noticeBytes = Buffer.from(notice);
  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      component: {
        type: "library",
        "bom-ref": "vivi:local-asset-addon",
        name: "vivi_local_asset_v1.node",
        version: "1",
        hashes: hashes(hash(addon)),
      },
      properties: properties({
        profile: JSON.stringify(fixed.profile),
        buildManifestSha256: hash(buildManifest),
        cargoLockSha256: hash(lock),
        inventorySha256: inventoryHash,
        noticeSha256: hash(noticeBytes),
        coverage:
          "native supplement; does not replace npm SBOM or license/release approval",
      }),
    },
    components,
  };
  const sbom = Buffer.from(`${JSON.stringify(bom, null, 2)}\n`);
  if (
    (await new Validation.JsonStrictValidator("1.6").validate(sbom.toString())) !== null
  )
    fail("CYCLONEDX_SCHEMA");
  for (const value of [noticeBytes, sbom])
    if (
      /(?:^|[\s"'<>])(?:[A-Za-z]:[\\/]|\/Users\/|\/home\/|AppData[\\/]|\.cargo[\\/]|\.rustup[\\/])/.test(
        value.toString(),
      )
    )
      fail("LOCAL_PATH_IN_OUTPUT");
  verified(read(path.join(root, "packages/runtime-native/Cargo.lock")), pin(lock));
  verified(read(path.join(directory, "manifest.json")), pin(buildManifest));
  const files = {
    "NATIVE_LOCAL_ASSET_NOTICES.txt": noticeBytes,
    "native-local-asset.cdx.json": sbom,
    "vcruntime140.dll": crt,
  };
  return {
    files,
    evidence: {
      format: 1,
      profile: fixed.profile,
      cargoPackages: 36,
      registryArchives: 30,
      addon: pin(addon),
      manifest: pin(buildManifest),
      lock: pin(lock),
      inventory: pin(read(inventoryFile)),
      packageNotices: records,
      rustNotices,
      runtimeNotices: fixed.electron.notices,
      nodeNoticeSection: fixed.electron.nodeLicenseSection,
      crt: {
        ...pin(crt),
        version: fixed.crt.version,
        signature: crtInfo.status,
        signer: crtInfo.signer,
      },
      outputs: Object.entries(files).map(([name, bytes]) => ({ name, ...pin(bytes) })),
      limits:
        "Input verification only. Root separately verifies normal/delayed PE closure, actual loaded CRT path, packaging and owner license entitlement.",
    },
  };
}
