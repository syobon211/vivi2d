import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const headerPath = "packages/runtime-c-abi/include/vivi_runtime.h";
const samplePath = "packages/runtime-c-abi/samples/minimal-host.c";
const layoutPath = "packages/runtime-c-abi/tests/header-layout.c";
const runtimeSpecPath = "packages/model/src/runtime-spec.ts";
const nativeCorePath =
  "packages/runtime-native/crates/vivi-runtime-native-core/src/lib.rs";
const nativeCAbiPath =
  "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/lib.rs";
const header = fs.readFileSync(path.join(root, headerPath), "utf8");
const sample = fs.readFileSync(path.join(root, samplePath), "utf8");
const layout = fs.readFileSync(path.join(root, layoutPath), "utf8");
const runtimeSpec = fs.readFileSync(path.join(root, runtimeSpecPath), "utf8");
const nativeCore = fs.readFileSync(path.join(root, nativeCorePath), "utf8");
const nativeCAbi = fs.existsSync(path.join(root, nativeCAbiPath))
  ? fs.readFileSync(path.join(root, nativeCAbiPath), "utf8")
  : "";
const headerWithoutComments = header.replace(/\/\*[\s\S]*?\*\//g, " ");
const failures = [];

const expectedStatusEntries = [
  ["VIVI_OK", 0],
  ["VIVI_ERR_INVALID_ARGUMENT", 1],
  ["VIVI_ERR_UNSUPPORTED_OPERATION", 2],
  ["VIVI_ERR_PARSE", 3],
  ["VIVI_ERR_UNSUPPORTED_SPEC_VERSION", 4],
  ["VIVI_ERR_PRIVATE_PROFILE", 5],
  ["VIVI_ERR_LIMIT_EXCEEDED", 6],
  ["VIVI_ERR_VALIDATION", 7],
  ["VIVI_ERR_TEXTURE", 8],
  ["VIVI_ERR_EVALUATION", 9],
  ["VIVI_ERR_INTERNAL", 10],
];

const expectedBlendModeEntries = [
  ["VIVI_BLEND_MODE_NORMAL", 0],
  ["VIVI_BLEND_MODE_MULTIPLY", 1],
  ["VIVI_BLEND_MODE_SCREEN", 2],
  ["VIVI_BLEND_MODE_ADD", 3],
];

const expectedPixelFormatEntries = [["VIVI_PIXEL_FORMAT_RGBA8_STRAIGHT", 0]];

const expectedColorSpaceEntries = [["VIVI_COLOR_SPACE_SRGB", 0]];

const expectedStructs = [
  "ViviVersion",
  "ViviRuntimeLimits",
  "ViviCreateError",
  "ViviTextureSnapshot",
  "ViviParameterInfo",
  "ViviHitResult",
  "ViviPlaybackState",
  "ViviExpressionPresetInfo",
  "ViviMeshSnapshot",
];

const expectedStructFields = new Map([
  ["ViviVersion", ["struct_size", "major", "minor", "patch"]],
  [
    "ViviRuntimeLimits",
    [
      "struct_size",
      "_reserved0",
      "max_payload_bytes",
      "max_texture_bytes",
      "max_textures",
      "max_layers",
      "max_meshes",
      "max_vertices_per_mesh",
      "max_indices_per_mesh",
      "max_bones",
      "max_ik_controllers",
      "max_physics_groups",
      "max_pendulums_per_physics_group",
      "max_parameters",
      "max_binding_points",
      "max_colliders",
      "max_animation_clips",
      "max_state_machines",
      "max_states_per_state_machine",
      "max_transitions_per_state_machine",
    ],
  ],
  ["ViviCreateError", ["struct_size", "status", "message"]],
  [
    "ViviTextureSnapshot",
    [
      "struct_size",
      "_reserved0",
      "id",
      "width",
      "height",
      "pixel_format",
      "color_space",
      "pixels",
      "pixel_byte_len",
      "row_stride",
      "host_image_id",
    ],
  ],
  [
    "ViviParameterInfo",
    ["struct_size", "_reserved0", "id", "min", "max", "default_value", "current_value"],
  ],
  [
    "ViviHitResult",
    ["struct_size", "_reserved0", "collider_id", "layer_id", "mesh_id", "x", "y"],
  ],
  [
    "ViviPlaybackState",
    ["struct_size", "playing", "loop", "_reserved0", "clip_id", "time_seconds"],
  ],
  [
    "ViviExpressionPresetInfo",
    [
      "struct_size",
      "_reserved0",
      "id",
      "name",
      "color",
      "hotkey",
      "parameter_value_count",
    ],
  ],
  [
    "ViviMeshSnapshot",
    [
      "struct_size",
      "_reserved0",
      "id",
      "texture_id",
      "vertices",
      "vertex_float_count",
      "uvs",
      "uv_float_count",
      "indices",
      "index_count",
      "x",
      "y",
      "opacity",
      "draw_order",
      "blend_mode",
      "visible",
      "culled",
      "has_multiply_color",
      "has_screen_color",
      "multiply_color",
      "screen_color",
    ],
  ],
]);

const expectedFunctions = [
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

const expectedSignatures = new Map([
  ["vivi_get_abi_version", "VIVI_EXPORT uint32_t vivi_get_abi_version(void);"],
  [
    "vivi_get_runtime_version",
    "VIVI_EXPORT ViviStatus vivi_get_runtime_version(ViviVersion* out_version);",
  ],
  [
    "vivi_get_supported_spec_version_range",
    "VIVI_EXPORT ViviStatus vivi_get_supported_spec_version_range( ViviVersion* out_min_version, ViviVersion* out_max_version );",
  ],
  [
    "vivi_runtime_create",
    "VIVI_EXPORT ViviStatus vivi_runtime_create( const ViviRuntimeLimits* limits, ViviCreateError* out_error, ViviRuntime** out_runtime );",
  ],
  [
    "vivi_runtime_destroy",
    "VIVI_EXPORT void vivi_runtime_destroy(ViviRuntime* runtime);",
  ],
  [
    "vivi_runtime_last_error_message",
    "VIVI_EXPORT const char* vivi_runtime_last_error_message( const ViviRuntime* runtime );",
  ],
  [
    "vivi_model_last_error_message",
    "VIVI_EXPORT const char* vivi_model_last_error_message(const ViviModel* model);",
  ],
  [
    "vivi_model_load",
    "VIVI_EXPORT ViviStatus vivi_model_load( ViviRuntime* runtime, const uint8_t* data, uint64_t data_len, ViviModel** out_model );",
  ],
  ["vivi_model_destroy", "VIVI_EXPORT void vivi_model_destroy(ViviModel* model);"],
  [
    "vivi_model_get_spec_version",
    "VIVI_EXPORT ViviStatus vivi_model_get_spec_version( const ViviModel* model, ViviVersion* out_version );",
  ],
  [
    "vivi_model_set_input",
    "VIVI_EXPORT ViviStatus vivi_model_set_input( ViviModel* model, const char* id, double value );",
  ],
  [
    "vivi_model_get_input",
    "VIVI_EXPORT ViviStatus vivi_model_get_input( const ViviModel* model, const char* id, double* out_value );",
  ],
  [
    "vivi_model_update",
    "VIVI_EXPORT ViviStatus vivi_model_update( ViviModel* model, double delta_seconds );",
  ],
  [
    "vivi_model_play_clip",
    "VIVI_EXPORT ViviStatus vivi_model_play_clip( ViviModel* model, const char* clip_id, uint8_t loop, double start_time_seconds );",
  ],
  [
    "vivi_model_stop_clip",
    "VIVI_EXPORT ViviStatus vivi_model_stop_clip(ViviModel* model);",
  ],
  [
    "vivi_model_seek_clip",
    "VIVI_EXPORT ViviStatus vivi_model_seek_clip( ViviModel* model, double seconds );",
  ],
  [
    "vivi_model_set_state_machine_state",
    "VIVI_EXPORT ViviStatus vivi_model_set_state_machine_state( ViviModel* model, const char* machine_id, const char* state_id );",
  ],
  [
    "vivi_model_get_state_machine_state",
    "VIVI_EXPORT ViviStatus vivi_model_get_state_machine_state( const ViviModel* model, const char* machine_id, const char** out_state_id, uint8_t* out_transitioning );",
  ],
  [
    "vivi_model_parameter_count",
    "VIVI_EXPORT ViviStatus vivi_model_parameter_count( const ViviModel* model, uint64_t* out_count );",
  ],
  [
    "vivi_model_parameter_info",
    "VIVI_EXPORT ViviStatus vivi_model_parameter_info( const ViviModel* model, uint64_t parameter_index, ViviParameterInfo* out_info );",
  ],
  [
    "vivi_model_texture_count",
    "VIVI_EXPORT ViviStatus vivi_model_texture_count( const ViviModel* model, uint64_t* out_count );",
  ],
  [
    "vivi_model_texture_snapshot",
    "VIVI_EXPORT ViviStatus vivi_model_texture_snapshot( const ViviModel* model, uint64_t texture_index, ViviTextureSnapshot* out_snapshot );",
  ],
  [
    "vivi_model_expression_preset_count",
    "VIVI_EXPORT ViviStatus vivi_model_expression_preset_count( const ViviModel* model, uint64_t* out_count );",
  ],
  [
    "vivi_model_expression_preset_info",
    "VIVI_EXPORT ViviStatus vivi_model_expression_preset_info( const ViviModel* model, uint64_t preset_index, ViviExpressionPresetInfo* out_info );",
  ],
  [
    "vivi_model_expression_preset_value",
    "VIVI_EXPORT ViviStatus vivi_model_expression_preset_value( const ViviModel* model, uint64_t preset_index, uint64_t value_index, const char** out_parameter_id, double* out_value );",
  ],
  [
    "vivi_model_apply_expression_preset",
    "VIVI_EXPORT ViviStatus vivi_model_apply_expression_preset( ViviModel* model, const char* preset_id );",
  ],
  [
    "vivi_model_mesh_count",
    "VIVI_EXPORT ViviStatus vivi_model_mesh_count( const ViviModel* model, uint64_t* out_count );",
  ],
  [
    "vivi_model_mesh_snapshot",
    "VIVI_EXPORT ViviStatus vivi_model_mesh_snapshot( const ViviModel* model, uint64_t render_index, ViviMeshSnapshot* out_snapshot );",
  ],
  [
    "vivi_model_mesh_snapshot_by_id",
    "VIVI_EXPORT ViviStatus vivi_model_mesh_snapshot_by_id( const ViviModel* model, const char* mesh_id, ViviMeshSnapshot* out_snapshot );",
  ],
  [
    "vivi_model_hit_test",
    "VIVI_EXPORT ViviStatus vivi_model_hit_test( const ViviModel* model, double x, double y, ViviHitResult* out_hit, uint8_t* out_has_hit );",
  ],
  [
    "vivi_model_get_playback_state",
    "VIVI_EXPORT ViviStatus vivi_model_get_playback_state( const ViviModel* model, ViviPlaybackState* out_state );",
  ],
]);

const exportedDeclarations = [
  ...headerWithoutComments.matchAll(/^\s*VIVI_EXPORT\b[\s\S]*?\)\s*;/gm),
].map((match) => match[0]);
const declarationsByName = new Map();
for (const declaration of exportedDeclarations) {
  const nameMatch = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(declaration);
  if (nameMatch) declarationsByName.set(nameMatch[1], declaration);
}

for (const [name, value] of expectedStatusEntries) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*${value}\\b`);
  if (!pattern.test(header)) {
    failures.push(`missing or incorrect status entry: ${name} = ${value}`);
  }
}

for (const [label, entries] of [
  ["blend mode", expectedBlendModeEntries],
  ["pixel format", expectedPixelFormatEntries],
  ["color space", expectedColorSpaceEntries],
]) {
  for (const [name, value] of entries) {
    const pattern = new RegExp(`\\b${name}\\s*=\\s*${value}\\b`);
    if (!pattern.test(header)) {
      failures.push(`missing or incorrect ${label} entry: ${name} = ${value}`);
    }
  }
}

for (const typedefName of [
  "ViviStatus",
  "ViviBlendMode",
  "ViviPixelFormat",
  "ViviColorSpace",
]) {
  if (!new RegExp(`typedef\\s+int32_t\\s+${typedefName}\\s*;`).test(header)) {
    failures.push(`${typedefName} must be a fixed-width int32_t ABI typedef`);
  }
}

if (/typedef\s+enum\s+Vivi/.test(header)) {
  failures.push("C ABI must not expose compiler-sized typedef enum types");
}

if (/\bsize_t\b/.test(header)) {
  failures.push("C ABI must use fixed-width uint64_t instead of size_t");
}

for (const structName of expectedStructs) {
  const structBlock = extractBlock(`typedef struct ${structName}`, `} ${structName};`);
  if (!structBlock) continue;
  const structSizePattern = new RegExp(
    `typedef\\s+struct\\s+${escapeRegExp(structName)}\\s*\\{\\s*` +
      "(?:/\\*[\\s\\S]*?\\*/\\s*)*" +
      "uint32_t\\s+struct_size\\s*;",
  );
  if (!structSizePattern.test(structBlock)) {
    failures.push(`${structName} must begin with uint32_t struct_size;`);
  }
}

for (const functionName of expectedFunctions) {
  const declaration = extractFunctionDeclaration(functionName);
  if (!declaration) {
    failures.push(`missing C ABI function prototype: ${functionName}`);
    continue;
  }
  if (!/\bVIVI_EXPORT\b/.test(declaration)) {
    failures.push(`missing VIVI_EXPORT on C ABI function: ${functionName}`);
  }
  if (!/\bVIVI_CALL\b/.test(declaration)) {
    failures.push(`missing VIVI_CALL on C ABI function: ${functionName}`);
  }
  const expectedSignature = expectedSignatures.get(functionName);
  if (
    expectedSignature &&
    normalizeCDeclaration(declaration) !== normalizeCDeclaration(expectedSignature)
  ) {
    failures.push(`unexpected C ABI signature for: ${functionName}`);
  }
}

const exportedFunctions = [...declarationsByName.keys()];
for (const functionName of exportedFunctions) {
  if (!expectedFunctions.includes(functionName)) {
    failures.push(`unexpected exported C ABI function: ${functionName}`);
  }
}

if (nativeCAbi) {
  const nativeExports = [
    ...nativeCAbi.matchAll(/pub\s+extern\s+"C"\s+fn\s+(vivi_[A-Za-z0-9_]+)\s*\(/g),
  ].map((match) => match[1]);
  const nativeExportSet = new Set(nativeExports);
  for (const functionName of expectedFunctions) {
    if (!nativeExportSet.has(functionName)) {
      failures.push(
        `${nativeCAbiPath} is missing exported implementation/stub: ${functionName}`,
      );
    }
  }
  for (const functionName of nativeExports) {
    if (!expectedFunctions.includes(functionName)) {
      failures.push(
        `${nativeCAbiPath} exports a function not declared by the public header: ${functionName}`,
      );
    }
  }
}

if (
  !/#define\s+VIVI_RUNTIME_ABI_VERSION\s+\(\(uint32_t\)\(\(0u\s*<<\s*16\)\s*\|\s*1u\)\)/.test(
    header,
  )
) {
  failures.push(
    `${headerPath} must define the exact pre-release runtime ABI version value ((0u << 16) | 1u)`,
  );
}
const headerAbiVersion = parseHeaderAbiVersion(header);
const runtimeSpecAbiVersion = parseRuntimeSpecAbiVersion(runtimeSpec);
const nativeCoreAbiVersion = parseNativeCoreAbiVersion(nativeCore);
if (headerAbiVersion !== 1) {
  failures.push(`${headerPath} must resolve to pre-release ABI version 0.1`);
}
if (runtimeSpecAbiVersion !== headerAbiVersion) {
  failures.push(
    `${runtimeSpecPath} ABI version must match ${headerPath}: ${headerAbiVersion}`,
  );
}
if (nativeCoreAbiVersion !== headerAbiVersion) {
  failures.push(
    `${nativeCorePath} ABI version must match ${headerPath}: ${headerAbiVersion}`,
  );
}
if (
  !/export\s+const\s+VIVI_RUNTIME_ABI_VERSION\s*=\s*\(0\s*<<\s*16\)\s*\|\s*1\s*;/.test(
    runtimeSpec,
  )
) {
  failures.push(
    `${runtimeSpecPath} must match the C ABI pre-release version ((0 << 16) | 1)`,
  );
}

for (const required of [
  "#ifdef __cplusplus",
  'extern "C"',
  "#include <stddef.h>",
  "#include <stdint.h>",
  "#define VIVI_EXPORT",
  "#define VIVI_CALL",
  "VIVI_RUNTIME_ABI_VERSION",
  "must not be freed",
  "UTF-8",
  "Callers must check ViviStatus",
]) {
  if (!header.includes(required)) {
    failures.push(`${headerPath} is missing ${required}`);
  }
}

for (const structName of expectedStructs) {
  if (!layout.includes(`VIVI_ASSERT_LAYOUT(${structName},`)) {
    failures.push(`${layoutPath} is missing layout assertion for ${structName}`);
  }
  for (const fieldName of expectedStructFields.get(structName) ?? []) {
    const layoutOffset = `VIVI_ASSERT_OFFSET(${structName}, ${fieldName},`;
    const headerOffset = `VIVI_RUNTIME_ASSERT_OFFSET(${structName}, ${fieldName},`;
    if (!layout.includes(layoutOffset)) {
      failures.push(
        `${layoutPath} is missing offset assertion for ${structName}.${fieldName}`,
      );
    }
    if (!header.includes(headerOffset)) {
      failures.push(
        `${headerPath} is missing inline offset assertion for ${structName}.${fieldName}`,
      );
    }
  }
}
if (!layout.includes("sizeof(void*) == 8")) {
  failures.push(`${layoutPath} must assert the initial C ABI is 64-bit only`);
}

for (const [functionName, pointerName] of [
  ["vivi_model_get_state_machine_state", "out_state_id"],
  ["vivi_model_expression_preset_value", "out_parameter_id"],
]) {
  if (
    !header.includes(pointerName) ||
    !header.includes("Returned pointer is owned by model")
  ) {
    failures.push(`${functionName} must document ownership/lifetime for ${pointerName}`);
  }
}

for (const [structName, fields] of [
  ["ViviTextureSnapshot", ["id", "pixels", "host_image_id"]],
  ["ViviParameterInfo", ["id"]],
  ["ViviHitResult", ["collider_id", "layer_id", "mesh_id"]],
  ["ViviPlaybackState", ["clip_id"]],
  ["ViviExpressionPresetInfo", ["id", "name", "color", "hotkey"]],
  ["ViviMeshSnapshot", ["id", "texture_id", "vertices", "uvs", "indices"]],
]) {
  const structBlock = extractBlock(`typedef struct ${structName}`, `} ${structName};`);
  if (!structBlock) continue;
  for (const fieldName of fields) {
    const fieldMatch = new RegExp(`\\b${escapeRegExp(fieldName)}\\s*;`).exec(structBlock);
    const fieldIndex = fieldMatch?.index ?? -1;
    const commentIndex = structBlock.lastIndexOf("Borrowed model-owned", fieldIndex);
    if (fieldIndex < 0 || commentIndex < 0) {
      failures.push(
        `${structName}.${fieldName} must document borrowed ownership/lifetime`,
      );
    }
  }
}

if (!sample.includes('#include "vivi_runtime.h"')) {
  failures.push(`${samplePath} must include vivi_runtime.h`);
}
if (!sample.includes("vivi_get_supported_spec_version_range")) {
  failures.push(`${samplePath} must exercise the version-range entry point`);
}

if (failures.length > 0) {
  console.error("[runtime-c-abi] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[runtime-c-abi] passed");

function extractBlock(startNeedle, endNeedle) {
  const start = header.indexOf(startNeedle);
  if (start < 0) {
    failures.push(`${headerPath} is missing ${startNeedle}`);
    return null;
  }
  const end = header.indexOf(endNeedle, start);
  if (end < 0) {
    failures.push(`${headerPath} is missing ${endNeedle}`);
    return null;
  }
  return header.slice(start, end + endNeedle.length);
}

function extractFunctionDeclaration(functionName) {
  return declarationsByName.get(functionName) ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCDeclaration(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\bVIVI_CALL\b\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHeaderAbiVersion(value) {
  const match =
    /#define\s+VIVI_RUNTIME_ABI_VERSION\s+\(\(uint32_t\)\(\((\d+)u\s*<<\s*16\)\s*\|\s*(\d+)u\)\)/.exec(
      value,
    );
  if (!match) {
    failures.push(`${headerPath} is missing a parseable VIVI_RUNTIME_ABI_VERSION macro`);
    return Number.NaN;
  }
  return (Number(match[1]) << 16) | Number(match[2]);
}

function parseRuntimeSpecAbiVersion(value) {
  const match =
    /export\s+const\s+VIVI_RUNTIME_ABI_VERSION\s*=\s*\((\d+)\s*<<\s*16\)\s*\|\s*(\d+)\s*;/.exec(
      value,
    );
  if (!match) {
    failures.push(`${runtimeSpecPath} is missing a parseable VIVI_RUNTIME_ABI_VERSION`);
    return Number.NaN;
  }
  return (Number(match[1]) << 16) | Number(match[2]);
}

function parseNativeCoreAbiVersion(value) {
  const majorMatch = /pub\s+const\s+ABI_VERSION_MAJOR:\s*u16\s*=\s*(\d+)\s*;/.exec(value);
  const minorMatch = /pub\s+const\s+ABI_VERSION_MINOR:\s*u16\s*=\s*(\d+)\s*;/.exec(value);
  if (!majorMatch || !minorMatch) {
    failures.push(`${nativeCorePath} is missing parseable ABI version constants`);
    return Number.NaN;
  }
  return (Number(majorMatch[1]) << 16) | Number(minorMatch[1]);
}
