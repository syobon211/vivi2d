import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createMaxPngWasmFixture } from "./runtime-native-png-wasm-fixture.mjs";

const i32 = 0x7f;
const f64 = 0x7c;
const prefix = "vivi_wasm_evaluation_";
export const evaluationSignatures = {
  vivi_runtime_abi_version: [[], [i32]],
  vivi_wasm_alloc: [[i32], [i32]],
  vivi_wasm_free: [[i32, i32], []],
};
for (const [name, params, results] of [
  ["abi_version", [], [i32]],
  ["create", [i32], [i32]],
  ["destroy", [i32], []],
  ["prepared_destroy", [i32], []],
  ["observe_request_state", [i32, i32], [i32]],
  ["prepare", [i32, i32, i32, i32], [i32]],
  ["retry_missing", [i32, i32, i32, i32, i32, i32], [i32]],
  ["commit", [i32, i32, i32], [i32]],
  ["set_input", [i32, i32, i32, i32, f64], [i32]],
  ["apply_expression_preset", [i32, i32, i32, i32], [i32]],
  ["update", [i32, f64], [i32]],
  ["get_generations", [i32, i32], [i32]],
])
  evaluationSignatures[prefix + name] = [params, results];
for (const prepared of ["", "prepared_"]) {
  for (const name of [
    "render_mesh",
    "texture",
    "draw_command",
    "parameter",
    "expression_preset",
  ])
    evaluationSignatures[`${prefix}${prepared}get_${name}_count`] = [[i32, i32], [i32]];
  evaluationSignatures[`${prefix}${prepared}get_required_render_features`] = [
    [i32, i32],
    [i32],
  ];
  for (const name of [
    "render_mesh_snapshot",
    "texture_snapshot",
    "parameter_snapshot",
    "expression_preset",
  ])
    evaluationSignatures[`${prefix}${prepared}get_${name}`] = [
      [i32, i32, i32, i32, i32],
      [i32],
    ];
  evaluationSignatures[`${prefix}${prepared}get_draw_command_snapshot`] = [
    [i32, i32, i32, i32],
    [i32],
  ];
}

export function assertEvaluationTargetDependencies(root) {
  const result = spawnSync(
    "cargo",
    [
      "+1.89.0",
      "tree",
      "--locked",
      "--manifest-path",
      "packages/runtime-native/Cargo.toml",
      "-p",
      "vivi-runtime-native-wasm",
      "--no-default-features",
      "--features",
      "evaluation-v1",
      "--target",
      "wasm32-unknown-unknown",
      "--edges",
      "normal,build",
      "--prefix",
      "none",
      "--format",
      "{p}",
    ],
    { cwd: root, encoding: "utf8", windowsHide: true, timeout: 120000 },
  );
  assert.equal(result.status, 0, "actual production WASM feature graph");
  const actual = [
    ...new Set(
      result.stdout
        .trim()
        .split(/\r?\n/)
        .map((row) => row.split(" ")[0]),
    ),
  ].sort();
  assert.deepEqual(
    actual,
    [
      "adler2",
      "bitflags",
      "block-buffer",
      "cfg-if",
      "crypto-common",
      "digest",
      "fpmath",
      "generic-array",
      "itoa",
      "memchr",
      "miniz_oxide",
      "rustc_apfloat",
      "serde",
      "serde_core",
      "serde_json",
      "sha2",
      "smallvec",
      "typenum",
      "version_check",
      "vivi-asset-host-local",
      "vivi-asset-resolver",
      "vivi-png-ref",
      "vivi-runtime-native-core",
      "vivi-runtime-native-evaluation",
      "vivi-runtime-native-evaluation-lowering",
      "vivi-runtime-native-evaluation-math",
      "vivi-runtime-native-preactivation",
      "vivi-runtime-native-wasm",
      "zmij",
    ].sort(),
  );
  // This explicit source inclusion is a dependency in addition to Cargo's graph.
  const modulePath =
    "packages/runtime-native/crates/vivi-runtime-native-wasm/src/evaluation.rs";
  const includedPath =
    "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/evaluation/bridge.rs";
  assert(
    readFileSync(path.join(root, modulePath), "utf8").includes(
      '#[path = "../../vivi-runtime-native-c-abi/src/evaluation/bridge.rs"]',
    ),
  );
  const included = readFileSync(path.join(root, includedPath));
  console.log(
    `[runtime-native-wasm] Evaluation pure production graph ${actual.length} packages; explicit transport source ${JSON.stringify({ path: includedPath, bytes: included.length, sha256: hash(included) })}`,
  );
}

