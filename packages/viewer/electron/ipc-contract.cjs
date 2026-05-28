const { VIEWER_API_EVENT_DEFS } = require("./viewer-api-schema.cjs");

const RENDERER_PUBLISHABLE_VIEWER_API_EVENTS = new Set([
  "viewer.action.started",
  "viewer.action.completed",
  "viewer.action.failed",
  "viewer.action.skipped",
  "viewer.signals.changed",
  "viewer.prop.added",
  "viewer.prop.updated",
  "viewer.prop.removed",
  "viewer.calibration.changed",
]);

const NO_ARG_CHANNELS = new Set([
  "toggle-always-on-top",
  "toggle-frame",
  "viewer-api:get-status",
  "viewer-api:list-grants",
  "viewer-api:close-pairing-window",
]);
const ALLOWED_BACKGROUND_MODES = new Set(["transparent", "green", "blue"]);
const ALLOWED_VIEWER_API_PROP_ASSET_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_VIEWER_API_PROP_ASSET_BASE64_LENGTH = 12 * 1024 * 1024;

function assertNoArgs(channel, args) {
  if (args.length !== 0) {
    throw new Error(`Invalid IPC payload for ${channel}: expected no arguments.`);
  }
}

function assertStringArg(channel, args) {
  if (args.length !== 1 || typeof args[0] !== "string") {
    throw new Error(`Invalid IPC payload for ${channel}: expected one string argument.`);
  }
  return args[0];
}

function assertNumberPair(channel, args) {
  if (
    args.length !== 2 ||
    typeof args[0] !== "number" ||
    typeof args[1] !== "number" ||
    !Number.isFinite(args[0]) ||
    !Number.isFinite(args[1])
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: expected two finite numbers.`);
  }
}

function assertObjectArg(channel, args) {
  if (args.length !== 1 || args[0] === null || typeof args[0] !== "object" || Array.isArray(args[0])) {
    throw new Error(`Invalid IPC payload for ${channel}: expected one object argument.`);
  }
  return args[0];
}

function assertOnlyKeys(payload, channel, allowedKeys) {
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Invalid IPC payload for ${channel}: unknown field ${key}.`);
    }
  }
}

function validateViewerApiSetEnabled(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["enabled", "port"]));
  if (typeof payload.enabled !== "boolean") {
    throw new Error(`Invalid IPC payload for ${channel}: enabled must be boolean.`);
  }
  if (
    payload.port !== undefined &&
    (!Number.isInteger(payload.port) || payload.port < 1024 || payload.port > 65535)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: port is invalid.`);
  }
}

function validateViewerApiOpenPairing(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["durationMs", "origins"]));
  if (
    payload.durationMs !== undefined &&
    (!Number.isInteger(payload.durationMs) ||
      payload.durationMs < 1000 ||
      payload.durationMs > 300000)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: durationMs is invalid.`);
  }
  if (
    payload.origins !== undefined &&
    (!Array.isArray(payload.origins) ||
      payload.origins.length > 16 ||
      payload.origins.some(
        (origin) =>
          typeof origin !== "string" ||
          origin.length === 0 ||
          origin.length > 2048,
      ))
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: origins is invalid.`);
  }
}

function validateViewerApiGrantId(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["grantId"]));
  if (typeof payload.grantId !== "string" || payload.grantId.length === 0 || payload.grantId.length > 256) {
    throw new Error(`Invalid IPC payload for ${channel}: grantId is invalid.`);
  }
}

function validateViewerApiAssetId(channel, payload) {
  if (
    typeof payload.assetId !== "string" ||
    !payload.assetId.startsWith("vpa_") ||
    payload.assetId.length > 256
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: assetId is invalid.`);
  }
}

function validateViewerApiCreatePropAsset(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(
    payload,
    channel,
    new Set(["grantId", "displayName", "mimeType", "bytesBase64"]),
  );
  if (typeof payload.grantId !== "string" || payload.grantId.length === 0 || payload.grantId.length > 256) {
    throw new Error(`Invalid IPC payload for ${channel}: grantId is invalid.`);
  }
  if (
    payload.displayName !== undefined &&
    (typeof payload.displayName !== "string" || payload.displayName.length > 256)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: displayName is invalid.`);
  }
  if (
    typeof payload.mimeType !== "string" ||
    !ALLOWED_VIEWER_API_PROP_ASSET_MIME_TYPES.has(payload.mimeType)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: mimeType is invalid.`);
  }
  if (
    typeof payload.bytesBase64 !== "string" ||
    payload.bytesBase64.length === 0 ||
    payload.bytesBase64.length > MAX_VIEWER_API_PROP_ASSET_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.bytesBase64)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: bytesBase64 is invalid.`);
  }
}

function validateViewerApiPropAssetRef(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["grantId", "assetId"]));
  if (typeof payload.grantId !== "string" || payload.grantId.length === 0 || payload.grantId.length > 256) {
    throw new Error(`Invalid IPC payload for ${channel}: grantId is invalid.`);
  }
  validateViewerApiAssetId(channel, payload);
}

function validateViewerApiChallengeApproval(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["challengeId", "code"]));
  if (
    typeof payload.challengeId !== "string" ||
    payload.challengeId.length === 0 ||
    payload.challengeId.length > 256
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: challengeId is invalid.`);
  }
  if (typeof payload.code !== "string" || !/^[0-9]{6}$/.test(payload.code)) {
    throw new Error(`Invalid IPC payload for ${channel}: code is invalid.`);
  }
}

