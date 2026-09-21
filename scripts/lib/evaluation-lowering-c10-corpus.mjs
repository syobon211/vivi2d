// Fixed C10 data decoding only. No numeric evaluator, candidate import or VM.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDirectory = fileURLToPath(
  new URL(
    "../../packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering/fixtures/c10/",
    import.meta.url,
  ),
);
const indexSha256 = "f671bf1e5321e595caa07dd8584c88fc936b1bbb893f9b447b00be8e9b76595c";
const rowLayouts = [
  ["checkpoint", "opcode", "operands", "result", "owners"],
  ["checkpoint", "opcode", "owners", "operands", "result"],
];
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function selected(array, index) {
  assert(Array.isArray(array) && array.length <= 100_000);
  assert(Number.isSafeInteger(index) && index >= 0 && index < array.length);
  return array[index];
}

// Both encodings are already-fixed lossless dictionary substitutions. Keep
// counterfactual rows in their own namespace; they are not execution oracles.
export function decodeExpectedDocument(value, dictionaries) {
  let visited = 0;
  function decode(current, depth = 0) {
    assert(depth <= 48 && ++visited <= 1_000_000);
    if (Array.isArray(current)) {
      assert(current.length <= 100_000);
      return current.map((entry) => decode(entry, depth + 1));
    }
    if (current && typeof current === "object") {
      if (Object.hasOwn(current, "$literalTrace")) {
        assert.deepEqual(Object.keys(current), ["$literalTrace"]);
        const marker = current.$literalTrace;
        assert(Array.isArray(marker) && marker.length === 2);
        const [namespace, traceId] = marker;
        assert(namespace === "literal" || namespace === "counterfactual");
        const dictionary = dictionaries[namespace];
        assert(dictionary && typeof dictionary === "object");
        const trace = selected(dictionary.trace, traceId);
        assert(Array.isArray(trace) && trace.length <= 4096);
        return trace.map((rowId) => {
          const row = selected(dictionary.row, rowId);
          assert(Array.isArray(row) && row.length === 6);
          const [layout, checkpoint, opcode, owner, operand, result] = row;
          assert(Number.isInteger(opcode) && opcode >= 0 && opcode < 20);
          const owners = selected(dictionary.owner, owner);
          assert(Array.isArray(owners) && owners.length <= 4);
          assert(owners.every((word) => Number.isSafeInteger(word) && word >= 0));
          const operands = selected(dictionary.operand, operand);
          assert(Array.isArray(operands) && operands.length >= 1 && operands.length <= 2);
          const bits = (index) => {
            const word = selected(dictionary.bits, index);
            assert(typeof word === "string" && /^[0-9a-f]{16}$/.test(word));
            return word;
          };
          const fields = {
            checkpoint: selected(dictionary.checkpoint, checkpoint),
            opcode,
            owners: [...owners],
            operands: operands.map(bits),
            result: bits(result),
          };
          assert(
            typeof fields.checkpoint === "string" && fields.checkpoint.length <= 32768,
          );
          return Object.fromEntries(
            selected(rowLayouts, layout).map((key) => [key, fields[key]]),
          );
        });
      }
      return Object.fromEntries(
        Object.entries(current).map(([key, entry]) => [key, decode(entry, depth + 1)]),
      );
    }
    if (typeof current === "string") assert(current.length <= 1_000_000);
    if (typeof current === "number")
      assert(Number.isFinite(current) && !Object.is(current, -0));
    return current;
  }
  return decode(value);
}

export function decodeInputDocument(value, dictionary) {
  assert(Array.isArray(dictionary) && dictionary.length <= 100_000);
  let visited = 0;
  function decode(current, depth = 0) {
    assert(depth <= 48 && ++visited <= 600_000);
    if (Array.isArray(current)) {
      assert(current.length <= 100_000);
      return current.map((entry) => decode(entry, depth + 1));
    }
    if (current && typeof current === "object") {
      if (Object.hasOwn(current, "$s")) {
        assert.deepEqual(Object.keys(current), ["$s"]);
        const text = selected(dictionary, current.$s);
        assert(typeof text === "string" && text.length <= 1_000_000);
        return text;
      }
      return Object.fromEntries(
        Object.entries(current).map(([key, entry]) => [key, decode(entry, depth + 1)]),
      );
    }
    if (typeof current === "string") assert(current.length <= 1_000_000);
    if (typeof current === "number")
      assert(Number.isFinite(current) && !Object.is(current, -0));
    return current;
  }
  return decode(value);
}

