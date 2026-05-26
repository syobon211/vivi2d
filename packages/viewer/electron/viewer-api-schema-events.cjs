const VIEWER_API_EVENT_DEFS = Object.freeze({
  "viewer.events.dropped": {
    scope: null,
    category: "api",
    surface: "core",
    delivery: "automatic",
    subscribeAllowed: false,
  },
  "viewer.model.loaded": {
    scope: "read:state",
    category: "model",
    surface: "core",
    delivery: "subscribed",
  },
  "viewer.model.unloaded": {
    scope: "read:state",
    category: "model",
    surface: "core",
    delivery: "subscribed",
  },
  "viewer.model.transform.changed": {
    scope: "read:state",
    category: "model",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.action.started": {
    scope: "read:actions",
    category: "actions",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.action.completed": {
    scope: "read:actions",
    category: "actions",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.action.failed": {
    scope: "read:actions",
    category: "actions",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.action.skipped": {
    scope: "read:actions",
    category: "actions",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.signals.changed": {
    scope: "read:signals",
    category: "signals",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.prop.added": {
    scope: "read:props",
    category: "props",
    surface: "core",
    delivery: "subscribed",
  },
  "viewer.prop.updated": {
    scope: "read:props",
    category: "props",
    surface: "core",
    delivery: "subscribed",
  },
  "viewer.prop.removed": {
    scope: "read:props",
    category: "props",
    surface: "core",
    delivery: "subscribed",
  },
  "viewer.calibration.changed": {
    scope: "read:calibration",
    category: "calibration",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.tracking.status.changed": {
    scope: "read:state",
    category: "tracking",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.input.clicked": {
    scope: "read:state",
    category: "state",
    surface: "extension",
    delivery: "subscribed",
  },
  "viewer.api.grant.revoked": {
    scope: null,
    category: "api",
    surface: "core",
    delivery: "automatic",
    subscribeAllowed: false,
  },
});

const VIEWER_API_EVENT_NAMES = new Set(Object.keys(VIEWER_API_EVENT_DEFS));
const VIEWER_API_SUBSCRIBABLE_EVENT_NAMES = new Set(
  Object.entries(VIEWER_API_EVENT_DEFS)
    .filter(([, definition]) => definition.subscribeAllowed !== false)
    .map(([name]) => name),
);

module.exports = {
  VIEWER_API_EVENT_DEFS,
  VIEWER_API_EVENT_NAMES,
  VIEWER_API_SUBSCRIBABLE_EVENT_NAMES,
};
