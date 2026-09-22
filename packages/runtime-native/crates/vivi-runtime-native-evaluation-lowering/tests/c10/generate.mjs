// Offline literal emission only; candidate execution belongs to the test runner.
import assert from "node:assert/strict";
import { lstatSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadC10Corpus, sha256 } from "../../../../../../scripts/lib/evaluation-lowering-c10-corpus.mjs";
import { generateCases } from "./generate-cases.mjs";
import { generateControls } from "./generate-controls.mjs";
import { generateScopes } from "./generate-scopes.mjs";
import { generateProjectionScope } from "./generate-projection-scope.mjs";
import { generateInputs } from "./generate-inputs.mjs";
import { generateIdentities } from "./generate-identities.mjs";

export function generateC10Literals(emit) {
  const corpus = loadC10Corpus();
  const outputs = new Map();
  const collect = (name, text) => {
    assert.equal(name, path.basename(name));
    assert(!outputs.has(name) && typeof text === "string");
    assert(Buffer.byteLength(text) <= 22_000_000);
    outputs.set(name, text);
  };
  generateCases(corpus, collect);
  generateControls(corpus, collect);
  generateScopes(corpus, collect);
  generateProjectionScope(corpus, collect);
  const inputs = generateInputs(corpus, collect);
  generateIdentities(inputs, collect);
  assert.equal(outputs.size, 11);
  for (const pin of corpus.generated) {
    const text = outputs.get(pin.name);
    assert.equal(typeof text, "string");
    assert.equal(Buffer.byteLength(text), pin.bytes, pin.name);
    assert.equal(sha256(text), pin.sha256, pin.name);
  }
  assert.equal(sha256(outputs.get("identity_setup.rs")), "0a624d19ee451166826fac4760d9e2c9e96126ff106abcbec6f29646dc6acf9c");
  corpus.verify();
  const pins = [];
  for (const [name, text] of outputs) {
    emit(name, text);
    pins.push({ name, bytes: Buffer.byteLength(text), sha256: sha256(text) });
  }
  return { kind: "c10-fixed-literal-generation-v1", counts: corpus.counts, outputs: pins };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, "Use --output-dir with an existing empty temporary directory");
  assert.equal(process.argv[2], "--output-dir");
  const directory = path.resolve(process.argv[3]);
  const stat = lstatSync(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal(realpathSync(directory), directory);
  assert.deepEqual(readdirSync(directory), [], "Output directory must be empty");
  const evidence = generateC10Literals((name, text) => {
    writeFileSync(path.join(directory, name), text, { flag: "wx" });
  });
  writeFileSync(path.join(directory, "generation.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}