export function loadC10Corpus() {
  assert(
    lstatSync(fixtureDirectory).isDirectory() &&
      !lstatSync(fixtureDirectory).isSymbolicLink(),
  );
  function read(name, limit, hash, bytes) {
    assert.equal(name, path.basename(name));
    assert(!name.includes("\\") && !name.includes("/"));
    const full = path.join(fixtureDirectory, name);
    const stat = lstatSync(full);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= limit);
    const raw = readFileSync(full);
    assert.equal(sha256(raw), hash, name);
    if (bytes !== undefined) assert.equal(raw.length, bytes, name);
    return raw;
  }
  const indexRaw = read("source-pins.json", 64_000, indexSha256);
  const index = JSON.parse(indexRaw);
  assert.equal(index.kind, "vivi2d.c10.fixed-corpus-pins.v1");
  assert.equal(index.fixtures.length, 9);
  assert.equal(index.documents.length, 39);
  const fixtures = new Map();
  for (const pin of index.fixtures) {
    assert(!fixtures.has(pin.name));
    fixtures.set(pin.name, JSON.parse(read(pin.name, 2_000_000, pin.sha256, pin.bytes)));
  }
  const documents = new Map();
  const pins = new Map();
  for (const pin of index.documents) {
    assert.equal(pin.name, path.basename(pin.name));
    assert(!documents.has(pin.name));
    const stored = fixtures.get(pin.storage.fixture);
    assert(stored);
    let value;
    if (pin.storage.kind === "direct") {
      value = stored;
      const fixture = index.fixtures.find((entry) => entry.name === pin.name);
      assert(
        fixture &&
          fixture.sha256 === pin.originalSha256 &&
          fixture.bytes === pin.originalBytes,
      );
    } else {
      const document = selected(stored.documents, pin.storage.index);
      assert.equal(document.name, pin.name);
      assert.equal(document.originalBytes, pin.originalBytes);
      assert.equal(document.originalSha256, pin.originalSha256);
      assert.equal(document.parsedCompactSha256, pin.parsedCompactSha256);
      if (pin.storage.kind === "expected-bundle") {
        assert.equal(stored.kind, "vivi2d.c10.literalReviewDataBundle.v1");
        value = decodeExpectedDocument(document.value, stored.dictionaries);
      } else {
        assert.equal(pin.storage.kind, "input-bundle");
        assert.equal(stored.kind, "vivi2d.c10.literalReviewInputBundle.v1");
        value = decodeInputDocument(document.value, stored.stringDictionary);
      }
    }
    assert.equal(sha256(JSON.stringify(value)), pin.parsedCompactSha256, pin.name);
    documents.set(pin.name, value);
    pins.set(pin.name, {
      name: pin.name,
      bytes: pin.originalBytes,
      sha256: pin.originalSha256,
    });
  }
  const load = (name, expected) => {
    assert(documents.has(name), `Unknown fixed C10 document: ${name}`);
    if (expected !== undefined) assert.equal(pins.get(name).sha256, expected, name);
    return documents.get(name);
  };
  const verify = () => {
    read("source-pins.json", 64_000, indexSha256);
    read(
      "frozen-c9-setups.rs",
      650_000,
      "fb98a3be0394894ffe3ed5c0245c2ff882de675f8bfa783af353a4f8ceb02536",
      592_053,
    );
    for (const pin of index.fixtures) read(pin.name, 2_000_000, pin.sha256, pin.bytes);
    for (const pin of index.documents)
      assert.equal(
        sha256(JSON.stringify(documents.get(pin.name))),
        pin.parsedCompactSha256,
        pin.name,
      );
  };
  verify();
  return { load, pins, verify, generated: index.generated, counts: index.counts };
}