const png = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8,
  6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 16, 50, 9, 99,
  0, 0, 1, 149, 0, 157, 77, 65, 8, 223, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);
assert.equal(
  hash(png),
  "76f430c66cac7eb823fa3a8ca44209c9584693dfbcc15d9b1d5ea30daa4dd3d2",
);
const rgba = Buffer.from([0x12, 0x34, 0x56, 0]);
function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function payload(width = 1, height = 1, masks = false) {
  const mesh = (id, visible = true) => ({
    id,
    name: id,
    kind: "viviMesh",
    visible,
    opacity: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    blendMode: "normal",
    expanded: true,
    children: [],
    mesh: {
      vertices: [0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      divisionsX: 1,
      divisionsY: 1,
    },
  });
  const layers = masks
    ? [mesh("mesh"), mesh("mask", false), mesh("nested", false)]
    : [mesh("mesh")];
  if (masks) {
    layers[0].clipMasks = [{ layerId: "mask", invert: true }];
    layers[1].clipMaskIds = ["nested"];
  }
  return {
    schema: "vivi2d.evaluationPayload.v1",
    canvas: { width: 32, height: 32 },
    layers,
    parameters: [{ id: "p", name: "p", minValue: 0, maxValue: 1, defaultValue: 0 }],
    parameterBindings: [],
    skins: {},
    ikControllers: [],
    physicsGroups: [],
    colliders: [],
    expressionPresets: [{ id: "zero", name: "zero", values: { p: 0 } }],
    clips: [],
    stateMachines: [],
    atlases: [
      {
        id: "a",
        width,
        height,
        entries: layers.map((layer) => ({
          layerId: layer.id,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        })),
      },
    ],
  };
}

function arena(exports) {
  let retired = false;
  const allocations = [];
  const call = (name, ...args) => {
    assert(!retired, "no exports after any trap");
    try {
      return exports[name](...args);
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  const view = () => new DataView(exports.memory.buffer);
  const alloc = (size) => {
    const p = call("vivi_wasm_alloc", size) >>> 0;
    assert(p !== 0, `fixture scratch allocation ${size}`);
    allocations.push([p, size]);
    new Uint8Array(exports.memory.buffer, p, size).fill(0);
    return p;
  };
  const put32 = (p, n) => view().setUint32(p, n, true);
  const put64 = (p, n) => view().setBigUint64(p, BigInt(n), true);
  const get32 = (p) => view().getUint32(p, true);
  const get64 = (p) => view().getBigUint64(p, true);
  const upload = (bytes) => {
    const p = alloc(bytes.length);
    new Uint8Array(exports.memory.buffer, p, bytes.length).set(bytes);
    return p;
  };
  const observe = (h, generation, exhausted = 0) => {
    const state = alloc(24);
    put32(state, 24);
    put32(state + 4, exhausted);
    put64(state + 8, generation);
    assert.equal(call(prefix + "observe_request_state", h, state), 0);
  };
  const create = () => {
    const out = alloc(4);
    assert.equal(call(prefix + "create", out), 0);
    return get32(out);
  };
  const physical = (bytes) => {
    const address = Buffer.from(hash(bytes), "hex");
    const data = upload(bytes);
    const object = alloc(56);
    put32(object, 56);
    new Uint8Array(exports.memory.buffer, object + 8, 32).set(address);
    put32(object + 40, data);
    put64(object + 48, bytes.length);
    return { object, data, address };
  };
  const load = (
    generation,
    {
      bytes = png,
      width = 1,
      height = 1,
      missing = false,
      masks = false,
      value = payload(width, height, masks),
    } = {},
  ) => {
    const physicalInput = physical(bytes);
    const json = Buffer.from(JSON.stringify(value));
    const jsonPtr = upload(json);
    const id = upload(Buffer.from("atlas:a"));
    const texture = alloc(112);
    put32(texture, 112);
    put32(texture + 4, 1);
    put32(texture + 8, width);
    put32(texture + 12, height);
    put32(texture + 16, id);
    put64(texture + 24, 7);
    put64(texture + 32, bytes.length);
    new Uint8Array(exports.memory.buffer, texture + 40, 32).set(physicalInput.address);
    new Uint8Array(exports.memory.buffer, texture + 72, 32).set(physicalInput.address);
    const descriptor = alloc(64);
    put32(descriptor, 64);
    put64(descriptor + 8, generation);
    put32(descriptor + 16, jsonPtr);
    put64(descriptor + 24, json.length);
    put32(descriptor + 32, texture);
    put64(descriptor + 40, 1);
    if (!missing) {
      put32(descriptor + 48, physicalInput.object);
      put64(descriptor + 56, 1);
    }
    return { descriptor, ...physicalInput };
  };
  const prepare = (h, input, expected = 0) => {
    const out = alloc(4);
    const info = alloc(16);
    put32(info, 16);
    put32(out, 0x1234);
    assert.equal(call(prefix + "prepare", h, input.descriptor, out, info), expected);
    if (expected !== 0) assert.equal(get32(out), 0);
    return { out, info, handle: get32(out), kind: get32(info + 4) };
  };
  const generations = (h) => {
    const out = alloc(24);
    assert.equal(call(prefix + "get_generations", h, out), 0);
    return [get64(out), get64(out + 8), get64(out + 16)];
  };
  const finish = () => {
    if (!retired)
      for (const [p, size] of allocations.reverse()) call("vivi_wasm_free", p, size);
  };
  return {
    call,
    view,
    alloc,
    upload,
    put32,
    put64,
    get32,
    get64,
    create,
    observe,
    physical,
    load,
    prepare,
    generations,
    finish,
    retired: () => retired,
  };
}

export async function runEvaluationWasmCorpus(exports, wasmBytes, root, label) {
  const a = arena(exports);
  const h = a.create();
  const other = a.create();
  try {
    a.observe(h, 1);
    const input = a.load(1, { missing: true });
    const missing = a.prepare(h, input);
    assert.equal(missing.kind, 2);
    assert.equal(a.get32(missing.info + 8), 1);
    assert.equal(
      a.call(prefix + "retry_missing", h, missing.out, input.object, 1, 0, missing.info),
      0,
    );
    assert.equal(a.get32(missing.info + 4), 1);
    const child = a.get32(missing.out);
    const textureInfo = a.alloc(48);
    a.put32(textureInfo, 48);
    assert.equal(
      a.call(prefix + "prepared_get_texture_snapshot", child, 0, 0, 0, textureInfo),
      0,
    );
    assert.equal(a.get64(textureInfo + 32), 4n);
    const textureBuffers = a.alloc(40);
    const id = a.alloc(7);
    const pixels = a.alloc(4);
    a.put32(textureBuffers, 40);
    a.put32(textureBuffers + 8, id);
    a.put64(textureBuffers + 16, 7);
    a.put32(textureBuffers + 24, pixels);
    a.put64(textureBuffers + 32, 4);
    assert.equal(
      a.call(
        prefix + "prepared_get_texture_snapshot",
        child,
        0,
        0,
        textureBuffers,
        textureInfo,
      ),
      0,
    );
    assert.deepEqual(Buffer.from(exports.memory.buffer, pixels, 4), rgba);
    checkMeshAtomicity(a, exports, child);
    checkCommandAtomicity(a, exports, child, "prepared_");
    const activated = a.alloc(4);
    a.put32(activated, 91);
    assert.equal(a.call(prefix + "commit", other, missing.out, activated), 1);
    assert.equal(a.get32(missing.out), child);
    assert.equal(a.get32(activated), 91);
    const memory = exports.memory.buffer;
    assert.equal(a.call(prefix + "commit", h, missing.out, activated), 0);
    assert.equal(a.get32(activated), 1);
    assert.equal(a.get32(missing.out), 0);
    assert.equal(exports.memory.buffer, memory, "commit does not grow memory");
    assert.deepEqual(a.generations(h), [1n, 1n, 0n]);
    checkCommandAtomicity(a, exports, h, "");
    assert.deepEqual(a.generations(h), [1n, 1n, 0n]);
    const parameter = a.upload(Buffer.from("p"));
    assert.equal(a.call(prefix + "set_input", h, parameter, 1, 0, 1), 0);
    assert.deepEqual(a.generations(h), [1n, 1n, 0n]);
    assert.equal(a.call(prefix + "update", h, 0), 0);
    assert.deepEqual(a.generations(h), [1n, 1n, 1n]);
    const preset = a.upload(Buffer.from("zero"));
    assert.equal(a.call(prefix + "apply_expression_preset", h, preset, 4, 0), 0);
    a.observe(h, 3);
    const stale = a.prepare(h, a.load(2));
    assert.equal(a.call(prefix + "commit", h, stale.out, activated), 0);
    assert.equal(a.get32(activated), 0);
    assert.deepEqual(a.generations(h), [1n, 1n, 1n]);
    const masked = a.prepare(h, a.load(3, { masks: true }));
    assertMaskCommands(a, masked.handle);
    assert.equal(a.call(prefix + "commit", h, masked.out, activated), 0);
    assert.deepEqual(a.generations(h), [2n, 1n, 0n]);
    const bad = a.load(4);
    a.put64(bad.descriptor + 56, 289);
    a.prepare(h, bad, 6);
    assert.deepEqual(a.generations(h), [2n, 1n, 0n]);
    const out = a.alloc(4),
      info = a.alloc(16);
    a.put32(info, 16);
    assert.equal(a.call(prefix + "prepare", h, 0xfffffff0, out, info), 1);
    assert.equal(
      a.call(prefix + "prepare", h, exports.memory.buffer.byteLength, out, info),
      1,
    );
    const missingAgain = a.prepare(h, a.load(4, { missing: true }));
    const wrong = a.physical(png);
    new Uint8Array(exports.memory.buffer, wrong.data, png.length).fill(7);
    assert.equal(
      a.call(
        prefix + "retry_missing",
        h,
        missingAgain.out,
        wrong.object,
        1,
        0,
        missingAgain.info,
      ),
      14,
    );
    assert.equal(a.get32(missingAgain.out), 0);
    assert.deepEqual(a.generations(h), [2n, 1n, 0n]);
    console.log(
      `[runtime-native-wasm] ${label}: actual Evaluation C9/C10/C11/PNG, Missing retry, copy atomicity, freshness and mutation passed`,
    );
  } finally {
    if (!a.retired()) {
      a.call(prefix + "destroy", other);
      a.call(prefix + "destroy", h);
    }
    a.finish();
  }
  // Only the built module runs the heavyweight boundary once; embedded bytes
  // were compared byte-for-byte before this invocation by the owning checker.
  if (label.startsWith("built ")) await maximumBoundary(wasmBytes);
  void root;
}

function checkMeshAtomicity(a, exports, child) {
  const buffers = a.alloc(72);
  a.put32(buffers, 72);
  const id = a.alloc(4),
    vertices = a.alloc(24),
    uvs = a.alloc(24),
    indices = a.alloc(12);
  const info = a.alloc(96);
  a.put32(info, 96);
  for (const [offset, pointer, length] of [
    [8, id, 4],
    [24, vertices, 24],
    [40, uvs, 24],
    [56, indices, 11],
  ]) {
    a.put32(buffers + offset, pointer);
    a.put64(buffers + offset + 8, length);
  }
  for (const [p, n] of [
    [id, 4],
    [vertices, 24],
    [uvs, 24],
    [indices, 12],
  ])
    new Uint8Array(exports.memory.buffer, p, n).fill(0xa5);
  const before = Buffer.from(new Uint8Array(exports.memory.buffer, info, 96));
  assert.equal(
    a.call(prefix + "prepared_get_render_mesh_snapshot", child, 0, 0, buffers, info),
    6,
  );
  assert.deepEqual(Buffer.from(exports.memory.buffer, info, 96), before);
  assert(Buffer.from(exports.memory.buffer, id, 4).every((n) => n === 0xa5));
  assert(Buffer.from(exports.memory.buffer, vertices, 24).every((n) => n === 0xa5));
  a.put64(buffers + 64, 12);
  a.put32(buffers + 40, vertices);
  assert.equal(
    a.call(prefix + "prepared_get_render_mesh_snapshot", child, 0, 0, buffers, info),
    1,
  );
  assert.deepEqual(Buffer.from(exports.memory.buffer, info, 96), before);
  a.put32(buffers + 40, uvs);
  assert.equal(
    a.call(prefix + "prepared_get_render_mesh_snapshot", child, 0, 0, buffers, info),
    0,
  );
  assert.equal(Buffer.from(exports.memory.buffer, id, 4).toString(), "mesh");
  assert.equal(a.get32(vertices + 8), 0x3f800000);
  assert.equal(a.get32(indices + 8), 2);
}
function assertMaskCommands(a, child) {
  const count = a.alloc(8);
  assert.equal(a.call(prefix + "prepared_get_draw_command_count", child, count), 0);
  assert.equal(a.get64(count), 5n);
  const out = a.alloc(24);
  a.put32(out, 24);
  const expected = [
    [24, 2, 2, 1, 0, 0],
    [24, 2, 1, 2, 1, 0],
    [24, 1, 0, 2, 0, 0],
    [24, 3, 0, 1, 0, 0],
    [24, 3, 0, 0, 0, 0],
  ];
  for (let i = 0; i < expected.length; i++) {
    assert.equal(
      a.call(prefix + "prepared_get_draw_command_snapshot", child, i, 0, out),
      0,
    );
    assert.deepEqual(
      Array.from({ length: 6 }, (_, j) => a.get32(out + 4 * j)),
      expected[i],
    );
  }
  const flags = a.alloc(4);
  assert.equal(a.call(prefix + "prepared_get_required_render_features", child, flags), 0);
  assert.equal(a.get32(flags), 1);
}

function checkCommandAtomicity(a, exports, handle, role) {
  const out = a.alloc(24);
  for (const [size, reserved] of [
    [0, 0],
    [24, 7],
  ]) {
    new Uint8Array(exports.memory.buffer, out, 24).fill(0xa5);
    a.put32(out, size);
    a.put32(out + 20, reserved);
    const before = Buffer.from(new Uint8Array(exports.memory.buffer, out, 24));
    assert.equal(
      a.call(`${prefix}${role}get_draw_command_snapshot`, handle, 0, 0, out),
      1,
    );
    assert.deepEqual(Buffer.from(exports.memory.buffer, out, 24), before);
  }
  a.put32(out, 24);
  a.put32(out + 20, 0);
  assert.equal(a.call(`${prefix}${role}get_draw_command_snapshot`, handle, 0, 0, out), 0);
  assert.deepEqual(
    Array.from({ length: 6 }, (_, i) => a.get32(out + 4 * i)),
    [24, 1, 0, 0, 0, 0],
  );
}

async function maximumBoundary(wasmBytes) {
  const fixture = await createMaxPngWasmFixture();
  assert.equal(fixture.rgbaBytes, 268435456);
  assert.equal(
    fixture.rgbaSha256,
    "f9971076def9731362387cbb1e1ff86d51def4a46321974237d9e50905611d89",
  );
  // Reuse the exact existing encoder's IHDR/IDAT/IEND. The 64 MiB ancillary
  // padding is irrelevant to decode workspace and cannot fit a <=16 MiB Blob.
  const encoded = Buffer.concat([
    fixture.bytes.subarray(0, 33),
    fixture.bytes.subarray(45 + fixture.paddingBytes),
  ]);
  assert(encoded.length < 16 * 1024 * 1024);
  const { instance } = await WebAssembly.instantiate(wasmBytes);
  const a = arena(instance.exports);
  const h = a.create();
  let prepared = 0;
  try {
    a.observe(h, 1);
    const incumbent = a.prepare(h, a.load(1));
    const activated = a.alloc(4);
    assert.equal(a.call(`${prefix}commit`, h, incumbent.out, activated), 0);
    assert.equal(a.get32(activated), 1);
    a.observe(h, 2);
    const input = a.load(2, {
      bytes: encoded,
      width: fixture.width,
      height: fixture.height,
    });
    const result = a.prepare(h, input);
    prepared = result.handle;
    assert.equal(result.kind, 1);
    const info = a.alloc(48);
    a.put32(info, 48);
    assert.equal(
      a.call(prefix + "prepared_get_texture_snapshot", prepared, 0, 0, 0, info),
      0,
    );
    assert.equal(a.get64(info + 32), BigInt(fixture.rgbaBytes));
    assert.equal(a.get32(info + 8), fixture.width);
    assert.equal(a.get32(info + 12), fixture.height);
    assert.equal(a.get64(info + 24), 7n);
    assert.equal(a.get64(info + 40), BigInt(fixture.width * 4));
    const pages = {
      beforeCopyAllocation: instance.exports.memory.buffer.byteLength / 65536,
    };
    const copyAllocations = [];
    let copiedSha256;
    try {
      for (const size of [7, fixture.rgbaBytes, 40]) {
        const pointer = a.call("vivi_wasm_alloc", size) >>> 0;
        assert(pointer !== 0, `maximum copy-out allocation ${size}`);
        copyAllocations.push([pointer, size]);
        new Uint8Array(instance.exports.memory.buffer, pointer, size).fill(0);
      }
      pages.afterCopyAllocation = instance.exports.memory.buffer.byteLength / 65536;
      const [[id], [pixels], [buffers]] = copyAllocations;
      a.put32(buffers, 40);
      a.put32(buffers + 8, id);
      a.put64(buffers + 16, 7);
      a.put32(buffers + 24, pixels);
      a.put64(buffers + 32, fixture.rgbaBytes);
      assert.equal(
        a.call(prefix + "prepared_get_texture_snapshot", prepared, 0, 0, buffers, info),
        0,
      );
      assert.equal(
        Buffer.from(instance.exports.memory.buffer, id, 7).toString(),
        "atlas:a",
      );
      copiedSha256 = hash(
        new Uint8Array(instance.exports.memory.buffer, pixels, fixture.rgbaBytes),
      );
      assert.equal(copiedSha256, fixture.rgbaSha256);
      pages.afterFullCopy = instance.exports.memory.buffer.byteLength / 65536;
    } finally {
      if (!a.retired()) {
        for (const [pointer, size] of copyAllocations.reverse()) {
          a.call("vivi_wasm_free", pointer, size);
        }
      }
    }
    pages.afterCopyFree = instance.exports.memory.buffer.byteLength / 65536;
    assert.equal(a.call(`${prefix}commit`, h, result.out, activated), 0);
    prepared = 0;
    assert.deepEqual(a.generations(h), [2n, 1n, 0n]);
    pages.afterMaximumCommit = instance.exports.memory.buffer.byteLength / 65536;
    a.observe(h, 3);
    const smallReplacement = a.prepare(h, a.load(3));
    assert.equal(a.call(`${prefix}commit`, h, smallReplacement.out, activated), 0);
    assert.deepEqual(a.generations(h), [3n, 1n, 0n]);
    pages.afterSmallReplacement = instance.exports.memory.buffer.byteLength / 65536;
    for (const count of Object.values(pages)) assert(count <= 12288);
    console.log(
      `[runtime-native-wasm] Evaluation maximum full copy-out ${JSON.stringify({ encodedBytes: encoded.length, encodedSha256: hash(encoded), rgbaBytes: fixture.rgbaBytes, rgbaSha256: copiedSha256, pages, maximumPages: 12288, copyBuffersFreed: true, smallReplacementCommitted: true, notAllFormatLegalInputsGuaranteed: true })}`,
    );
  } finally {
    if (!a.retired()) {
      if (prepared) a.call(prefix + "prepared_destroy", prepared);
      a.call(prefix + "destroy", h);
    }
    a.finish();
  }
  const constrained = await WebAssembly.instantiate(wasmBytes);
  const b = arena(constrained.instance.exports);
  const owner = b.create();
  b.observe(owner, 1);
  const incumbent = b.prepare(owner, b.load(1));
  const activated = b.alloc(4);
  assert.equal(b.call(`${prefix}commit`, owner, incumbent.out, activated), 0);
  assert.deepEqual(b.generations(owner), [1n, 1n, 0n]);
  const heldBytes = 600 * 1024 * 1024;
  const held = b.call("vivi_wasm_alloc", heldBytes) >>> 0;
  assert(held !== 0, "controlled heap reservation");
  try {
    b.observe(owner, 2);
    const input = b.load(2, {
      bytes: encoded,
      width: fixture.width,
      height: fixture.height,
    });
    b.prepare(owner, input, 14);
    // A returned resource failure is not a trap: the same incumbent owner is
    // still callable. This does not promise recovery from infallible OOM paths.
    const count = b.alloc(8);
    assert.equal(b.call(prefix + "get_render_mesh_count", owner, count), 0);
    assert.equal(b.get64(count), 1n);
    assert.deepEqual(b.generations(owner), [1n, 1n, 0n]);
    assert.equal(b.call(`${prefix}update`, owner, 0), 0);
    assert.deepEqual(b.generations(owner), [1n, 1n, 1n]);
    console.log(
      `[runtime-native-wasm] Evaluation constrained PNG reservation ${JSON.stringify({ heldBytes, status: 14, frozenCause: "Asset/LimitExceeded", incumbentRetainedAndUpdated: true, trapRecoveryNotClaimed: true })}`,
    );
  } finally {
    if (!b.retired()) {
      b.call("vivi_wasm_free", held, heldBytes);
      b.call(prefix + "destroy", owner);
    }
    b.finish();
  }
  const transport = await WebAssembly.instantiate(wasmBytes);
  const c = arena(transport.instance.exports);
  const transportOwner = c.create();
  c.observe(transportOwner, 1);
  const transportIncumbent = c.prepare(transportOwner, c.load(1));
  const transportActivated = c.alloc(4);
  assert.equal(
    c.call(`${prefix}commit`, transportOwner, transportIncumbent.out, transportActivated),
    0,
  );
  assert.deepEqual(c.generations(transportOwner), [1n, 1n, 0n]);
  const transportHeldBytes = 742 * 1024 * 1024;
  const transportHeld = c.call("vivi_wasm_alloc", transportHeldBytes) >>> 0;
  assert(transportHeld !== 0);
  try {
    // Deliberately not a valid PNG: this must fail at the bridge's bounded
    // ownership copy before invoking any PNG decoder, not fabricate Asset proof.
    c.observe(transportOwner, 2);
    const input = c.load(2, { bytes: Buffer.alloc(16 * 1024 * 1024) });
    c.prepare(transportOwner, input, 6);
    assert.deepEqual(c.generations(transportOwner), [1n, 1n, 0n]);
    assert.equal(c.call(`${prefix}update`, transportOwner, 0), 0);
    assert.deepEqual(c.generations(transportOwner), [1n, 1n, 1n]);
    console.log(
      `[runtime-native-wasm] Evaluation constrained transport copy ${JSON.stringify({ heldBytes: transportHeldBytes, inputBytes: 16777216, status: 6, pngNotReached: true, incumbentRetainedAndUpdated: true })}`,
    );
  } finally {
    if (!c.retired()) {
      c.call("vivi_wasm_free", transportHeld, transportHeldBytes);
      c.call(prefix + "destroy", transportOwner);
    }
    c.finish();
  }
}
