const {
  VIEWER_API_EVENT_DEFS,
  VIVI_VIEWER_API_VERSION,
  isPreviewViewerApiVersion: isPreviewVersion,
} = require("./viewer-api-schema.cjs");
const {
  consumeRateLimitBudget,
  hasRateLimitBudget,
} = require("./viewer-api-rate-limit.cjs");
const { hasEventScope } = require("./viewer-api-scope-resolver.cjs");

const MAX_SUBSCRIPTION_CHANGES_PER_SECOND = 5;
const MAX_ACTIVE_EVENT_SUBSCRIPTIONS = 32;
const MAX_EVENT_QUEUE_COUNT = 128;
const MAX_EVENT_QUEUE_BYTES = 256 * 1024;
const MAX_EVENT_PAYLOAD_BYTES = 16 * 1024;
const MAX_EVENT_FLUSH_BYTES = 64 * 1024;

function createViewerApiClientState() {
  return {
    negotiatedVersion: null,
    authAttemptTimestamps: [],
    pairingChallengeTimestamps: [],
    requestTimestamps: [],
    writeTimestamps: [],
    subscriptionChangeTimestamps: [],
    subscriptions: new Map(),
    lastEventSent: new Map(),
    controlEventQueue: [],
    eventQueue: [],
    eventQueueBytes: 0,
    eventFlushScheduled: false,
  };
}

function normalizeEventFilter(filter = {}) {
  return {
    signalIds: Array.isArray(filter.signalIds) ? [...new Set(filter.signalIds)] : undefined,
    propIds: Array.isArray(filter.propIds) ? [...new Set(filter.propIds)] : undefined,
    actionIds: Array.isArray(filter.actionIds) ? [...new Set(filter.actionIds)] : undefined,
    minIntervalMs:
      typeof filter.minIntervalMs === "number"
        ? Math.max(17, Math.floor(filter.minIntervalMs))
        : undefined,
  };
}

function eventMatchesFilter(event, filter = {}) {
  const data = event.data ?? {};
  if (filter.signalIds?.length) {
    const signalIds = Array.isArray(data.signalIds) ? data.signalIds : [];
    if (!signalIds.some((id) => filter.signalIds.includes(id))) return false;
  }
  if (filter.propIds?.length) {
    const propId = data.propId ?? data.id;
    if (typeof propId !== "string" || !filter.propIds.includes(propId)) return false;
  }
  if (filter.actionIds?.length) {
    if (typeof data.actionId !== "string" || !filter.actionIds.includes(data.actionId)) {
      return false;
    }
  }
  return true;
}

function assertEventQueueState(clientState) {
  if (
    !clientState ||
    !Array.isArray(clientState.controlEventQueue) ||
    !Array.isArray(clientState.eventQueue)
  ) {
    throw new TypeError("invalid viewer api event queue state");
  }
}

function assertEventClientState(clientState) {
  assertEventQueueState(clientState);
  if (
    !(clientState.subscriptions instanceof Map) ||
    !(clientState.lastEventSent instanceof Map)
  ) {
    throw new TypeError("invalid viewer api event client state");
  }
}

function serializeGrantRevokedEvent({
  eventId,
  fingerprint,
  timestamp = Date.now(),
  version = VIVI_VIEWER_API_VERSION,
}) {
  return JSON.stringify({
    api: "ViviViewerApi",
    version,
    type: "viewer.api.grant.revoked",
    ok: true,
    eventId,
    timestamp,
    data: isPreviewVersion(version)
      ? { fingerprint, reason: "revoked" }
      : { grantId: fingerprint },
  });
}

class ViewerApiEventQueue {
  constructor({
    getClients = () => [],
    getGrantForClient = () => null,
    isActiveGrantSession = () => false,
    logger = console,
    responseVersion = () => VIVI_VIEWER_API_VERSION,
    nextEventId = null,
    now = () => Date.now(),
  } = {}) {
    this.getClients = getClients;
    this.getGrantForClient = getGrantForClient;
    this.isActiveGrantSession = isActiveGrantSession;
    this.logger = logger;
    this.responseVersion = responseVersion;
    this.now = now;
    this.localEventSequence = 0;
    this.nextEventId =
      typeof nextEventId === "function"
        ? nextEventId
        : () => `evt-${++this.localEventSequence}`;
  }

  clearClientState(clientState) {
    assertEventClientState(clientState);
    clientState.subscriptions.clear();
    clientState.lastEventSent.clear();
    clientState.controlEventQueue.length = 0;
    clientState.eventQueue.length = 0;
    clientState.eventQueueBytes = 0;
  }

