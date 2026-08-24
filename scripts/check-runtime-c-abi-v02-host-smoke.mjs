import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const nativeManifest = path.join(root, "packages/runtime-native/Cargo.toml");
const basicFixturePath = path.join(
  root,
  "tests/conformance/runtime-v1/basic-mesh.fixture.json",
);
const tmpRoot = path.join(root, "tmp");
const libraryBaseName = "vivi_runtime_native_c_abi";

const inheritedV01Exports = [
  "vivi_get_abi_version",
  "vivi_get_runtime_version",
  "vivi_get_supported_spec_version_range",
  "vivi_runtime_create",
  "vivi_runtime_destroy",
  "vivi_runtime_last_error_message",
  "vivi_model_last_error_message",
  "vivi_model_load",
  "vivi_model_destroy",
  "vivi_model_get_spec_version",
  "vivi_model_set_input",
  "vivi_model_get_input",
  "vivi_model_update",
  "vivi_model_play_clip",
  "vivi_model_stop_clip",
  "vivi_model_seek_clip",
  "vivi_model_set_state_machine_state",
  "vivi_model_get_state_machine_state",
  "vivi_model_parameter_count",
  "vivi_model_parameter_info",
  "vivi_model_texture_count",
  "vivi_model_texture_snapshot",
  "vivi_model_expression_preset_count",
  "vivi_model_expression_preset_info",
  "vivi_model_expression_preset_value",
  "vivi_model_apply_expression_preset",
  "vivi_model_mesh_count",
  "vivi_model_mesh_snapshot",
  "vivi_model_mesh_snapshot_by_id",
  "vivi_model_hit_test",
  "vivi_model_get_playback_state",
];
const v02Exports = [
  "vivi_model_draw_command_count",
  "vivi_model_draw_commands",
  "vivi_model_generations",
  "vivi_model_render_mesh_count_v2",
  "vivi_model_render_mesh_snapshot_v2",
  "vivi_model_required_render_features",
];
const expectedExports = [...inheritedV01Exports, ...v02Exports].sort();
const editorOnlyExports = ["vivi_model_load_evaluation"];

mkdirSync(tmpRoot, { recursive: true });
const tmpDir = mkdtempSync(path.join(tmpRoot, "runtime-c-abi-v02-host-smoke-"));

