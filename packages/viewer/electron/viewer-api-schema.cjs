const constants = require("./viewer-api-schema-constants.cjs");
const response = require("./viewer-api-schema-response.cjs");
const validators = require("./viewer-api-schema-validators.cjs");

const {
  ACCEPTED_VIEWER_API_VERSIONS,
  ACTION_KINDS,
  ALLOWED_SCOPES,
  DEFAULT_PRE_NEGOTIATION_VIEWER_API_VERSION,
  MAX_FILE_PICKER_PROP_BYTES,
  MAX_INLINE_PROP_BYTES,
  MAX_JSON_NESTING_DEPTH,
  MAX_MESSAGE_BYTES,
  MAX_PUBLIC_PROP_DIMENSION,
  MAX_PUBLIC_PROP_PIXEL_BYTES,
  MAX_REQUEST_PAYLOAD_BYTES,
  MAX_TOP_LEVEL_KEYS,
  VIEWER_API_EVENT_DEFS,
  VIEWER_API_REQUEST_DEFS,
  VIEWER_API_SCOPE_METADATA,
  VIEWER_API_SUBSCRIBABLE_EVENT_NAMES,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
  VIVI_VIEWER_API_VERSION_EXPERIMENTAL,
  VIVI_VIEWER_API_VERSION_PREVIEW,
  WRITE_TYPES,
} = constants;

const {
  isPreviewViewerApiVersion,
  makeErrorPayload,
  makeErrorResponse,
  makeResponse,
} = response;

const {
  parseViewerApiMessage,
  requiredScopeAlternativesForMessage,
  requiredScopesForMessage,
  validateInlinePropImage,
} = validators;

module.exports = {
  ACCEPTED_VIEWER_API_VERSIONS,
  ACTION_KINDS,
  ALLOWED_SCOPES,
  DEFAULT_PRE_NEGOTIATION_VIEWER_API_VERSION,
  MAX_FILE_PICKER_PROP_BYTES,
  MAX_INLINE_PROP_BYTES,
  MAX_JSON_NESTING_DEPTH,
  MAX_MESSAGE_BYTES,
  MAX_PUBLIC_PROP_DIMENSION,
  MAX_PUBLIC_PROP_PIXEL_BYTES,
  MAX_REQUEST_PAYLOAD_BYTES,
  MAX_TOP_LEVEL_KEYS,
  VIEWER_API_EVENT_DEFS,
  VIEWER_API_REQUEST_DEFS,
  VIEWER_API_SCOPE_METADATA,
  VIEWER_API_SUBSCRIBABLE_EVENT_NAMES,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
  VIVI_VIEWER_API_VERSION_EXPERIMENTAL,
  VIVI_VIEWER_API_VERSION_PREVIEW,
  WRITE_TYPES,
  isPreviewViewerApiVersion,
  makeErrorPayload,
  makeErrorResponse,
  makeResponse,
  parseViewerApiMessage,
  requiredScopeAlternativesForMessage,
  requiredScopesForMessage,
  validateInlinePropImage,
};
