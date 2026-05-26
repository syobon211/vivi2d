// Main-process bridge for optional ComfyUI local-provider workflows.
//
// ComfyUI responses and files are treated as untrusted local input. Keep raw
// provider bodies, local paths, and oversized payloads out of UI-visible errors,
// workflow recordings, and saved project data.
const path = require("node:path");
const fs = require("node:fs");
const { httpGet, httpPost } = require("../http-util.cjs");
const {
  assertAllowedPath,
  validateBaseUrl,
  validatePromptId,
  validateComfyPathPart,
  validateComfyType,
} = require("../security.cjs");
const { MAX_COMFYUI_UPLOAD_BYTES, MAX_IMAGE_FILE_BYTES } = require("../ipc-contract.cjs");

const COMFYUI_ALLOW_REMOTE = process.env.VIVI2D_COMFYUI_ALLOW_REMOTE === "1";
const MAX_COMFYUI_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const MAX_COMFYUI_SYSTEM_STATS_BYTES = 256 * 1024;
const MAX_COMFYUI_UPLOAD_RESPONSE_BYTES = 256 * 1024;
const MAX_COMFYUI_ENQUEUE_RESPONSE_BYTES = 256 * 1024;
const MAX_COMFYUI_HISTORY_BYTES = 4 * 1024 * 1024;
const MAX_COMFYUI_NODE_INFO_BYTES = 2 * 1024 * 1024;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(body, label) {
  let parsed;
  try {
    parsed = JSON.parse(body.toString());
  } catch {
    throw new Error(`Invalid ${label}: malformed JSON`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return parsed;
}

function validateUploadImageResponse(body) {
  const data = parseJsonObject(body, "ComfyUI upload response");
  const name = validateComfyPathPart(data.name, "ComfyUI upload name");
  return { name };
}

function validateEnqueueResponse(body) {
  const data = parseJsonObject(body, "ComfyUI enqueue response");
  validatePromptId(data.prompt_id);
  if (typeof data.number !== "number" || !Number.isFinite(data.number)) {
    throw new Error("Invalid ComfyUI enqueue response: number must be finite.");
  }
  return data;
}

function validateHistoryResponse(body, promptId) {
  const data = parseJsonObject(body, "ComfyUI history response");
  const entry = data[promptId];
  if (entry === undefined || entry === null) return null;
  if (!isRecord(entry)) {
    throw new Error("Invalid ComfyUI history response: prompt entry must be an object.");
  }
  return entry;
}

function validateNodeInfoResponse(body, nodeType) {
  const data = parseJsonObject(body, "ComfyUI node info response");
  const entry = data[nodeType];
  if (entry === undefined || entry === null) return null;
  if (!isRecord(entry)) {
    throw new Error("Invalid ComfyUI node info response: node entry must be an object.");
  }
  return entry;
}

function assertDownloadWithinLimit(body) {
  if (body.byteLength > MAX_COMFYUI_DOWNLOAD_BYTES) {
    throw new Error("ComfyUI download is too large.");
  }
}

async function uploadImageBufferToComfy(baseUrl, imageData, filename) {
  if (imageData.byteLength > MAX_COMFYUI_UPLOAD_BYTES) {
    throw new Error("ComfyUI upload image is too large.");
  }
  const safeName = validateComfyPathPart(filename, "filename");
  const boundary = `----vivi2d${Date.now()}`;

  const header = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="${safeName}"\r\n` +
      `Content-Type: image/png\r\n\r\n`,
  );
  const footer = Buffer.from(
    `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n` +
      `--${boundary}--\r\n`,
  );
  const body = Buffer.concat([header, imageData, footer]);

  const res = await httpPost(
    `${baseUrl}/upload/image`,
    body,
    { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    { timeout: 30000, maxBytes: MAX_COMFYUI_UPLOAD_RESPONSE_BYTES },
  );

  if (res.status !== 200) {
    throw new Error(`ComfyUI upload failed with status ${res.status}.`);
  }
  return validateUploadImageResponse(res.body);
}

function register({ handle, allowlists }) {
  handle("comfyui-ping", async (_event, { baseUrl }) => {
    try {
      validateBaseUrl(baseUrl, { allowRemote: COMFYUI_ALLOW_REMOTE });
      const res = await httpGet(`${baseUrl}/system_stats`, {
        timeout: 5000,
        maxBytes: MAX_COMFYUI_SYSTEM_STATS_BYTES,
      });
      return { ok: res.status === 200 };
    } catch {
      return { ok: false };
    }
  });

  handle("comfyui-upload-image", async (_event, { baseUrl, imagePath }) => {
    validateBaseUrl(baseUrl, { allowRemote: COMFYUI_ALLOW_REMOTE });
    const resolved = assertAllowedPath(
      imagePath,
      allowlists.opened,
      "opened by the image selection dialog",
    );
    const stats = fs.statSync(resolved);
    if (stats.size > MAX_IMAGE_FILE_BYTES) {
      throw new Error("Selected image file is too large for ComfyUI upload.");
    }
    const imageData = fs.readFileSync(resolved);
    const filename = path.basename(resolved);
    return uploadImageBufferToComfy(baseUrl, imageData, filename);
  });

  handle("comfyui-upload-image-buffer", async (_event, { baseUrl, data, filename }) => {
    validateBaseUrl(baseUrl, { allowRemote: COMFYUI_ALLOW_REMOTE });
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      throw new Error("Invalid data: ArrayBuffer is required.");
    }
    if (typeof filename !== "string" || filename.length === 0) {
      throw new Error("Invalid filename.");
    }
    const buffer =
      data instanceof ArrayBuffer
        ? Buffer.from(data)
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (buffer.byteLength > MAX_COMFYUI_UPLOAD_BYTES) {
      throw new Error("ComfyUI upload image is too large.");
    }
    return uploadImageBufferToComfy(baseUrl, buffer, filename);
  });

  handle("read-image-file", async (_event, { imagePath }) => {
    const resolved = assertAllowedPath(
      imagePath,
      allowlists.opened,
      "opened by the image selection dialog",
    );
    const stats = fs.statSync(resolved);
    if (stats.size > MAX_IMAGE_FILE_BYTES) {
      throw new Error("Selected image file is too large to read.");
    }
    const data = fs.readFileSync(resolved);
    const copy = new ArrayBuffer(data.byteLength);
    new Uint8Array(copy).set(data);
    return { buffer: copy, filename: path.basename(resolved) };
  });

  handle("comfyui-enqueue", async (_event, { baseUrl, workflow }) => {
    validateBaseUrl(baseUrl, { allowRemote: COMFYUI_ALLOW_REMOTE });
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
      throw new Error("Invalid workflow: expected an object.");
    }
    const body = JSON.stringify({ prompt: workflow, client_id: "vivi2d" });
    const res = await httpPost(
      `${baseUrl}/prompt`,
      body,
      { "Content-Type": "application/json" },
      { timeout: 30000, maxBytes: MAX_COMFYUI_ENQUEUE_RESPONSE_BYTES },
    );
    if (res.status !== 200) {
      throw new Error(`ComfyUI workflow failed with status ${res.status}.`);
    }
    return validateEnqueueResponse(res.body);
  });

  handle("comfyui-history", async (_event, { baseUrl, promptId }) => {
    validateBaseUrl(baseUrl, { allowRemote: COMFYUI_ALLOW_REMOTE });
    validatePromptId(promptId);
    const res = await httpGet(`${baseUrl}/history/${promptId}`, {
      timeout: 10000,
      maxBytes: MAX_COMFYUI_HISTORY_BYTES,
    });
    if (res.status !== 200) return null;
    return validateHistoryResponse(res.body, promptId);
  });

  handle("comfyui-node-info", async (_event, { baseUrl, nodeType }) => {
    validateBaseUrl(baseUrl, { allowRemote: COMFYUI_ALLOW_REMOTE });
    const safeNodeType = validateComfyPathPart(nodeType, "ComfyUI node type");
    const res = await httpGet(
      `${baseUrl}/object_info/${encodeURIComponent(safeNodeType)}`,
      { timeout: 10000, maxBytes: MAX_COMFYUI_NODE_INFO_BYTES },
    );
    if (res.status !== 200) return null;
    return validateNodeInfoResponse(res.body, safeNodeType);
  });

  handle("comfyui-download", async (_event, { baseUrl, filename, subfolder, type }) => {
    validateBaseUrl(baseUrl, { allowRemote: COMFYUI_ALLOW_REMOTE });
    const safeFilename = validateComfyPathPart(filename, "ComfyUI filename");
    const safeSubfolder = validateComfyPathPart(subfolder, "ComfyUI subfolder", {
      allowEmpty: true,
    });
    const safeType = validateComfyType(type);
    const params = new URLSearchParams({
      filename: safeFilename,
      subfolder: safeSubfolder,
      type: safeType,
    });
    const res = await httpGet(`${baseUrl}/view?${params.toString()}`, {
      timeout: 60000,
      maxBytes: MAX_COMFYUI_DOWNLOAD_BYTES,
    });
    if (res.status !== 200) {
      throw new Error(`ComfyUI download failed with status ${res.status}.`);
    }
    assertDownloadWithinLimit(res.body);
    return res.body.buffer.slice(
      res.body.byteOffset,
      res.body.byteOffset + res.body.byteLength,
    );
  });
}

module.exports = {
  MAX_COMFYUI_DOWNLOAD_BYTES,
  MAX_COMFYUI_ENQUEUE_RESPONSE_BYTES,
  MAX_COMFYUI_HISTORY_BYTES,
  MAX_COMFYUI_NODE_INFO_BYTES,
  MAX_COMFYUI_SYSTEM_STATS_BYTES,
  MAX_COMFYUI_UPLOAD_RESPONSE_BYTES,
  assertDownloadWithinLimit,
  register,
  validateEnqueueResponse,
  validateHistoryResponse,
  validateNodeInfoResponse,
  validateUploadImageResponse,
};
