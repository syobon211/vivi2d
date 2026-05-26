const {
  ALLOWED_SCOPES,
  VIEWER_API_ERROR_ALIASES,
  VIEWER_API_ERROR_CATALOG,
  VIEWER_API_ERROR_CODES,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
  VIVI_VIEWER_API_VERSION_PREVIEW,
} = require("./viewer-api-schema-constants.cjs");
const { isRecord } = require("./viewer-api-schema-utils.cjs");

function sanitizeErrorDetails(code, details) {
  if (!isRecord(details)) return undefined;
  const output = {};
  if (code === "invalid_request") {
    if (typeof details.field === "string" && details.field.length <= 256) {
      output.field = details.field;
    }
    if (["unknown_field", "type", "range", "format"].includes(details.reason)) {
      output.reason = details.reason;
    }
  } else if (code === "scope_denied") {
    if (Array.isArray(details.requiredScopes)) {
      const scopes = [...new Set(
        details.requiredScopes.filter((scope) => ALLOWED_SCOPES.has(scope)),
      )].sort().slice(0, 16);
      if (scopes.length > 0) output.requiredScopes = scopes;
    }
  } else if (code === "rate_limited") {
    if (
      Number.isInteger(details.retryAfterMs) &&
      details.retryAfterMs >= 0 &&
      details.retryAfterMs <= 60000
    ) {
      output.retryAfterMs = details.retryAfterMs;
    }
    if (
      ["origin", "no-origin", "global", "connection", "grant", "peer"].includes(
        details.bucket,
      )
    ) {
      output.bucket = details.bucket;
    }
  } else if (code === "payload_too_large") {
    if (
      Number.isInteger(details.limitBytes) &&
      details.limitBytes >= 0 &&
      details.limitBytes <= Number.MAX_SAFE_INTEGER
    ) {
      output.limitBytes = details.limitBytes;
    }
  } else if (code === "asset_unavailable") {
    if (["not_found", "wrong_grant", "wrong_origin"].includes(details.reason)) {
      output.reason = "unauthorized";
    } else if (
      ["expired", "consumed", "unauthorized", "limit_exceeded"].includes(
        details.reason,
      )
    ) {
      output.reason = details.reason;
    }
  } else if (code === "pairing_code_mismatch") {
    if (
      Number.isInteger(details.attemptsRemaining) &&
      details.attemptsRemaining >= 0 &&
      details.attemptsRemaining <= 5
    ) {
      output.attemptsRemaining = details.attemptsRemaining;
    }
  } else if (code === "renderer_timeout") {
    if (
      Number.isInteger(details.timeoutMs) &&
      details.timeoutMs >= 0 &&
      details.timeoutMs <= 60000
    ) {
      output.timeoutMs = details.timeoutMs;
    }
  } else if (code === "unsupported") {
    if (typeof details.feature === "string" && details.feature.length <= 128) {
      output.feature = details.feature;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function normalizeErrorCode(error) {
  if (isRecord(error) && typeof error.code === "string") {
    return VIEWER_API_ERROR_CODES.has(error.code) ? error.code : "internal_error";
  }
  if (typeof error === "string") {
    const normalized = error.trim().toLowerCase();
    return VIEWER_API_ERROR_ALIASES.get(normalized) ?? "internal_error";
  }
  return "internal_error";
}

function makeErrorPayload(error, details) {
  const code = normalizeErrorCode(error);
  const catalog = VIEWER_API_ERROR_CATALOG[code] ?? VIEWER_API_ERROR_CATALOG.internal_error;
  const errorDetails = sanitizeErrorDetails(
    code,
    details ?? (isRecord(error) ? error.details : undefined),
  );
  return {
    code,
    message: catalog.message,
    retryable: catalog.retryable,
    ...(errorDetails ? { details: errorDetails } : {}),
  };
}

function makeErrorResponse(id, type, error, data = {}, details, options = {}) {
  return makeResponse(id, type, false, data, error, details, options);
}

function makeResponse(id, type, ok, data, error, details, options = {}) {
  const response = {
    api: VIVI_VIEWER_API_NAME,
    version: options.version ?? VIVI_VIEWER_API_VERSION,
    type,
    ok,
    data: data ?? {},
    ...(!ok && error ? { error: makeErrorPayload(error, details) } : {}),
  };
  if (typeof id === "string") response.id = id;
  return response;
}

function isPreviewViewerApiVersion(version) {
  return version === VIVI_VIEWER_API_VERSION_PREVIEW;
}

module.exports = {
  isPreviewViewerApiVersion,
  makeErrorPayload,
  makeErrorResponse,
  makeResponse,
};