  consumeSubscriptionBudget(clientState) {
    if (!Array.isArray(clientState?.subscriptionChangeTimestamps)) {
      throw new TypeError("invalid viewer api subscription rate state");
    }
    const now = this.now();
    if (
      !hasRateLimitBudget(
        clientState.subscriptionChangeTimestamps,
        now,
        1_000,
        MAX_SUBSCRIPTION_CHANGES_PER_SECOND,
      )
    ) {
      return false;
    }
    clientState.subscriptionChangeTimestamps = consumeRateLimitBudget(
      clientState.subscriptionChangeTimestamps,
      now,
      1_000,
    );
    return true;
  }

  handleEventSubscription(message, grant, context) {
    const clientState = context.clientState;
    if (!clientState) return { accepted: false, reason: "subscription state unavailable" };
    assertEventClientState(clientState);
    if (!this.consumeSubscriptionBudget(clientState)) {
      return { accepted: false, reason: "rate limited" };
    }
    const mode =
      message.type === "viewer.events.unsubscribe"
        ? (message.data.mode ?? "remove")
        : (message.data.mode ?? "replace");
    const events = (message.data.events ?? []).map((event) => ({
      name: event.name,
      filter: normalizeEventFilter(event.filter),
    }));
    if (mode !== "clear" && mode !== "remove") {
      const requiredScopes = [
        ...new Set(
          events
            .map((event) => VIEWER_API_EVENT_DEFS[event.name]?.scope)
            .filter((scope) => scope && !grant.scopes.includes(scope)),
        ),
      ].sort();
      if (requiredScopes.length > 0) {
        return {
          accepted: false,
          reason: "scope denied",
          details: { requiredScopes },
        };
      }
    }
    const next = new Map(clientState.subscriptions);
    if (mode === "replace") {
      next.clear();
      clientState.lastEventSent.clear();
    }
    if (mode === "clear") {
      next.clear();
      clientState.lastEventSent.clear();
    } else if (mode === "remove") {
      for (const event of events) {
        next.delete(event.name);
        clientState.lastEventSent.delete(event.name);
      }
    } else {
      for (const event of events) next.set(event.name, event.filter);
    }
    if (next.size > MAX_ACTIVE_EVENT_SUBSCRIPTIONS) {
      return { accepted: false, reason: "too many subscriptions" };
    }
    clientState.subscriptions = next;
    return {
      accepted: true,
      subscriptions: [...next.keys()].sort(),
    };
  }

  publishEvent(event) {
    if (!event || typeof event.name !== "string") return 0;
    if (!VIEWER_API_EVENT_DEFS[event.name]) return 0;
    const publicEvent = {
      name: event.name,
      data: event.data ?? {},
      timestamp: typeof event.timestamp === "number" ? event.timestamp : this.now(),
    };
    let delivered = 0;
    for (const ws of this.getClients() ?? []) {
      try {
        const clientState = ws.__viewerApiClientState;
        const grant = this.getGrantForClient(ws);
        if (!clientState || !grant || !this.isActiveGrantSession(ws, grant)) continue;
        if (!this.shouldDeliverEvent(clientState, grant, publicEvent)) continue;
        if (this.enqueueEvent(ws, clientState, publicEvent)) delivered += 1;
      } catch (error) {
        this.logger.warn?.("[viewer-api] failed to publish event to client", error);
      }
    }
    return delivered;
  }

  shouldDeliverEvent(clientState, grant, event) {
    assertEventClientState(clientState);
    if (event.name === "viewer.events.dropped" || event.name === "viewer.api.grant.revoked") {
      return true;
    }
    const filter = clientState.subscriptions.get(event.name);
    if (!filter) return false;
    if (!hasEventScope(grant, event.name)) return false;
    if (!eventMatchesFilter(event, filter)) return false;
    if (filter.minIntervalMs) {
      const last = clientState.lastEventSent.get(event.name) ?? 0;
      if (event.timestamp - last < filter.minIntervalMs) return false;
      clientState.lastEventSent.set(event.name, event.timestamp);
    }
    return true;
  }

