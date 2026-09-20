import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  normalizePrimitiveCorpus,
  runPrimitiveCorpus,
} from "./evaluation-math-corpus.mjs";

const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      "../../packages/runtime-native/crates/vivi-runtime-native-evaluation-math/fixtures/evaluation-deterministic-math-v1-vectors.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const invalidCorpus = { message: "Invalid deterministic-math primitive corpus." };
const failedExecution = { message: "Deterministic-math primitive execution failed." };

test("H1: raw low bits, signed zero and noncanonical NaN survive normalization", () => {
  const cases = normalizePrimitiveCorpus(fixture);
  const step = cases.find((row) => row.id === "const-physics-step");
  assert.equal(step.a, 0x3f81111111111111n);
  assert.equal(step.expected, 0x3f81111111111111n);
  const zero = cases.find((row) => row.id === "utility-from-to-bits-negative-zero");
  assert.equal(zero.a, 0x8000000000000000n);
  assert.equal(zero.expected, 0x8000000000000000n);
  const nan = cases.find((row) => row.id === "utility-from-to-bits-noncanonical-nan");
  assert.equal(nan.a, 0x7ff8000000000042n);
  assert.equal(nan.expected, 0x7ff8000000000000n);
});

test("H2: all 126 ordered wire calls and four completed groups are observable", () => {
  // This table asserts the test-only wire contract, not a second math implementation.
  const opcodes = {
    from_bits_to_bits: 0,
    add: 1,
    sub: 2,
    mul: 3,
    div: 4,
    c_fmod: 5,
    neg: 6,
    abs: 7,
    sin: 8,
    cos: 9,
    atan2: 10,
    acos: 11,
    sqrt: 12,
    eq: 13,
    lt: 14,
    le: 15,
    gt: 16,
    ge: 17,
    classify: 18,
    is_finite: 19,
  };
  const classTags = { zero: 0n, subnormal: 1n, normal: 2n, infinite: 3n, nan: 4n };
  const expectedCalls = fixture.constants.map((row) => [0, BigInt(`0x${row.bits}`), 0n]);
  const results = fixture.constants.map((row) => BigInt(`0x${row.bits}`));
  for (const row of [
    ...fixture.curatedKernelVectors,
    ...fixture.comparisonVectors,
    ...fixture.wrapperUtilityVectors,
  ]) {
    expectedCalls.push([
      opcodes[row.op],
      BigInt(`0x${row.inputBits[0]}`),
      row.inputBits.length === 2 ? BigInt(`0x${row.inputBits[1]}`) : 0n,
    ]);
    if ("expectedBits" in row) results.push(BigInt(`0x${row.expectedBits}`));
    else if ("expectedBoolean" in row) results.push(row.expectedBoolean ? 1n : 0n);
    else results.push(classTags[row.expectedClass]);
  }
  const calls = [];
  const counts = runPrimitiveCorpus(fixture, (...args) => {
    calls.push(args);
    // Expected-data callback exercises dispatch only; this is NOT numerical evidence.
    return results[calls.length - 1];
  });
  assert.deepEqual(calls, expectedCalls);
  assert.equal(calls.length, 126);
  assert.deepEqual(counts, {
    constants: 18,
    kernel: 85,
    comparison: 12,
    utility: 11,
    total: 126,
  });
});

test("H3: incomplete arrays and false declared counts cannot certify the corpus", () => {
  const truncated = structuredClone(fixture);
  truncated.curatedKernelVectors.pop();
  assert.throws(() => normalizePrimitiveCorpus(truncated), invalidCorpus);
  const wrongCount = structuredClone(fixture);
  wrongCount.counts.comparisonVectors += 1;
  assert.throws(() => normalizePrimitiveCorpus(wrongCount), invalidCorpus);
});

test("H4: raw-bit coercion, unsupported operations and lost operands are rejected", () => {
  for (const bits of [0, "0000000000000000\n"]) {
    const malformedBits = structuredClone(fixture);
    malformedBits.constants[0].bits = bits;
    assert.throws(() => normalizePrimitiveCorpus(malformedBits), invalidCorpus);
  }
  const unknown = structuredClone(fixture);
  unknown.curatedKernelVectors[0].op = "unsupported";
  assert.throws(() => normalizePrimitiveCorpus(unknown), invalidCorpus);
  const missingOperand = structuredClone(fixture);
  missingOperand.curatedKernelVectors[0].inputBits.pop();
  assert.throws(() => normalizePrimitiveCorpus(missingOperand), invalidCorpus);
});

test("H5: final-row invalid u64 prevents every invocation; no callback fallback", () => {
  const invalidLast = structuredClone(fixture);
  invalidLast.wrapperUtilityVectors.at(-1).inputBits[0] = "10000000000000000";
  let calls = 0;
  assert.throws(
    () =>
      runPrimitiveCorpus(invalidLast, () => {
        calls += 1;
        return 0n;
      }),
    failedExecution,
  );
  assert.equal(calls, 0);
  assert.throws(() => runPrimitiveCorpus(fixture), failedExecution);
});

test("H6: callback errors expose neither synthetic marker nor original cause", () => {
  const marker = "VIVI_MATH_CALLBACK_DIAGNOSTIC_CANARY";
  const original = new Error(marker, { cause: new Error(`${marker}_CAUSE`) });
  assert.throws(
    () =>
      runPrimitiveCorpus(fixture, () => {
        throw original;
      }),
    (error) => {
      assert.equal(error.message, failedExecution.message);
      assert.notEqual(error, original);
      assert.equal(error.cause, undefined);
      assert.equal(String(error.stack).includes(marker), false);
      return true;
    },
  );
});

test("H7: results must be synchronous unsigned-u64 BigInt values", () => {
  for (const result of [0, -1n, 0x10000000000000000n, Promise.resolve(0n)]) {
    let calls = 0;
    assert.throws(
      () =>
        runPrimitiveCorpus(fixture, () => {
          calls += 1;
          return result;
        }),
      failedExecution,
    );
    assert.equal(calls, 1);
  }
});

test("H8: a one-bit mismatch fails on the first invocation without tolerance", () => {
  let calls = 0;
  assert.throws(
    () =>
      runPrimitiveCorpus(fixture, () => {
        calls += 1;
        return 1n; // First corpus expectation is positive-zero raw bits, 0n.
      }),
    failedExecution,
  );
  assert.equal(calls, 1);
});
