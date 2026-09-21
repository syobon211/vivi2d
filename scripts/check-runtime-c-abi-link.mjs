import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  msvcCompileAndLinkArgs,
  selectCCompiler,
} from "./lib/runtime-c-abi-compiler.mjs";

const root = process.cwd();
if (process.argv.slice(2).some((arg) => arg !== "--evaluation-v1")) {
  throw new Error("Only the fixed --evaluation-v1 profile is supported");
}
const evaluationMode = process.argv.includes("--evaluation-v1");
const nativeManifest = path.join(root, "packages/runtime-native/Cargo.toml");
const includeDir = path.join(root, "packages/runtime-c-abi/include");
const samplePath = path.join(
  root,
  `packages/runtime-c-abi/samples/${evaluationMode ? "evaluation-host" : "minimal-host"}.c`,
);
const targetDir = path.join(
  root,
  evaluationMode
    ? "packages/runtime-native/target/evaluation-abi/debug"
    : "packages/runtime-native/target/debug",
);
const tmpDirRelative = path.join(
  "tmp",
  evaluationMode ? "runtime-c-abi-evaluation-link" : "runtime-c-abi-link",
);
const tmpDir = path.join(root, tmpDirRelative);

run("cargo", [
  ...(evaluationMode ? ["+1.89.0"] : []),
  "build",
  "--locked",
  "--manifest-path",
  nativeManifest,
  "-p",
  "vivi-runtime-native-c-abi",
  ...(evaluationMode
    ? [
        "--no-default-features",
        "--features",
        "evaluation-v1",
        "--target-dir",
        path.dirname(targetDir),
      ]
    : []),
]);

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const dynamicLibrary = findDynamicLibrary();
copyFileSync(dynamicLibrary, path.join(tmpDir, path.basename(dynamicLibrary)));
const importLibrary = findImportLibrary();
if (importLibrary) {
  copyFileSync(importLibrary, path.join(tmpDir, path.basename(importLibrary)));
  if (process.platform === "win32") {
    copyFileSync(importLibrary, path.join(tmpDir, "vivi_runtime_native_c_abi.lib"));
  }
}

if (!evaluationMode) runRustFfiHost();
runOptionalCHost();

console.log("[runtime-c-abi-link] passed");

function runRustFfiHost() {
  const hostPath = path.join(tmpDir, "rust-ffi-host.rs");
  const exePath = path.join(tmpDir, executableName("rust-ffi-host"));
  writeFileSync(
    hostPath,
    `
#[repr(C)]
struct ViviVersion {
    struct_size: u32,
    major: u32,
    minor: u32,
    patch: u32,
}

#[link(name = "vivi_runtime_native_c_abi")]
unsafe extern "C" {
    fn vivi_get_abi_version() -> u32;
    fn vivi_get_supported_spec_version_range(
        out_min_version: *mut ViviVersion,
        out_max_version: *mut ViviVersion,
    ) -> i32;
}

fn main() {
    if unsafe { vivi_get_abi_version() } != 1 {
        std::process::exit(10);
    }
    let mut min_version = ViviVersion { struct_size: 16, major: 0, minor: 0, patch: 0 };
    let mut max_version = ViviVersion { struct_size: 16, major: 0, minor: 0, patch: 0 };
    let status = unsafe {
        vivi_get_supported_spec_version_range(&mut min_version, &mut max_version)
    };
    if status != 0 || min_version.major != 1 || max_version.major != 1 {
        std::process::exit(11);
    }
}
`,
  );
  run("rustc", [
    hostPath,
    "-o",
    exePath,
    "-L",
    `native=${tmpDir}`,
    "-L",
    `native=${targetDir}`,
  ]);
  runHost(exePath);
}

