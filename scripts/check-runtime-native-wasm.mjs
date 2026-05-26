import { readFileSync } from "node:fs";
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
const expectedAbiVersion = 1;
const expectedMaxMemoryPages = 1024; // 64 MiB.
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
]);
run("node", ["scripts/generate-runtime-native-wasm-module.mjs", "--check"]);

const bytes = readFileSync(wasmPath);
if (!WebAssembly.validate(bytes)) {
  throw new Error(`Native WASM artifact failed validation: ${wasmPath}`);
}
const memoryLimits = readDefinedMemoryLimits(bytes);
if (!memoryLimits?.hasMaximum) {
  throw new Error("Native WASM artifact must declare a maximum linear-memory size");
}
if (memoryLimits.maximumPages > expectedMaxMemoryPages) {
  throw new Error(
    `Native WASM maximum memory is too high: ${memoryLimits.maximumPages} pages > ${expectedMaxMemoryPages} pages`,
  );
}

const { instance } = await WebAssembly.instantiate(bytes);
for (const exportName of expectedExports) {
  if (!(exportName in instance.exports)) {
    throw new Error(`Native WASM artifact is missing ${exportName}`);
  }
}
const abiVersion = instance.exports.vivi_runtime_abi_version;
if (typeof abiVersion !== "function") {
  throw new Error("Native WASM artifact is missing vivi_runtime_abi_version");
}
if (abiVersion() !== expectedAbiVersion) {
  throw new Error(
    `Native WASM ABI mismatch: ${abiVersion()} !== ${expectedAbiVersion}`,
  );
}

runNativeWasmSmoke(instance.exports);
console.log("[runtime-native-wasm] passed");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function runNativeWasmSmoke(exports) {
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
        throw new Error(`native WASM load failed: ${readLastError(exports, decoder)}`);
      }
      try {
        const snapshotPtr = exports.vivi_wasm_model_snapshot_json(handle);
        if (snapshotPtr === 0) {
          throw new Error(
            `native WASM snapshot failed: ${readLastError(exports, decoder)}`,
          );
        }
        const snapshot = JSON.parse(readOutput(exports, decoder, snapshotPtr));
        const expectedMesh = fixture.expect.renderList[0];
        if (snapshot.renderList?.[0]?.id !== expectedMesh.id) {
          throw new Error(
            `native WASM smoke snapshot did not evaluate ${expectedMesh.id} from ${fixture.name}`,
          );
        }
        const expectedHit = fixture.expect.hitTests[0];
        const hitPtr = exports.vivi_wasm_model_hit_test_json(
          handle,
          expectedHit.x,
          expectedHit.y,
        );
        if (hitPtr === 0) {
          throw new Error(`native WASM hit test failed: ${readLastError(exports, decoder)}`);
        }
        const hit = JSON.parse(readOutput(exports, decoder, hitPtr));
        if (hit?.colliderId !== expectedHit.hit.colliderId) {
          throw new Error(
            `native WASM smoke hit test did not hit ${expectedHit.hit.colliderId} from ${fixture.name}`,
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
    throw new Error("native WASM allocation failed");
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
