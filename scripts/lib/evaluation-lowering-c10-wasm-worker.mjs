// Fixed C10 evidence only. Never accepts a caller-authored program or oracle.
import assert from "node:assert/strict";
import { parentPort, workerData } from "node:worker_threads";

assert(parentPort);
assert.deepEqual(Object.keys(workerData), ["moduleBytes"]);
assert(workerData.moduleBytes instanceof Uint8Array);
assert(
  workerData.moduleBytes.length > 0 && workerData.moduleBytes.length < 16 * 1024 * 1024,
);
const module = new WebAssembly.Module(workerData.moduleBytes);
assert.deepEqual(WebAssembly.Module.imports(module), []);
const expectedExports = [
  "memory",
  "c10_compound_case",
  "c10_helper_case",
  "c10_raw_checks",
  "c10_reuse_and_negative_controls",
  "c10_allocator_positive_control",
  "c10_observer_exhaustion_control",
  "c10_diagnostic_word",
  "__data_end",
  "__heap_base",
].sort();
assert.deepEqual(
  WebAssembly.Module.exports(module)
    .map((entry) => entry.name)
    .sort(),
  expectedExports,
);
for (const entry of WebAssembly.Module.exports(module)) {
  assert.equal(
    entry.kind,
    entry.name === "memory"
      ? "memory"
      : entry.name.startsWith("__")
        ? "global"
        : "function",
  );
}
const exports = new WebAssembly.Instance(module).exports;
function checked(name) {
  const result = exports[name]();
  assert.equal(
    result,
    0,
    `${name}: ${Array.from({ length: 8 }, (_, index) => exports.c10_diagnostic_word(index)).join(",")}`,
  );
}
for (const name of [
  "c10_raw_checks",
  "c10_helper_case",
  "c10_reuse_and_negative_controls",
  "c10_allocator_positive_control",
])
  checked(name);
const nativeOnly = [35, 91, 92, 93, 94, 95];
const separate = [39, 41, 42, 43];
let compound = 0;
for (let index = 0; index < 147; index++) {
  if (nativeOnly.includes(index)) continue;
  const result = exports.c10_compound_case(index);
  if (separate.includes(index)) assert.equal(result, 2);
  else {
    assert.equal(
      result,
      0,
      `case ${index}: ${Array.from({ length: 8 }, (_, word) => exports.c10_diagnostic_word(word)).join(",")}`,
    );
    compound++;
  }
}
assert.equal(compound, 137);
for (const [name, argument] of [
  ["c10_observer_exhaustion_control", 0],
  ["c10_observer_exhaustion_control", 1],
  ...nativeOnly.map((index) => ["c10_compound_case", index]),
  ["c10_compound_case", 147],
  ["c10_diagnostic_word", 8],
]) {
  const fresh = new WebAssembly.Instance(module).exports;
  assert.throws(() => fresh[name](argument), WebAssembly.RuntimeError);
  // A trapped instance is never used again, including cleanup/diagnostic exports.
}
parentPort.postMessage({
  ok: true,
  compound: 137,
  helper: 1,
  rawRows: 574,
  reusedActualCases: 8,
  freshTraps: 10,
});
