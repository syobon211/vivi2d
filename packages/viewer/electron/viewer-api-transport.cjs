const { projectPublicResponseData } = require("./viewer-api-dispatch.cjs");
const { createViewerApiClientState } = require("./viewer-api-event-queue.cjs");
const { isGrantAllowedForOrigin, normalizeOrigin } = require("./viewer-api-origin.cjs");
const { grantFingerprint } = require("./viewer-api-auth.cjs");
const {
  MAX_MESSAGE_BYTES,
  MAX_REQUEST_PAYLOAD_BYTES,
  isPreviewViewerApiVersion: isPreviewVersion,
  makeResponse,
  parseViewerApiMessage,
  requiredScopeAlternativesForMessage,
} = require("./viewer-api-schema.cjs");
const {
  extractMessageId,
  extractSafeMessageContext,
  responseTypeFor,
} = require("./viewer-api-transport-context.cjs");
const {
  hasScopeAlternatives,
  hasWriteType,
  publicScopeDeniedDetails,
} = require("./viewer-api-scope-resolver.cjs");

/**
 * Attach WebSocket message handling to a Viewer API peer.
 *
 * The transport owns wire-level parsing, close codes, auth flow dispatch, and
 * response projection. The server argument is intentionally a narrow
 * composition seam: it must provide getPeerState, sendResponse,
 * handleChallenge, consumeAuthAttempt, consume*Budget, dispatch, beginGrantRequest,
 * getCapabilities, isRequestEnabled, resolveActionRunKind, scheduleGrantSave,
 * emitStatusChanged, grant/session lookup helpers, persistentGrantsAvailable,
 * logger, pendingChallenges, and eventQueue.
 */
