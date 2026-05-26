const {
  EVENT_SUBSCRIPTION_TYPES,
  VIEWER_API_REQUEST_DEFS,
} = require("./viewer-api-schema-constants.cjs");

function requiredScopesForMessage(message) {
  return requiredScopeAlternativesForMessage(message).map((scopes) => scopes[0]);
}

function requiredScopeAlternativesForMessage(message) {
  if (message.type === "viewer.auth.challenge" || message.type === "viewer.auth.authenticate") {
    return [];
  }
  if (EVENT_SUBSCRIPTION_TYPES.has(message.type)) {
    return [];
  }
  const definition = VIEWER_API_REQUEST_DEFS[message.type];
  if (definition?.scopeMode === "static") {
    return definition.requiredScopes ?? [];
  }
  switch (message.type) {
    case "viewer.action.run":
      return [scopesForActionKind(message.data.actionKind)];
    case "viewer.signals.set":
      return [["write:signals"]];
    case "viewer.expression.apply":
      return [["write:signals", "run:actions:safe"]];
    case "viewer.model.transform":
      return [["run:actions:safe"]];
    case "viewer.prop.load":
    case "viewer.prop.update":
    case "viewer.prop.remove":
    case "viewer.prop.group.cycle":
      return [["write:props"]];
    case "viewer.calibration.set":
    case "viewer.calibration.profile.apply":
      return [["write:calibration"]];
    default:
      return [["run:actions:safe"]];
  }
}

function scopesForActionKind(kind) {
  switch (kind) {
    case "signalSet":
    case "signalPulse":
      return ["write:signals"];
    case "propTransform":
    case "propVisibility":
    case "propCycle":
    case "propSpawnBurst":
      return ["write:props"];
    case "calibrationProfileApply":
    case "calibrationCaptureNeutral":
    case "calibrationReset":
      return ["write:calibration"];
    case "recordingControl":
    case "scriptCommand":
    case "bridgeCommand":
      throw new Error("reserved action kind is unsupported");
    default:
      return ["run:actions:safe"];
  }
}

module.exports = {
  requiredScopeAlternativesForMessage,
  requiredScopesForMessage,
  scopesForActionKind,
};