  enqueueEvent(ws, clientState, event) {
    assertEventQueueState(clientState);
    const version = this.responseVersion(clientState);
    const envelope = {
      api: "ViviViewerApi",
      version,
      type: event.name,
      ok: true,
      eventId: this.nextEventId(),
      timestamp: event.timestamp,
      data: event.data,
    };
    const serialized = JSON.stringify(envelope);
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > MAX_EVENT_PAYLOAD_BYTES) {
      this.enqueueDroppedEvent(ws, clientState, "payload_too_large", 1);
      return false;
    }
    const droppedCount = this.evictEventQueueHead(clientState, bytes, 1);
    if (droppedCount > 0) {
      this.enqueueDroppedEvent(ws, clientState, "queue_overflow", droppedCount, {
        schedule: false,
      });
    }
    clientState.eventQueue.push({ serialized, bytes, droppedCount: 0 });
    clientState.eventQueueBytes += bytes;
    this.scheduleEventFlush(ws, clientState);
    return true;
  }

  enqueueDroppedEvent(ws, clientState, category, count, { schedule = true } = {}) {
    assertEventQueueState(clientState);
    const version = this.responseVersion(clientState);
    const existing = clientState.controlEventQueue.find(
      (event) => event.kind === "dropped" && event.category === category,
    );
    if (existing) {
      existing.count += count;
      const item = this.serializeDroppedEvent(category, existing.count, version);
      existing.serialized = item.serialized;
      existing.bytes = item.bytes;
    } else {
      const item = this.serializeDroppedEvent(category, count, version);
      clientState.controlEventQueue.push({
        ...item,
        kind: "dropped",
        category,
        count,
      });
    }
    if (schedule) this.scheduleEventFlush(ws, clientState);
  }

  evictEventQueueHead(clientState, incomingBytes, incomingSlots) {
    assertEventQueueState(clientState);
    let droppedCount = 0;
    while (
      clientState.eventQueue.length + incomingSlots > MAX_EVENT_QUEUE_COUNT ||
      clientState.eventQueueBytes + incomingBytes > MAX_EVENT_QUEUE_BYTES
    ) {
      const dropped = clientState.eventQueue.shift();
      if (!dropped) break;
      clientState.eventQueueBytes -= dropped.bytes;
      droppedCount += dropped.droppedCount && dropped.droppedCount > 0
        ? dropped.droppedCount
        : 1;
    }
    return droppedCount;
  }

  serializeDroppedEvent(category, count, version = VIVI_VIEWER_API_VERSION) {
    const serialized = JSON.stringify({
      api: "ViviViewerApi",
      version,
      type: "viewer.events.dropped",
      ok: true,
      eventId: this.nextEventId(),
      timestamp: this.now(),
      data: isPreviewVersion(version)
        ? { category, count }
        : { category, count, streamClosed: false },
    });
    return {
      serialized,
      bytes: Buffer.byteLength(serialized, "utf8"),
    };
  }

  scheduleEventFlush(ws, clientState) {
    assertEventQueueState(clientState);
    if (clientState.eventFlushScheduled) return;
    clientState.eventFlushScheduled = true;
    setTimeout(() => {
      clientState.eventFlushScheduled = false;
      this.flushEventQueue(ws, clientState);
    }, 0).unref?.();
  }

  flushEventQueue(ws, clientState) {
    assertEventQueueState(clientState);
    if (ws.readyState !== 1) return;
    let sentBytes = 0;
    while (clientState.controlEventQueue.length > 0) {
      const next = clientState.controlEventQueue[0];
      if (sentBytes + next.bytes > MAX_EVENT_FLUSH_BYTES && sentBytes > 0) break;
      clientState.controlEventQueue.shift();
      sentBytes += next.bytes;
      ws.send(next.serialized);
    }
    while (clientState.eventQueue.length > 0) {
      const next = clientState.eventQueue[0];
      if (sentBytes + next.bytes > MAX_EVENT_FLUSH_BYTES) break;
      clientState.eventQueue.shift();
      clientState.eventQueueBytes -= next.bytes;
      sentBytes += next.bytes;
      ws.send(next.serialized);
    }
    if (clientState.controlEventQueue.length > 0 || clientState.eventQueue.length > 0) {
      this.scheduleEventFlush(ws, clientState);
    }
  }
}

module.exports = {
  MAX_ACTIVE_EVENT_SUBSCRIPTIONS,
  MAX_EVENT_FLUSH_BYTES,
  MAX_EVENT_PAYLOAD_BYTES,
  MAX_EVENT_QUEUE_BYTES,
  MAX_EVENT_QUEUE_COUNT,
  MAX_SUBSCRIPTION_CHANGES_PER_SECOND,
  ViewerApiEventQueue,
  createViewerApiClientState,
  eventMatchesFilter,
  normalizeEventFilter,
  serializeGrantRevokedEvent,
};
