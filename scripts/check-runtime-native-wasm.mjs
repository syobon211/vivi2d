import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertEvaluationTargetDependencies,
  evaluationSignatures,
  runEvaluationWasmCorpus,
} from "./lib/runtime-native-evaluation-wasm.mjs";
import { createMaxPngWasmFixture } from "./lib/runtime-native-png-wasm-fixture.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
if (process.argv.slice(2).some((arg) => !["--png-v1", "--evaluation-v1"].includes(arg))) {
  throw new Error("Only the fixed PNG or Evaluation modes are supported");
}
const pngMode = process.argv.includes("--png-v1");
const evaluationMode = process.argv.includes("--evaluation-v1");
if (pngMode && evaluationMode) throw new Error("Select exactly one WASM profile");
const profileMode = pngMode || evaluationMode;
const selectedProfile = evaluationMode ? "evaluation-v1" : "png-v1";
const legacyBytesPath = path.join(root, "packages/runtime-wasm/src/native-wasm-bytes.ts");
const legacyBytesPin = sha256(readFileSync(legacyBytesPath));
const targetDir = path.join(root, `packages/runtime-native/target/${selectedProfile}`);
const pngBytesPath = path.join(
  root,
  "packages/runtime-wasm/src/native-png-wasm-bytes.ts",
);
const pngBytesPin = sha256(readFileSync(pngBytesPath));
const nativeManifest = path.join(root, "packages/runtime-native/Cargo.toml");
const wasmPath = path.join(
  root,
  profileMode
    ? `packages/runtime-native/target/${selectedProfile}/wasm32-unknown-unknown/release/vivi_runtime_native_wasm.wasm`
    : "packages/runtime-native/target/wasm32-unknown-unknown/release/vivi_runtime_native_wasm.wasm",
);
const generatedBytesPath = path.join(
  root,
  evaluationMode
    ? "packages/runtime-wasm/src/native-evaluation-wasm-bytes.ts"
    : pngMode
      ? "packages/runtime-wasm/src/native-png-wasm-bytes.ts"
      : "packages/runtime-wasm/src/native-wasm-bytes.ts",
);
const expectedAbiVersion = 1;
const expectedMaxMemoryPages = evaluationMode ? 12288 : pngMode ? 6144 : 1024;
const enforceGeneratedBytesFreshness =
  process.env.VIVI2D_ENFORCE_NATIVE_WASM_FRESHNESS === "1";
const deterministicRustflags = [
  "-C",
  `link-arg=--max-memory=${expectedMaxMemoryPages * 65536}`,
  ...(profileMode
    ? ["-C", "link-arg=-zstack-size=2097152", "-C", "link-arg=--export=__heap_base"]
    : []),
  "--remap-path-prefix",
  `${root}=.`,
  "--remap-path-prefix",
  `${path.join(os.homedir(), ".cargo", "registry", "src")}=/cargo/registry/src`,
  "--remap-path-prefix",
  `${path.join(os.homedir(), ".cargo", "git", "checkouts")}=/cargo/git/checkouts`,
  "-C",
  "metadata=vivi_runtime_native_wasm",
];
const expectedExports = [
  "memory",
  "vivi_runtime_abi_version",
  "vivi_wasm_alloc",
  "vivi_wasm_free",
  "vivi_wasm_last_error_code",
  "vivi_wasm_last_error_message_ptr",
  "vivi_wasm_model_apply_expression_preset",
  "vivi_wasm_model_destroy",
  "vivi_wasm_model_hit_test_json",
  "vivi_wasm_model_load",
  "vivi_wasm_model_set_input",
  "vivi_wasm_model_snapshot_json",
  "vivi_wasm_model_update",
  "vivi_wasm_output_len",
];
const pngSignatures = {
  vivi_runtime_abi_version: [[], [0x7f]],
  vivi_wasm_alloc: [[0x7f], [0x7f]],
  vivi_wasm_free: [[0x7f, 0x7f], []],
  vivi_wasm_output_len: [[], [0x7f]],
  vivi_wasm_png_abi_version: [[], [0x7f]],
  vivi_wasm_png_decode_rgba8: [[0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f], [0x7f]],
  vivi_wasm_png_output_ptr: [[], [0x7f]],
  vivi_wasm_png_release_output: [[], []],
};

