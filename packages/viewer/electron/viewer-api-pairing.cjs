const {
  MAX_BAD_PAIRING_CODE_ATTEMPTS,
  MAX_GLOBAL_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_GRANTS,
  MAX_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_PAIRING_WINDOW_MS,
  MAX_PENDING_CHALLENGES,
  PAIRING_WINDOW_MS,
  createPairingCode,
  createPairingToken,
  grantFingerprint,
  isSafeTokenEqual,
  publicGrant,
} = require("./viewer-api-auth.cjs");
const { normalizeAllowedOrigins } = require("./viewer-api-origin.cjs");
const {
  consumeRateLimitBudget,
  hasRateLimitBudget,
} = require("./viewer-api-rate-limit.cjs");
const { isPreviewViewerApiVersion: isPreviewVersion, makeResponse } =
  require("./viewer-api-schema.cjs");

function makeChallengeTerminalResponse(challenge, ok, data, error, details) {
  const preview = isPreviewVersion(challenge.version);
  return makeResponse(
    challenge.requestId,
    preview ? "viewer.auth.challenge.completed" : "viewer.auth.token",
    ok,
    preview ? { phase: "completed", ...(data ?? {}) } : data,
    error,
    details,
    { version: challenge.version },
  );
}

function sendChallengeTerminal(server, challenge, ok, data, error, details) {
  if (challenge.ws?.readyState !== 1) return;
  server.sendMessage(
    challenge.ws,
    makeChallengeTerminalResponse(challenge, ok, data, error, details),
  );
}

function openPairingWindow(server, durationMs = PAIRING_WINDOW_MS, { origins = [] } = {}) {
  closePairingWindow(server);
  const boundedDuration = Math.min(
    MAX_PAIRING_WINDOW_MS,
    Math.max(1_000, durationMs),
  );
  server.pairingWindowUntil = Date.now() + boundedDuration;
  server.pairingAllowedOrigins = new Set(normalizeAllowedOrigins(origins));
  server.emitStatusChanged();
  return { expiresAt: server.pairingWindowUntil };
}

function closePairingWindow(server) {
  server.pairingWindowUntil = 0;
  server.pairingAllowedOrigins.clear();
  for (const [id, challenge] of server.pendingChallenges) {
    sendChallengeTerminal(server, challenge, false, {}, "pairing closed");
    server.pendingChallenges.delete(id);
  }
  server.emitStatusChanged();
}

function purgeExpiredChallenges(server, now = Date.now()) {
  for (const [id, challenge] of server.pendingChallenges) {
    if (challenge.expiresAt <= now || challenge.ws?.readyState === 3) {
      if (challenge.ws?.readyState === 1) {
        sendChallengeTerminal(server, challenge, false, {}, "pairing closed");
      }
      server.pendingChallenges.delete(id);
    }
  }
}

function approveChallenge(server, challengeId, confirmationCode) {
  const challenge = server.pendingChallenges.get(challengeId);
  if (!challenge) return null;
  const now = Date.now();
  if (
    now >= server.pairingWindowUntil ||
    now >= challenge.expiresAt ||
    challenge.ws?.readyState !== 1 ||
    (challenge.origin && !server.pairingAllowedOrigins.has(challenge.origin))
  ) {
    server.pendingChallenges.delete(challengeId);
    sendChallengeTerminal(
      server,
      challenge,
      false,
      {},
      challenge.origin && !server.pairingAllowedOrigins.has(challenge.origin)
        ? "origin mismatch"
        : "pairing closed",
    );
    return null;
  }
  if (!isSafeTokenEqual(confirmationCode, challenge.code)) {
    challenge.badCodeAttempts += 1;
    if (challenge.badCodeAttempts >= MAX_BAD_PAIRING_CODE_ATTEMPTS) {
      server.pendingChallenges.delete(challengeId);
      sendChallengeTerminal(server, challenge, false, {}, "pairing closed");
    }
    server.emitStatusChanged();
    return null;
  }
  purgeExpiredChallenges(server, now);
  if (!server.persistentGrantsAvailable && !server.allowSessionGrants) {
    server.pendingChallenges.delete(challengeId);
    sendChallengeTerminal(
      server,
      challenge,
      false,
      {},
      "host capability unavailable",
    );
    return null;
  }
  if (server.grants.size >= MAX_GRANTS) {
    server.pendingChallenges.delete(challengeId);
    sendChallengeTerminal(server, challenge, false, {}, "rate limited", {
      bucket: "global",
    });
    return null;
  }
  server.pendingChallenges.delete(challengeId);
  const grant = {
    id: createPairingToken(),
    token: createPairingToken(),
    appName: challenge.appName,
    scopes: challenge.scopes,
    origins: challenge.origin ? [challenge.origin] : [],
    originBinding: challenge.origin ?? "no-origin",
    createdAt: Date.now(),
    lastUsedAt: null,
  };
  server.grants.set(grant.id, grant);
  try {
    server.saveGrants();
  } catch (error) {
    server.grants.delete(grant.id);
    sendChallengeTerminal(server, challenge, false, {}, "grant persistence failed");
    server.logger.warn?.("[viewer-api] grant save failed", error);
    return null;
  }
  sendChallengeTerminal(server, challenge, true, {
    grantId: grant.id,
    fingerprint: grantFingerprint(grant),
    token: grant.token,
    scopes: grant.scopes,
  });
  server.emitStatusChanged();
  return { ...publicGrant(grant), token: undefined };
}

