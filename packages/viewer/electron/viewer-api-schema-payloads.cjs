const {
  ACTION_KIND_SET,
  ALLOWED_SCOPES,
  MAX_CALIBRATION_CHANNELS,
  MAX_CALIBRATION_PROFILES,
  MAX_FILE_PICKER_PROP_BYTES,
  MAX_INLINE_PROP_BYTES,
  MAX_MESSAGE_BYTES,
  PUBLIC_PROP_MIME_TYPES,
  READ_TYPES,
  RESERVED_CALIBRATION_CHANNEL_ID_SEGMENTS,
  RESERVED_PUBLIC_ACTION_KINDS,
  VIEWER_API_EVENT_NAMES,
  VIEWER_API_SUBSCRIBABLE_EVENT_NAMES,
} = require("./viewer-api-schema-constants.cjs");
const { validateInlinePropImage } = require("./viewer-api-schema-image.cjs");
const {
  assertBoolean,
  assertBoundedNumber,
  assertFiniteNumber,
  assertNoUnknownKeys,
  assertRecord,
  assertString,
} = require("./viewer-api-schema-assertions.cjs");

function isSafeCalibrationChannelId(channelId) {
  return !channelId
    .split(".")
    .some((segment) => RESERVED_CALIBRATION_CHANNEL_ID_SEGMENTS.has(segment));
}

function assertScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > 16) {
    throw new Error("scopes must be a non-empty array");
  }
  return scopes.map((scope, index) => {
    const value = assertString(scope, `scopes[${index}]`, 64);
    if (!ALLOWED_SCOPES.has(value)) {
      throw new Error(`unsupported scope: ${value}`);
    }
    return value;
  });
}

function validateParameterPatch(data) {
  const values = assertRecord(data.values, "data.values");
  const entries = Object.entries(values);
  if (entries.length > 128) {
    throw new Error("data.values has too many entries");
  }
  for (const [id, value] of entries) {
    assertString(id, "parameter id", 256);
    assertFiniteNumber(value, `data.values.${id}`);
  }
}

function validatePropLoad(data) {
  if (data.name !== undefined) {
    assertString(data.name, "data.name", 256);
  }
  validatePropPatchFields(data);
  const source = assertRecord(data.source, "data.source");
  const kind = assertString(source.kind, "data.source.kind", 64);
  if (kind === "inlineBase64") {
    assertNoUnknownKeys(source, ["kind", "mimeType", "bytes"], "data.source");
    const mimeType = assertString(source.mimeType, "data.source.mimeType", 128);
    if (!PUBLIC_PROP_MIME_TYPES.has(mimeType)) {
      throw new Error("unsupported inline prop MIME type");
    }
    const bytes = assertString(source.bytes, "data.source.bytes", MAX_MESSAGE_BYTES);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(bytes)) {
      throw new Error("inline prop bytes must be base64");
    }
    if (bytes.length === 0) {
      throw new Error("inline prop bytes must not be empty");
    }
    const padding = bytes.endsWith("==") ? 2 : bytes.endsWith("=") ? 1 : 0;
    const decodedBytes = (bytes.length / 4) * 3 - padding;
    if (decodedBytes <= 0) {
      throw new Error("inline prop bytes must not be empty");
    }
    if (decodedBytes > MAX_INLINE_PROP_BYTES) {
      throw new Error("inline prop bytes exceed limit");
    }
    validateInlinePropImage(Buffer.from(bytes, "base64"), mimeType);
    return;
  }
  if (kind === "filePickerAsset") {
    assertNoUnknownKeys(source, ["kind", "assetId", "mimeType", "bytes"], "data.source");
    assertString(source.assetId, "data.source.assetId", 256);
    const mimeType = assertString(source.mimeType, "data.source.mimeType", 128);
    if (!PUBLIC_PROP_MIME_TYPES.has(mimeType)) {
      throw new Error("unsupported file-picker prop MIME type");
    }
    const bytes = assertFiniteNumber(source.bytes, "data.source.bytes");
    if (!Number.isInteger(bytes) || bytes < 0 || bytes > MAX_FILE_PICKER_PROP_BYTES) {
      throw new Error("file-picker prop bytes exceed limit");
    }
    return;
  }
  throw new Error("unsupported prop source kind");
}

