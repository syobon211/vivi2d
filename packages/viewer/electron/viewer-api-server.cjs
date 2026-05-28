const { WebSocketServer } = require("ws");
const { attachViewerApiConnection } = require("./viewer-api-transport.cjs");
const {
  buildAssetBrokerGrant,
  buildClientStatus,
  buildViewerApiCapabilities,
  buildViewerApiStatus,
} = require("./viewer-api-capabilities.cjs");
const {
  approveChallenge: approvePairingChallenge,
  closePairingWindow: closePairingWindowState,
  handleChallenge: handlePairingChallenge,
  makeChallengeTerminalResponse: makePairingChallengeTerminalResponse,
  openPairingWindow: openPairingWindowState,
  purgeExpiredChallenges: purgeExpiredPairingChallenges,
  sendChallengeTerminal: sendPairingChallengeTerminal,
} = require("./viewer-api-pairing.cjs");
const {
  abortGrantRequests: abortGrantSessionRequests,
  beginGrantRequest: beginGrantSessionRequest,
  findGrantByToken: findSessionGrantByToken,
  flushScheduledGrantSave: flushScheduledGrantSessionSave,
  isActiveGrantSession: isActiveGrantSessionState,
  revokeGrant: revokeGrantSession,
  rotateGrant: rotateGrantSession,
  saveGrants: saveGrantSessions,
  scheduleGrantSave: scheduleGrantSessionSave,
} = require("./viewer-api-grant-sessions.cjs");
const {
  MAX_AUTH_ATTEMPTS_PER_MINUTE,
  MAX_GRANTS,
  MAX_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_PAIRING_WINDOW_MS,
  PAIRING_WINDOW_MS,
} = require("./viewer-api-auth.cjs");
const {
  dispatchViewerApiRequest,
  getImplementedRequestTypes: collectImplementedRequestTypes,
} = require("./viewer-api-dispatch.cjs");
const { ViewerApiEventQueue } = require("./viewer-api-event-queue.cjs");
const {
  isGrantAllowedForOrigin,
  isLoopbackHostHeader,
  normalizeOrigin,
} = require("./viewer-api-origin.cjs");
const { VIEWER_API_CLOSE_CODES } = require("./viewer-api-close-codes.cjs");
const {
  MAX_GRANT_WRITE_REQUESTS_PER_SECOND,
  MAX_PEER_WRITE_REQUESTS_PER_SECOND,
  MAX_WRITE_REQUESTS_PER_SECOND,
  consumeAuthAttemptBudget,
  consumeRequestBudget: consumeViewerApiRequestBudget,
  consumeWriteBudget: consumeViewerApiWriteBudget,
  getPeerState: getViewerApiPeerState,
} = require("./viewer-api-request-budgets.cjs");
const {
  DEFAULT_PRE_NEGOTIATION_VIEWER_API_VERSION,
  MAX_MESSAGE_BYTES,
  VIEWER_API_REQUEST_DEFS,
  VIVI_VIEWER_API_VERSION,
  makeResponse,
} = require("./viewer-api-schema.cjs");

const DEFAULT_PORT = 0;
const MAX_CLIENTS = 64;
const VIEWER_API_HTTP_HEADERS_TIMEOUT_MS = 10_000;
const VIEWER_API_HTTP_REQUEST_TIMEOUT_MS = 30_000;