function handleChallenge(server, ws, message, origin, clientState, peerState) {
  purgeExpiredChallenges(server);
  if (Date.now() >= server.pairingWindowUntil) {
    server.sendResponse(
      ws,
      clientState,
      message.id,
      "viewer.auth.challenge.result",
      false,
      isPreviewVersion(message.version) ? { phase: "failed" } : {},
      "pairing required",
    );
    return;
  }
  if (origin && !server.pairingAllowedOrigins.has(origin)) {
    server.sendResponse(
      ws,
      clientState,
      message.id,
      "viewer.auth.challenge.result",
      false,
      isPreviewVersion(message.version) ? { phase: "failed" } : {},
      "origin mismatch",
    );
    return;
  }
  const now = Date.now();
  clientState.pairingChallengeTimestamps =
    clientState.pairingChallengeTimestamps.filter(
      (timestamp) => now - timestamp < 60_000,
    );
  if (
    clientState.pairingChallengeTimestamps.length >=
      MAX_PAIRING_CHALLENGES_PER_WINDOW ||
    !hasRateLimitBudget(
      peerState.pairingChallengeTimestamps,
      now,
      60_000,
      MAX_PAIRING_CHALLENGES_PER_WINDOW,
    ) ||
    !hasRateLimitBudget(
      server.globalPairingChallengeTimestamps,
      now,
      60_000,
      MAX_GLOBAL_PAIRING_CHALLENGES_PER_WINDOW,
    )
  ) {
    server.sendResponse(
      ws,
      clientState,
      message.id,
      "viewer.auth.challenge.result",
      false,
      isPreviewVersion(message.version) ? { phase: "failed" } : {},
      "rate limited",
      { bucket: origin ? "origin" : "no-origin" },
    );
    return;
  }
  if (server.pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
    server.sendResponse(
      ws,
      clientState,
      message.id,
      "viewer.auth.challenge.result",
      false,
      isPreviewVersion(message.version) ? { phase: "failed" } : {},
      "rate limited",
      { bucket: "global" },
    );
    return;
  }
  clientState.pairingChallengeTimestamps.push(now);
  peerState.pairingChallengeTimestamps = consumeRateLimitBudget(
    peerState.pairingChallengeTimestamps,
    now,
    60_000,
  );
  server.globalPairingChallengeTimestamps = consumeRateLimitBudget(
    server.globalPairingChallengeTimestamps,
    now,
    60_000,
  );
  const challengeId = createPairingToken();
  const existingCodes = new Set(
    [...server.pendingChallenges.values()].map((challenge) => challenge.code),
  );
  let challengeCode = createPairingCode();
  for (let attempt = 0; existingCodes.has(challengeCode) && attempt < 8; attempt += 1) {
    challengeCode = createPairingCode();
  }
  const challenge = {
    id: challengeId,
    requestId: message.id,
    version: message.version,
    code: challengeCode,
    appName: message.data.appName,
    scopes: message.data.scopes,
    origin,
    ws,
    createdAt: Date.now(),
    expiresAt: Math.min(server.pairingWindowUntil, Date.now() + PAIRING_WINDOW_MS),
    badCodeAttempts: 0,
  };
  server.pendingChallenges.set(challengeId, challenge);
  server.emitStatusChanged();
  server.sendResponse(
    ws,
    clientState,
    message.id,
    "viewer.auth.challenge.result",
    true,
    isPreviewVersion(message.version)
      ? {
          phase: "pending",
          challengeId,
          code: challenge.code,
          expiresAt: new Date(challenge.expiresAt).toISOString(),
        }
      : {
          challengeId,
          code: challenge.code,
          scopes: challenge.scopes,
        },
  );
}

module.exports = {
  approveChallenge,
  closePairingWindow,
  handleChallenge,
  makeChallengeTerminalResponse,
  openPairingWindow,
  purgeExpiredChallenges,
  sendChallengeTerminal,
};
