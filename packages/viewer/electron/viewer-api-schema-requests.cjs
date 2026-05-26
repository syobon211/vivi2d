const READ_TYPES = new Set([
  "viewer.state.get",
  "viewer.model.get",
  "viewer.signals.list",
  "viewer.actions.list",
  "viewer.props.list",
  "viewer.calibration.get",
  "viewer.api.capabilities.get",
  "viewer.events.list",
]);

const WRITE_TYPES = new Set([
  "viewer.action.run",
  "viewer.signals.set",
  "viewer.expression.apply",
  "viewer.model.transform",
  "viewer.prop.load",
  "viewer.prop.update",
  "viewer.prop.remove",
  "viewer.prop.group.cycle",
  "viewer.calibration.set",
  "viewer.calibration.profile.apply",
]);

const EVENT_SUBSCRIPTION_TYPES = new Set([
  "viewer.events.subscribe",
  "viewer.events.unsubscribe",
]);

const VIEWER_API_REQUEST_DEFS = Object.freeze({
  "viewer.api.capabilities.get": {
    surface: "core",
    enabled: true,
    scopeMode: "static",
    requiredScopes: [[]],
    authRequired: false,
  },
  "viewer.auth.challenge": {
    surface: "core",
    enabled: true,
    scopeMode: "static",
    requiredScopes: [[]],
    authRequired: false,
  },
  "viewer.auth.authenticate": {
    surface: "core",
    enabled: true,
    scopeMode: "static",
    requiredScopes: [[]],
    authRequired: false,
  },
  "viewer.state.get": {
    surface: "core",
    enabled: true,
    scopeMode: "static",
    requiredScopes: [["read:state"]],
    authRequired: true,
  },
  "viewer.props.list": {
    surface: "core",
    enabled: true,
    scopeMode: "static",
    requiredScopes: [["read:props"]],
    authRequired: true,
  },
  "viewer.prop.load": {
    surface: "core",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["write:props"]],
    authRequired: true,
  },
  "viewer.prop.update": {
    surface: "core",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["write:props"]],
    authRequired: true,
  },
  "viewer.prop.remove": {
    surface: "core",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["write:props"]],
    authRequired: true,
  },
  "viewer.prop.group.cycle": {
    surface: "core",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["write:props"]],
    authRequired: true,
  },
  "viewer.events.list": {
    surface: "core",
    enabled: true,
    scopeMode: "static",
    authRequired: true,
  },
  "viewer.events.subscribe": {
    surface: "core",
    enabled: true,
    scopeMode: "event-derived",
    scopeDerivation: "requestedEvents",
    authRequired: true,
  },
  "viewer.events.unsubscribe": {
    surface: "core",
    enabled: true,
    scopeMode: "static",
    authRequired: true,
  },
  "viewer.model.get": {
    surface: "extension",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["read:state"]],
    authRequired: true,
  },
  "viewer.model.transform": {
    surface: "extension",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["run:actions:safe"]],
    authRequired: true,
  },
  "viewer.signals.list": {
    surface: "extension",
    enabled: true,
    scopeMode: "static",
    requiredScopes: [["read:signals"]],
    authRequired: true,
  },
  "viewer.signals.set": {
    surface: "extension",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["write:signals"]],
    authRequired: true,
  },
  "viewer.actions.list": {
    surface: "extension",
    enabled: true,
    scopeMode: "static",
    requiredScopes: [["read:actions"]],
    authRequired: true,
  },
  "viewer.action.run": {
    surface: "extension",
    enabled: false,
    scopeMode: "action-derived",
    scopeDerivation: "actionKind",
    authRequired: true,
  },
  "viewer.expression.apply": {
    surface: "extension",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["write:signals", "run:actions:safe"]],
    authRequired: true,
  },
  "viewer.calibration.get": {
    surface: "extension",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["read:calibration"]],
    authRequired: true,
  },
  "viewer.calibration.set": {
    surface: "extension",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["write:calibration"]],
    authRequired: true,
  },
  "viewer.calibration.profile.apply": {
    surface: "extension",
    enabled: false,
    scopeMode: "static",
    requiredScopes: [["write:calibration"]],
    authRequired: true,
  },
});

const KNOWN_TYPES = new Set(Object.keys(VIEWER_API_REQUEST_DEFS));

module.exports = {
  EVENT_SUBSCRIPTION_TYPES,
  KNOWN_TYPES,
  READ_TYPES,
  VIEWER_API_REQUEST_DEFS,
  WRITE_TYPES,
};
