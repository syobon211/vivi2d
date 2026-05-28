const {
  grantFingerprint,
  isSafeTokenEqual,
} = require("./viewer-api-auth.cjs");
const { serializeGrantRevokedEvent } = require("./viewer-api-event-queue.cjs");

function revokeGrant(server, closeCodes, grantId) {
  const existing = server.grants.get(grantId);
  if (!existing) return false;
  const previousWriteTimestamps = server.grantWriteTimestamps.get(grantId);
  server.grants.delete(grantId);
  server.grantWriteTimestamps.delete(grantId);
  try {
    server.saveGrants();
  } catch (error) {
    server.grants.set(grantId, existing);
    if (previousWriteTimestamps) {
      server.grantWriteTimestamps.set(grantId, previousWriteTimestamps);
    }
    server.logger.warn?.("[viewer-api] grant revoke save failed", error);
    return false;
  }
  for (const client of server.wsServer?.clients ?? []) {
    if (client.__viewerGrantId === grantId) {
      const closeRevoked = () =>
        client.close(
          closeCodes.grantRevoked.code,
          closeCodes.grantRevoked.reason,
        );
      try {
        const clientState = client.__viewerApiClientState;
        const version = server.responseVersion(clientState);
        const fingerprint = grantFingerprint(existing);
        const event = serializeGrantRevokedEvent({
          version,
          eventId: server.nextEventId(),
          fingerprint,
        });
        client.send(event, closeRevoked);
      } catch (error) {
        server.logger.warn?.("[viewer-api] failed to send grant revocation", error);
        try {
          closeRevoked();
        } catch (closeError) {
          server.logger.warn?.("[viewer-api] failed to close revoked client", closeError);
        }
      }
    }
  }
  abortGrantRequests(server, grantId, "grant revoked");
  server.emitStatusChanged();
  return true;
}

function rotateGrant(server, closeCodes, grantId) {
  const existing = server.grants.get(grantId);
  if (!existing) return null;
  const revoked = revokeGrant(server, closeCodes, grantId);
  return revoked ? { id: existing.id, rePairRequired: true } : null;
}

function saveGrants(server) {
  server.grantStore?.save?.([...server.grants.values()]);
}

function scheduleGrantSave(server) {
  if (!server.grantStore || server.grantSaveTimer) return;
  server.grantSaveTimer = setTimeout(() => {
    server.grantSaveTimer = null;
    try {
      saveGrants(server);
    } catch (error) {
      server.logger.warn?.("[viewer-api] scheduled grant save failed", error);
    }
  }, 1_000);
  server.grantSaveTimer.unref?.();
}

function flushScheduledGrantSave(server) {
  if (!server.grantSaveTimer) return;
  clearTimeout(server.grantSaveTimer);
  server.grantSaveTimer = null;
  try {
    saveGrants(server);
  } catch (error) {
    server.logger.warn?.("[viewer-api] grant save flush failed", error);
  }
}

function findGrantByToken(server, authToken) {
  let matched = null;
  let matchCount = 0;
  for (const grant of server.grants.values()) {
    if (isSafeTokenEqual(grant.token, authToken)) {
      matched = grant;
      matchCount += 1;
    }
  }
  return matchCount === 1 ? matched : null;
}

function isActiveGrantSession(server, ws, grant) {
  return (
    Boolean(grant) &&
    server.grants.get(grant.id) === grant &&
    isSafeTokenEqual(ws.__viewerGrantToken, grant.token)
  );
}

function beginGrantRequest(server, grant) {
  const controller = new AbortController();
  let requests = server.activeGrantRequests.get(grant.id);
  if (!requests) {
    requests = new Set();
    server.activeGrantRequests.set(grant.id, requests);
  }
  requests.add(controller);
  return {
    signal: controller.signal,
    finish: () => {
      requests.delete(controller);
      if (requests.size === 0) {
        server.activeGrantRequests.delete(grant.id);
      }
    },
  };
}

function abortGrantRequests(server, grantId, reason) {
  const requests = server.activeGrantRequests.get(grantId);
  if (!requests) return;
  for (const controller of requests) {
    controller.abort(reason);
  }
  server.activeGrantRequests.delete(grantId);
}

module.exports = {
  abortGrantRequests,
  beginGrantRequest,
  findGrantByToken,
  flushScheduledGrantSave,
  isActiveGrantSession,
  revokeGrant,
  rotateGrant,
  saveGrants,
  scheduleGrantSave,
};