function attachViewerApiConnection(server, ws, request, { closeCodes }) {
  const origin = normalizeOrigin(request.headers.origin);
  const peerState = server.getPeerState(request.socket.remoteAddress ?? "loopback");
  let grant = null;
  const clientState = createViewerApiClientState();
  ws.__viewerApiClientState = clientState;
  let purged = false;
  const purgePending = () => {
    if (purged) return;
    purged = true;
    try {
      for (const [id, challenge] of server.pendingChallenges) {
        if (challenge.ws === ws) server.pendingChallenges.delete(id);
      }
      server.eventQueue.clearClientState(clientState);
    } catch (error) {
      server.logger.warn?.("[viewer-api] failed to clear client state", error);
    }
  };
  ws.on("close", purgePending);
  ws.on("error", purgePending);
  ws.on("message", async (raw, isBinary) => {
    let messageId = extractMessageId(raw);
    try {
      if (isBinary) {
        ws.close(
          closeCodes.binaryRejected.code,
          closeCodes.binaryRejected.reason,
        );
        return;
      }
      const rawText = typeof raw === "string" ? raw : raw?.toString?.("utf8");
      const rawBytes = typeof rawText === "string"
        ? Buffer.byteLength(rawText, "utf8")
        : MAX_MESSAGE_BYTES + 1;
      if (rawBytes > MAX_MESSAGE_BYTES) {
        ws.close(
          closeCodes.frameTooLarge.code,
          closeCodes.frameTooLarge.reason,
        );
        return;
      }
      if (rawBytes > MAX_REQUEST_PAYLOAD_BYTES) {
        const context = extractSafeMessageContext(raw, clientState.negotiatedVersion);
        ws.send(
          JSON.stringify(
            makeResponse(
              context.id,
              context.associated && isPreviewVersion(context.version)
                ? `${context.type}.result`
                : "viewer.error",
              false,
              {},
              "payload too large",
              { limitBytes: MAX_REQUEST_PAYLOAD_BYTES },
              { version: context.version },
            ),
          ),
        );
        return;
      }
      if (!server.consumeRequestBudget(clientState, peerState)) {
        server.sendResponse(
          ws,
          clientState,
          messageId,
          "viewer.error",
          false,
          {},
          "rate limited",
          { bucket: origin ? "origin" : "no-origin" },
        );
        return;
      }
      const message = parseViewerApiMessage(raw, {
        negotiatedVersion: clientState.negotiatedVersion,
      });
      clientState.negotiatedVersion ??= message.version;
      messageId = message.id;
      if (message.type === "viewer.api.capabilities.get" && !grant) {
        server.sendResponse(
          ws,
          clientState,
          message.id,
          "viewer.api.capabilities.get.result",
          true,
          {
            capabilities: server.getCapabilities({
              authenticated: false,
              version: message.version,
            }),
          },
        );
        return;
      }
      if (message.type === "viewer.auth.challenge") {
        server.handleChallenge(ws, message, origin, clientState, peerState);
        return;
      }
      if (message.type === "viewer.auth.authenticate") {
        if (grant) {
          server.sendResponse(
            ws,
            clientState,
            message.id,
            responseTypeFor(message, "viewer.auth.result"),
            false,
            {},
            "invalid request",
          );
          return;
        }
        if (!server.consumeAuthAttempt(clientState, peerState)) {
          server.sendResponse(
            ws,
            clientState,
            message.id,
            responseTypeFor(message, "viewer.auth.result"),
            false,
            {},
            "rate limited",
            { bucket: origin ? "origin" : "no-origin" },
          );
          return;
        }
        const matchedGrant = server.findGrantByToken(message.data.token);
        const nextGrant =
          matchedGrant && isGrantAllowedForOrigin(matchedGrant, origin)
            ? matchedGrant
            : null;
        if (nextGrant) {
          grant = nextGrant;
          nextGrant.lastUsedAt = Date.now();
          ws.__viewerGrantId = nextGrant.id;
          ws.__viewerGrantToken = message.data.token;
          server.scheduleGrantSave();
          server.emitStatusChanged();
        }
        ws.send(
          JSON.stringify(
            makeResponse(
              message.id,
              responseTypeFor(message, "viewer.auth.result"),
              Boolean(nextGrant),
              isPreviewVersion(message.version)
                ? nextGrant
                  ? {
                      grantId: nextGrant.id,
                      fingerprint: grantFingerprint(nextGrant),
                      scopes: [...nextGrant.scopes],
                      tokenPersistence: server.persistentGrantsAvailable
                        ? "persistent"
                        : server.allowSessionGrants
                          ? "session"
                          : "unavailable",
                    }
                  : { authenticated: false }
                : { authenticated: Boolean(nextGrant) },
              nextGrant || !isPreviewVersion(message.version)
                ? undefined
                : "unauthenticated",
              undefined,
              { version: message.version },
            ),
          ),
        );
        return;
      }
      const currentGrant = grant;
      if (!currentGrant) {
        server.sendResponse(
          ws,
          clientState,
          message.id,
          responseTypeFor(message),
          false,
          {},
          "unauthenticated",
        );
        return;
      }
      if (!server.isActiveGrantSession(ws, currentGrant)) {
        if (grant === currentGrant) grant = null;
        server.sendResponse(
          ws,
          clientState,
          message.id,
          responseTypeFor(message),
          false,
          {},
          "grant revoked",
        );
        return;
      }
      if (!server.isRequestEnabled(message.type)) {
        server.sendResponse(
          ws,
          clientState,
          message.id,
          responseTypeFor(message),
          false,
          {},
          "unsupported",
          { feature: message.type },
        );
        return;
      }
      if (message.type === "viewer.action.run") {
        const checked = server.resolveActionRunKind(message);
        if (!checked.ok) {
          server.sendResponse(
            ws,
            clientState,
            message.id,
            responseTypeFor(message),
            false,
            {},
            checked.error,
          );
          return;
        }
      }
      const requiredScopes = requiredScopeAlternativesForMessage(message);
      if (!hasScopeAlternatives(currentGrant, requiredScopes)) {
        server.sendResponse(
          ws,
          clientState,
          message.id,
          responseTypeFor(message),
          false,
          {},
          "scope denied",
          publicScopeDeniedDetails(requiredScopes),
        );
        return;
      }
      if (
        hasWriteType(message.type) &&
        !server.consumeWriteBudget(clientState, peerState, currentGrant)
      ) {
        server.sendResponse(
          ws,
          clientState,
          message.id,
          responseTypeFor(message),
          false,
          {},
          "rate limited",
          { bucket: "grant" },
        );
        return;
      }
      const activeRequest = server.beginGrantRequest(currentGrant);
      let data;
      try {
        data = await server.dispatch(message, currentGrant, {
          signal: activeRequest.signal,
          clientState,
          origin,
        });
      } finally {
        activeRequest.finish();
      }
      if (!server.isActiveGrantSession(ws, currentGrant) || activeRequest.signal.aborted) {
        if (grant === currentGrant) grant = null;
        server.sendResponse(
          ws,
          clientState,
          message.id,
          responseTypeFor(message),
          false,
          {},
          "grant revoked",
        );
        return;
      }
      const ok = data?.accepted !== false;
      server.sendResponse(
        ws,
        clientState,
        message.id,
        `${message.type}.result`,
        ok,
        projectPublicResponseData(message.type, data),
        ok ? undefined : data?.reason ?? "request failed",
        ok ? undefined : data?.details,
      );
    } catch (error) {
      const context = extractSafeMessageContext(raw, clientState.negotiatedVersion);
      ws.send(
        JSON.stringify(
          makeResponse(
            context.id ?? messageId,
            context.associated && isPreviewVersion(context.version)
              ? `${context.type}.result`
              : "viewer.error",
            false,
            {},
            "invalid request",
            undefined,
            { version: context.version },
          ),
        ),
      );
      server.logger.warn?.("[viewer-api] rejected message", error);
    }
  });
}

module.exports = {
  attachViewerApiConnection,
  extractMessageId,
  extractSafeMessageContext,
  responseTypeFor,
};
