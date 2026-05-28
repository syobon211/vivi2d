const {
  DEFAULT_PRE_NEGOTIATION_VIEWER_API_VERSION,
  VIEWER_API_REQUEST_DEFS,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION_EXPERIMENTAL,
  VIVI_VIEWER_API_VERSION_PREVIEW,
  isPreviewViewerApiVersion: isPreviewVersion,
} = require("./viewer-api-schema.cjs");

function extractMessageId(raw) {
  try {
    const text = typeof raw === "string" ? raw : raw?.toString?.("utf8");
    const parsed = JSON.parse(text);
    return typeof parsed?.id === "string" && parsed.id.length <= 128
      ? parsed.id
      : undefined;
  } catch {
    return undefined;
  }
}

function extractSafeMessageContext(raw, negotiatedVersion) {
  try {
    const text = typeof raw === "string" ? raw : raw?.toString?.("utf8");
    const parsed = JSON.parse(text);
    const id = typeof parsed?.id === "string" && parsed.id.length <= 128
      ? parsed.id
      : undefined;
    const fallbackVersion =
      negotiatedVersion ?? DEFAULT_PRE_NEGOTIATION_VIEWER_API_VERSION;
    if (parsed?.api !== VIVI_VIEWER_API_NAME) {
      return { id, version: fallbackVersion, associated: false };
    }
    const version =
      parsed.version === VIVI_VIEWER_API_VERSION_EXPERIMENTAL ||
      parsed.version === VIVI_VIEWER_API_VERSION_PREVIEW
        ? parsed.version
        : fallbackVersion;
    if (negotiatedVersion && version !== negotiatedVersion) {
      return { id, version: negotiatedVersion, associated: false };
    }
    const type =
      typeof parsed?.type === "string" && parsed.type.length <= 128
        ? parsed.type
        : undefined;
    const associated = Boolean(type && VIEWER_API_REQUEST_DEFS[type] && id);
    return { id, type, version, associated };
  } catch {
    return {
      id: undefined,
      version: negotiatedVersion ?? DEFAULT_PRE_NEGOTIATION_VIEWER_API_VERSION,
      associated: false,
    };
  }
}

function responseTypeFor(message, fallbackType = "viewer.error") {
  if (!message || !isPreviewVersion(message.version)) return fallbackType;
  return `${message.type}.result`;
}

module.exports = {
  extractMessageId,
  extractSafeMessageContext,
  responseTypeFor,
};