class ViewerApiServer {
  constructor({
    port = DEFAULT_PORT,
    logger = console,
    handlers = {},
    resolveActionKind = null,
    persistentGrantsAvailable = false,
    grantStore = null,
    allowSessionGrants = false,
    allowIpv6Loopback = false,
  } = {}) {
    this.port = port;
    this.logger = logger;
    this.handlers = handlers;
    this.resolveActionKind = resolveActionKind;
    this.persistentGrantsAvailable = persistentGrantsAvailable;
    this.grantStore = grantStore;
    this.allowSessionGrants = allowSessionGrants;
    this.allowIpv6Loopback = allowIpv6Loopback;
    this.server = null;
    this.wsServer = null;
    this.enabled = false;
    this.grants = new Map();
    for (const grant of this.grantStore?.load?.() ?? []) {
      this.grants.set(grant.id, grant);
    }
    this.pendingChallenges = new Map();
    this.pairingWindowUntil = 0;
    this.pairingAllowedOrigins = new Set();
    this.serverTransition = null;
    this.serverTransitionToken = null;
    this.globalAuthAttemptTimestamps = [];
    this.globalPairingChallengeTimestamps = [];
    this.globalWriteTimestamps = [];
    this.globalRequestTimestamps = [];
    this.peerStates = new Map();
    this.grantWriteTimestamps = new Map();
    this.grantSaveTimer = null;
    this.activeGrantRequests = new Map();
    this.statusListeners = new Set();
    this.eventSequence = 0;
    this.nextEventId = () => `evt-${++this.eventSequence}`;
    this.eventQueue = new ViewerApiEventQueue({
      getClients: () => this.wsServer?.clients ?? [],
      getGrantForClient: (ws) => this.grants.get(ws.__viewerGrantId),
      isActiveGrantSession: (ws, currentGrant) =>
        this.isActiveGrantSession(ws, currentGrant),
      logger: this.logger,
      responseVersion: (clientState) => this.responseVersion(clientState),
      nextEventId: () => this.nextEventId(),
    });
  }

  getStatus() {
    return buildViewerApiStatus(this);
  }

  getAssetBrokerGrant(grantId) {
    return buildAssetBrokerGrant(this, grantId);
  }

  responseVersion(clientState) {
    return clientState?.negotiatedVersion ?? DEFAULT_PRE_NEGOTIATION_VIEWER_API_VERSION;
  }

  sendResponse(ws, clientState, id, type, ok, data, error, details) {
    ws.send(
      JSON.stringify(
        makeResponse(id, type, ok, data, error, details, {
          version: this.responseVersion(clientState),
        }),
      ),
    );
  }

  sendMessage(ws, payload) {
    ws.send(JSON.stringify(payload));
  }

  makeChallengeTerminalResponse(challenge, ok, data, error, details) {
    return makePairingChallengeTerminalResponse(challenge, ok, data, error, details);
  }

  sendChallengeTerminal(challenge, ok, data, error, details) {
    return sendPairingChallengeTerminal(this, challenge, ok, data, error, details);
  }

  getCapabilities({ authenticated = false, version = VIVI_VIEWER_API_VERSION } = {}) {
    return buildViewerApiCapabilities(this, VIEWER_API_CLOSE_CODES, {
      authenticated,
      version,
    });
  }

  getImplementedRequestTypes() {
    return collectImplementedRequestTypes(this.handlers);
  }

  getImplementedRequestTypeNames() {
    return this.getImplementedRequestTypes().map((request) => request.name);
  }

  isRequestEnabled(type) {
    const definition = VIEWER_API_REQUEST_DEFS[type];
    if (!definition) return false;
    return Boolean(definition.enabled || this.handlers[type]);
  }

  onStatusChanged(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  emitStatusChanged() {
    const status = this.getStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (error) {
        this.logger.warn?.("[viewer-api] status listener failed", error);
      }
    }
  }

  async setEnabled(enabled, { port } = {}) {
    if (enabled) {
      await this.start({ port });
    } else {
      await this.stop();
    }
    return this.getStatus();
  }

  async start({ port } = {}) {
    return this.withServerTransition(() => this.startUnlocked({ port }));
  }