function validateActionRun(data) {
  // The API selects a stored viewer action by ID/kind. The resolved action
  // payload is validated by the TypeScript action schemas in the renderer.
  assertString(data.actionId, "data.actionId", 256);
  const actionKind = assertString(data.actionKind, "data.actionKind", 64);
  if (!ACTION_KIND_SET.has(actionKind)) {
    throw new Error("unsupported action kind");
  }
  if (RESERVED_PUBLIC_ACTION_KINDS.has(actionKind)) {
    throw new Error("reserved action kind is unsupported");
  }
}

function validateStringIdList(value, label) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 64) {
    throw new Error(`${label} must be an array with at most 64 entries`);
  }
  for (const item of value) {
    assertString(item, `${label} entry`, 256);
  }
}

function validateEventFilter(value) {
  if (value === undefined) return;
  const filter = assertRecord(value, "event.filter");
  assertNoUnknownKeys(filter, [
    "signalIds",
    "propIds",
    "actionIds",
    "minIntervalMs",
  ], "event.filter");
  validateStringIdList(filter.signalIds, "event.filter.signalIds");
  validateStringIdList(filter.propIds, "event.filter.propIds");
  validateStringIdList(filter.actionIds, "event.filter.actionIds");
  if (filter.minIntervalMs !== undefined) {
    assertBoundedNumber(filter.minIntervalMs, "event.filter.minIntervalMs", 17, 60000);
  }
}

function validateEventSubscription(data, { allowedModes = ["replace", "add", "remove", "clear"] } = {}) {
  const mode = data.mode ?? "replace";
  if (!allowedModes.includes(mode)) {
    throw new Error("unsupported subscription mode");
  }
  if (mode === "clear") {
    if (data.events !== undefined && (!Array.isArray(data.events) || data.events.length > 0)) {
      throw new Error("events must be omitted for clear mode");
    }
    return;
  }
  if (!Array.isArray(data.events) || data.events.length === 0 || data.events.length > 32) {
    throw new Error("events must be a non-empty array with at most 32 entries");
  }
  for (const item of data.events) {
    const event = assertRecord(item, "event");
    assertNoUnknownKeys(event, ["name", "filter"], "event");
    const name = assertString(event.name, "event.name", 128);
    if (!VIEWER_API_EVENT_NAMES.has(name) || !VIEWER_API_SUBSCRIBABLE_EVENT_NAMES.has(name)) {
      throw new Error("unknown event name");
    }
    validateEventFilter(event.filter);
  }
}

function validateExpressionApply(data) {
  assertString(data.presetId, "data.presetId", 256);
}

function validateModelTransform(data) {
  if (data.x !== undefined) assertBoundedNumber(data.x, "data.x", -100000, 100000);
  if (data.y !== undefined) assertBoundedNumber(data.y, "data.y", -100000, 100000);
  if (data.scale !== undefined) assertBoundedNumber(data.scale, "data.scale", 0.01, 100);
  if (data.rotation !== undefined) assertBoundedNumber(data.rotation, "data.rotation", -3600, 3600);
}

