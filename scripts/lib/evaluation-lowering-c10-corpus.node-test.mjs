import assert from "node:assert/strict";
import { test } from "node:test";
import { generateC10Literals } from "../../packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering/tests/c10/generate.mjs";
import { generateCases } from "../../packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering/tests/c10/generate-cases.mjs";
import {
  decodeExpectedDocument,
  decodeInputDocument,
  loadC10Corpus,
  sha256,
} from "./evaluation-lowering-c10-corpus.mjs";

test("fixed packed documents and generated literals retain their reviewed identities", {
  timeout: 60_000,
}, () => {
  const corpus = loadC10Corpus();
  assert.equal(corpus.pins.size, 39);
  assert.equal(corpus.load("native-c10-case-index-manifest-1.json").cases.length, 147);
  assert.throws(() => corpus.load("not-a-fixed-document.json"));
  assert.throws(() => corpus.load("native-c10-a-expectations-1.json", "0".repeat(64)));
  const seen = new Map();
  const result = generateC10Literals((name, text) =>
    seen.set(name, { bytes: Buffer.byteLength(text), sha256: sha256(text) }),
  );
  assert.equal(result.outputs.length, 11);
  assert.deepEqual(seen.get("native-c10-literal-cases-1.rs"), {
    bytes: 9_061_599,
    sha256: "2f5d8337c63042aab5c620d6748e56829fbf404e50bb9f21641ef79a9e4cae4b",
  });
  assert.equal(result.counts.steps, 290);
  assert.equal(result.counts.compoundCases, 137);
  corpus.verify();
});

test("literal and counterfactual dictionaries stay separate and retain property order", () => {
  const dictionary = (result) => ({
    checkpoint: ["fixed.checkpoint"],
    owner: [[0]],
    operand: [[0]],
    bits: ["0000000000000000", result],
    row: [[0, 0, 8, 0, 0, 1]],
    trace: [[0]],
  });
  const dictionaries = {
    literal: dictionary("3ff0000000000000"),
    counterfactual: dictionary("4000000000000000"),
  };
  const literal = decodeExpectedDocument({ $literalTrace: ["literal", 0] }, dictionaries);
  const counterfactual = decodeExpectedDocument(
    { $literalTrace: ["counterfactual", 0] },
    dictionaries,
  );
  assert.deepEqual(Object.keys(literal[0]), [
    "checkpoint",
    "opcode",
    "operands",
    "result",
    "owners",
  ]);
  assert.equal(literal[0].result, "3ff0000000000000");
  assert.equal(counterfactual[0].result, "4000000000000000");
  assert.throws(() =>
    decodeExpectedDocument({ $literalTrace: ["other", 0] }, dictionaries),
  );
  assert.throws(() =>
    decodeExpectedDocument({ $literalTrace: ["literal", 1] }, dictionaries),
  );
  assert.throws(() =>
    decodeExpectedDocument({ $literalTrace: ["literal", 0], extra: true }, dictionaries),
  );
  const corrupt = structuredClone(dictionaries);
  corrupt.literal.row[0][4] = 42;
  assert.throws(() => decodeExpectedDocument({ $literalTrace: ["literal", 0] }, corrupt));
});

test("input string substitution rejects malformed references without interpreting payloads", () => {
  const source = '{"angle":"8000000000000000"}';
  assert.deepEqual(decodeInputDocument({ payload: { $s: 0 }, empty: [] }, [source]), {
    payload: source,
    empty: [],
  });
  assert.throws(() => decodeInputDocument({ $s: 1 }, [source]));
  assert.throws(() => decodeInputDocument({ $s: 0, extra: true }, [source]));
  let nested = null;
  for (let depth = 0; depth < 50; depth++) nested = [nested];
  assert.throws(() => decodeInputDocument(nested, []));
});

test("a new unhandled expected field stops literal generation", () => {
  const corpus = loadC10Corpus();
  const name = "native-c10-a-expectations-1.json";
  const changed = structuredClone(corpus.load(name));
  changed.cases[0].construction.unhandledFutureField = false;
  assert.throws(
    () =>
      generateCases(
        {
          ...corpus,
          load: (file, expected) =>
            file === name ? changed : corpus.load(file, expected),
        },
        () => assert.fail("Invalid expectations must not emit an output"),
      ),
    /UNHANDLED step/,
  );
});