  async startUnlocked({ port } = {}) {
    if (this.enabled) {
      if (port === undefined || port === this.port) return;
      await this.stopUnlocked();
    }
    this.port = port ?? this.port;
    this.wsServer = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_MESSAGE_BYTES,
      perMessageDeflate: false,
    });
    this.server = require("node:http").createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    this.server.headersTimeout = VIEWER_API_HTTP_HEADERS_TIMEOUT_MS;
    this.server.requestTimeout = VIEWER_API_HTTP_REQUEST_TIMEOUT_MS;
    this.server.timeout = VIEWER_API_HTTP_REQUEST_TIMEOUT_MS;
    this.server.on("upgrade", (request, socket, head) => {
      if (!this.acceptUpgrade(request)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wsServer.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, request);
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, "127.0.0.1", () => {
        this.server.off("error", reject);
        const address = this.server.address();
        if (address && typeof address === "object") {
          this.port = address.port;
        }
        resolve();
      });
    });
    this.enabled = true;
    this.emitStatusChanged();
  }

  async stop() {
    return this.withServerTransition(() => this.stopUnlocked());
  }

  async stopUnlocked() {
    if (!this.server && !this.wsServer) {
      this.enabled = false;
      return;
    }
    this.closePairingWindow();
    for (const client of this.wsServer?.clients ?? []) {
      client.close();
    }
    await new Promise((resolve) => {
      this.wsServer?.close(() => resolve());
      if (!this.wsServer) resolve();
    });
    await new Promise((resolve) => {
      this.server?.close(() => resolve());
      if (!this.server) resolve();
    });
    this.server = null;
    this.wsServer = null;
    this.enabled = false;
    this.flushScheduledGrantSave();
    this.emitStatusChanged();
  }

  async withServerTransition(task) {
    const previous = this.serverTransition ?? Promise.resolve();
    const token = {};
    this.serverTransitionToken = token;
    const transition = previous.catch(() => {}).then(task);
    this.serverTransition = transition;
    try {
      return await transition;
    } finally {
      if (this.serverTransitionToken === token) {
        this.serverTransition = null;
        this.serverTransitionToken = null;
      }
    }
  }

  acceptUpgrade(request) {
    if ((this.wsServer?.clients.size ?? 0) >= MAX_CLIENTS) {
      return false;
    }
    if (
      !isLoopbackHostHeader(request.headers.host, {
        allowIpv6Loopback: this.allowIpv6Loopback,
      })
    ) {
      return false;
    }
    const fetchSite = request.headers["sec-fetch-site"];
    if (fetchSite && !["none", "same-origin"].includes(fetchSite)) return false;
    const hasOriginHeader = typeof request.headers.origin === "string";
    const origin = normalizeOrigin(request.headers.origin);
    if (hasOriginHeader && !origin) return false;
    if (!origin) return true;
    if (
      Date.now() < this.pairingWindowUntil &&
      this.pairingAllowedOrigins.has(origin)
    ) {
      return true;
    }
    return [...this.grants.values()].some((grant) =>
      isGrantAllowedForOrigin(grant, origin),
    );
  }

  openPairingWindow(durationMs = PAIRING_WINDOW_MS, { origins = [] } = {}) {
    return openPairingWindowState(this, durationMs, { origins });
  }

  closePairingWindow() {
    return closePairingWindowState(this);
  }

  purgeExpiredChallenges(now = Date.now()) {
    return purgeExpiredPairingChallenges(this, now);
  }

  approveChallenge(challengeId, confirmationCode) {
    return approvePairingChallenge(this, challengeId, confirmationCode);
  }

  revokeGrant(grantId) {
    return revokeGrantSession(this, VIEWER_API_CLOSE_CODES, grantId);
  }

  rotateGrant(grantId) {
    return rotateGrantSession(this, VIEWER_API_CLOSE_CODES, grantId);
  }

  saveGrants() {
    return saveGrantSessions(this);
  }

  scheduleGrantSave() {
    return scheduleGrantSessionSave(this);
  }

  flushScheduledGrantSave() {
    return flushScheduledGrantSessionSave(this);
  }

  findGrantByToken(authToken) {
    return findSessionGrantByToken(this, authToken);
  }

  isActiveGrantSession(ws, grant) {
    return isActiveGrantSessionState(this, ws, grant);
  }

  beginGrantRequest(grant) {
    return beginGrantSessionRequest(this, grant);
  }

  abortGrantRequests(grantId, reason) {
    return abortGrantSessionRequests(this, grantId, reason);
  }

  getPeerState(peerKey) {
    return getViewerApiPeerState(this, peerKey);
  }

  handleConnection(ws, request) {
    return attachViewerApiConnection(this, ws, request, {
      closeCodes: VIEWER_API_CLOSE_CODES,
    });
  }

  handleChallenge(ws, message, origin, clientState, peerState) {
    return handlePairingChallenge(this, ws, message, origin, clientState, peerState);
  }

  consumeAuthAttempt(clientState, peerState) {
    return consumeAuthAttemptBudget(this, clientState, peerState);
  }

  consumeRequestBudget(clientState, peerState) {
    return consumeViewerApiRequestBudget(this, clientState, peerState);
  }

  consumeWriteBudget(clientState, peerState, grant = null) {
    return consumeViewerApiWriteBudget(this, clientState, peerState, grant);
  }

  consumeSubscriptionBudget(clientState) {
    return this.eventQueue.consumeSubscriptionBudget(clientState);
  }

  handleEventSubscription(message, grant, context) {
    return this.eventQueue.handleEventSubscription(message, grant, context);
  }

  publishEvent(event) {
    return this.eventQueue.publishEvent(event);
  }

  shouldDeliverEvent(clientState, grant, event) {
    return this.eventQueue.shouldDeliverEvent(clientState, grant, event);
  }

  enqueueEvent(ws, clientState, event) {
    return this.eventQueue.enqueueEvent(ws, clientState, event);
  }

  enqueueDroppedEvent(ws, clientState, category, count, { schedule = true } = {}) {
    return this.eventQueue.enqueueDroppedEvent(ws, clientState, category, count, {
      schedule,
    });
  }

  evictEventQueueHead(clientState, incomingBytes, incomingSlots) {
    return this.eventQueue.evictEventQueueHead(clientState, incomingBytes, incomingSlots);
  }

  serializeDroppedEvent(category, count, version = VIVI_VIEWER_API_VERSION) {
    return this.eventQueue.serializeDroppedEvent(category, count, version);
  }

  scheduleEventFlush(ws, clientState) {
    return this.eventQueue.scheduleEventFlush(ws, clientState);
  }

  flushEventQueue(ws, clientState) {
    return this.eventQueue.flushEventQueue(ws, clientState);
  }

  async dispatch(message, grant, context = {}) {
    return dispatchViewerApiRequest(message, grant, context, {
      handlers: this.handlers,
      getCapabilities: (options) => this.getCapabilities(options),
      getClientStatus: (currentGrant) => this.getClientStatus(currentGrant),
      handleEventSubscription: (eventMessage, currentGrant, eventContext) =>
        this.handleEventSubscription(eventMessage, currentGrant, eventContext),
    });
  }

  getClientStatus(grant) {
    return buildClientStatus(this, grant);
  }

  resolveActionRunKind(message) {
    if (message.type !== "viewer.action.run") return { ok: true };
    const hasActionHandler = Boolean(this.handlers["viewer.action.run"]);
    if (!hasActionHandler) return { ok: true };
    if (typeof this.resolveActionKind !== "function") {
      return { ok: false, error: "action kind resolver unavailable" };
    }
    const resolvedKind = this.resolveActionKind(message.data.actionId);
    if (resolvedKind !== message.data.actionKind) {
      return { ok: false, error: "action kind mismatch" };
    }
    return { ok: true };
  }
}

function createViewerApiServer(options) {
  return new ViewerApiServer(options);
}

module.exports = {
  DEFAULT_PORT,
  MAX_PAIRING_CHALLENGES_PER_WINDOW,
  MAX_AUTH_ATTEMPTS_PER_MINUTE,
  MAX_PAIRING_WINDOW_MS,
  MAX_GRANTS,
  MAX_GRANT_WRITE_REQUESTS_PER_SECOND,
  MAX_PEER_WRITE_REQUESTS_PER_SECOND,
  MAX_WRITE_REQUESTS_PER_SECOND,
  VIEWER_API_CLOSE_CODES,
  VIEWER_API_HTTP_HEADERS_TIMEOUT_MS,
  VIEWER_API_HTTP_REQUEST_TIMEOUT_MS,
  ViewerApiServer,
  createViewerApiServer,
  isLoopbackHostHeader,
  normalizeOrigin,
};
