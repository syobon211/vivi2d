const VIEWER_API_SCOPE_METADATA = Object.freeze([
  {
    scope: "read:state",
    surface: "core",
    risk: "low",
    category: "state",
    description: "Read safe viewer-session state.",
  },
  {
    scope: "read:props",
    surface: "core",
    risk: "low",
    category: "props",
    description: "List public prop summaries.",
  },
  {
    scope: "write:props",
    surface: "core",
    risk: "medium",
    category: "props",
    description: "Add, update, remove, and cycle viewer props.",
    requiresUserMediatedAssets: true,
  },
  {
    scope: "read:signals",
    surface: "extension",
    risk: "low",
    category: "signals",
    description: "Read public control-signal summaries.",
  },
  {
    scope: "write:signals",
    surface: "extension",
    risk: "medium",
    category: "signals",
    description: "Write bounded viewer-session control signals.",
  },
  {
    scope: "read:actions",
    surface: "extension",
    risk: "low",
    category: "actions",
    description: "List safe viewer action summaries and lifecycle events.",
  },
  {
    scope: "read:calibration",
    surface: "extension",
    risk: "low",
    category: "calibration",
    description: "Read calibration summaries, not raw private device data.",
  },
  {
    scope: "write:calibration",
    surface: "extension",
    risk: "high",
    category: "calibration",
    description: "Update calibration settings through bounded schemas.",
  },
  {
    scope: "run:actions:safe",
    surface: "extension",
    risk: "high",
    category: "actions",
    description: "Run approved safe viewer actions and bounded model transforms.",
  },
]);

const ALLOWED_SCOPES = new Set(
  VIEWER_API_SCOPE_METADATA.map((metadata) => metadata.scope),
);

module.exports = {
  ALLOWED_SCOPES,
  VIEWER_API_SCOPE_METADATA,
};
