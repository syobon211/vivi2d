// Test-only transport for the pinned primitive corpus, never a numerical oracle.
// Keep this module import-free: the caller supplies the actual WASM invocation.
const operations = new Map([
  ["from_bits_to_bits", [0, 1, "bits", "utility"]],
  ["add", [1, 2, "bits", "kernel"]],
  ["sub", [2, 2, "bits", "kernel"]],
  ["mul", [3, 2, "bits", "kernel"]],
  ["div", [4, 2, "bits", "kernel"]],
  ["c_fmod", [5, 2, "bits", "kernel"]],
  ["neg", [6, 1, "bits", "kernel"]],
  ["abs", [7, 1, "bits", "kernel"]],
  ["sin", [8, 1, "bits", "kernel"]],
  ["cos", [9, 1, "bits", "kernel"]],
  ["atan2", [10, 2, "bits", "kernel"]],
  ["acos", [11, 1, "bits", "kernel"]],
  ["sqrt", [12, 1, "bits", "kernel"]],
  ["eq", [13, 2, "boolean", "comparison"]],
  ["lt", [14, 2, "boolean", "comparison"]],
  ["le", [15, 2, "boolean", "comparison"]],
  ["gt", [16, 2, "boolean", "comparison"]],
  ["ge", [17, 2, "boolean", "comparison"]],
  ["classify", [18, 1, "class", "utility"]],
  ["is_finite", [19, 1, "boolean", "utility"]],
]);
const classes = new Map([
  ["zero", 0n],
  ["subnormal", 1n],
  ["normal", 2n],
  ["infinite", 3n],
  ["nan", 4n],
]);
const groups = [
  ["constants", "constants", 18],
  ["curatedKernelVectors", "kernel", 85],
  ["comparisonVectors", "comparison", 12],
  ["wrapperUtilityVectors", "utility", 11],
];
const maximumU64 = 0xffffffffffffffffn;

function requireRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid primitive record.");
  }
}

function parseBits(value) {
  if (typeof value !== "string" || value.length !== 16 || !/^[0-9a-f]{16}$/.test(value)) {
    throw new Error("Invalid primitive bits.");
  }
  return BigInt(`0x${value}`);
}

function expectedValue(row, kind) {
  if (kind === "bits") return parseBits(row.expectedBits);
  if (kind === "boolean" && typeof row.expectedBoolean === "boolean") {
    return row.expectedBoolean ? 1n : 0n;
  }
  if (kind === "class" && classes.has(row.expectedClass)) {
    return classes.get(row.expectedClass);
  }
  throw new Error("Invalid primitive expectation.");
}

/** Decode every primitive row before any caller can begin execution. */
export function normalizePrimitiveCorpus(fixture) {
  try {
    requireRecord(fixture);
    requireRecord(fixture.counts);
    const cases = [];
    const ids = new Set();
    for (const [field, group, count] of groups) {
      const rows = fixture[field];
      if (
        !Array.isArray(rows) ||
        rows.length !== count ||
        fixture.counts[field] !== count
      ) {
        throw new Error("Incomplete primitive corpus.");
      }
      for (const row of rows) {
        requireRecord(row);
        if (typeof row.id !== "string" || row.id.length === 0 || ids.has(row.id)) {
          throw new Error("Invalid primitive identity.");
        }
        ids.add(row.id);
        if (group === "constants") {
          const bits = parseBits(row.bits);
          cases.push({ id: row.id, group, opcode: 0, a: bits, b: 0n, expected: bits });
          continue;
        }
        const operation = operations.get(row.op);
        if (!operation || operation[3] !== group) {
          throw new Error("Unsupported primitive operation.");
        }
        const [opcode, arity, kind] = operation;
        if (!Array.isArray(row.inputBits) || row.inputBits.length !== arity) {
          throw new Error("Invalid primitive arity.");
        }
        cases.push({
          id: row.id,
          group,
          opcode,
          a: parseBits(row.inputBits[0]),
          b: arity === 2 ? parseBits(row.inputBits[1]) : 0n,
          expected: expectedValue(row, kind),
        });
      }
    }
    return cases;
  } catch {
    throw new Error("Invalid deterministic-math primitive corpus.");
  }
}

/** Compare actual synchronous unsigned-u64 results; never synthesize a result. */
export function runPrimitiveCorpus(fixture, invoke) {
  try {
    if (typeof invoke !== "function") throw new Error("Missing primitive invocation.");
    const cases = normalizePrimitiveCorpus(fixture);
    const counts = { constants: 0, kernel: 0, comparison: 0, utility: 0, total: 0 };
    for (const row of cases) {
      const actual = invoke(row.opcode, row.a, row.b);
      if (
        typeof actual !== "bigint" ||
        actual < 0n ||
        actual > maximumU64 ||
        actual !== row.expected
      ) {
        throw new Error("Primitive result mismatch.");
      }
      counts[row.group] += 1;
      counts.total += 1;
    }
    return counts;
  } catch {
    // Callback messages, stack and cause may contain local/private diagnostics.
    throw new Error("Deterministic-math primitive execution failed.");
  }
}