function validatePropPatchFields(data) {
  if (data.visible !== undefined && typeof data.visible !== "boolean") {
    throw new Error("data.visible must be boolean");
  }
  if (data.groupId !== undefined && data.groupId !== null) {
    assertString(data.groupId, "data.groupId", 256);
  }
  if (data.transform !== undefined) {
    const transform = assertRecord(data.transform, "data.transform");
    assertNoUnknownKeys(transform, [
      "x",
      "y",
      "scaleX",
      "scaleY",
      "rotation",
      "opacity",
    ], "data.transform");
    if (transform.x !== undefined) assertBoundedNumber(transform.x, "data.transform.x", -100000, 100000);
    if (transform.y !== undefined) assertBoundedNumber(transform.y, "data.transform.y", -100000, 100000);
    if (transform.scaleX !== undefined) assertBoundedNumber(transform.scaleX, "data.transform.scaleX", 0.01, 100);
    if (transform.scaleY !== undefined) assertBoundedNumber(transform.scaleY, "data.transform.scaleY", 0.01, 100);
    if (transform.rotation !== undefined) assertBoundedNumber(transform.rotation, "data.transform.rotation", -36000, 36000);
    if (transform.opacity !== undefined) assertBoundedNumber(transform.opacity, "data.transform.opacity", 0, 1);
  }
  if (data.anchor !== undefined && data.anchor !== null) {
    const anchor = assertRecord(data.anchor, "data.anchor");
    assertNoUnknownKeys(anchor, ["kind"], "data.anchor");
    const kind = assertString(anchor.kind, "data.anchor.kind", 32);
    if (kind !== "screen" && kind !== "modelRoot") {
      throw new Error("unsupported prop anchor kind");
    }
  }
}

function validatePropUpdate(data) {
  assertString(data.propId, "data.propId", 256);
  validatePropPatchFields(data);
}

function validatePropRemove(data) {
  assertString(data.propId, "data.propId", 256);
}

function validatePropGroupCycle(data) {
  assertString(data.groupId, "data.groupId", 256);
  if (
    data.direction !== undefined &&
    data.direction !== "next" &&
    data.direction !== "previous"
  ) {
    throw new Error("unsupported prop group direction");
  }
}

function validateCalibrationChannel(channel, label) {
  const item = assertRecord(channel, label);
  assertNoUnknownKeys(item, [
    "enabled",
    "inputMin",
    "inputMax",
    "outputMin",
    "outputMax",
    "neutral",
    "deadzone",
    "smoothing",
    "invert",
    "curve",
  ], label);
  assertBoolean(item.enabled, `${label}.enabled`);
  assertBoundedNumber(item.inputMin, `${label}.inputMin`, -100, 100);
  assertBoundedNumber(item.inputMax, `${label}.inputMax`, -100, 100);
  if (item.inputMin >= item.inputMax) throw new Error(`${label}.input range must be increasing`);
  assertBoundedNumber(item.outputMin, `${label}.outputMin`, -100, 100);
  assertBoundedNumber(item.outputMax, `${label}.outputMax`, -100, 100);
  if (item.outputMin >= item.outputMax) throw new Error(`${label}.output range must be increasing`);
  assertBoundedNumber(item.neutral, `${label}.neutral`, -100, 100);
  assertBoundedNumber(item.deadzone, `${label}.deadzone`, 0, 10);
  assertBoundedNumber(item.smoothing, `${label}.smoothing`, 0, 0.99);
  assertBoolean(item.invert, `${label}.invert`);
  const curve = assertString(item.curve, `${label}.curve`, 32);
  if (!["linear", "easeIn", "easeOut", "easeInOut", "step"].includes(curve)) {
    throw new Error(`${label}.curve is unsupported`);
  }
}

function validateCalibrationProfile(profile, label = "data.profile") {
  const item = assertRecord(profile, label);
  assertNoUnknownKeys(item, ["version", "id", "name", "channels"], label);
  if (item.version !== 1) throw new Error(`${label}.version must be 1`);
  assertString(item.id, `${label}.id`, 256);
  if (!isSafeCalibrationChannelId(item.id)) {
    throw new Error(`${label}.id is reserved`);
  }
  assertString(item.name, `${label}.name`, 256);
  const channels = assertRecord(item.channels, `${label}.channels`);
  const entries = Object.entries(channels);
  if (entries.length > MAX_CALIBRATION_CHANNELS) throw new Error(`${label}.channels has too many entries`);
  for (const [channelId, channel] of entries) {
    assertString(channelId, `${label}.channelId`, 256);
    if (!isSafeCalibrationChannelId(channelId)) {
      throw new Error(`${label}.channelId is reserved`);
    }
    validateCalibrationChannel(channel, `${label}.channels.${channelId}`);
  }
}