function runOptionalCHost() {
  const compiler = findCCompiler();
  if (!compiler) {
    if (evaluationMode)
      throw new Error(
        "Evaluation profile requires an actual C header/link/copy-out check",
      );
    console.log("[runtime-c-abi-link] C host skipped: no C compiler found on PATH");
    return;
  }

  const exePath = path.join(tmpDir, executableName("minimal-host"));
  if (compiler.kind === "msvc") {
    runMsvc(
      compiler,
      msvcCompileAndLinkArgs({
        includeDir,
        sourcePath: samplePath,
        executablePath: exePath,
        objectPath: path.join(tmpDir, "minimal-host.obj"),
        importLibraryPath: path.join(tmpDir, "vivi_runtime_native_c_abi.lib"),
      }),
    );
  } else {
    run(compiler.command, [
      "-std=c11",
      "-Wall",
      "-Wextra",
      "-Wpedantic",
      "-Werror",
      `-I${includeDir}`,
      samplePath,
      `-L${targetDir}`,
      "-lvivi_runtime_native_c_abi",
      "-o",
      exePath,
    ]);
  }
  runHost(exePath);
}

function findDynamicLibrary() {
  const candidates =
    process.platform === "win32"
      ? ["vivi_runtime_native_c_abi.dll"]
      : process.platform === "darwin"
        ? ["libvivi_runtime_native_c_abi.dylib"]
        : ["libvivi_runtime_native_c_abi.so"];
  for (const fileName of candidates) {
    const fullPath = path.join(targetDir, fileName);
    if (existsSync(fullPath)) return fullPath;
  }
  throw new Error(`Native runtime dynamic library was not found in ${targetDir}`);
}

function findImportLibrary() {
  if (process.platform !== "win32") return null;
  const fullPath = path.join(targetDir, "vivi_runtime_native_c_abi.dll.lib");
  return existsSync(fullPath) ? fullPath : null;
}

function findCCompiler() {
  return selectCCompiler({
    platform: process.platform,
    requested: process.env.CC,
    commandExists,
    findVcvars64,
  });
}

function findVcvars64() {
  if (process.platform !== "win32") return null;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (!programFilesX86) return null;
  const vswhere = path.join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (!existsSync(vswhere)) return null;
  const result = spawnSync(
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
    { encoding: "utf8", windowsHide: true, timeout: 10000 },
  );
  if (result.status !== 0 || result.error || result.signal) return null;
  const installation = result.stdout.trim();
  if (!path.isAbsolute(installation) || /[\r\n"&|<>%!]/.test(installation)) return null;
  const candidate = path.join(installation, "VC", "Auxiliary", "Build", "vcvars64.bat");
  return existsSync(candidate) ? candidate : null;
}

function commandExists(command) {
  const probe =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { stdio: "ignore" })
      : spawnSync("command", ["-v", command], { shell: true, stdio: "ignore" });
  return probe.status === 0;
}

function runHost(exePath) {
  const env = { ...process.env };
  if (process.platform === "win32") {
    env.PATH = `${tmpDir};${targetDir};${env.PATH ?? ""}`;
  } else if (process.platform === "darwin") {
    env.DYLD_LIBRARY_PATH = `${tmpDir}:${targetDir}:${env.DYLD_LIBRARY_PATH ?? ""}`;
  } else {
    env.LD_LIBRARY_PATH = `${tmpDir}:${targetDir}:${env.LD_LIBRARY_PATH ?? ""}`;
  }
  run(exePath, [], { env });
}

function runMsvc(compiler, args) {
  if (!compiler.vcvars) {
    run(compiler.command, args);
    return;
  }
  const cmdRelativePath = path.join(tmpDirRelative, "build-c-host.cmd");
  const cmdPath = path.join(root, cmdRelativePath);
  writeFileSync(
    cmdPath,
    [
      "@echo off",
      `call "${compiler.vcvars}" >nul`,
      `${compiler.command} ${args.map(quoteCmdArg).join(" ")}`,
      "",
    ].join("\r\n"),
  );
  const result = spawnSync("cmd.exe", ["/d", "/c", cmdRelativePath], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function run(command, args, options = {}) {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          shell: true,
          stdio: "inherit",
          ...options,
        })
      : spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function executableName(baseName) {
  return process.platform === "win32" ? `${baseName}.exe` : baseName;
}

function quoteShellArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function quoteCmdArg(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