try {
  run("node", ["scripts/check-runtime-c-abi.mjs"]);
  const defaultLibraryDir = path.join(tmpDir, "abi-v01-default");
  const defaultArtifacts = buildCAbiArtifacts("default ABI 0.1", []);
  assertStaticLibraryExists(defaultArtifacts.staticLibrary);
  assertExactDynamicExports(
    defaultArtifacts.dynamicLibrary,
    inheritedV01Exports,
    "default ABI 0.1",
    [...v02Exports, ...editorOnlyExports],
  );
  copyRuntimeArtifacts(defaultArtifacts, defaultLibraryDir);

  const v02Artifacts = buildCAbiArtifacts("feature ABI 0.2", [
    "--no-default-features",
    "--features",
    "abi-v02",
  ]);
  assertStaticLibraryExists(v02Artifacts.staticLibrary);
  assertExactDynamicExports(
    v02Artifacts.dynamicLibrary,
    expectedExports,
    "feature ABI 0.2",
    editorOnlyExports,
  );
  copyRuntimeArtifacts(v02Artifacts, tmpDir);

  const { basicPayloadPath, maskedPayloadPath } = writePayloads();
  assertAbiV01ObservationParity(basicPayloadPath, defaultLibraryDir, tmpDir);
  writeGeneratedHeader();
  runRustConformanceHost(basicPayloadPath, maskedPayloadPath);
  runOptionalCAndCppHosts();

  console.log("[runtime-c-abi-v02-host-smoke] passed (implementation subset)");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

function writePayloads() {
  const fixture = JSON.parse(readFileSync(basicFixturePath, "utf8"));
  if (!fixture?.fileData?.project?.layers?.[0]) {
    throw new Error(`${basicFixturePath} does not contain fileData.project.layers[0]`);
  }

  const basicPayloadPath = path.join(tmpDir, "basic-mesh.runtime.json");
  writeFileSync(basicPayloadPath, `${JSON.stringify(fixture.fileData)}\n`);

  const masked = structuredClone(fixture.fileData);
  const sourceLayer = structuredClone(masked.project.layers[0]);
  const maskLayer = {
    ...structuredClone(sourceLayer),
    id: "mask",
    name: "Mask",
    visible: false,
    drawOrder: 1,
  };
  const targetLayer = {
    ...structuredClone(sourceLayer),
    id: "target",
    name: "Target",
    visible: true,
    drawOrder: 2,
    clipMaskIds: ["mask"],
  };
  masked.project.layers = [maskLayer, targetLayer];
  masked.project.colliders = [];
  masked.atlases[0].entries = [
    { layerId: "mask", x: 0, y: 0, width: 10, height: 10 },
    { layerId: "target", x: 0, y: 0, width: 10, height: 10 },
  ];

  const maskedPayloadPath = path.join(tmpDir, "masked.runtime.json");
  writeFileSync(maskedPayloadPath, `${JSON.stringify(masked)}\n`);
  return { basicPayloadPath, maskedPayloadPath };
}

function assertAbiV01ObservationParity(
  basicPayloadPath,
  defaultLibraryDir,
  v02LibraryDir,
) {
  const hostPath = path.join(tmpDir, "rust-v01-observation-host.rs");
  writeFileSync(hostPath, rustV01ObservationHostSource());
  const observations = [
    ["default ABI 0.1", defaultLibraryDir, "default", 1],
    ["feature ABI 0.2", v02LibraryDir, "v02", 2],
  ].map(([label, libraryDir, suffix, expectedAbi]) => {
    // Keep the executable beside the selected DLL. Windows searches the
    // executable directory before PATH, so this prevents the ABI 0.2 DLL in
    // tmpDir from shadowing the copied default DLL during the parity check.
    const exePath = path.join(
      libraryDir,
      executableName(`rust-v01-observation-${suffix}`),
    );
    const rustcArgs = [
      "--edition=2024",
      hostPath,
      "-o",
      exePath,
      "-L",
      `native=${libraryDir}`,
      "-l",
      `dylib=${libraryBaseName}`,
    ];
    const cargoBuildTarget = process.env.CARGO_BUILD_TARGET?.trim();
    if (cargoBuildTarget) rustcArgs.unshift("--target", cargoBuildTarget);
    run("rustc", rustcArgs);
    return [
      label,
      runHostCapture(exePath, [basicPayloadPath, String(expectedAbi)], libraryDir).trim(),
    ];
  });

  if (observations[0][1] !== observations[1][1]) {
    throw new Error(
      [
        "valid unmasked model changed across the default and ABI 0.2 builds",
        `${observations[0][0]}: ${observations[0][1]}`,
        `${observations[1][0]}: ${observations[1][1]}`,
      ].join("\n"),
    );
  }
}

function runRustConformanceHost(basicPayloadPath, maskedPayloadPath) {
  const hostPath = path.join(tmpDir, "rust-v02-host-smoke.rs");
  const exePath = path.join(tmpDir, executableName("rust-v02-host-smoke"));
  writeFileSync(hostPath, rustConformanceHostSource());
  const rustcArgs = [
    "--edition=2024",
    hostPath,
    "-o",
    exePath,
    "-L",
    `native=${tmpDir}`,
    "-l",
    `dylib=${libraryBaseName}`,
  ];
  const cargoBuildTarget = process.env.CARGO_BUILD_TARGET?.trim();
  if (cargoBuildTarget) rustcArgs.unshift("--target", cargoBuildTarget);
  run("rustc", rustcArgs);
  runHost(exePath, [basicPayloadPath, maskedPayloadPath]);
}

function writeGeneratedHeader() {
  writeFileSync(
    path.join(tmpDir, "vivi_runtime_v02_generated.h"),
    `#ifndef VIVI_RUNTIME_V02_GENERATED_H
#define VIVI_RUNTIME_V02_GENERATED_H

#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32)
#define VIVI_EXPORT __declspec(dllimport)
#define VIVI_CALL __cdecl
#else
#define VIVI_EXPORT __attribute__((visibility("default")))
#define VIVI_CALL
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef int32_t ViviStatus;
typedef int32_t ViviBlendMode;
typedef struct ViviRuntime ViviRuntime;
typedef struct ViviModel ViviModel;

typedef struct ViviMeshSnapshot {
  uint32_t struct_size;
  uint32_t _reserved0;
  const char* id;
  const char* texture_id;
  const float* vertices;
  uint64_t vertex_float_count;
  const float* uvs;
  uint64_t uv_float_count;
  const uint32_t* indices;
  uint64_t index_count;
  float x;
  float y;
  float opacity;
  int32_t draw_order;
  ViviBlendMode blend_mode;
  uint8_t visible;
  uint8_t culled;
  uint8_t has_multiply_color;
  uint8_t has_screen_color;
  float multiply_color[4];
  float screen_color[4];
} ViviMeshSnapshot;

typedef struct ViviDrawCommandV2 {
  uint32_t struct_size;
  uint32_t type;
  uint32_t mesh_index;
  uint32_t mask_depth;
  uint32_t flags;
  uint32_t _reserved;
} ViviDrawCommandV2;

typedef struct ViviGenerations {
  uint64_t model_generation;
  uint64_t topology_generation;
  uint64_t dynamic_generation;
} ViviGenerations;

#if defined(__cplusplus)
static_assert(sizeof(ViviMeshSnapshot) == 128, "ViviMeshSnapshot size drift");
static_assert(sizeof(ViviDrawCommandV2) == 24, "ViviDrawCommandV2 size drift");
static_assert(alignof(ViviDrawCommandV2) == 4, "ViviDrawCommandV2 align drift");
static_assert(sizeof(ViviGenerations) == 24, "ViviGenerations size drift");
#else
_Static_assert(sizeof(ViviMeshSnapshot) == 128, "ViviMeshSnapshot size drift");
_Static_assert(sizeof(ViviDrawCommandV2) == 24, "ViviDrawCommandV2 size drift");
_Static_assert(_Alignof(ViviDrawCommandV2) == 4, "ViviDrawCommandV2 align drift");
_Static_assert(sizeof(ViviGenerations) == 24, "ViviGenerations size drift");
#endif

VIVI_EXPORT uint32_t VIVI_CALL vivi_get_abi_version(void);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_draw_command_count(
  const ViviModel* model,
  uint64_t* out_count
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_draw_commands(
  const ViviModel* model,
  const ViviDrawCommandV2** out_ptr
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_generations(
  const ViviModel* model,
  ViviGenerations* out_generations
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_render_mesh_count_v2(
  const ViviModel* model,
  uint64_t* out_count
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_render_mesh_snapshot_v2(
  const ViviModel* model,
  uint32_t mesh_slot,
  ViviMeshSnapshot* out_snapshot
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_required_render_features(
  const ViviModel* model,
  uint64_t* out_flags
);

#ifdef __cplusplus
}
#endif

#endif
`,
  );
}

function runOptionalCAndCppHosts() {
  const cSource = path.join(tmpDir, "v02-header-host.c");
  const cppSource = path.join(tmpDir, "v02-header-host.cpp");
  const source = `#include "vivi_runtime_v02_generated.h"
int main(void) { return vivi_get_abi_version() == 2u ? 0 : 1; }
`;
  writeFileSync(cSource, source);
  writeFileSync(cppSource, source);

  if (process.platform === "win32") {
    const compiler = findMsvcCompiler();
    if (!compiler) {
      console.log(
        "[runtime-c-abi-v02-host-smoke] C/C++ hosts skipped: MSVC was not found",
      );
      return;
    }
    for (const [language, sourcePath, mode, standard] of [
      ["c", cSource, "/Tc", "/std:c11"],
      ["cpp", cppSource, "/Tp", "/std:c++17"],
    ]) {
      const exePath = path.join(tmpDir, executableName(`v02-header-host-${language}`));
      runMsvc(compiler, [
        "/nologo",
        standard,
        "/W4",
        "/WX",
        "/utf-8",
        `/I${tmpDir}`,
        `${mode}${sourcePath}`,
        `/Fe:${exePath}`,
        `/Fo:${path.join(tmpDir, `v02-header-host-${language}.obj`)}`,
        "/link",
        path.join(tmpDir, `${libraryBaseName}.lib`),
      ]);
      runHost(exePath);
    }
    return;
  }

  for (const [language, compiler, sourcePath, standard] of [
    ["c", findCommand([process.env.CC, "cc", "gcc", "clang"]), cSource, "c11"],
    ["cpp", findCommand([process.env.CXX, "c++", "g++", "clang++"]), cppSource, "c++17"],
  ]) {
    if (!compiler) {
      console.log(
        `[runtime-c-abi-v02-host-smoke] ${language.toUpperCase()} host skipped: compiler not found`,
      );
      continue;
    }
    const exePath = path.join(tmpDir, `v02-header-host-${language}`);
    const rpath = process.platform === "darwin" ? "@loader_path" : "$ORIGIN";
    run(compiler, [
      `-std=${standard}`,
      "-Wall",
      "-Wextra",
      "-Wpedantic",
      "-Werror",
      `-I${tmpDir}`,
      sourcePath,
      `-L${tmpDir}`,
      `-l${libraryBaseName}`,
      `-Wl,-rpath,${rpath}`,
      "-o",
      exePath,
    ]);
    runHost(exePath);
  }
}

function assertExactDynamicExports(
  dynamicLibrary,
  expected,
  label,
  explicitlyForbidden = [],
) {
  const output = readDynamicExports(dynamicLibrary);
  const actual = [
    ...new Set(
      [...output.matchAll(/\b_?(vivi_[A-Za-z0-9_]+)\b/g)].map((match) => match[1]),
    ),
  ]
    .filter((name) => name !== libraryBaseName)
    .sort();
  const sortedExpected = [...expected].sort();
  const missing = sortedExpected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !sortedExpected.includes(name));
  const forbidden = explicitlyForbidden.filter((name) => actual.includes(name));
  if (
    missing.length > 0 ||
    unexpected.length > 0 ||
    forbidden.length > 0 ||
    actual.length !== sortedExpected.length
  ) {
    throw new Error(
      [
        `${label} dynamic export set must be exactly ${sortedExpected.length} symbols (found ${actual.length})`,
        missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
        unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : null,
        forbidden.length > 0 ? `forbidden: ${forbidden.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
}

function readDynamicExports(dynamicLibrary) {
  if (process.platform === "win32") {
    if (commandExists("dumpbin")) {
      return runCapture("dumpbin", ["/nologo", "/exports", dynamicLibrary]);
    }
    const vcvars = findVcvars64();
    if (!vcvars) {
      throw new Error("dumpbin is required to verify the Windows DLL export set");
    }
    const commandPath = path.join(tmpDir, "inspect-exports.cmd");
    writeFileSync(
      commandPath,
      [
        "@echo off",
        `call "${vcvars}" >nul`,
        `dumpbin /nologo /exports "${dynamicLibrary}"`,
        "",
      ].join("\r\n"),
    );
    return runCapture("cmd.exe", ["/d", "/c", commandPath]);
  }
  const nm = findCommand(["nm"]);
  if (!nm) throw new Error("nm is required to verify the dynamic export set");
  return process.platform === "darwin"
    ? runCapture(nm, ["-gU", dynamicLibrary])
    : runCapture(nm, ["-D", "--defined-only", dynamicLibrary]);
}

function buildCAbiArtifacts(label, featureArgs) {
  const args = [
    "build",
    "--manifest-path",
    nativeManifest,
    "-p",
    "vivi-runtime-native-c-abi",
    ...featureArgs,
    "--message-format=json-render-diagnostics",
  ];
  const result = spawnSync("cargo", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    throw new Error(
      `${label} cargo build failed with exit code ${result.status ?? "unknown"}`,
    );
  }

  const filenames = new Set();
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      message.reason !== "compiler-artifact" ||
      message.target?.name !== libraryBaseName ||
      !String(message.package_id).includes("vivi-runtime-native-c-abi")
    ) {
      continue;
    }
    for (const filename of message.filenames ?? []) {
      filenames.add(path.resolve(root, filename));
    }
  }

  const artifacts = [...filenames].filter(existsSync);
  const dynamicLibrary = artifacts.find((filename) =>
    /(?:\.dll|\.dylib|\.so)$/i.test(filename),
  );
  const importLibrary = artifacts.find((filename) => /\.dll\.(?:lib|a)$/i.test(filename));
  const staticLibrary = artifacts.find((filename) => {
    const basename = path.basename(filename).toLowerCase();
    if (basename.endsWith(".dll.lib") || basename.endsWith(".dll.a")) return false;
    return (
      basename === `${libraryBaseName}.lib` || basename === `lib${libraryBaseName}.a`
    );
  });

  if (!dynamicLibrary || !staticLibrary) {
    throw new Error(
      [
        `Cargo did not report both ${label} cdylib and staticlib compiler artifacts`,
        `reported: ${artifacts.join(", ") || "none"}`,
      ].join("; "),
    );
  }
  assertHostCompatibleDynamicLibrary(dynamicLibrary);
  return { dynamicLibrary, importLibrary, staticLibrary };
}

function assertHostCompatibleDynamicLibrary(dynamicLibrary) {
  const expectedExtension =
    process.platform === "win32"
      ? ".dll"
      : process.platform === "darwin"
        ? ".dylib"
        : ".so";
  if (!dynamicLibrary.toLowerCase().endsWith(expectedExtension)) {
    throw new Error(
      `CARGO_BUILD_TARGET produced ${path.basename(dynamicLibrary)}, which cannot run on ${process.platform}`,
    );
  }
}

function copyRuntimeArtifacts(artifacts, destination) {
  mkdirSync(destination, { recursive: true });
  copyFileSync(
    artifacts.dynamicLibrary,
    path.join(destination, path.basename(artifacts.dynamicLibrary)),
  );
  copyLinkLibrary(artifacts.importLibrary, destination);
}

function copyLinkLibrary(importLibrary, destination) {
  if (process.platform !== "win32") return;
  if (!importLibrary) {
    throw new Error("Cargo did not report the Windows cdylib import library");
  }
  copyFileSync(importLibrary, path.join(destination, path.basename(importLibrary)));
  if (importLibrary.endsWith(".dll.lib")) {
    copyFileSync(importLibrary, path.join(destination, `${libraryBaseName}.lib`));
  }
}

function assertStaticLibraryExists(staticLibrary) {
  if (!existsSync(staticLibrary)) {
    throw new Error(`Cargo-reported static library does not exist: ${staticLibrary}`);
  }
}

function findMsvcCompiler() {
  if (commandExists("cl")) return { command: "cl", vcvars: null };
  const vcvars = findVcvars64();
  return vcvars ? { command: "cl", vcvars } : null;
}

function findVcvars64() {
  if (process.platform !== "win32") return null;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (!programFilesX86) return null;
  const visualStudioRoot = path.join(programFilesX86, "Microsoft Visual Studio");
  if (!existsSync(visualStudioRoot)) return null;
  for (const year of safeReaddir(visualStudioRoot)) {
    if (!year.isDirectory()) continue;
    const yearPath = path.join(visualStudioRoot, year.name);
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

function findCommand(candidates) {
  for (const candidate of candidates) {
    const command = candidate?.trim();
    if (command && commandExists(command)) return command;
  }
  return null;
}

function commandExists(command) {
  const result =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { stdio: "ignore" })
      : spawnSync("command", ["-v", command], { shell: true, stdio: "ignore" });
  return result.status === 0;
}

function runMsvc(compiler, args) {
  if (!compiler.vcvars) {
    run(compiler.command, args);
    return;
  }
  const commandPath = path.join(tmpDir, `build-${Date.now()}.cmd`);
  writeFileSync(
    commandPath,
    [
      "@echo off",
      `call "${compiler.vcvars}" >nul`,
      `${compiler.command} ${args.map(quoteCmdArg).join(" ")}`,
      "",
    ].join("\r\n"),
  );
  run("cmd.exe", ["/d", "/c", commandPath]);
}

function runHost(exePath, args = [], libraryDir = tmpDir) {
  run(exePath, args, { env: hostEnvironment(libraryDir) });
}

function runHostCapture(exePath, args, libraryDir) {
  const result = spawnSync(exePath, args, {
    cwd: root,
    encoding: "utf8",
    env: hostEnvironment(libraryDir),
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${exePath} failed with exit code ${result.status ?? "unknown"}: ${result.stderr}`,
    );
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function hostEnvironment(libraryDir) {
  const env = { ...process.env };
  if (process.platform === "win32") {
    env.PATH = `${libraryDir};${env.PATH ?? ""}`;
  } else if (process.platform === "darwin") {
    env.DYLD_LIBRARY_PATH = `${libraryDir}:${env.DYLD_LIBRARY_PATH ?? ""}`;
  } else {
    env.LD_LIBRARY_PATH = `${libraryDir}:${env.LD_LIBRARY_PATH ?? ""}`;
  }
  return env;
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
    throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status ?? "unknown"}: ${result.stderr}`,
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
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

function rustV01ObservationHostSource() {
  return `
use std::ffi::{CStr, c_char, c_void};
use std::fs;
use std::mem::size_of;
use std::ptr;
use std::slice;

const OK: i32 = 0;

#[repr(C)]
#[derive(Clone, Copy)]
struct ViviMeshSnapshot {
    struct_size: u32,
    reserved0: u32,
    id: *const c_char,
    texture_id: *const c_char,
    vertices: *const f32,
    vertex_float_count: u64,
    uvs: *const f32,
    uv_float_count: u64,
    indices: *const u32,
    index_count: u64,
    x: f32,
    y: f32,
    opacity: f32,
    draw_order: i32,
    blend_mode: i32,
    visible: u8,
    culled: u8,
    has_multiply_color: u8,
    has_screen_color: u8,
    multiply_color: [f32; 4],
    screen_color: [f32; 4],
}

unsafe extern "C" {
    fn vivi_get_abi_version() -> u32;
    fn vivi_runtime_create(
        limits: *const c_void,
        out_error: *mut c_void,
        out_runtime: *mut *mut c_void,
    ) -> i32;
    fn vivi_runtime_destroy(runtime: *mut c_void);
    fn vivi_model_load(
        runtime: *mut c_void,
        data: *const u8,
        data_len: u64,
        out_model: *mut *mut c_void,
    ) -> i32;
    fn vivi_model_destroy(model: *mut c_void);
    fn vivi_model_update(model: *mut c_void, delta_seconds: f64) -> i32;
    fn vivi_model_mesh_count(model: *const c_void, out_count: *mut u64) -> i32;
    fn vivi_model_mesh_snapshot(
        model: *const c_void,
        render_index: u64,
        out_snapshot: *mut ViviMeshSnapshot,
    ) -> i32;
}

fn main() {
    assert_eq!(size_of::<ViviMeshSnapshot>(), 128);
    let mut args = std::env::args_os().skip(1);
    let payload_path = args.next().expect("payload path");
    let expected_abi = args
        .next()
        .expect("expected ABI")
        .to_string_lossy()
        .parse::<u32>()
        .expect("numeric expected ABI");
    assert_eq!(unsafe { vivi_get_abi_version() }, expected_abi, "loaded DLL ABI");
    let payload = fs::read(payload_path).expect("read payload");
    let mut runtime = ptr::null_mut();
    expect(
        unsafe { vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime) },
        "runtime_create",
    );
    let mut model = ptr::null_mut();
    expect(
        unsafe { vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model) },
        "model_load",
    );
    let before = observe(model);
    let update_status = unsafe { vivi_model_update(model, 1.0 / 60.0) };
    let after = observe(model);
    println!("before={before}\nupdate_status={update_status}\nafter={after}");
    unsafe { vivi_model_destroy(model) };
    unsafe { vivi_runtime_destroy(runtime) };
}

fn observe(model: *const c_void) -> String {
    let mut count = u64::MAX;
    expect(
        unsafe { vivi_model_mesh_count(model, &mut count) },
        "mesh_count",
    );
    let mut records = Vec::new();
    for index in 0..count {
        let mut snapshot: ViviMeshSnapshot = unsafe { std::mem::zeroed() };
        snapshot.struct_size = size_of::<ViviMeshSnapshot>() as u32;
        expect(
            unsafe { vivi_model_mesh_snapshot(model, index, &mut snapshot) },
            "mesh_snapshot",
        );
        records.push(format!(
            "id={:?},texture={:?},vertices={:?},uvs={:?},indices={:?},x={},y={},opacity={},draw_order={},blend_mode={},visible={},culled={},has_multiply={},has_screen={},multiply={:?},screen={:?}",
            read_c_string(snapshot.id),
            read_c_string(snapshot.texture_id),
            float_bits(snapshot.vertices, snapshot.vertex_float_count),
            float_bits(snapshot.uvs, snapshot.uv_float_count),
            unsigned_values(snapshot.indices, snapshot.index_count),
            snapshot.x.to_bits(),
            snapshot.y.to_bits(),
            snapshot.opacity.to_bits(),
            snapshot.draw_order,
            snapshot.blend_mode,
            snapshot.visible,
            snapshot.culled,
            snapshot.has_multiply_color,
            snapshot.has_screen_color,
            snapshot.multiply_color.map(f32::to_bits),
            snapshot.screen_color.map(f32::to_bits),
        ));
    }
    format!("count={count};{}", records.join(";"))
}

fn read_c_string(pointer: *const c_char) -> String {
    assert!(!pointer.is_null(), "snapshot string pointer");
    unsafe { CStr::from_ptr(pointer) }
        .to_str()
        .expect("snapshot string must be UTF-8")
        .to_owned()
}

fn float_bits(pointer: *const f32, count: u64) -> Vec<u32> {
    if count == 0 {
        return Vec::new();
    }
    assert!(!pointer.is_null(), "snapshot float pointer");
    unsafe { slice::from_raw_parts(pointer, count as usize) }
        .iter()
        .map(|value| value.to_bits())
        .collect()
}

fn unsigned_values(pointer: *const u32, count: u64) -> Vec<u32> {
    if count == 0 {
        return Vec::new();
    }
    assert!(!pointer.is_null(), "snapshot index pointer");
    unsafe { slice::from_raw_parts(pointer, count as usize) }.to_vec()
}

fn expect(status: i32, operation: &str) {
    assert_eq!(status, OK, "{operation} status");
}
`;
}

function rustConformanceHostSource() {
  return `
use std::ffi::{CStr, c_char, c_void};
use std::fs;
use std::mem::size_of;
use std::ptr;
use std::slice;

const OK: i32 = 0;
const ERR_RENDER_FEATURE_REQUIRED: i32 = 13;
const RENDER_FEATURE_DRAW_COMMANDS: u64 = 1;

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ViviDrawCommandV2 {
    struct_size: u32,
    command_type: u32,
    mesh_index: u32,
    mask_depth: u32,
    flags: u32,
    reserved: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ViviGenerations {
    model_generation: u64,
    topology_generation: u64,
    dynamic_generation: u64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct ViviMeshSnapshot {
    struct_size: u32,
    reserved0: u32,
    id: *const c_char,
    texture_id: *const c_char,
    vertices: *const f32,
    vertex_float_count: u64,
    uvs: *const f32,
    uv_float_count: u64,
    indices: *const u32,
    index_count: u64,
    x: f32,
    y: f32,
    opacity: f32,
    draw_order: i32,
    blend_mode: i32,
    visible: u8,
    culled: u8,
    has_multiply_color: u8,
    has_screen_color: u8,
    multiply_color: [f32; 4],
    screen_color: [f32; 4],
}

unsafe extern "C" {
    fn vivi_get_abi_version() -> u32;
    fn vivi_runtime_create(
        limits: *const c_void,
        out_error: *mut c_void,
        out_runtime: *mut *mut c_void,
    ) -> i32;
    fn vivi_runtime_destroy(runtime: *mut c_void);
    fn vivi_model_load(
        runtime: *mut c_void,
        data: *const u8,
        data_len: u64,
        out_model: *mut *mut c_void,
    ) -> i32;
    fn vivi_model_destroy(model: *mut c_void);
    fn vivi_model_update(model: *mut c_void, delta_seconds: f64) -> i32;
    fn vivi_model_mesh_count(model: *const c_void, out_count: *mut u64) -> i32;
    fn vivi_model_mesh_snapshot(
        model: *const c_void,
        render_index: u64,
        out_snapshot: *mut ViviMeshSnapshot,
    ) -> i32;
    fn vivi_model_mesh_snapshot_by_id(
        model: *const c_void,
        mesh_id: *const c_char,
        out_snapshot: *mut ViviMeshSnapshot,
    ) -> i32;
    fn vivi_model_draw_command_count(model: *const c_void, out_count: *mut u64) -> i32;
    fn vivi_model_draw_commands(
        model: *const c_void,
        out_ptr: *mut *const ViviDrawCommandV2,
    ) -> i32;
    fn vivi_model_generations(
        model: *const c_void,
        out_generations: *mut ViviGenerations,
    ) -> i32;
    fn vivi_model_render_mesh_count_v2(model: *const c_void, out_count: *mut u64) -> i32;
    fn vivi_model_render_mesh_snapshot_v2(
        model: *const c_void,
        mesh_slot: u32,
        out_snapshot: *mut ViviMeshSnapshot,
    ) -> i32;
    fn vivi_model_required_render_features(model: *const c_void, out_flags: *mut u64) -> i32;
}

fn main() {
    assert_eq!(unsafe { vivi_get_abi_version() }, 2, "feature ABI version");
    assert_eq!(size_of::<ViviDrawCommandV2>(), 24);
    assert_eq!(size_of::<ViviGenerations>(), 24);
    assert_eq!(size_of::<ViviMeshSnapshot>(), 128);

    let paths: Vec<_> = std::env::args_os().skip(1).collect();
    assert_eq!(paths.len(), 2, "expected basic and masked payload paths");
    let mut runtime = ptr::null_mut();
    expect(
        unsafe { vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime) },
        OK,
        "runtime_create",
    );
    assert!(!runtime.is_null());

    let basic = load(runtime, &paths[0]);
    verify_basic(basic);
    unsafe { vivi_model_destroy(basic) };

    let masked = load(runtime, &paths[1]);
    verify_masked(masked);
    unsafe { vivi_model_destroy(masked) };
    unsafe { vivi_runtime_destroy(runtime) };
}

fn load(runtime: *mut c_void, path: &std::ffi::OsStr) -> *mut c_void {
    let bytes = fs::read(path).expect("read payload");
    let mut model = ptr::null_mut();
    expect(
        unsafe { vivi_model_load(runtime, bytes.as_ptr(), bytes.len() as u64, &mut model) },
        OK,
        "model_load",
    );
    assert!(!model.is_null());
    model
}

fn verify_basic(model: *mut c_void) {
    let mut features = u64::MAX;
    expect(
        unsafe { vivi_model_required_render_features(model, &mut features) },
        OK,
        "basic required_render_features",
    );
    assert_eq!(features, 0);

    assert_eq!(mesh_count_v2(model), 1);
    let snapshot = mesh_snapshot_v2(model, 0);
    assert_eq!(snapshot_id(&snapshot), "mesh-body");

    let commands = draw_commands(model);
    assert_eq!(
        commands,
        vec![command(1, 0, 0, 0)],
        "unmasked command lowering",
    );
    let basic_generations = generations(model);
    assert!(basic_generations.model_generation >= 1);
    assert_eq!(basic_generations.topology_generation, 1);
    assert_eq!(basic_generations.dynamic_generation, 0);

    let mut legacy_count = u64::MAX;
    expect(
        unsafe { vivi_model_mesh_count(model, &mut legacy_count) },
        OK,
        "basic legacy mesh_count",
    );
    assert_eq!(legacy_count, 1);
    let mut legacy_snapshot = empty_snapshot();
    expect(
        unsafe { vivi_model_mesh_snapshot(model, 0, &mut legacy_snapshot) },
        OK,
        "basic legacy mesh_snapshot",
    );
    assert_eq!(snapshot_id(&legacy_snapshot), "mesh-body");
    let mut by_id_snapshot = empty_snapshot();
    expect(
        unsafe {
            vivi_model_mesh_snapshot_by_id(
                model,
                c"mesh-body".as_ptr(),
                &mut by_id_snapshot,
            )
        },
        OK,
        "basic legacy mesh_snapshot_by_id",
    );
    assert_eq!(snapshot_id(&by_id_snapshot), "mesh-body");
}

fn verify_masked(model: *mut c_void) {
    let mut features = 0;
    expect(
        unsafe { vivi_model_required_render_features(model, &mut features) },
        OK,
        "masked required_render_features",
    );
    assert_eq!(features, RENDER_FEATURE_DRAW_COMMANDS);

    assert_eq!(mesh_count_v2(model), 2);
    let before_ids = [
        snapshot_id(&mesh_snapshot_v2(model, 0)).to_owned(),
        snapshot_id(&mesh_snapshot_v2(model, 1)).to_owned(),
    ];
    assert_eq!(before_ids, ["mask", "target"]);
    assert_eq!(
        draw_commands(model),
        vec![command(2, 0, 1, 0), command(1, 1, 1, 0), command(3, 0, 0, 0)],
        "masked command lowering",
    );

    let mut legacy_count = u64::MAX;
    expect(
        unsafe { vivi_model_mesh_count(model, &mut legacy_count) },
        ERR_RENDER_FEATURE_REQUIRED,
        "masked legacy mesh_count fail-close",
    );
    let mut legacy_snapshot = empty_snapshot();
    expect(
        unsafe { vivi_model_mesh_snapshot(model, 0, &mut legacy_snapshot) },
        ERR_RENDER_FEATURE_REQUIRED,
        "masked legacy mesh_snapshot fail-close",
    );
    expect(
        unsafe {
            vivi_model_mesh_snapshot_by_id(
                model,
                c"target".as_ptr(),
                &mut legacy_snapshot,
            )
        },
        ERR_RENDER_FEATURE_REQUIRED,
        "masked legacy mesh_snapshot_by_id fail-close",
    );

    let initial = generations(model);
    assert!(initial.model_generation >= 1);
    assert_eq!(initial.topology_generation, 1);
    assert_eq!(initial.dynamic_generation, 0);

    expect(unsafe { vivi_model_update(model, 0.0) }, OK, "masked update");
    let updated = generations(model);
    assert_eq!(updated.model_generation, initial.model_generation);
    assert_eq!(updated.topology_generation, initial.topology_generation);
    assert_eq!(updated.dynamic_generation, 1);
    let after_ids = [
        snapshot_id(&mesh_snapshot_v2(model, 0)).to_owned(),
        snapshot_id(&mesh_snapshot_v2(model, 1)).to_owned(),
    ];
    assert_eq!(after_ids, before_ids, "V2 mesh slots changed after update");
    assert_eq!(
        draw_commands(model),
        vec![command(2, 0, 1, 0), command(1, 1, 1, 0), command(3, 0, 0, 0)],
        "commands changed after a topology-stable update",
    );

    assert_ne!(unsafe { vivi_model_update(model, f64::NAN) }, OK);
    assert_eq!(generations(model), updated, "failed update changed generations");
}

fn mesh_count_v2(model: *const c_void) -> u64 {
    let mut count = u64::MAX;
    expect(
        unsafe { vivi_model_render_mesh_count_v2(model, &mut count) },
        OK,
        "render_mesh_count_v2",
    );
    count
}

fn mesh_snapshot_v2(model: *const c_void, slot: u32) -> ViviMeshSnapshot {
    let mut snapshot = empty_snapshot();
    expect(
        unsafe { vivi_model_render_mesh_snapshot_v2(model, slot, &mut snapshot) },
        OK,
        "render_mesh_snapshot_v2",
    );
    snapshot
}

fn draw_commands(model: *const c_void) -> Vec<ViviDrawCommandV2> {
    let mut count = u64::MAX;
    expect(
        unsafe { vivi_model_draw_command_count(model, &mut count) },
        OK,
        "draw_command_count",
    );
    let mut commands_ptr = ptr::null();
    expect(
        unsafe { vivi_model_draw_commands(model, &mut commands_ptr) },
        OK,
        "draw_commands",
    );
    assert!(count == 0 || !commands_ptr.is_null());
    unsafe { slice::from_raw_parts(commands_ptr, count as usize) }.to_vec()
}

fn generations(model: *const c_void) -> ViviGenerations {
    let mut value = ViviGenerations {
        model_generation: u64::MAX,
        topology_generation: u64::MAX,
        dynamic_generation: u64::MAX,
    };
    expect(
        unsafe { vivi_model_generations(model, &mut value) },
        OK,
        "generations",
    );
    value
}

fn empty_snapshot() -> ViviMeshSnapshot {
    let mut snapshot: ViviMeshSnapshot = unsafe { std::mem::zeroed() };
    snapshot.struct_size = size_of::<ViviMeshSnapshot>() as u32;
    snapshot
}

fn snapshot_id(snapshot: &ViviMeshSnapshot) -> &str {
    assert!(!snapshot.id.is_null());
    unsafe { CStr::from_ptr(snapshot.id) }
        .to_str()
        .expect("snapshot ID must be UTF-8")
}

fn command(command_type: u32, mesh_index: u32, mask_depth: u32, flags: u32) -> ViviDrawCommandV2 {
    ViviDrawCommandV2 {
        struct_size: 24,
        command_type,
        mesh_index,
        mask_depth,
        flags,
        reserved: 0,
    }
}

fn expect(actual: i32, expected: i32, operation: &str) {
    assert_eq!(actual, expected, "{operation} status");
}
`;
}
