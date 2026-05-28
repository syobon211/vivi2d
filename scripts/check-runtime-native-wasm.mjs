import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const nativeManifest = path.join(root, "packages/runtime-native/Cargo.toml");
const wasmPath = path.join(
  root,
  "packages/runtime-native/target/wasm32-unknown-unknown/release/vivi_runtime_native_wasm.wasm",
);
const generatedBytesPath = path.join(
  root,
  "packages/runtime-wasm/src/native-wasm-bytes.ts",
);
const expectedAbiVersion = 1;
const expectedMaxMemoryPages = 1024; // 64 MiB.
const enforceGeneratedBytesFreshness =
  process.env.VIVI2D_ENFORCE_NATIVE_WASM_FRESHNESS === "1";
const deterministicRustflags = [
  "-C",
  "link-arg=--max-memory=67108864",
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

run("cargo", [
  "build",
  "--manifest-path",
  nativeManifest,
  "-p",
  "vivi-runtime-native-wasm",
  "--target",
  "wasm32-unknown-unknown",
  "--release",
], {
  CARGO_ENCODED_RUSTFLAGS: deterministicRustflags.join("\x1f"),
});

if (enforceGeneratedBytesFreshness) {
  run("node", ["scripts/generate-runtime-native-wasm-module.mjs", "--check"]);
} else {
  console.log(
    "[runtime-native-wasm] skipped byte-for-byte freshness; set VIVI2D_ENFORCE_NATIVE_WASM_FRESHNESS=1 for a local regeneration check",
  );
}

await validateNativeWasmArtifact(
  readFileSync(wasmPath),
  `built native WASM artifact (${path.relative(root, wasmPath)})`,
);
await validateNativeWasmArtifact(
  readEmbeddedNativeWasmBytes(),
  `embedded native WASM bytes (${path.relative(root, generatedBytesPath)})`,
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

  const { instance } = await WebAssembly.instantiate(bytes);
  for (const exportName of expectedExports) {
    if (!(exportName in instance.exports)) {
      throw new Error(`${label} is missing ${exportName}`);
    }
  }
  const abiVersion = instance.exports.vivi_runtime_abi_version;
  if (typeof abiVersion !== "function") {
    throw new Error(`${label} is missing vivi_runtime_abi_version`);
  }
  if (abiVersion() !== expectedAbiVersion) {
    throw new Error(
      `${label} ABI mismatch: ${abiVersion()} !== ${expectedAbiVersion}`,
    );
  }

  runNativeWasmSmoke(instance.exports, label);
}

function readEmbeddedNativeWasmBytes() {
  const source = readFileSync(generatedBytesPath, "utf8");
  const exportMatch = source.match(
    /export const VIVI_RUNTIME_NATIVE_WASM_BASE64 =\n([\s\S]*?);\n?$/,
  );
  if (!exportMatch) {
    throw new Error(
      `${path.relative(root, generatedBytesPath)} must export VIVI_RUNTIME_NATIVE_WASM_BASE64`,
    );
  }
  const chunks = [...exportMatch[1].matchAll(/"([^"]*)"/g)].map(
    (match) => match[1],
  );
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
          throw new Error(
            `${label} snapshot failed: ${readLastError(exports, decoder)}`,
          );
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
          throw new Error(
            `${label} hit test failed: ${readLastError(exports, decoder)}`,
          );
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
        throw new Error(`Native WASM artifact should define exactly one memory, got ${count.value}`);
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