run(
  "cargo",
  [
    ...(profileMode ? ["+1.89.0"] : []),
    "build",
    "--locked",
    "--manifest-path",
    nativeManifest,
    "-p",
    "vivi-runtime-native-wasm",
    "--target",
    "wasm32-unknown-unknown",
    "--release",
    ...(profileMode
      ? [
          "--no-default-features",
          "--features",
          selectedProfile,
          "--target-dir",
          targetDir,
        ]
      : []),
  ],
  {
    CARGO_ENCODED_RUSTFLAGS: deterministicRustflags.join("\x1f"),
  },
);

if (profileMode || enforceGeneratedBytesFreshness) {
  run("node", [
    "scripts/generate-runtime-native-wasm-module.mjs",
    "--check",
    ...(profileMode ? [`--${selectedProfile}`] : []),
  ]);
} else {
  console.log(
    "[runtime-native-wasm] skipped byte-for-byte freshness; set VIVI2D_ENFORCE_NATIVE_WASM_FRESHNESS=1 for a local regeneration check",
  );
}

if (pngMode) assertPngTargetDependencies();
if (evaluationMode) assertEvaluationTargetDependencies(root);
const builtArtifactBytes = readFileSync(wasmPath);
const builtInstance = await validateNativeWasmArtifact(
  builtArtifactBytes,
  `built native WASM artifact (${path.relative(root, wasmPath)})`,
);
await validateNativeWasmArtifact(
  readEmbeddedNativeWasmBytes(),
  `embedded native WASM bytes (${path.relative(root, generatedBytesPath)})`,
);
if (pngMode) await runPngMaximumSequence(builtInstance.exports, builtArtifactBytes);
if (evaluationMode)
  assert.equal(
    sha256(readFileSync(pngBytesPath)),
    pngBytesPin,
    "Evaluation must not change the PNG artifact",
  );
assert.equal(
  sha256(readFileSync(legacyBytesPath)),
  legacyBytesPin,
  "checker must never replace the legacy embedded artifact",
);
console.log("[runtime-native-wasm] passed");

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

async function validateNativeWasmArtifact(bytes, label) {
  if (!WebAssembly.validate(bytes)) {
    throw new Error(`${label} failed validation`);
  }
  const memoryLimits = readDefinedMemoryLimits(bytes);
  if (!memoryLimits?.hasMaximum) {
    throw new Error(`${label} must declare a maximum linear-memory size`);
  }
  if (memoryLimits.maximumPages > expectedMaxMemoryPages) {
    throw new Error(
      `${label} maximum memory is too high: ${memoryLimits.maximumPages} pages > ${expectedMaxMemoryPages} pages`,
    );
  }
  if (profileMode)
    assert.equal(
      memoryLimits.maximumPages,
      expectedMaxMemoryPages,
      `${label} PNG maximum`,
    );

  const module = await WebAssembly.compile(bytes);
  assert.equal(
    WebAssembly.Module.imports(module).length,
    0,
    `${label} must be self-contained`,
  );
  const instance = await WebAssembly.instantiate(module);
  for (const exportName of expectedExports) {
    if (!(exportName in instance.exports)) {
      throw new Error(`${label} is missing ${exportName}`);
    }
    assert.equal(
      typeof instance.exports[exportName],
      exportName === "memory" ? "object" : "function",
      `${label} ${exportName} kind`,
    );
  }
  const abiVersion = instance.exports.vivi_runtime_abi_version;
  if (typeof abiVersion !== "function") {
    throw new Error(`${label} is missing vivi_runtime_abi_version`);
  }
  if (abiVersion() !== expectedAbiVersion) {
    throw new Error(`${label} ABI mismatch: ${abiVersion()} !== ${expectedAbiVersion}`);
  }

  if (evaluationMode) {
    assertPngSignatures(bytes, label, evaluationSignatures, "vivi_wasm_evaluation_");
    assert.equal(instance.exports.vivi_wasm_evaluation_abi_version(), 2);
    assert(instance.exports.__heap_base.value > 2 * 1024 * 1024);
    assert(instance.exports.__heap_base.value <= 16 * 1024 * 1024);
    await runEvaluationWasmCorpus(instance.exports, bytes, root, label);
  } else if (pngMode) {
    assertPngSignatures(bytes, label);
    assert(instance.exports.memory instanceof WebAssembly.Memory);
    assert(instance.exports.__heap_base instanceof WebAssembly.Global);
    assert(
      instance.exports.__heap_base.value > 2 * 1024 * 1024 &&
        instance.exports.__heap_base.value <= 16 * 1024 * 1024,
      `${label} stack/static heap prefix`,
    );
    assert.equal(instance.exports.vivi_wasm_png_abi_version(), 1);
    console.log(
      `[runtime-native-wasm] ${label}: PNG layout ${JSON.stringify({ bytes: bytes.length, sha256: sha256(bytes), maximumPages: memoryLimits.maximumPages, initialPages: memoryLimits.minimumPages, heapBase: instance.exports.__heap_base.value, linkerStackBytes: 2097152 })}`,
    );
    runPngCorpus(instance.exports, label);
  } else {
    assert(
      !("vivi_wasm_png_abi_version" in instance.exports),
      `${label} legacy must not opt into PNG`,
    );
    runNativeWasmSmoke(instance.exports, label);
  }
  return instance;
}

