import { parentPort, workerData } from "node:worker_threads";
import { runPrimitiveCorpus } from "./evaluation-math-corpus.mjs";

const expectedExports = [
  { name: "__data_end", kind: "global" },
  { name: "__heap_base", kind: "global" },
  { name: "memory", kind: "memory" },
  { name: "vivi_math_test_invoke", kind: "function" },
];

try {
  if (
    !parentPort ||
    !(workerData?.moduleBytes instanceof Uint8Array) ||
    workerData.moduleBytes.length === 0 ||
    Object.keys(workerData).sort().join(",") !== "fixture,moduleBytes"
  ) {
    throw new Error("Invalid worker input.");
  }
  const module = new WebAssembly.Module(workerData.moduleBytes);
  const imports = WebAssembly.Module.imports(module);
  const exports = WebAssembly.Module.exports(module).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  if (
    imports.length !== 0 ||
    JSON.stringify(exports) !== JSON.stringify(expectedExports)
  ) {
    throw new Error("Unexpected WASM surface.");
  }
  const instance = new WebAssembly.Instance(module, {});
  const invoke = instance.exports.vivi_math_test_invoke;
  if (typeof invoke !== "function" || invoke.length !== 3) {
    throw new Error("Unexpected WASM invocation.");
  }
  const counts = runPrimitiveCorpus(workerData.fixture, (opcode, a, b) => {
    const result = invoke(opcode, a, b);
    if (typeof result !== "bigint") throw new Error("Unexpected WASM result.");
    // This is the only signed-i64 -> unsigned-u64 boundary, not a helper fallback.
    return BigInt.asUintN(64, result);
  });
  const traps = [20, 0xffffffff];
  for (const opcode of traps) {
    let trapped = false;
    try {
      invoke(opcode, 0n, 0n);
    } catch (error) {
      if (!(error instanceof WebAssembly.RuntimeError)) throw error;
      trapped = true;
    }
    if (!trapped) throw new Error("Unsupported opcode did not trap.");
  }
  parentPort.postMessage({ ok: true, counts, exports, imports: 0, traps });
} catch {
  // The parent owns the deadline/termination and exposes no original error/cause.
  parentPort?.postMessage({ ok: false });
}