function validateViewerApiPublishEvent(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["name", "timestamp", "data"]));
  if (
    typeof payload.name !== "string" ||
    !VIEWER_API_EVENT_DEFS[payload.name] ||
    !RENDERER_PUBLISHABLE_VIEWER_API_EVENTS.has(payload.name)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: event name is invalid.`);
  }
  if (
    payload.timestamp !== undefined &&
    (typeof payload.timestamp !== "number" || !Number.isFinite(payload.timestamp))
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: timestamp is invalid.`);
  }
  if (
    payload.data === null ||
    typeof payload.data !== "object" ||
    Array.isArray(payload.data)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: data must be an object.`);
  }
  if (Buffer.byteLength(JSON.stringify(payload.data), "utf8") > 16 * 1024) {
    throw new Error(`Invalid IPC payload for ${channel}: data exceeds limit.`);
  }
}

function validateViewerApiRendererResponse(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["requestId", "ok", "reason", "data"]));
  if (
    typeof payload.requestId !== "string" ||
    payload.requestId.length === 0 ||
    payload.requestId.length > 128
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: requestId is invalid.`);
  }
  if (typeof payload.ok !== "boolean") {
    throw new Error(`Invalid IPC payload for ${channel}: ok must be boolean.`);
  }
  if (
    payload.reason !== undefined &&
    (typeof payload.reason !== "string" || payload.reason.length > 256)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: reason is invalid.`);
  }
  if (
    payload.data === null ||
    typeof payload.data !== "object" ||
    Array.isArray(payload.data)
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: data must be an object.`);
  }
  if (Buffer.byteLength(JSON.stringify(payload.data), "utf8") > 48 * 1024) {
    throw new Error(`Invalid IPC payload for ${channel}: data exceeds limit.`);
  }
}

function validateBackgroundMode(channel, args) {
  const mode = assertStringArg(channel, args);
  if (!ALLOWED_BACKGROUND_MODES.has(mode)) {
    throw new Error(`Invalid IPC payload for ${channel}: unsupported background mode.`);
  }
}

function validateIpcArgs(channel, args) {
  if (NO_ARG_CHANNELS.has(channel)) {
    assertNoArgs(channel, args);
    return;
  }
  if (channel === "set-background-mode") {
    validateBackgroundMode(channel, args);
    return;
  }
  if (channel === "set-window-size") {
    assertNumberPair(channel, args);
    return;
  }
  if (channel === "viewer-api:set-enabled") {
    validateViewerApiSetEnabled(channel, args);
    return;
  }
  if (channel === "viewer-api:open-pairing-window") {
    validateViewerApiOpenPairing(channel, args);
    return;
  }
  if (channel === "viewer-api:revoke-grant") {
    validateViewerApiGrantId(channel, args);
    return;
  }
  if (channel === "viewer-api:rotate-grant") {
    validateViewerApiGrantId(channel, args);
    return;
  }
  if (channel === "viewer-api:create-prop-asset") {
    validateViewerApiCreatePropAsset(channel, args);
    return;
  }
  if (channel === "viewer-api:list-prop-assets") {
    validateViewerApiGrantId(channel, args);
    return;
  }
  if (
    channel === "viewer-api:extend-prop-asset" ||
    channel === "viewer-api:revoke-prop-asset"
  ) {
    validateViewerApiPropAssetRef(channel, args);
    return;
  }
  if (channel === "viewer-api:approve-pairing") {
    validateViewerApiChallengeApproval(channel, args);
    return;
  }
  if (channel === "viewer-api:publish-event") {
    validateViewerApiPublishEvent(channel, args);
    return;
  }
  if (channel === "viewer-api:renderer-response") {
    validateViewerApiRendererResponse(channel, args);
    return;
  }
  throw new Error(`Invalid IPC channel: ${channel} has no payload contract.`);
}

function hasIpcContract(channel) {
  return (
    NO_ARG_CHANNELS.has(channel) ||
    channel === "set-background-mode" ||
    channel === "set-window-size" ||
    channel === "viewer-api:set-enabled" ||
    channel === "viewer-api:open-pairing-window" ||
    channel === "viewer-api:revoke-grant" ||
    channel === "viewer-api:rotate-grant" ||
    channel === "viewer-api:create-prop-asset" ||
    channel === "viewer-api:list-prop-assets" ||
    channel === "viewer-api:extend-prop-asset" ||
    channel === "viewer-api:revoke-prop-asset" ||
    channel === "viewer-api:approve-pairing" ||
    channel === "viewer-api:publish-event" ||
    channel === "viewer-api:renderer-response"
  );
}

function listIpcChannels() {
  return [
    ...NO_ARG_CHANNELS,
    "set-background-mode",
    "set-window-size",
    "viewer-api:set-enabled",
    "viewer-api:open-pairing-window",
    "viewer-api:revoke-grant",
    "viewer-api:rotate-grant",
    "viewer-api:create-prop-asset",
    "viewer-api:list-prop-assets",
    "viewer-api:extend-prop-asset",
    "viewer-api:revoke-prop-asset",
    "viewer-api:approve-pairing",
    "viewer-api:publish-event",
    "viewer-api:renderer-response",
  ].sort();
}

module.exports = {
  hasIpcContract,
  listIpcChannels,
  validateIpcArgs,
};
