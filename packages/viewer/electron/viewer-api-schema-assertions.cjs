const { MAX_JSON_NESTING_DEPTH } = require("./viewer-api-schema-constants.cjs");
const { isRecord } = require("./viewer-api-schema-utils.cjs");

function assertRecord(value, label) {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function assertString(value, label, max = 256) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function assertBoundedNumber(value, label, min, max) {
  const number = assertFiniteNumber(value, label);
  if (number < min || number > max) {
    throw new Error(`${label} out of range`);
  }
  return number;
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function assertNoUnknownKeys(value, allowedKeys, label = "data") {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label}.${key} is not allowed`);
    }
  }
}

function maxJsonDepth(value, depth = 0) {
  if (value === null || typeof value !== "object") return depth;
  if (depth > MAX_JSON_NESTING_DEPTH) return depth;
  const values = Array.isArray(value) ? value : Object.values(value);
  let max = depth;
  for (const child of values) {
    max = Math.max(max, maxJsonDepth(child, depth + 1));
  }
  return max;
}

module.exports = {
  assertBoolean,
  assertBoundedNumber,
  assertFiniteNumber,
  assertNoUnknownKeys,
  assertRecord,
  assertString,
  maxJsonDepth,
};
