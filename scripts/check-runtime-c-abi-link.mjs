import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const nativeManifest = path.join(root, "packages/runtime-native/Cargo.toml");
const includeDir = path.join(root, "packages/runtime-c-abi/include");
const samplePath = path.join(root, "packages/runtime-c-abi/samples/minimal-host.c");
const targetDir = path.join(root, "packages/runtime-native/target/debug");
const tmpDir = path.join(root, "tmp/runtime-c-abi-link");

run("cargo", [
  "build",
  "--manifest-path",
  nativeManifest,
  "-p",
  "vivi-runtime-native-c-abi",
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

runRustFfiHost();
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
    console.log("[runtime-c-abi-link] C host skipped: no C compiler found on PATH");
    return;
  }

  const exePath = path.join(tmpDir, executableName("minimal-host"));
  if (compiler.kind === "msvc") {
    runMsvc(compiler, [
      "/nologo",
      "/std:c11",
      "/W4",
      "/WX",
      "/utf-8",
      `/I${includeDir}`,
      samplePath,
      `/Fe:${exePath}`,
      `/Fo:${path.join(tmpDir, "minimal-host.obj")}`,
      path.join(tmpDir, "vivi_runtime_native_c_abi.lib"),
    ]);
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
  const requested = process.env.CC?.trim();
  if (requested && commandExists(requested)) {
    return { command: requested, kind: compilerKind(requested) };
  }
  for (const command of ["cc", "gcc", "clang", "cl", "clang-cl"]) {
    if (commandExists(command)) {
      return { command, kind: compilerKind(command) };
    }
  }
  const vcvars = findVcvars64();
  if (vcvars) {
    return { command: "cl", kind: "msvc", vcvars };
  }
  return null;
}

function findVcvars64() {
  if (process.platform !== "win32") return null;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (!programFilesX86) return null;
  const visualStudioRoot = path.join(programFilesX86, "Microsoft Visual Studio");
  if (!existsSync(visualStudioRoot)) return null;
  for (const year of safeReaddir(visualStudioRoot)) {
    const yearPath = path.join(visualStudioRoot, year.name);
    if (!year.isDirectory()) continue;
    for (const edition of safeReaddir(yearPath)) {
      if (!edition.isDirectory()) continue;
      const candidate = path.join(
        yearPath,
        edition.name,
        "VC",
        "Auxiliary",
        "Build",
        "vcvars64.bat",
      );
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function safeReaddir(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function compilerKind(command) {
  const baseName = path.basename(command).toLowerCase();
  return baseName === "cl" || baseName === "cl.exe" || baseName.startsWith("clang-cl")
    ? "msvc"
    : "unix";
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
  const cmdPath = path.join(tmpDir, "build-c-host.cmd");
  writeFileSync(
    cmdPath,
    [
      "@echo off",
      `call "${compiler.vcvars}" >nul`,
      `${compiler.command} ${args.map(quoteCmdArg).join(" ")}`,
      "",
    ].join("\r\n"),
  );
  const result = spawnSync("cmd.exe", ["/d", "/c", cmdPath], {
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
