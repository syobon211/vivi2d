"use strict";

// Trusted main only. A missing native profile disables this capability; there is
// no environment-selected path, package lookup, download, or alternate backend.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

let attempted = false;
let loaded;
const unavailable = () =>
  Object.assign(new Error("LOCAL_ASSET_UNAVAILABLE"), {
    code: "LOCAL_ASSET_UNAVAILABLE",
  });
const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const identity = (value) =>
  exactKeys(value, ["path", "byteLength", "sha256"]) &&
  positive(value.byteLength) &&
  digest(value.sha256) &&
  typeof value.path === "string" &&
  value.path.length < 512 &&
  !value.path.includes("\\") &&
  !value.path.includes(":") &&
  !value.path.startsWith("/") &&
  value.path.split("/").every((part) => part !== ".." && part !== "." && part !== "");
function manifestValid(value) {
  if (
    !exactKeys(value, [
      "format",
      "platform",
      "arch",
      "electronVersion",
      "napiVersion",
      "localAssetAbiVersion",
      "addon",
      "inputs",
      "build",
      "pe",
    ]) ||
    value.format !== 1 ||
    value.platform !== "win32" ||
    value.arch !== "x64" ||
    value.electronVersion !== "42.9.3" ||
    value.napiVersion !== 8 ||
    value.localAssetAbiVersion !== 1 ||
    !exactKeys(value.addon, ["byteLength", "sha256"]) ||
    !positive(value.addon.byteLength) ||
    value.addon.byteLength > 64 * 1024 * 1024 ||
    !digest(value.addon.sha256)
  )
    return false;
  const input = value.inputs;
  if (
    !exactKeys(input, ["releaseArtifacts", "headers", "sources", "lock"]) ||
    !identity(input.lock) ||
    input.lock.path !== "packages/runtime-native/Cargo.lock"
  )
    return false;
  const releasePins = [
    [
      "SHASUMS256.txt",
      1097,
      "3dcbcfd37581310fc5ddfbcd0f2a20d6bc593f447c1b85b662eaf01ffd013e1e",
    ],
    [
      "node-v42.9.3-headers.tar.gz",
      344565,
      "899a19f5c6b69dc124a83ff473b18a39b6c8f8c703ca2810e3986adf9a69ec08",
    ],
    [
      "win-x64/node.lib",
      1507588,
      "790af72b16459418d562dc078ac71f657ac44a01ab81115d2cb9555e7c9703c9",
    ],
  ];
  const headerPins = [
    [
      "node_api.h",
      10370,
      "2d4560831e525b47b060ec8a0864ab73993df9e20215ce9f0fe7b24cd31af32a",
    ],
    [
      "node_api_types.h",
      1930,
      "a25356630d3058f0a0c8937d9f297e9471e037fda58c2696d8a505c2bd99cb00",
    ],
    [
      "js_native_api.h",
      33180,
      "5895df50c378dde419fab4569805e6e273e47ff9f23b6885f74d86c9c22f3f83",
    ],
    [
      "js_native_api_types.h",
      7871,
      "4f19cb90d240765cc0961d92a1ee20f65fdc50db7de1ab0a5cb6bc227224e1a0",
    ],
  ];
  const matches = (actual, expected) =>
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every(
      (item, index) =>
        identity(item) &&
        item.path === expected[index][0] &&
        item.byteLength === expected[index][1] &&
        item.sha256 === expected[index][2],
    );
  if (
    !matches(input.releaseArtifacts, releasePins) ||
    !matches(input.headers, headerPins)
  )
    return false;
  const sourcePaths = [
    "electron/native-local-asset/addon.c",
    "electron/native-local-asset/delay-load.c",
    "electron/native-local-asset/addon.def",
    "scripts/build-local-asset-addon.mjs",
    "packages/runtime-c-abi/include/vivi_local_asset.h",
    "packages/runtime-c-abi/include/vivi_local_asset_preview.h",
    "packages/runtime-native/crates/vivi-runtime-native-c-abi/Cargo.toml",
    "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/lib.rs",
    "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/local_asset.rs",
    "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/local_asset/preview.rs",
  ];
  if (
    !Array.isArray(input.sources) ||
    input.sources.length !== sourcePaths.length ||
    !input.sources.every(
      (item, index) => identity(item) && item.path === sourcePaths[index],
    )
  )
    return false;
  const b = value.build;
  if (
    !exactKeys(b, [
      "rustc",
      "cargo",
      "target",
      "msvc",
      "windowsSdk",
      "compiler",
      "linker",
      "compilerFlags",
      "linkerFlags",
      "rustFlags",
      "features",
      "defaultFeatures",
      "nativeStaticLibraries",
      "staticlib",
    ]) ||
    typeof b.rustc !== "string" ||
    !/^rustc 1\.94\.1 [^\r\n]{1,120}$/.test(b.rustc) ||
    typeof b.cargo !== "string" ||
    !/^cargo 1\.94\.1 [^\r\n]{1,120}$/.test(b.cargo) ||
    b.target !== "x86_64-pc-windows-msvc" ||
    typeof b.msvc !== "string" ||
    !/^\d+(\.\d+){2}$/.test(b.msvc) ||
    typeof b.windowsSdk !== "string" ||
    !/^\d+(\.\d+){3}$/.test(b.windowsSdk) ||
    !identity(b.compiler) ||
    b.compiler.path !== "cl.exe" ||
    !identity(b.linker) ||
    b.linker.path !== "link.exe" ||
    !identity(b.staticlib) ||
    b.staticlib.path !== "vivi_runtime_native_c_abi.lib" ||
    b.defaultFeatures !== false ||
    JSON.stringify(b.features) !== '["local-asset-host-v1"]' ||
    JSON.stringify(b.rustFlags) !==
      '["--remap-path-prefix=<workspace>=/workspace/vivi2d","--remap-path-prefix=<cargo-home>=/cargo"]'
  )
    return false;
  const flags = (values) =>
    Array.isArray(values) &&
    values.length > 0 &&
    values.length < 32 &&
    values.every(
      (item) => typeof item === "string" && item.length < 128 && !/[\r\n\\]/.test(item),
    );
  if (
    !flags(b.compilerFlags) ||
    !flags(b.linkerFlags) ||
    !b.compilerFlags.includes("/DNAPI_VERSION=8") ||
    !b.linkerFlags.includes("/DELAYLOAD:node.exe") ||
    !Array.isArray(b.nativeStaticLibraries) ||
    b.nativeStaticLibraries.length < 1 ||
    b.nativeStaticLibraries.length > 64 ||
    !b.nativeStaticLibraries.every(
      (item) =>
        typeof item === "string" &&
        /^(?:(?:advapi32|bcrypt|kernel32|ntdll|userenv|ws2_32|dbghelp|synchronization|secur32|crypt32|ole32|shell32|uuid|legacy_stdio_definitions|msvcrt|vcruntime|ucrt|libcmt|libvcruntime|libucrt)(?:\.lib)?|\/defaultlib:msvcrt)$/i.test(
          item,
        ),
    )
  )
    return false;
  if (
    !exactKeys(value.pe, ["exports", "imports"]) ||
    JSON.stringify(value.pe.exports) !==
      '["napi_register_module_v1","node_api_module_get_api_version_v1"]' ||
    !Array.isArray(value.pe.imports) ||
    value.pe.imports.length < 1 ||
    value.pe.imports.length > 32
  )
    return false;
  const native = value.pe.imports.filter((item) => item.dll === "node.exe");
  return (
    native.length === 1 &&
    native[0].delayed === true &&
    value.pe.imports.every(
      (item) =>
        exactKeys(item, ["dll", "delayed", "symbols"]) &&
        typeof item.dll === "string" &&
        /^[a-z0-9_.-]{1,100}$/i.test(item.dll) &&
        typeof item.delayed === "boolean" &&
        Array.isArray(item.symbols) &&
        item.symbols.length > 0 &&
        item.symbols.length < 1024 &&
        item.symbols.every(
          (name) => typeof name === "string" && /^[a-z0-9_?$@]{1,200}$/i.test(name),
        ) &&
        (item.dll === "node.exe"
          ? item.symbols.every((name) => name.startsWith("napi_"))
          : !item.delayed &&
            /^(?:KERNEL32|ADVAPI32|bcrypt|bcryptprimitives|ntdll|USERENV|WS2_32|dbghelp|Secur32|CRYPT32|ole32|SHELL32|VCRUNTIME140(?:_1)?|api-ms-win-(?:crt|core)-[a-z0-9-]+)\.dll$/i.test(
              item.dll,
            )),
    )
  );
}
function regular(file, directory = false) {
  const stat = fs.lstatSync(file, { bigint: true });
  if (
    stat.isSymbolicLink() ||
    !(directory ? stat.isDirectory() : stat.isFile()) ||
    fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase()
  )
    throw unavailable();
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}
function fixedFiles(appRoot) {
  if (typeof appRoot !== "string" || !path.isAbsolute(appRoot)) throw unavailable();
  regular(appRoot, true);
  let directory = appRoot;
  for (const part of ["electron", "generated", "native-local-asset", "win32-x64"]) {
    directory = path.join(directory, part);
    regular(directory, true);
  }
  return {
    addon: path.join(directory, "vivi_local_asset_v1.node"),
    manifest: path.join(directory, "manifest.json"),
  };
}
function moduleValid(value) {
  if (
    !value ||
    !Object.isFrozen(value) ||
    Reflect.ownKeys(value).sort().join("\0") !== "abiVersion\0cancel\0close\0start"
  )
    return false;
  return ["start", "cancel", "close", "abiVersion"].every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor &&
      descriptor.configurable === false &&
      descriptor.enumerable === false &&
      descriptor.writable === false &&
      (key === "abiVersion"
        ? descriptor.value === 1
        : typeof descriptor.value === "function")
    );
  });
}
function loadNativeLocalAsset() {
  if (attempted) {
    if (loaded) return loaded;
    throw unavailable();
  }
  attempted = true;
  try {
    if (
      process.platform !== "win32" ||
      process.arch !== "x64" ||
      process.versions.electron !== "42.9.3" ||
      !/^\d+$/.test(process.versions.napi || "") ||
      Number(process.versions.napi) < 8
    )
      throw unavailable();
    const { app } = require("electron");
    const files = fixedFiles(app.getAppPath());
    const manifestIdentity = regular(files.manifest);
    if (fs.statSync(files.manifest).size > 65536) throw unavailable();
    const manifest = JSON.parse(fs.readFileSync(files.manifest, "utf8"));
    if (!manifestValid(manifest) || regular(files.manifest) !== manifestIdentity)
      throw unavailable();
    const addonIdentity = regular(files.addon);
    if (fs.statSync(files.addon).size !== manifest.addon.byteLength) throw unavailable();
    const bytes = fs.readFileSync(files.addon);
    if (
      bytes.length !== manifest.addon.byteLength ||
      hash(bytes) !== manifest.addon.sha256 ||
      regular(files.addon) !== addonIdentity ||
      regular(files.manifest) !== manifestIdentity
    )
      throw unavailable();
    const candidate = require(files.addon);
    if (
      !moduleValid(candidate) ||
      regular(files.addon) !== addonIdentity ||
      regular(files.manifest) !== manifestIdentity
    )
      throw unavailable();
    loaded = candidate;
    return loaded;
  } catch {
    throw unavailable();
  }
}
module.exports = Object.freeze({ loadNativeLocalAsset });
