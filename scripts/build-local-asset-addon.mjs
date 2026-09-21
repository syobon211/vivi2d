// Build the fixed Windows/Electron profile. No install scripts or fallback backend.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { prepareLocalAssetNativeNotices } from "./lib/local-asset-native-notices.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let currentLockedArtifacts = new Map();
const base = "https://electronjs.org/headers/v42.9.3/";
const downloads = [
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
const headers = [
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
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function regular(file) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase()
  )
    throw Error("Non-regular or redirected build input");
  return stat;
}
function read(file) {
  regular(file);
  return fs.readFileSync(file);
}
function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent !== dir) ensureDirectory(parent);
    fs.mkdirSync(dir);
  }
  if (
    !fs.lstatSync(dir).isDirectory() ||
    fs.lstatSync(dir).isSymbolicLink() ||
    fs.realpathSync(dir).toLowerCase() !== path.resolve(dir).toLowerCase()
  )
    throw Error("Redirected build directory");
}
function write(file, bytes) {
  ensureDirectory(path.dirname(file));
  if (fs.existsSync(file)) regular(file);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes, { flag: "wx" });
  fs.renameSync(temporary, file);
}
function identity(file, name = path.relative(root, file).replaceAll("\\", "/")) {
  const bytes = read(file);
  return { path: name, byteLength: bytes.length, sha256: sha(bytes) };
}
function verify(bytes, expected) {
  if (bytes.length !== expected[1] || sha(bytes) !== expected[2])
    throw Error(`Pinned input mismatch: ${expected[0]}`);
}
function command(executable, args, env, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    timeout: 600000,
    ...options,
  });
  if (result.error || result.status !== 0) {
    process.stderr.write((result.stdout ?? "") + (result.stderr ?? ""));
    throw Error(`Build command failed: ${path.basename(executable)} (${result.status})`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}
async function pinnedDownload(spec, cache) {
  const file = path.join(cache, path.basename(spec[0]));
  if (fs.existsSync(file)) {
    const bytes = read(file);
    verify(bytes, spec);
    return bytes;
  }
  const response = await fetch(new URL(spec[0], base), {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok || !response.body) throw Error("Pinned download unavailable");
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > spec[1]) throw Error("Pinned download exceeds bound");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  verify(bytes, spec);
  write(file, bytes);
  return bytes;
}
function extractHeaders(compressed, include) {
  const archive = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
  const seen = new Set();
  const extracted = new Set();
  const string = (bytes) => bytes.toString("utf8").replace(/\0.*$/s, "");
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = [string(header.subarray(345, 500)), string(header.subarray(0, 100))]
      .filter(Boolean)
      .join("/");
    const type = header[156];
    if (
      !name ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      name.includes(":") ||
      (seen.has(name) && type !== 120) ||
      ![0, 48, 53, 120].includes(type)
    )
      throw Error("Unsafe header archive entry");
    if (type !== 120) seen.add(name);
    const octal = string(header.subarray(124, 136)).trim();
    if (!/^[0-7]+$/.test(octal)) throw Error("Invalid header archive length");
    const size = Number.parseInt(octal, 8);
    const storedChecksum = Number.parseInt(string(header.subarray(148, 156)).trim(), 8);
    const checksum = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (checksum !== storedChecksum || offset + 512 + size > archive.length)
      throw Error("Invalid header archive framing");
    if (type === 120) {
      // This pinned release contains only numeric per-entry mtime metadata.
      // Never interpret PAX path/linkpath/size overrides or extract metadata.
      const record = archive.toString("utf8", offset + 512, offset + 512 + size);
      if (
        name !== "././@PaxHeader" ||
        size > 32 ||
        !/^\d+ mtime=\d+(\.\d+)?\n$/.test(record) ||
        Number(record.split(" ")[0]) !== size
      )
        throw Error("Unsupported archive metadata");
    }
    const spec = headers.find((item) => name === `node_headers/include/node/${item[0]}`);
    if (spec) {
      if (type !== 0 && type !== 48) throw Error("Header is not regular");
      const bytes = archive.subarray(offset + 512, offset + 512 + size);
      verify(bytes, spec);
      write(path.join(include, spec[0]), bytes);
      extracted.add(spec[0]);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (extracted.size !== headers.length) throw Error("Pinned headers missing");
}
function compilerEnvironment() {
  const vswhere = "C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe";
  regular(vswhere);
  const installation = command(
    vswhere,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath",
    ],
    process.env,
  ).trim();
  if (!installation || /[\r\n"&|<>]/.test(installation))
    throw Error("No fixed MSVC x64 installation");
  const vcvars = path.join(installation, "VC/Auxiliary/Build/vcvars64.bat");
  regular(vcvars);
  const output = command(
    process.env.ComSpec || "C:/Windows/System32/cmd.exe",
    ["/d", "/s", "/c", `""${vcvars}" >nul && set"`],
    process.env,
    { windowsVerbatimArguments: true },
  );
  const env = { ...process.env };
  for (const line of output.split(/\r?\n/)) {
    const split = line.indexOf("=");
    if (split > 0) env[line.slice(0, split)] = line.slice(split + 1);
  }
  for (const key of Object.keys(env))
    if (
      /^(RUSTC|RUSTFLAGS|CARGO_ENCODED_RUSTFLAGS|RUSTC_WRAPPER|RUSTC_WORKSPACE_WRAPPER|CL|_CL_|LINK|_LINK_)$/i.test(
        key,
      )
    )
      delete env[key];
  env.CARGO_INCREMENTAL = "0";
  const cargoRoot = path.resolve(env.CARGO_HOME || path.join(os.homedir(), ".cargo"));
  env.CARGO_ENCODED_RUSTFLAGS = [
    `--remap-path-prefix=${root}=/workspace/vivi2d`,
    `--remap-path-prefix=${cargoRoot}=/cargo`,
  ].join("\u001f");
  // Cargo honors inherited RUSTC even when cargo itself uses +1.94.1. Resolve
  // the selected toolchain once, before Cargo, and use that same executable for
  // compilation and the manifest version observation.
  env.RUSTC = command("rustup", ["which", "--toolchain", "1.94.1", "rustc"], env).trim();
  if (!path.isAbsolute(env.RUSTC)) throw Error("Selected rustc is not absolute");
  regular(env.RUSTC);
  if (!/^rustc 1\.94\.1 /.test(command(env.RUSTC, ["--version"], env).trim()))
    throw Error("Wrong selected rustc");
  return env;
}
export function peInventory(bytes, requireAddon = true) {
  if (bytes.toString("ascii", 0, 2) !== "MZ") throw Error("Not PE");
  const pe = bytes.readUInt32LE(60);
  if (
    bytes.toString("ascii", pe, pe + 4) !== "PE\0\0" ||
    bytes.readUInt16LE(pe + 4) !== 0x8664
  )
    throw Error("Not x64 PE");
  const optional = pe + 24;
  if (bytes.readUInt16LE(optional) !== 0x20b) throw Error("Not PE32+");
  const sectionCount = bytes.readUInt16LE(pe + 6),
    sections = optional + bytes.readUInt16LE(pe + 20);
  const rva = (address) => {
    for (let i = 0; i < sectionCount; i++) {
      const p = sections + i * 40,
        start = bytes.readUInt32LE(p + 12);
      const length = Math.max(bytes.readUInt32LE(p + 8), bytes.readUInt32LE(p + 16));
      if (address >= start && address < start + length) {
        const offset = bytes.readUInt32LE(p + 20) + address - start;
        if (offset >= bytes.length) break;
        return offset;
      }
    }
    throw Error("PE RVA outside file");
  };
  const text = (address) => {
    const p = rva(address),
      end = bytes.indexOf(0, p);
    if (end < p || end - p > 512) throw Error("Invalid PE string");
    return bytes.toString("ascii", p, end);
  };
  const directory = (index) => bytes.readUInt32LE(optional + 112 + index * 8);
  const exports = [];
  if (directory(0)) {
    const p = rva(directory(0)),
      count = bytes.readUInt32LE(p + 24),
      names = rva(bytes.readUInt32LE(p + 32));
    for (let i = 0; i < count; i++) exports.push(text(bytes.readUInt32LE(names + i * 4)));
  }
  const imports = [];
  function importList(address, delay) {
    if (!address) return;
    for (
      let p = rva(address);
      bytes.readUInt32LE(p + (delay ? 4 : 12));
      p += delay ? 32 : 20
    ) {
      if (delay && bytes.readUInt32LE(p) !== 1) throw Error("Unsupported delayed import");
      const dll = text(bytes.readUInt32LE(p + (delay ? 4 : 12)));
      const table = rva(bytes.readUInt32LE(p + (delay ? 16 : 0))),
        symbols = [];
      for (let q = table; bytes.readBigUInt64LE(q); q += 8) {
        const value = bytes.readBigUInt64LE(q);
        if (value >> 63n) throw Error("Ordinal imports are not admitted");
        symbols.push(text(Number(value) + 2));
      }
      imports.push({ dll, delayed: delay, symbols });
    }
  }
  importList(directory(1), false);
  importList(directory(13), true);
  const expected = ["napi_register_module_v1", "node_api_module_get_api_version_v1"];
  if (requireAddon && JSON.stringify(exports.sort()) !== JSON.stringify(expected))
    throw Error(`Unexpected addon exports: ${exports.join(",")}`);
  const node = imports.filter((item) => item.dll.toLowerCase() === "node.exe");
  if (
    requireAddon
      ? node.length !== 1 ||
        !node[0].delayed ||
        node[0].symbols.some((name) => !name.startsWith("napi_"))
      : node.length !== 0
  )
    throw Error("Unexpected Node imports");
  const admittedDll =
    /^(?:KERNEL32|ADVAPI32|bcrypt|bcryptprimitives|ntdll|USERENV|WS2_32|dbghelp|Secur32|CRYPT32|ole32|SHELL32|VCRUNTIME140|api-ms-win-(?:crt|core)-[a-z0-9-]+)\.dll$/i;
  const unexpected = imports.filter(
    (item) =>
      item.dll.toLowerCase() !== "node.exe" &&
      (!admittedDll.test(item.dll) || item.delayed),
  );
  if (unexpected.length)
    throw Error(
      `Unexpected native DLL dependency: ${unexpected.map((item) => item.dll).join(",")}`,
    );
  // The single pinned CRT is the complete non-OS dependency closure. A CRT
  // depending on another CRT (including itself) needs a separate reviewed input.
  if (!requireAddon && imports.some((item) => /^vcruntime/i.test(item.dll)))
    throw Error("Unbundled CRT dependency");
  return { exports, imports };
}

export async function checkLocalAssetNativeNotices(manifest) {
  const prepared = await prepareLocalAssetNativeNotices({
    root,
    manifest,
    env: compilerEnvironment(),
  });
  const directory = path.join(root, "electron/generated/native-local-asset/win32-x64");
  const addonPe = peInventory(read(path.join(directory, "vivi_local_asset_v1.node")));
  if (JSON.stringify(addonPe) !== JSON.stringify(manifest.pe))
    throw Error("Native PE inventory changed");
  const crtPe = peInventory(prepared.files["vcruntime140.dll"], false);
  for (const [name, bytes] of Object.entries(prepared.files))
    if (!read(path.join(directory, name)).equals(bytes))
      throw Error("Native notice output differs");
  return {
    ...prepared.evidence,
    nonOsDependencyClosure: { addon: addonPe.imports, crt: crtPe.imports },
  };
}

export async function buildLocalAssetAddon() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error("This build requires Windows x64");
  if (
    JSON.parse(read(path.join(root, "node_modules/electron/package.json"))).version !==
    "42.9.3"
  )
    throw Error("Pinned Electron required");
  const build = path.join(root, "target/local-asset-addon-v1");
  const cache = path.join(build, "electron-42.9.3");
  const include = path.join(cache, "include");
  ensureDirectory(include);
  const artifacts = [];
  for (const spec of downloads) artifacts.push(await pinnedDownload(spec, cache));
  for (const spec of downloads.slice(1))
    if (
      !artifacts[0]
        .toString("utf8")
        .split(/\r?\n/)
        .some(
          (line) =>
            line.trim() === `${spec[2]} *${spec[0]}` ||
            line.trim() === `${spec[2]}  ${spec[0]}`,
        )
    )
      throw Error("Release checksum table mismatch");
  extractHeaders(artifacts[1], include);
  const env = compilerEnvironment();
  const sourceFiles = [
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
  const sourcePins = sourceFiles.map((file) => identity(path.join(root, file)));
  const noticeSources = [
    "scripts/lib/local-asset-native-notices.mjs",
    "scripts/fixtures/local-asset-native-notices-v1.json",
  ];
  const noticePins = noticeSources.map((file) => identity(path.join(root, file)));
  const lockPin = identity(path.join(root, "packages/runtime-native/Cargo.lock"));
  const cargoArgs = [
    "+1.94.1",
    "rustc",
    "--manifest-path",
    "packages/runtime-native/Cargo.toml",
    "-p",
    "vivi-runtime-native-c-abi",
    "--release",
    "--locked",
    "--offline",
    "--message-format=json",
    "--target",
    "x86_64-pc-windows-msvc",
    "--target-dir",
    path.join(build, "rust"),
    "--no-default-features",
    "--features",
    "local-asset-host-v1",
    "--crate-type",
    "staticlib",
    "--",
    "--print",
    "native-static-libs",
  ];
  process.stdout.write("Building isolated, locked Rust static library...\n");
  const cargoOutput = command("cargo", cargoArgs, env);
  const diagnosticLines = [];
  currentLockedArtifacts = new Map();
  for (const line of cargoOutput.split(/\r?\n/)) {
    if (!line.startsWith("{")) {
      diagnosticLines.push(line);
      continue;
    }
    const message = JSON.parse(line);
    if (message.reason === "compiler-message")
      diagnosticLines.push(message.message.rendered || "");
    if (message.reason === "compiler-artifact") {
      const rlib = message.filenames.find((file) => file.endsWith(".rlib"));
      if (rlib) currentLockedArtifacts.set(message.target.name, rlib);
    }
  }
  const reports = [
    ...new Set(
      [...diagnosticLines.join("\n").matchAll(/native-static-libs:\s*([^\r\n]+)/g)].map(
        (match) => match[1].trim(),
      ),
    ),
  ];
  if (reports.length !== 1) throw Error("Expected one compiler static library report");
  const libraries = reports[0].split(/\s+/);
  const admittedLibrary =
    /^(?:(?:advapi32|bcrypt|kernel32|ntdll|userenv|ws2_32|dbghelp|synchronization|secur32|crypt32|ole32|shell32|uuid|legacy_stdio_definitions|msvcrt|vcruntime|ucrt|libcmt|libvcruntime|libucrt)(?:\.lib)?|\/defaultlib:msvcrt)$/i;
  if (!libraries.length || libraries.some((item) => !admittedLibrary.test(item)))
    throw Error(`Unexpected compiler native libraries: ${libraries.join(",")}`);
  const source = path.join(root, "electron/native-local-asset");
  const cl = path.join(env.VCToolsInstallDir, "bin/Hostx64/x64/cl.exe");
  const link = path.join(env.VCToolsInstallDir, "bin/Hostx64/x64/link.exe");
  regular(cl);
  regular(link);
  const compilerFlags = [
    "/nologo",
    "/TC",
    "/std:c11",
    "/W4",
    "/WX",
    "/O2",
    "/MD",
    "/guard:cf",
    "/Brepro",
    "/DNAPI_VERSION=8",
    "/DNODE_GYP_MODULE_NAME=vivi_local_asset_v1",
    "/DWIN32_LEAN_AND_MEAN",
    `/I${include}`,
    `/I${path.join(root, "packages/runtime-c-abi/include")}`,
  ];
  for (const name of ["addon", "delay-load"])
    command(
      cl,
      [
        ...compilerFlags,
        "/c",
        path.join(source, `${name}.c`),
        `/Fo${path.join(build, `${name}.obj`)}`,
      ],
      env,
    );
  const staticlib = path.join(
    build,
    "rust/x86_64-pc-windows-msvc/release/vivi_runtime_native_c_abi.lib",
  );
  regular(staticlib);
  const addon = path.join(build, "vivi_local_asset_v1.node");
  const linkerFlags = [
    "/NOLOGO",
    "/DLL",
    "/MACHINE:X64",
    "/INCREMENTAL:NO",
    "/OPT:REF",
    "/OPT:ICF",
    "/DYNAMICBASE",
    "/NXCOMPAT",
    "/GUARD:CF",
    "/Brepro",
    "/DELAYLOAD:node.exe",
  ];
  command(
    link,
    [
      ...linkerFlags,
      `/DEF:${path.join(source, "addon.def")}`,
      `/OUT:${addon}`,
      `/IMPLIB:${path.join(build, "addon.lib")}`,
      path.join(build, "addon.obj"),
      path.join(build, "delay-load.obj"),
      path.join(cache, "node.lib"),
      "delayimp.lib",
      staticlib,
      ...libraries,
    ],
    env,
  );
  const bytes = read(addon);
  const inventory = peInventory(bytes);
  for (const encoding of ["latin1", "utf16le"]) {
    if (/[a-z]:[\\/]Users[\\/]/i.test(bytes.toString(encoding)))
      throw Error("Author path in shipping addon");
  }
  if (bytes.includes(Buffer.from("__test")))
    throw Error("Test control in shipping addon");
  if (
    JSON.stringify(sourcePins) !==
      JSON.stringify(sourceFiles.map((file) => identity(path.join(root, file)))) ||
    JSON.stringify(lockPin) !==
      JSON.stringify(identity(path.join(root, "packages/runtime-native/Cargo.lock")))
  )
    throw Error("Build source changed while compiling");
  const manifest = {
    format: 1,
    platform: "win32",
    arch: "x64",
    electronVersion: "42.9.3",
    napiVersion: 8,
    localAssetAbiVersion: 1,
    addon: { byteLength: bytes.length, sha256: sha(bytes) },
    inputs: {
      releaseArtifacts: downloads.map(([name, byteLength, sha256]) => ({
        path: name,
        byteLength,
        sha256,
      })),
      headers: headers.map(([name, byteLength, sha256]) => ({
        path: name,
        byteLength,
        sha256,
      })),
      sources: sourcePins,
      lock: lockPin,
    },
    build: {
      rustc: command(env.RUSTC, ["--version"], env).trim(),
      cargo: command("cargo", ["+1.94.1", "--version"], env).trim(),
      target: "x86_64-pc-windows-msvc",
      msvc: env.VCToolsVersion.trim(),
      windowsSdk: env.WindowsSDKVersion.replace(/[\\/]$/, ""),
      compiler: identity(cl, "cl.exe"),
      linker: identity(link, "link.exe"),
      compilerFlags: compilerFlags.filter((flag) => !flag.startsWith("/I")),
      linkerFlags,
      rustFlags: [
        "--remap-path-prefix=<workspace>=/workspace/vivi2d",
        "--remap-path-prefix=<cargo-home>=/cargo",
      ],
      features: ["local-asset-host-v1"],
      defaultFeatures: false,
      nativeStaticLibraries: libraries,
      staticlib: identity(staticlib, "vivi_runtime_native_c_abi.lib"),
    },
    pe: inventory,
  };
  const output = path.join(root, "electron/generated/native-local-asset/win32-x64");
  write(path.join(output, "vivi_local_asset_v1.node"), bytes);
  write(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const notice = await prepareLocalAssetNativeNotices({ root, manifest, env });
  peInventory(notice.files["vcruntime140.dll"], false);
  if (
    JSON.stringify(noticePins) !==
    JSON.stringify(noticeSources.map((file) => identity(path.join(root, file))))
  )
    throw Error("Notice source changed during generation");
  for (const [name, contents] of Object.entries(notice.files))
    write(path.join(output, name), contents);
  process.stdout.write(
    `${JSON.stringify({ addon: manifest.addon, exports: inventory.exports, delayedNodeApiImports: inventory.imports.find((item) => item.delayed).symbols.length })}\n`,
  );
  return manifest;
}

// Called only by the mandatory check, never used as a shipping output. The same
// already authenticated Rust staticlib backs fixed C-only lifetime/failure seams.
export function buildLocalAssetTestAddon(manifest) {
  const build = path.join(root, "target/local-asset-addon-v1"),
    env = compilerEnvironment();
  const source = path.join(root, "electron/native-local-asset");
  const staticlib = path.join(
    build,
    "rust/x86_64-pc-windows-msvc/release/vivi_runtime_native_c_abi.lib",
  );
  if (
    JSON.stringify(identity(staticlib, "vivi_runtime_native_c_abi.lib")) !==
    JSON.stringify(manifest.build.staticlib)
  )
    throw Error("Test staticlib identity changed");
  for (const pin of manifest.inputs.sources)
    if (JSON.stringify(identity(path.join(root, pin.path))) !== JSON.stringify(pin))
      throw Error("Test source differs from shipping source");
  const cl = path.join(env.VCToolsInstallDir, "bin/Hostx64/x64/cl.exe"),
    link = path.join(env.VCToolsInstallDir, "bin/Hostx64/x64/link.exe");
  const includes = [
    `/I${path.join(build, "electron-42.9.3/include")}`,
    `/I${path.join(root, "packages/runtime-c-abi/include")}`,
  ];
  command(
    cl,
    [
      ...manifest.build.compilerFlags,
      ...includes,
      "/DVIVI_LOCAL_ASSET_TEST=1",
      "/c",
      path.join(source, "addon.c"),
      `/Fo${path.join(build, "addon-test.obj")}`,
    ],
    env,
  );
  const output = path.join(build, "vivi_local_asset_test.node");
  command(
    link,
    [
      ...manifest.build.linkerFlags,
      `/DEF:${path.join(source, "addon.def")}`,
      `/OUT:${output}`,
      `/IMPLIB:${path.join(build, "addon-test.lib")}`,
      path.join(build, "addon-test.obj"),
      path.join(build, "delay-load.obj"),
      path.join(build, "electron-42.9.3/node.lib"),
      "delayimp.lib",
      staticlib,
      ...manifest.build.nativeStaticLibraries,
    ],
    env,
  );
  peInventory(read(output));
  command(
    cl,
    [
      ...manifest.build.compilerFlags,
      ...includes,
      "/DVIVI_LOCAL_ASSET_TEST_INIT_FAILURE=1",
      "/c",
      path.join(source, "addon.c"),
      `/Fo${path.join(build, "addon-init-failure.obj")}`,
    ],
    env,
  );
  const initializationFailure = path.join(
    build,
    "vivi_local_asset_initialization_failure.node",
  );
  command(
    link,
    [
      ...manifest.build.linkerFlags,
      `/DEF:${path.join(source, "addon.def")}`,
      `/OUT:${initializationFailure}`,
      `/IMPLIB:${path.join(build, "addon-init-failure.lib")}`,
      path.join(build, "addon-init-failure.obj"),
      path.join(build, "delay-load.obj"),
      path.join(build, "electron-42.9.3/node.lib"),
      "delayimp.lib",
      staticlib,
      ...manifest.build.nativeStaticLibraries,
    ],
    env,
  );
  peInventory(read(initializationFailure));
  return { addon: output, initializationFailure };
}

export function buildLocalAssetManifestSeeder(manifest) {
  const build = path.join(root, "target/local-asset-addon-v1"),
    env = compilerEnvironment();
  const dependencies = path.join(build, "rust/x86_64-pc-windows-msvc/release/deps");
  const externs = ["vivi_asset_host_local", "vivi_asset_resolver", "sha2"].map((name) => {
    const file = currentLockedArtifacts.get(name);
    if (!file || path.dirname(file).toLowerCase() !== dependencies.toLowerCase())
      throw Error("Missing actual locked fixture artifact");
    regular(file);
    return { name, file };
  });
  for (const pin of manifest.inputs.sources)
    if (JSON.stringify(identity(path.join(root, pin.path))) !== JSON.stringify(pin))
      throw Error("Fixture source changed since locked build");
  const source = path.join(root, "scripts/fixtures/local-asset-manifest-seed.rs"),
    output = path.join(build, "local-asset-manifest-seed.exe");
  command(
    env.RUSTC,
    [
      "--edition=2024",
      "--target",
      "x86_64-pc-windows-msvc",
      "-C",
      "opt-level=2",
      "--remap-path-prefix",
      `${root}=/workspace/vivi2d`,
      "-L",
      `dependency=${dependencies}`,
      ...externs.flatMap((item) => ["--extern", `${item.name}=${item.file}`]),
      source,
      "-o",
      output,
    ],
    env,
  );
  return {
    executable: output,
    source: identity(source),
    linkedRlibs: externs.map((item) => identity(item.file, path.basename(item.file))),
    binary: identity(output, "local-asset-manifest-seed.exe"),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildLocalAssetAddon();
