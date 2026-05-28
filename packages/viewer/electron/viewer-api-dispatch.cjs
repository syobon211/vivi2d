const {
  VIEWER_API_EVENT_DEFS,
  VIEWER_API_REQUEST_DEFS,
} = require("./viewer-api-schema.cjs");

function publicEventRegistry() {
  return Object.entries(VIEWER_API_EVENT_DEFS).map(([name, definition]) => ({
    name,
    scope: definition.scope,
    category: definition.category,
    surface: definition.surface,
    delivery: definition.delivery,
  }));
}

function publicRequestMetadata(name, definition) {
  const metadata = {
    name,
    surface: definition.surface,
    scopeMode: definition.scopeMode,
  };
  if (typeof definition.authRequired === "boolean") {
    metadata.authRequired = definition.authRequired;
  }
  if (definition.requiredScopes) {
    metadata.requiredScopes = definition.requiredScopes.map((scopes) => [...scopes]);
  }
  if (definition.scopeDerivation) metadata.scopeDerivation = definition.scopeDerivation;
  return metadata;
}

function splitBySurface(items) {
  return {
    core: items.filter((item) => item.surface === "core"),
    extensions: items.filter((item) => item.surface === "extension"),
  };
}

function projectPublicResponseData(type, data) {
  if (!data || typeof data !== "object") return {};
  if (type === "viewer.events.subscribe" || type === "viewer.events.unsubscribe") {
    return {
      subscription: {
        eventTypes: Array.isArray(data.subscriptions) ? [...data.subscriptions].sort() : [],
      },
    };
  }
  const output = { ...data };
  delete output.accepted;
  delete output.reason;
  delete output.deniedEvents;
  delete output.subscriptions;
  return output;
}

async function dispatchViewerApiRequest(message, grant, context, dependencies) {
  const handler = dependencies.handlers[message.type];
  if (handler) return handler(message, grant, context);
  if (message.type === "viewer.state.get") return dependencies.getClientStatus(grant);
  if (message.type === "viewer.api.capabilities.get") {
    return {
      capabilities: dependencies.getCapabilities({
        authenticated: true,
        version: message.version,
      }),
    };
  }
  if (message.type === "viewer.events.list") return { events: publicEventRegistry() };
  if (
    message.type === "viewer.events.subscribe" ||
    message.type === "viewer.events.unsubscribe"
  ) {
    return dependencies.handleEventSubscription(message, grant, context);
  }
  if (message.type === "viewer.signals.list") return { signals: [] };
  if (message.type === "viewer.actions.list") return { actions: [] };
  return { accepted: false, reason: "renderer handler unavailable" };
}

function getImplementedRequestTypes(handlers = {}) {
  const alwaysEnabled = Object.entries(VIEWER_API_REQUEST_DEFS)
    .filter(([, definition]) => definition.enabled)
    .map(([name]) => name);
  return [...new Set([...alwaysEnabled, ...Object.keys(handlers)])]
    .filter((name) => VIEWER_API_REQUEST_DEFS[name])
    .sort()
    .map((name) => publicRequestMetadata(name, VIEWER_API_REQUEST_DEFS[name]));
}

module.exports = {
  dispatchViewerApiRequest,
  getImplementedRequestTypes,
  projectPublicResponseData,
  publicEventRegistry,
  publicRequestMetadata,
  splitBySurface,
};
