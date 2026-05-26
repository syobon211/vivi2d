// IPC contracts are the main-process privilege boundary. Every channel must
// fail closed on unknown channels, unknown fields, and oversized payloads so a
// compromised renderer cannot turn convenience IPC into arbitrary file or
// local-provider access.
const NO_ARG_CHANNELS = new Set([
  "open-psd-file",
  "open-vivi-file",
  "open-vivid-file",
  "select-export-directory",
  "open-image-file",
  "open-png-file",
  "open-png-files",
  "open-png-folder",
  "open-audio-file",
]);

const MAX_IMAGE_FILE_BYTES = 128 * 1024 * 1024;
const MAX_COMFYUI_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_SAVE_BINARY_BYTES = 512 * 1024 * 1024;
const MAX_SAVE_TEXT_BYTES = 128 * 1024 * 1024;
const MAX_EXPORT_FILES = 512;
const MAX_EXPORT_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_EXPORT_SINGLE_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_COMFYUI_WORKFLOW_BYTES = 2 * 1024 * 1024;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBinaryPayload(value) {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function assertNoArgs(channel, args) {
  if (args.length !== 0) {
    throw new Error(`Invalid IPC payload for ${channel}: expected no arguments.`);
  }
}

function assertObjectArg(channel, args) {
  if (args.length !== 1 || !isRecord(args[0])) {
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

function binaryByteLength(value) {
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

function assertMaxBytes(byteLength, channel, field, maxBytes) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > maxBytes) {
    throw new Error(`Invalid IPC payload for ${channel}: ${field} exceeds byte limit.`);
  }
}

function assertString(
  value,
  channel,
  field,
  { optional = false, allowEmpty = false } = {},
) {
  if (value === undefined || value === null) {
    if (optional) return;
    throw new Error(`Invalid IPC payload for ${channel}: ${field} is required.`);
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid IPC payload for ${channel}: ${field} must be a string.`);
  }
  if (!allowEmpty && value.length === 0) {
    throw new Error(`Invalid IPC payload for ${channel}: ${field} must not be empty.`);
  }
}

function assertBoolean(value, channel, field, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return;
    throw new Error(`Invalid IPC payload for ${channel}: ${field} is required.`);
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid IPC payload for ${channel}: ${field} must be a boolean.`);
  }
}

function assertBinary(value, channel, field, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return;
    throw new Error(`Invalid IPC payload for ${channel}: ${field} is required.`);
  }
  if (!isBinaryPayload(value)) {
    throw new Error(`Invalid IPC payload for ${channel}: ${field} must be binary data.`);
  }
}

function validateSaveFile(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["data", "binary", "defaultName", "filePath"]));
  assertString(payload.data, channel, "data", { optional: true, allowEmpty: true });
  assertBinary(payload.binary, channel, "binary", { optional: true });
  assertString(payload.defaultName, channel, "defaultName");
  assertString(payload.filePath, channel, "filePath", { optional: true });
  if (payload.data === undefined && payload.binary === undefined) {
    throw new Error(`Invalid IPC payload for ${channel}: data or binary is required.`);
  }
  if (payload.data !== undefined) {
    assertMaxBytes(Buffer.byteLength(payload.data, "utf8"), channel, "data", MAX_SAVE_TEXT_BYTES);
  }
  if (payload.binary !== undefined) {
    assertMaxBytes(binaryByteLength(payload.binary), channel, "binary", MAX_SAVE_BINARY_BYTES);
  }
}

function validateSaveVividFile(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["binary", "defaultName"]));
  assertBinary(payload.binary, channel, "binary");
  assertString(payload.defaultName, channel, "defaultName");
  assertMaxBytes(binaryByteLength(payload.binary), channel, "binary", MAX_SAVE_BINARY_BYTES);
}

function validateReadAudioFile(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["audioPath"]));
  assertString(payload.audioPath, channel, "audioPath");
}

function validateReadImageFile(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["imagePath"]));
  assertString(payload.imagePath, channel, "imagePath");
}

function validateWriteExportFiles(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertOnlyKeys(payload, channel, new Set(["dirPath", "files"]));
  assertString(payload.dirPath, channel, "dirPath");
  if (!Array.isArray(payload.files)) {
    throw new Error(`Invalid IPC payload for ${channel}: files must be an array.`);
  }
  if (payload.files.length > MAX_EXPORT_FILES) {
    throw new Error(`Invalid IPC payload for ${channel}: files exceeds count limit.`);
  }
  let totalBytes = 0;
  for (const [index, file] of payload.files.entries()) {
    if (!isRecord(file)) {
      throw new Error(
        `Invalid IPC payload for ${channel}: files[${index}] must be an object.`,
      );
    }
    assertOnlyKeys(
      file,
      channel,
      new Set(["path", "content", "isBlob"]),
    );
    assertString(file.path, channel, `files[${index}].path`);
    assertString(file.content, channel, `files[${index}].content`, { allowEmpty: true });
    assertBoolean(file.isBlob, channel, `files[${index}].isBlob`, { optional: true });
    const contentBytes = Buffer.byteLength(file.content, "utf8");
    if (!file.isBlob) {
      assertMaxBytes(
        contentBytes,
        channel,
        `files[${index}].content`,
        MAX_EXPORT_SINGLE_TEXT_BYTES,
      );
    }
    totalBytes += contentBytes;
    assertMaxBytes(totalBytes, channel, "files total", MAX_EXPORT_TOTAL_BYTES);
  }
}

