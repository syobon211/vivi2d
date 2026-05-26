const actions = require("./viewer-api-schema-actions.cjs");
const errors = require("./viewer-api-schema-errors.cjs");
const events = require("./viewer-api-schema-events.cjs");
const limits = require("./viewer-api-schema-limits.cjs");
const requests = require("./viewer-api-schema-requests.cjs");
const scopes = require("./viewer-api-schema-scopes.cjs");

module.exports = {
  ...actions,
  ...errors,
  ...events,
  ...limits,
  ...requests,
  ...scopes,
};