function validateCalibrationSet(data) {
  if (data.profileId !== undefined) {
    const profileId = assertString(data.profileId, "data.profileId", 256);
    if (!isSafeCalibrationChannelId(profileId)) {
      throw new Error("data.profileId is reserved");
    }
  }
  if (data.profile === undefined && data.profiles === undefined) {
    throw new Error("calibration.set requires profile or profiles");
  }
  if (data.profile !== undefined && data.profiles !== undefined) {
    throw new Error("profile and profiles are mutually exclusive");
  }
  if (data.profile !== undefined) validateCalibrationProfile(data.profile);
  if (data.profiles !== undefined) {
    if (!Array.isArray(data.profiles) || data.profiles.length > MAX_CALIBRATION_PROFILES) {
      throw new Error("data.profiles must be a bounded array");
    }
    data.profiles.forEach((profile, index) => validateCalibrationProfile(profile, `data.profiles[${index}]`));
  }
}

function validateCalibrationProfileApply(data) {
  const profileId = assertString(data.profileId, "data.profileId", 256);
  if (!isSafeCalibrationChannelId(profileId)) {
    throw new Error("data.profileId is reserved");
  }
  if (data.profile !== undefined || data.profiles !== undefined) {
    throw new Error("calibration profile apply does not accept profile data");
  }
}

function validateMessagePayload(message) {
  const data = message.data ?? {};
  assertRecord(data, "data");
  if (READ_TYPES.has(message.type)) {
    assertNoUnknownKeys(data, []);
    return;
  }
  switch (message.type) {
    case "viewer.auth.challenge":
      assertNoUnknownKeys(data, ["appName", "scopes"]);
      assertString(data.appName, "data.appName", 64);
      assertScopes(data.scopes);
      break;
    case "viewer.auth.authenticate":
      assertNoUnknownKeys(data, ["token"]);
      assertString(data.token, "data.token", 256);
      break;
    case "viewer.events.subscribe":
      assertNoUnknownKeys(data, ["events", "mode"]);
      validateEventSubscription(data);
      break;
    case "viewer.events.unsubscribe":
      assertNoUnknownKeys(data, ["events", "mode"]);
      validateEventSubscription({
        ...data,
        mode: data.mode ?? "remove",
      }, {
        allowedModes: ["remove", "clear"],
      });
      break;
    case "viewer.signals.set":
      assertNoUnknownKeys(data, ["values"]);
      validateParameterPatch(data);
      break;
    case "viewer.action.run":
      assertNoUnknownKeys(data, ["actionId", "actionKind"]);
      validateActionRun(data);
      break;
    case "viewer.expression.apply":
      assertNoUnknownKeys(data, ["presetId"]);
      validateExpressionApply(data);
      break;
    case "viewer.model.transform":
      assertNoUnknownKeys(data, ["x", "y", "scale", "rotation"]);
      validateModelTransform(data);
      break;
    case "viewer.prop.load":
      assertNoUnknownKeys(data, [
        "source",
        "name",
        "transform",
        "visible",
        "groupId",
        "anchor",
      ]);
      validatePropLoad(data);
      break;
    case "viewer.prop.update":
      assertNoUnknownKeys(data, [
        "propId",
        "transform",
        "visible",
        "groupId",
        "anchor",
      ]);
      validatePropUpdate(data);
      break;
    case "viewer.prop.remove":
      assertNoUnknownKeys(data, ["propId"]);
      validatePropRemove(data);
      break;
    case "viewer.prop.group.cycle":
      assertNoUnknownKeys(data, ["groupId", "direction"]);
      validatePropGroupCycle(data);
      break;
    case "viewer.calibration.set":
      assertNoUnknownKeys(data, ["profileId", "profile", "profiles"]);
      validateCalibrationSet(data);
      break;
    case "viewer.calibration.profile.apply":
      assertNoUnknownKeys(data, ["profileId"]);
      validateCalibrationProfileApply(data);
      break;
  }
}

module.exports = {
  validateMessagePayload,
};