function validateComfyBase(channel, args) {
  const payload = assertObjectArg(channel, args);
  assertString(payload.baseUrl, channel, "baseUrl");
  return payload;
}

function validateComfyPing(channel, args) {
  const payload = validateComfyBase(channel, args);
  assertOnlyKeys(payload, channel, new Set(["baseUrl"]));
}

function validateComfyUploadImage(channel, args) {
  const payload = validateComfyBase(channel, args);
  assertOnlyKeys(payload, channel, new Set(["baseUrl", "imagePath"]));
  assertString(payload.imagePath, channel, "imagePath");
}

function validateComfyUploadImageBuffer(channel, args) {
  const payload = validateComfyBase(channel, args);
  assertOnlyKeys(payload, channel, new Set(["baseUrl", "data", "filename"]));
  assertBinary(payload.data, channel, "data");
  assertString(payload.filename, channel, "filename");
  assertMaxBytes(binaryByteLength(payload.data), channel, "data", MAX_COMFYUI_UPLOAD_BYTES);
}

function validateComfyEnqueue(channel, args) {
  const payload = validateComfyBase(channel, args);
  assertOnlyKeys(payload, channel, new Set(["baseUrl", "workflow"]));
  if (!isRecord(payload.workflow)) {
    throw new Error(`Invalid IPC payload for ${channel}: workflow must be an object.`);
  }
  assertMaxBytes(
    Buffer.byteLength(JSON.stringify(payload.workflow), "utf8"),
    channel,
    "workflow",
    MAX_COMFYUI_WORKFLOW_BYTES,
  );
}

function validateComfyHistory(channel, args) {
  const payload = validateComfyBase(channel, args);
  assertOnlyKeys(payload, channel, new Set(["baseUrl", "promptId"]));
  assertString(payload.promptId, channel, "promptId");
}

function validateComfyNodeInfo(channel, args) {
  const payload = validateComfyBase(channel, args);
  assertOnlyKeys(payload, channel, new Set(["baseUrl", "nodeType"]));
  assertString(payload.nodeType, channel, "nodeType");
}

function validateComfyDownload(channel, args) {
  const payload = validateComfyBase(channel, args);
  assertOnlyKeys(payload, channel, new Set(["baseUrl", "filename", "subfolder", "type"]));
  assertString(payload.filename, channel, "filename");
  assertString(payload.subfolder, channel, "subfolder", {
    optional: true,
    allowEmpty: true,
  });
  assertString(payload.type, channel, "type", { optional: true });
}

const OBJECT_ARG_CONTRACTS = new Map([
  ["save-file", validateSaveFile],
  ["save-vivid-file", validateSaveVividFile],
  ["write-export-files", validateWriteExportFiles],
  ["read-audio-file", validateReadAudioFile],
  ["read-image-file", validateReadImageFile],
  ["comfyui-ping", validateComfyPing],
  ["comfyui-upload-image", validateComfyUploadImage],
  ["comfyui-upload-image-buffer", validateComfyUploadImageBuffer],
  ["comfyui-enqueue", validateComfyEnqueue],
  ["comfyui-history", validateComfyHistory],
  ["comfyui-node-info", validateComfyNodeInfo],
  ["comfyui-download", validateComfyDownload],
]);

function hasIpcContract(channel) {
  return NO_ARG_CHANNELS.has(channel) || OBJECT_ARG_CONTRACTS.has(channel);
}

function listIpcChannels() {
  return [...NO_ARG_CHANNELS, ...OBJECT_ARG_CONTRACTS.keys()].sort();
}

function validateIpcArgs(channel, args) {
  if (NO_ARG_CHANNELS.has(channel)) {
    assertNoArgs(channel, args);
    return;
  }
  const validator = OBJECT_ARG_CONTRACTS.get(channel);
  if (!validator) {
    throw new Error(`Invalid IPC channel: ${channel} has no payload contract.`);
  }
  validator(channel, args);
}

module.exports = {
  MAX_COMFYUI_UPLOAD_BYTES,
  MAX_EXPORT_FILES,
  MAX_EXPORT_TOTAL_BYTES,
  MAX_IMAGE_FILE_BYTES,
  MAX_SAVE_BINARY_BYTES,
  MAX_SAVE_TEXT_BYTES,
  hasIpcContract,
  listIpcChannels,
  validateIpcArgs,
};