function readEmbeddedNativeWasmBytes() {
  const source = readFileSync(generatedBytesPath, "utf8");
  const exportName = evaluationMode
    ? "VIVI_RUNTIME_NATIVE_EVALUATION_WASM_BASE64"
    : pngMode
      ? "VIVI_RUNTIME_NATIVE_PNG_WASM_BASE64"
      : "VIVI_RUNTIME_NATIVE_WASM_BASE64";
  const exportMatch = source.match(
    new RegExp(`export const ${exportName} =\\s*([\\s\\S]*?);\\n?$`),
  );
  if (!exportMatch) {
    throw new Error(
      `${path.relative(root, generatedBytesPath)} must export ${exportName}`,
    );
  }
  const chunks = [...exportMatch[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  if (chunks.length === 0) {
    throw new Error(
      `${path.relative(root, generatedBytesPath)} does not contain base64 chunks`,
    );
  }
  return Buffer.from(chunks.join(""), "base64");
}

function runNativeWasmSmoke(exports, label) {
  const fixture = JSON.parse(
    readFileSync(
      path.join(root, "tests/conformance/runtime-v1/basic-mesh.fixture.json"),
      "utf8",
    ),
  );
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const jsonInput = writeInput(exports, encoder.encode(JSON.stringify(fixture.fileData)));
  try {
    const optionsInput = writeInput(exports, encoder.encode("{}"));
    try {
      const handle = exports.vivi_wasm_model_load(
        jsonInput.pointer,
        jsonInput.byteLength,
        optionsInput.pointer,
        optionsInput.byteLength,
      );
      if (handle === 0) {
        throw new Error(`${label} load failed: ${readLastError(exports, decoder)}`);
      }
      try {
        const snapshotPtr = exports.vivi_wasm_model_snapshot_json(handle);
        if (snapshotPtr === 0) {
          throw new Error(`${label} snapshot failed: ${readLastError(exports, decoder)}`);
        }
        const snapshot = JSON.parse(readOutput(exports, decoder, snapshotPtr));
        const expectedMesh = fixture.expect.renderList[0];
        if (snapshot.renderList?.[0]?.id !== expectedMesh.id) {
          throw new Error(
            `${label} smoke snapshot did not evaluate ${expectedMesh.id} from ${fixture.name}`,
          );
        }
        const expectedHit = fixture.expect.hitTests[0];
        const hitPtr = exports.vivi_wasm_model_hit_test_json(
          handle,
          expectedHit.x,
          expectedHit.y,
        );
        if (hitPtr === 0) {
          throw new Error(`${label} hit test failed: ${readLastError(exports, decoder)}`);
        }
        const hit = JSON.parse(readOutput(exports, decoder, hitPtr));
        if (hit?.colliderId !== expectedHit.hit.colliderId) {
          throw new Error(
            `${label} smoke hit test did not hit ${expectedHit.hit.colliderId} from ${fixture.name}`,
          );
        }
      } finally {
        exports.vivi_wasm_model_destroy(handle);
      }
    } finally {
      freeInput(exports, optionsInput);
    }
  } finally {
    freeInput(exports, jsonInput);
  }
}

function writeInput(exports, bytes) {
  if (bytes.byteLength === 0) return { pointer: 0, byteLength: 0 };
  const pointer = exports.vivi_wasm_alloc(bytes.byteLength);
  if (pointer === 0) {
    throw new Error("native WASM smoke allocation failed");
  }
  new Uint8Array(exports.memory.buffer, pointer, bytes.byteLength).set(bytes);
  return { pointer, byteLength: bytes.byteLength };
}

function freeInput(exports, input) {
  if (input.pointer !== 0 && input.byteLength !== 0) {
    exports.vivi_wasm_free(input.pointer, input.byteLength);
  }
}

function readLastError(exports, decoder) {
  const pointer = exports.vivi_wasm_last_error_message_ptr();
  return pointer === 0 ? "" : readOutput(exports, decoder, pointer);
}

function readOutput(exports, decoder, pointer) {
  return decoder.decode(
    new Uint8Array(exports.memory.buffer, pointer, exports.vivi_wasm_output_len()),
  );
}

function readDefinedMemoryLimits(bytes) {
  if (
    bytes.byteLength < 8 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  ) {
    throw new Error("Native WASM artifact does not have a valid WASM header");
  }

  let offset = 8;
  while (offset < bytes.byteLength) {
    const sectionId = bytes[offset++];
    const sectionSize = readVarUint32(bytes, offset);
    offset = sectionSize.nextOffset;
    const sectionEnd = offset + sectionSize.value;
    if (sectionEnd > bytes.byteLength) {
      throw new Error("Native WASM artifact has a truncated section");
    }
    if (sectionId === 5) {
      const count = readVarUint32(bytes, offset);
      offset = count.nextOffset;
      if (count.value !== 1) {
        throw new Error(
          `Native WASM artifact should define exactly one memory, got ${count.value}`,
        );
      }
      const flags = readVarUint32(bytes, offset);
      offset = flags.nextOffset;
      const minimum = readVarUint32(bytes, offset);
      offset = minimum.nextOffset;
      const hasMaximum = (flags.value & 0x01) !== 0;
      if (!hasMaximum) {
        return {
          hasMaximum: false,
          minimumPages: minimum.value,
          maximumPages: Number.POSITIVE_INFINITY,
        };
      }
      const maximum = readVarUint32(bytes, offset);
      return {
        hasMaximum: true,
        minimumPages: minimum.value,
        maximumPages: maximum.value,
      };
    }
    offset = sectionEnd;
  }
  return null;
}

function readVarUint32(bytes, offset) {
  let result = 0;
  let shift = 0;
  for (let byteIndex = 0; byteIndex < 5; byteIndex += 1) {
    if (offset >= bytes.byteLength) {
      throw new Error("Native WASM artifact has a truncated LEB128 integer");
    }
    const byte = bytes[offset++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, nextOffset: offset };
    }
    shift += 7;
  }
  throw new Error("Native WASM artifact has an invalid varuint32 integer");
}

function assertPngTargetDependencies() {
  const result = spawnSync(
    "cargo",
    [
      "+1.89.0",
      "tree",
      "--locked",
      "--manifest-path",
      nativeManifest,
      "-p",
      "vivi-runtime-native-wasm",
      "--features",
      "png-v1",
      "--target",
      "wasm32-unknown-unknown",
      "--edges",
      "normal,build",
      "--prefix",
      "none",
      "--format",
      "{p}",
    ],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error("PNG target dependency-tree inspection failed");
  const actual = [
    ...new Set(
      result.stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => line.split(" ")[0]),
    ),
  ].sort();
  assert.deepEqual(
    actual,
    [
      "adler2",
      "block-buffer",
      "cfg-if",
      "crypto-common",
      "digest",
      "generic-array",
      "itoa",
      "memchr",
      "miniz_oxide",
      "serde_core",
      "serde_json",
      "sha2",
      "typenum",
      "version_check",
      "vivi-png-ref",
      "vivi-runtime-native-core",
      "vivi-runtime-native-wasm",
      "zmij",
    ].sort(),
    "exact PNG target normal/build closure; no host, store, C ABI or C10",
  );
  console.log(`[runtime-native-wasm] PNG target dependencies: ${actual.join(", ")}`);
}

function assertPngSignatures(
  bytes,
  label,
  signatures = pngSignatures,
  prefix = "vivi_wasm_png_",
) {
  const types = [];
  const functions = [];
  const exports = new Map();
  let offset = 8;
  while (offset < bytes.length) {
    const id = bytes[offset++];
    const size = readVarUint32(bytes, offset);
    offset = size.nextOffset;
    const end = offset + size.value;
    assert(end <= bytes.length);
    const integer = () => {
      const value = readVarUint32(bytes, offset);
      offset = value.nextOffset;
      assert(offset <= end);
      return value.value;
    };
    if (id === 1) {
      const count = integer();
      for (let i = 0; i < count; i++) {
        assert.equal(bytes[offset++], 0x60, "function type only");
        const params = Array.from({ length: integer() }, () => bytes[offset++]);
        const results = Array.from({ length: integer() }, () => bytes[offset++]);
        types.push([params, results]);
      }
    } else if (id === 3) {
      const count = integer();
      for (let i = 0; i < count; i++) functions.push(integer());
    } else if (id === 7) {
      const count = integer();
      for (let i = 0; i < count; i++) {
        const length = integer();
        const name = Buffer.from(bytes.subarray(offset, offset + length)).toString(
          "utf8",
        );
        offset += length;
        exports.set(name, { kind: bytes[offset++], index: integer() });
      }
    }
    assert(offset <= end);
    offset = end;
  }
  for (const [name, expected] of Object.entries(signatures)) {
    const actual = exports.get(name);
    assert.equal(actual?.kind, 0, `${label} ${name} function export`);
    assert.deepEqual(
      types[functions[actual.index]],
      expected,
      `${label} ${name} exact WASM signature`,
    );
  }
  const actualPngNames = [...exports.keys()]
    .filter((name) => name.startsWith(prefix))
    .sort();
  assert.deepEqual(
    actualPngNames,
    Object.keys(signatures)
      .filter((name) => name.startsWith(prefix))
      .sort(),
  );
}

function pngFixtures() {
  const bytes = readFileSync(
    path.join(
      root,
      "packages/runtime-native/crates/vivi-png-ref/tests/fixtures/png-rgba8-v1.json",
    ),
  );
  assert.equal(bytes.length, 8547);
  assert.equal(
    sha256(bytes),
    "ce24e9fc5daef4aa5584ec5bb54892ba87c16b368001da8453a65f836cbc5956",
  );
  return JSON.parse(bytes.toString("utf8"));
}

function runPngCorpus(exports, label) {
  const fixture = pngFixtures();
  assert.equal(fixture.accept.length, 8);
  assert.equal(fixture.reject.length, 12);
  for (const vector of fixture.accept) {
    const bytes = Buffer.from(vector.base64, "base64");
    assert.equal(sha256(bytes), vector.expectedSha256);
    const result = decodeRawPng(
      exports,
      {
        bytes,
        digest: Buffer.from(vector.expectedSha256, "hex"),
        width: vector.expected.width,
        height: vector.expected.height,
      },
      0,
      { checkBusy: true },
    );
    assert.equal(result.rgba.toString("hex"), vector.expected.rgbaHex, vector.id);
  }
  const status = {
    unsupported: 2,
    malformed: 3,
    limit: 4,
    dimension: 5,
    content_hash_mismatch: 6,
  };
  for (const vector of fixture.reject) {
    const bytes = Buffer.from(vector.base64, "base64");
    assert.equal(sha256(bytes), vector.expectedActualSha256 ?? vector.expectedSha256);
    decodeRawPng(
      exports,
      {
        bytes,
        digest: Buffer.from(vector.declaredSha256 ?? vector.expectedSha256, "hex"),
        width: vector.declaredWidth ?? bytes.readUInt32BE(16),
        height: vector.declaredHeight ?? bytes.readUInt32BE(20),
      },
      status[vector.expectedError],
    );
  }
  decodeRawPng(
    exports,
    {
      bytes: Buffer.alloc(0),
      digest: createHash("sha256").digest(),
      width: 1,
      height: 1,
    },
    3,
  );
  decodeRawPng(
    exports,
    { bytes: Buffer.from([0]), digest: Buffer.alloc(32), width: 0, height: 0 },
    6,
  );
  decodeRawPng(
    exports,
    { bytes: Buffer.from([0]), digest: Buffer.alloc(64, 48), width: 1, height: 1 },
    1,
  );
  assert.equal(exports.vivi_wasm_png_decode_rgba8(0, 0, 0, 32, 1, 1), 1);
  assert.equal(
    exports.vivi_wasm_png_decode_rgba8(exports.memory.buffer.byteLength, 1, 1, 32, 1, 1),
    1,
  );
  assert.equal(exports.vivi_wasm_png_decode_rgba8(0xfffffff0, 32, 1, 32, 1, 1), 1);
  assert.equal(exports.vivi_wasm_output_len(), 0);
  assert.equal(exports.vivi_wasm_png_output_ptr(), 0);
  console.log(
    `[runtime-native-wasm] ${label}: PNG corpus 8 accept/12 reject plus transport controls passed`,
  );
}

function decodeRawPng(exports, input, expectedStatus, { checkBusy = false } = {}) {
  let poisoned = false;
  const call = (name, ...args) => {
    try {
      return exports[name](...args);
    } catch (error) {
      poisoned = true;
      throw error;
    }
  };
  const pages = () => exports.memory.buffer.byteLength / 65536;
  const memory = { beforeAlloc: pages() };
  const size = input.bytes.length + input.digest.length;
  let pointer = 0;
  let result;
  try {
    pointer = call("vivi_wasm_alloc", size);
    if (pointer === 0) poisoned = true;
    assert(
      pointer > 0 && pointer + size <= exports.memory.buffer.byteLength,
      "complete uploaded allocation",
    );
    memory.afterAlloc = pages();
    new Uint8Array(exports.memory.buffer, pointer, input.bytes.length).set(input.bytes);
    new Uint8Array(
      exports.memory.buffer,
      pointer + input.bytes.length,
      input.digest.length,
    ).set(input.digest);
    const args = [
      pointer,
      input.bytes.length,
      pointer + input.bytes.length,
      input.digest.length,
      input.width,
      input.height,
    ];
    const status = call("vivi_wasm_png_decode_rgba8", ...args);
    if (status === 4) {
      poisoned = true;
      throw new Error(
        "PNG4 retires this private test instance; no cleanup export follows",
      );
    }
    memory.afterDecode = pages();
    assert.equal(status, expectedStatus, "actual raw PNG status");
    const outputPointer = call("vivi_wasm_png_output_ptr");
    const outputLength = call("vivi_wasm_output_len");
    if (status === 0) {
      assert.equal(outputLength, input.width * input.height * 4);
      assert(
        outputPointer > 0 &&
          outputPointer + outputLength <= exports.memory.buffer.byteLength,
      );
      if (checkBusy) {
        assert.equal(
          call("vivi_wasm_png_decode_rgba8", ...args),
          1,
          "unreleased output must reject a second decode",
        );
        assert.equal(call("vivi_wasm_png_output_ptr"), outputPointer);
        assert.equal(call("vivi_wasm_output_len"), outputLength);
      }
      // Deliberately own the output, never retain a linear-memory subarray.
      const rgba = Buffer.from(
        new Uint8Array(exports.memory.buffer, outputPointer, outputLength),
      );
      memory.afterCopy = pages();
      result = { status, rgbaSha256: sha256(rgba), rgbaBytes: rgba.length, memory };
      if (rgba.length <= 1024 * 1024) result.rgba = rgba;
      if (input.pixel) {
        for (const offset of [
          0,
          (input.height >> 1) * input.width * 4,
          rgba.length - 4,
        ]) {
          assert.deepEqual(rgba.subarray(offset, offset + 4), input.pixel);
        }
      }
      if (input.rgbaSha256) assert.equal(result.rgbaSha256, input.rgbaSha256);
    } else {
      assert.equal(outputPointer, 0);
      assert.equal(outputLength, 0);
      result = { status, memory };
    }
    assert.equal(
      Buffer.compare(
        Buffer.from(exports.memory.buffer, pointer, input.bytes.length),
        input.bytes,
      ),
      0,
      "input unchanged",
    );
    assert.equal(
      Buffer.compare(
        Buffer.from(
          exports.memory.buffer,
          pointer + input.bytes.length,
          input.digest.length,
        ),
        input.digest,
      ),
      0,
      "digest unchanged",
    );
  } finally {
    // After any WASM trap, including release, invoke no more exports (even free).
    if (!poisoned) {
      call("vivi_wasm_png_release_output");
      assert.equal(call("vivi_wasm_output_len"), 0);
      assert.equal(call("vivi_wasm_png_output_ptr"), 0);
      memory.afterRelease = pages();
    }
    if (!poisoned && pointer !== 0) {
      call("vivi_wasm_free", pointer, size);
      memory.afterFree = pages();
    }
  }
  return result;
}

async function runPngMaximumSequence(exports, wasmBytes) {
  const max = await createMaxPngWasmFixture();
  assert.equal(max.bytes.length, 67_108_864);
  assert.equal(max.rgbaBytes, 268_435_456);
  const smallVector = pngFixtures().accept[0];
  const small = {
    bytes: Buffer.from(smallVector.base64, "base64"),
    digest: Buffer.from(smallVector.expectedSha256, "hex"),
    width: smallVector.expected.width,
    height: smallVector.expected.height,
  };
  const first = decodeRawPng(exports, max, 0);
  const middle = decodeRawPng(exports, small, 0);
  const last = decodeRawPng(exports, max, 0);
  assert.equal(
    middle.rgba.toString("hex"),
    smallVector.expected.rgbaHex,
    "owned small output survives later max growth/reuse",
  );
  assert(
    first.memory.afterDecode > first.memory.beforeAlloc,
    "real memory growth exercised",
  );
  for (const result of [first, middle, last]) {
    assert(Math.max(...Object.values(result.memory)) <= expectedMaxMemoryPages);
    assert.equal(
      result.memory.afterFree,
      result.memory.afterRelease,
      "release/free do not shrink linear memory",
    );
  }
  assert.equal(
    last.memory.afterDecode,
    first.memory.afterDecode,
    "max/small/max reuses the released allocations without growing the high-water mark",
  );
  console.log(
    `[runtime-native-wasm] PNG maximum sequence ${JSON.stringify({
      fixture: max.id,
      encodedBytes: max.bytes.length,
      inputSha256: max.digest.toString("hex"),
      width: max.width,
      height: max.height,
      rgbaBytes: max.rgbaBytes,
      rgbaSha256: max.rgbaSha256,
      paddingBytes: max.paddingBytes,
      compressedBytes: max.compressedBytes,
      maxPages: expectedMaxMemoryPages,
      maxSmallMax: [first.memory, middle.memory, last.memory],
    })}`,
  );
  await runPngAllocationFailure(max, wasmBytes);
  // Last raw operation on this private instance: limit-before-hash with a real
  // owned, in-bounds allocation. PNG4 retires the instance, so no exports follow.
  const oversizedLength = 67_108_865;
  const pointer = exports.vivi_wasm_alloc(oversizedLength + 32);
  assert(
    pointer > 0 && pointer + oversizedLength + 32 <= exports.memory.buffer.byteLength,
  );
  new Uint8Array(exports.memory.buffer, pointer + oversizedLength, 32).fill(0);
  assert.equal(
    exports.vivi_wasm_png_decode_rgba8(
      pointer,
      oversizedLength,
      pointer + oversizedLength,
      32,
      1,
      1,
    ),
    4,
  );
}

async function runPngAllocationFailure(input, wasmBytes) {
  // Same approved module and valid maximum input, but deliberately less free
  // heap: 96 MiB retained + 64 MiB upload + 256 MiB RGBA cannot fit in 384 MiB.
  // This is a failure control, not an ordinary maximum-profile workload.
  const { instance } = await WebAssembly.instantiate(wasmBytes);
  const exports = instance.exports;
  const heldBytes = 96 * 1024 * 1024;
  const held = exports.vivi_wasm_alloc(heldBytes);
  assert(held > 0 && held + heldBytes <= exports.memory.buffer.byteLength);
  const size = input.bytes.length + 32;
  const pointer = exports.vivi_wasm_alloc(size);
  assert(pointer > 0 && pointer + size <= exports.memory.buffer.byteLength);
  new Uint8Array(exports.memory.buffer, pointer, input.bytes.length).set(input.bytes);
  new Uint8Array(exports.memory.buffer, pointer + input.bytes.length, 32).set(
    input.digest,
  );
  const pagesBeforeDecode = exports.memory.buffer.byteLength / 65536;
  const status = exports.vivi_wasm_png_decode_rgba8(
    pointer,
    input.bytes.length,
    pointer + input.bytes.length,
    32,
    input.width,
    input.height,
  );
  // PNG4 retires this instance: do not inspect output or call release/free.
  assert.equal(
    status,
    4,
    "actual fallible full-RGBA allocation returns PNG4 rather than trapping",
  );
  console.log(
    `[runtime-native-wasm] PNG constrained-heap control ${JSON.stringify({ heldBytes, uploadedBytes: size, requiredRgbaBytes: input.rgbaBytes, maximumPages: expectedMaxMemoryPages, pagesBeforeDecode, status, retiredWithoutFurtherExports: true })}`,
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
