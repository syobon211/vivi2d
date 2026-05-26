const {
  MAX_AUTH_ATTEMPTS_PER_MINUTE,
  MAX_GLOBAL_AUTH_ATTEMPTS_PER_MINUTE,
  MAX_GLOBAL_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_PAIRING_WINDOW_MS,
  PAIRING_WINDOW_MS,
  grantFingerprint,
  publicGrant,
} = require("./viewer-api-auth.cjs");
const { publicEventRegistry, splitBySurface } = require("./viewer-api-dispatch.cjs");
const {
  MAX_ACTIVE_EVENT_SUBSCRIPTIONS,
  MAX_EVENT_PAYLOAD_BYTES,
  MAX_EVENT_QUEUE_BYTES,
  MAX_EVENT_QUEUE_COUNT,
} = require("./viewer-api-event-queue.cjs");
const {
  MAX_INLINE_PROP_BYTES,
  MAX_FILE_PICKER_PROP_BYTES,
  MAX_JSON_NESTING_DEPTH,
  MAX_MESSAGE_BYTES,
  MAX_REQUEST_PAYLOAD_BYTES,
  MAX_TOP_LEVEL_KEYS,
  VIEWER_API_EVENT_DEFS,
  VIEWER_API_SCOPE_METADATA,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
  VIVI_VIEWER_API_VERSION_EXPERIMENTAL,
} = require("./viewer-api-schema.cjs");

function numericCloseCodes(closeCodes, names) {
  return Object.fromEntries(
    names.map((name) => [name, closeCodes[name]?.code]).filter(([, code]) => code),
  );
}

function tokenPersistenceForServer(server) {
  if (server.persistentGrantsAvailable) return "persistent";
  return server.allowSessionGrants ? "session" : "unavailable";
}

function buildViewerApiStatus(server) {
  // The secret code stays on the requesting client. The renderer only sees
  // non-secret pending metadata and submits the user's typed confirmation.
  const pendingChallenges = [...server.pendingChallenges.values()].map((challenge) => ({
    id: challenge.id,
    appName: challenge.appName,
    scopes: [...challenge.scopes],
    originBinding: challenge.origin ?? "no-origin",
    createdAt: challenge.createdAt,
    expiresAt: challenge.expiresAt,
    badCodeAttempts: challenge.badCodeAttempts,
  }));
  return {
    enabled: server.enabled,
    port: server.port,
    endpoint: server.enabled ? `ws://127.0.0.1:${server.port}` : null,
    version: VIVI_VIEWER_API_VERSION,
    persistentGrantsAvailable: server.persistentGrantsAvailable,
    tokenPersistence: tokenPersistenceForServer(server),
    pairingWindowOpen: Date.now() < server.pairingWindowUntil,
    pairingWindowExpiresAt: server.pairingWindowUntil || null,
    pairingAllowedOrigins: [...server.pairingAllowedOrigins],
    pendingChallenges,
    grants: [...server.grants.values()].map(publicGrant),
  };
}

function buildAssetBrokerGrant(server, grantId) {
  const grant = server.grants.get(grantId);
  if (!grant) return null;
  return {
    id: grant.id,
    appName: grant.appName,
    scopes: [...grant.scopes],
    originBinding: grant.originBinding ?? (grant.origins?.[0] ?? "no-origin"),
  };
}

