const {
  MAX_AUTH_ATTEMPTS_PER_MINUTE,
  MAX_GLOBAL_AUTH_ATTEMPTS_PER_MINUTE,
} = require("./viewer-api-auth.cjs");
const {
  consumeRateLimitBudget,
  hasRateLimitBudget,
} = require("./viewer-api-rate-limit.cjs");

const MAX_WRITE_REQUESTS_PER_SECOND = 10;
const MAX_GRANT_WRITE_REQUESTS_PER_SECOND = 60;
const MAX_PEER_WRITE_REQUESTS_PER_SECOND = 120;
const MAX_GLOBAL_WRITE_REQUESTS_PER_SECOND = 600;
const MAX_REQUESTS_PER_SECOND = 120;
const MAX_GLOBAL_REQUESTS_PER_SECOND = 1200;

function getPeerState(server, peerKey) {
  const existing = server.peerStates.get(peerKey);
  if (existing) return existing;
  const state = {
    authAttemptTimestamps: [],
    pairingChallengeTimestamps: [],
    requestTimestamps: [],
    writeTimestamps: [],
  };
  server.peerStates.set(peerKey, state);
  return state;
}

function consumeAuthAttemptBudget(server, clientState, peerState) {
  const now = Date.now();
  if (
    !hasRateLimitBudget(
      clientState.authAttemptTimestamps,
      now,
      60_000,
      MAX_AUTH_ATTEMPTS_PER_MINUTE,
    ) ||
    !hasRateLimitBudget(
      peerState.authAttemptTimestamps,
      now,
      60_000,
      MAX_AUTH_ATTEMPTS_PER_MINUTE,
    ) ||
    !hasRateLimitBudget(
      server.globalAuthAttemptTimestamps,
      now,
      60_000,
      MAX_GLOBAL_AUTH_ATTEMPTS_PER_MINUTE,
    )
  ) {
    return false;
  }
  clientState.authAttemptTimestamps = consumeRateLimitBudget(
    clientState.authAttemptTimestamps,
    now,
    60_000,
  );
  peerState.authAttemptTimestamps = consumeRateLimitBudget(
    peerState.authAttemptTimestamps,
    now,
    60_000,
  );
  server.globalAuthAttemptTimestamps = consumeRateLimitBudget(
    server.globalAuthAttemptTimestamps,
    now,
    60_000,
  );
  return true;
}

function consumeRequestBudget(server, clientState, peerState) {
  const now = Date.now();
  if (
    !hasRateLimitBudget(
      clientState.requestTimestamps,
      now,
      1_000,
      MAX_REQUESTS_PER_SECOND,
    ) ||
    !hasRateLimitBudget(
      peerState.requestTimestamps,
      now,
      1_000,
      MAX_REQUESTS_PER_SECOND,
    ) ||
    !hasRateLimitBudget(
      server.globalRequestTimestamps,
      now,
      1_000,
      MAX_GLOBAL_REQUESTS_PER_SECOND,
    )
  ) {
    return false;
  }
  clientState.requestTimestamps = consumeRateLimitBudget(
    clientState.requestTimestamps,
    now,
    1_000,
  );
  peerState.requestTimestamps = consumeRateLimitBudget(
    peerState.requestTimestamps,
    now,
    1_000,
  );
  server.globalRequestTimestamps = consumeRateLimitBudget(
    server.globalRequestTimestamps,
    now,
    1_000,
  );
  return true;
}

function consumeWriteBudget(server, clientState, peerState, grant = null) {
  const now = Date.now();
  const grantTimestamps = grant
    ? (server.grantWriteTimestamps.get(grant.id) ?? [])
    : [];
  if (
    !hasRateLimitBudget(
      clientState.writeTimestamps,
      now,
      1_000,
      MAX_WRITE_REQUESTS_PER_SECOND,
    ) ||
    (grant &&
      !hasRateLimitBudget(
        grantTimestamps,
        now,
        1_000,
        MAX_GRANT_WRITE_REQUESTS_PER_SECOND,
      )) ||
    !hasRateLimitBudget(
      peerState.writeTimestamps,
      now,
      1_000,
      MAX_PEER_WRITE_REQUESTS_PER_SECOND,
    ) ||
    !hasRateLimitBudget(
      server.globalWriteTimestamps,
      now,
      1_000,
      MAX_GLOBAL_WRITE_REQUESTS_PER_SECOND,
    )
  ) {
    return false;
  }
  clientState.writeTimestamps = consumeRateLimitBudget(
    clientState.writeTimestamps,
    now,
    1_000,
  );
  peerState.writeTimestamps = consumeRateLimitBudget(
    peerState.writeTimestamps,
    now,
    1_000,
  );
  if (grant) {
    server.grantWriteTimestamps.set(
      grant.id,
      consumeRateLimitBudget(grantTimestamps, now, 1_000),
    );
  }
  server.globalWriteTimestamps = consumeRateLimitBudget(
    server.globalWriteTimestamps,
    now,
    1_000,
  );
  return true;
}

module.exports = {
  MAX_GLOBAL_REQUESTS_PER_SECOND,
  MAX_GLOBAL_WRITE_REQUESTS_PER_SECOND,
  MAX_GRANT_WRITE_REQUESTS_PER_SECOND,
  MAX_PEER_WRITE_REQUESTS_PER_SECOND,
  MAX_REQUESTS_PER_SECOND,
  MAX_WRITE_REQUESTS_PER_SECOND,
  consumeAuthAttemptBudget,
  consumeRequestBudget,
  consumeWriteBudget,
  getPeerState,
};
