const {
  ACCEPTED_VIEWER_API_VERSIONS,
  KNOWN_TYPES,
  MAX_JSON_NESTING_DEPTH,
  MAX_MESSAGE_BYTES,
  MAX_TOP_LEVEL_KEYS,
  VIVI_VIEWER_API_NAME,
} = require("./viewer-api-schema-constants.cjs");
const { validateInlinePropImage } = require("./viewer-api-schema-image.cjs");
const { validateMessagePayload } = require("./viewer-api-schema-payloads.cjs");
const {
  requiredScopeAlternativesForMessage,
  requiredScopesForMessage,
} = require("./viewer-api-schema-scope-resolution.cjs");
const {
  assertNoUnknownKeys,
  assertRecord,
  assertString,
  maxJsonDepth,
} = require("./viewer-api-schema-assertions.cjs");

function parseViewerApiMessage(raw, { negotiatedVersion } = {}) {
  const text = typeof raw === "string" ? raw : raw?.toString?.("utf8");
  if (typeof text !== "string") {
    throw new Error("message must be text");
  }
  if (Buffer.byteLength(text, "utf8") > MAX_MESSAGE_BYTES) {
    throw new Error("message exceeds byte limit");
  }
  const message = assertRecord(JSON.parse(text), "message");
  if (maxJsonDepth(message) > MAX_JSON_NESTING_DEPTH) {
    throw new Error("message nesting exceeds limit");
  }
  if (Object.keys(message).length > MAX_TOP_LEVEL_KEYS) {
    throw new Error("message has too many top-level keys");
  }
  assertNoUnknownKeys(message, ["api", "version", "id", "type", "data"], "message");
  if (message.api !== VIVI_VIEWER_API_NAME) {
    throw new Error("invalid api name");
  }
  if (!ACCEPTED_VIEWER_API_VERSIONS.includes(message.version)) {
    throw new Error("invalid api version");
  }
  if (negotiatedVersion && message.version !== negotiatedVersion) {
    throw new Error("api version must match negotiated socket version");
  }
  assertString(message.id, "id", 128);
  assertString(message.type, "type", 128);
  if (!KNOWN_TYPES.has(message.type)) {
    throw new Error("unknown message type");
  }
  validateMessagePayload(message);
  return {
    api: VIVI_VIEWER_API_NAME,
    version: message.version,
    id: message.id,
    type: message.type,
    data: message.data ?? {},
  };
}

module.exports = {
  parseViewerApiMessage,
  requiredScopeAlternativesForMessage,
  requiredScopesForMessage,
  validateInlinePropImage,
};