function buildViewerApiCapabilities(
  server,
  closeCodes,
  { authenticated = false, version = VIVI_VIEWER_API_VERSION } = {},
) {
  if (version === VIVI_VIEWER_API_VERSION_EXPERIMENTAL) {
    const banner = {
      api: VIVI_VIEWER_API_NAME,
      version: VIVI_VIEWER_API_VERSION_EXPERIMENTAL,
      authMethods: ["pairing-token"],
      pairingOpen: Date.now() < server.pairingWindowUntil,
    };
    if (!authenticated) return banner;
    return {
      ...banner,
      requestTypes: server.getImplementedRequestTypeNames(),
      eventTypes: Object.keys(VIEWER_API_EVENT_DEFS),
      propSourceKinds: ["inlineBase64", "filePickerAsset"],
      limits: {
        maxWebSocketTextFrameBytes: MAX_MESSAGE_BYTES,
        maxJsonNestingDepth: MAX_JSON_NESTING_DEPTH,
        maxTopLevelKeys: MAX_TOP_LEVEL_KEYS,
        maxRequestIdLength: 128,
        maxSignalValuesPerRequest: 128,
        maxInlinePropBytes: MAX_INLINE_PROP_BYTES,
        maxFilePickerPropBytes: MAX_FILE_PICKER_PROP_BYTES,
        maxActiveEventSubscriptions: MAX_ACTIVE_EVENT_SUBSCRIPTIONS,
        maxQueuedEventsPerClient: MAX_EVENT_QUEUE_COUNT,
        maxQueuedEventBytesPerClient: MAX_EVENT_QUEUE_BYTES,
        maxEventPayloadBytes: MAX_EVENT_PAYLOAD_BYTES,
      },
      closeCodes,
    };
  }
  const tokenPersistence = tokenPersistenceForServer(server);
  const banner = {
    api: VIVI_VIEWER_API_NAME,
    version: VIVI_VIEWER_API_VERSION,
    stability: "preview",
    authMethods: ["pairing-token"],
    pairingOpen: Date.now() < server.pairingWindowUntil,
    scopeMetadata: VIEWER_API_SCOPE_METADATA.map((metadata) => ({ ...metadata })),
    pairing: {
      codeTtlMs: PAIRING_WINDOW_MS,
      windowTtlMs: MAX_PAIRING_WINDOW_MS,
      tokenTtlMs: null,
      tokenPersistence,
    },
    limits: {
      maxRequestIdLength: 128,
      maxRequestPayloadBytes: MAX_REQUEST_PAYLOAD_BYTES,
      maxWebSocketTextFrameBytes: MAX_MESSAGE_BYTES,
      maxPairingChallengesPerMinute: MAX_PAIRING_CHALLENGES_PER_WINDOW,
      maxAuthenticateAttemptsPerMinute: MAX_AUTH_ATTEMPTS_PER_MINUTE,
      maxGlobalPairingChallengesPerMinute: MAX_GLOBAL_PAIRING_CHALLENGES_PER_WINDOW,
      maxGlobalAuthenticateAttemptsPerMinute: MAX_GLOBAL_AUTH_ATTEMPTS_PER_MINUTE,
    },
    closeCodes: numericCloseCodes(closeCodes, [
      "invalidRequest",
      "rateLimited",
      "originMismatch",
      "frameTooLarge",
      "binaryRejected",
      "compressionRejected",
    ]),
    availability: {
      core: { status: "available" },
      extensions: { status: authenticated ? "available" : "discover-after-auth" },
    },
  };
  if (!authenticated) return banner;
  const requests = server.getImplementedRequestTypes();
  const requestSurfaces = splitBySurface(requests);
  const events = publicEventRegistry();
  const eventSurfaces = splitBySurface(events);
  const scopes = splitBySurface(VIEWER_API_SCOPE_METADATA.map((metadata) => ({ ...metadata })));
  return {
    ...banner,
    propSourceKinds: ["inlineBase64", "filePickerAsset"],
    limits: {
      ...banner.limits,
      maxJsonNestingDepth: MAX_JSON_NESTING_DEPTH,
      maxTopLevelKeys: MAX_TOP_LEVEL_KEYS,
      maxSignalValuesPerRequest: 128,
      maxInlinePropBytes: MAX_INLINE_PROP_BYTES,
      maxFilePickerPropBytes: MAX_FILE_PICKER_PROP_BYTES,
      maxActiveEventSubscriptions: MAX_ACTIVE_EVENT_SUBSCRIPTIONS,
      maxQueuedEventsPerClient: MAX_EVENT_QUEUE_COUNT,
      maxQueuedEventBytesPerClient: MAX_EVENT_QUEUE_BYTES,
      maxEventPayloadBytes: MAX_EVENT_PAYLOAD_BYTES,
    },
    closeCodes: numericCloseCodes(closeCodes, [
      "invalidRequest",
      "grantRevoked",
      "rateLimited",
      "originMismatch",
      "frameTooLarge",
      "binaryRejected",
      "compressionRejected",
    ]),
    core: {
      requestTypes: requestSurfaces.core,
      eventTypes: eventSurfaces.core,
      scopes: scopes.core,
    },
    extensions: {
      requestTypes: requestSurfaces.extensions,
      eventTypes: eventSurfaces.extensions,
      scopes: scopes.extensions,
    },
  };
}

function buildClientStatus(server, grant) {
  return {
    enabled: server.enabled,
    port: server.port,
    version: VIVI_VIEWER_API_VERSION,
    persistentGrantsAvailable: server.persistentGrantsAvailable,
    tokenPersistence: tokenPersistenceForServer(server),
    pairingWindowOpen: Date.now() < server.pairingWindowUntil,
    grant: grant
      ? {
          id: grantFingerprint(grant),
          appName: grant.appName,
          scopes: [...grant.scopes],
          scopeMetadata: VIEWER_API_SCOPE_METADATA
            .filter((metadata) => grant.scopes.includes(metadata.scope))
            .map((metadata) => ({ ...metadata })),
          originBinding: grant.originBinding ?? (grant.origins?.[0] ?? "no-origin"),
          createdAt: grant.createdAt,
          lastUsedAt: grant.lastUsedAt,
        }
      : null,
  };
}

module.exports = {
  buildAssetBrokerGrant,
  buildClientStatus,
  buildViewerApiCapabilities,
  buildViewerApiStatus,
  numericCloseCodes,
  tokenPersistenceForServer,
};
