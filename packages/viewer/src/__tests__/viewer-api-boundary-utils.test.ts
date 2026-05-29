/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, expect, it } from "vitest";

const auth = require("../../electron/viewer-api-auth.cjs");
const dispatch = require("../../electron/viewer-api-dispatch.cjs");
const eventQueue = require("../../electron/viewer-api-event-queue.cjs");
const origin = require("../../electron/viewer-api-origin.cjs");
const rateLimit = require("../../electron/viewer-api-rate-limit.cjs");
const scopeResolver = require("../../electron/viewer-api-scope-resolver.cjs");
const transport = require("../../electron/viewer-api-transport.cjs");

const { isSafeTokenEqual, publicGrant } = auth;
const {
  dispatchViewerApiRequest,
  projectPublicResponseData,
  publicEventRegistry,
  splitBySurface,
} = dispatch;
const { ViewerApiEventQueue, createViewerApiClientState, serializeGrantRevokedEvent } =
  eventQueue;
const {
  isGrantAllowedForOrigin,
  isLoopbackHostHeader,
  normalizeAllowedOrigins,
  normalizeOrigin,
  parseHostHeader,
} = origin;
const { consumeRateLimitBudget, hasRateLimitBudget, pruneTimestamps } = rateLimit;
const { hasScopeAlternatives, publicScopeDeniedDetails } = scopeResolver;
const { extractMessageId, extractSafeMessageContext, responseTypeFor } = transport;

describe("Viewer API origin boundary helpers", () => {
  it("normalizes browser origins with URL canonicalization", () => {
    expect(normalizeOrigin("HTTP://LOCALHOST:80/path")).toBe("http://localhost");
    expect(normalizeOrigin("https://Example.COM:443/a")).toBe("https://example.com");
    expect(normalizeOrigin("file:///tmp/model.vivi")).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
  });

  it("parses and restricts host headers to explicit loopback hosts", () => {
    expect(parseHostHeader("127.0.0.1:3000")).toEqual({
      host: "127.0.0.1",
      port: 3000,
    });
    expect(isLoopbackHostHeader("127.0.0.1:3000")).toBe(true);
    expect(isLoopbackHostHeader("[::1]:3000")).toBe(false);
    expect(isLoopbackHostHeader("[::1]:3000", { allowIpv6Loopback: true })).toBe(true);
    expect(isLoopbackHostHeader("localhost:3000")).toBe(false);
  });

  it("uses one canonical origin binding rule for grants and allowlists", () => {
    const grant = {
      scopes: ["read:state"],
      originBinding: "https://example.com",
    };

    expect(normalizeAllowedOrigins(["https://EXAMPLE.com/a"])).toEqual([
      "https://example.com",
    ]);
    expect(isGrantAllowedForOrigin(grant, "https://example.com")).toBe(true);
    expect(isGrantAllowedForOrigin(grant, "https://evil.example.com")).toBe(false);
    expect(
      isGrantAllowedForOrigin({ scopes: [], originBinding: "no-origin" }, null),
    ).toBe(true);
  });
});

describe("Viewer API rate-limit helpers", () => {
  it("prunes, checks, and consumes timestamps without mutating caller arrays", () => {
    const existing = [0, 900, 950];
    const pruned = pruneTimestamps(existing, 1_000, 100);

    expect(pruned).toEqual([950]);
    expect(existing).toEqual([0, 900, 950]);
    expect(hasRateLimitBudget(existing, 1_000, 200, 2)).toBe(false);
    expect(consumeRateLimitBudget(existing, 1_000, 100)).toEqual([950, 1_000]);
  });
});

describe("Viewer API transport helpers", () => {
  it("extracts only bounded message ids from raw text frames", () => {
    expect(extractMessageId(JSON.stringify({ id: "message-1" }))).toBe("message-1");
    expect(extractMessageId(JSON.stringify({ id: "x".repeat(129) }))).toBeUndefined();
    expect(extractMessageId("{not-json")).toBeUndefined();
  });

  it("recovers a safe context for malformed known preview requests", () => {
    const raw = JSON.stringify({
      api: "ViviViewerApi",
      version: "0.preview",
      id: "message-1",
      type: "viewer.state.get",
    });

    expect(extractSafeMessageContext(raw, null)).toEqual({
      id: "message-1",
      type: "viewer.state.get",
      version: "0.preview",
      associated: true,
    });
    expect(extractSafeMessageContext(raw, "0.experimental")).toEqual({
      id: "message-1",
      version: "0.experimental",
      associated: false,
    });
    expect(extractSafeMessageContext("{not-json", null)).toMatchObject({
      associated: false,
      version: "0.preview",
    });
  });

  it("uses preview result envelopes only for negotiated preview messages", () => {
    expect(responseTypeFor({ version: "0.preview", type: "viewer.state.get" })).toBe(
      "viewer.state.get.result",
    );
    expect(responseTypeFor({ version: "0.experimental", type: "viewer.state.get" })).toBe(
      "viewer.error",
    );
    expect(responseTypeFor(null, "viewer.auth.result")).toBe("viewer.auth.result");
  });
});

describe("Viewer API auth and scope helpers", () => {
  it("redacts grant secrets and compares tokens without leaking length-mismatch errors", () => {
    const grant = {
      id: "grant-1",
      token: "secret-token",
      appName: "Fixture app",
      scopes: ["read:state"],
      originBinding: "no-origin",
      createdAt: 123,
      lastUsedAt: 456,
    };

    expect(isSafeTokenEqual("same", "same")).toBe(true);
    expect(isSafeTokenEqual("same", "different")).toBe(false);
    expect(publicGrant(grant)).toMatchObject({
      id: "grant-1",
      appName: "Fixture app",
      origins: [],
      scopes: ["read:state"],
    });
    expect(publicGrant(grant)).not.toHaveProperty("token");
  });

  it("resolves all scope alternatives and projects safe denial details", () => {
    const grant = { scopes: ["read:state", "write:props"] };

    expect(
      hasScopeAlternatives(grant, [["read:state"], ["write:signals", "write:props"]]),
    ).toBe(true);
    expect(
      hasScopeAlternatives({ scopes: ["write:signals"] }, [
        ["write:signals", "run:actions:safe"],
      ]),
    ).toBe(false);
    expect(
      hasScopeAlternatives({ scopes: ["write:signals", "run:actions:safe"] }, [
        ["write:signals", "run:actions:safe"],
      ]),
    ).toBe(true);
    expect(hasScopeAlternatives(grant, [[]])).toBe(true);
    expect(hasScopeAlternatives(grant, [])).toBe(true);
    expect(hasScopeAlternatives(grant, [["read:actions"]])).toBe(false);
    expect(
      publicScopeDeniedDetails([["write:props", "read:state"], ["read:state"]]),
    ).toEqual({ requiredScopes: ["read:state", "write:props"] });
  });
});

describe("Viewer API dispatch and event queue helpers", () => {
  it("projects public response payloads without leaking internal dispatch fields", () => {
    expect(
      projectPublicResponseData("viewer.prop.load", {
        accepted: true,
        reason: "internal",
        subscriptions: ["viewer.action.completed"],
        propId: "prop-1",
      }),
    ).toEqual({ propId: "prop-1" });
    expect(
      projectPublicResponseData("viewer.events.subscribe", {
        subscriptions: ["viewer.signals.changed", "viewer.action.completed"],
      }),
    ).toEqual({
      subscription: {
        eventTypes: ["viewer.action.completed", "viewer.signals.changed"],
      },
    });
  });

  it("keeps public registry entries surface-splittable", () => {
    const surfaces = splitBySurface(publicEventRegistry());

    expect(surfaces.core.length).toBeGreaterThan(0);
    expect(surfaces.extensions.length).toBeGreaterThan(0);
  });

  it("dispatches built-in fallbacks through explicit dependencies", async () => {
    const grant = { id: "grant-1" };
    const dispatchedCalls: Array<[string, unknown]> = [];
    const dependencies = {
      handlers: {},
      getCapabilities: (options: unknown) => {
        dispatchedCalls.push(["capabilities", options]);
        return { api: "caps", options };
      },
      getClientStatus: (currentGrant: { id: string }) => ({ grantId: currentGrant.id }),
      handleEventSubscription: (message: { type: string }) => {
        dispatchedCalls.push(["subscription", message.type]);
        return {
          accepted: true,
          subscriptions: ["viewer.action.completed"],
        };
      },
    };

    await expect(
      dispatchViewerApiRequest(
        { type: "viewer.state.get", data: {} },
        grant,
        {},
        dependencies,
      ),
    ).resolves.toEqual({ grantId: "grant-1" });
    await expect(
      dispatchViewerApiRequest(
        { type: "viewer.api.capabilities.get", data: {}, version: "0.preview" },
        grant,
        {},
        dependencies,
      ),
    ).resolves.toEqual({
      capabilities: {
        api: "caps",
        options: { authenticated: true, version: "0.preview" },
      },
    });
    expect(dispatchedCalls).toContainEqual([
      "capabilities",
      { authenticated: true, version: "0.preview" },
    ]);
    await expect(
      dispatchViewerApiRequest(
        { type: "viewer.events.list", data: {} },
        grant,
        {},
        dependencies,
      ),
    ).resolves.toMatchObject({ events: expect.any(Array) });
    await expect(
      dispatchViewerApiRequest(
        { type: "viewer.signals.list", data: {} },
        grant,
        {},
        dependencies,
      ),
    ).resolves.toEqual({ signals: [] });
    await expect(
      dispatchViewerApiRequest(
        { type: "viewer.actions.list", data: {} },
        grant,
        {},
        dependencies,
      ),
    ).resolves.toEqual({ actions: [] });
    await expect(
      dispatchViewerApiRequest(
        { type: "viewer.events.subscribe", data: { events: [] } },
        grant,
        {},
        dependencies,
      ),
    ).resolves.toEqual({
      accepted: true,
      subscriptions: ["viewer.action.completed"],
    });
    await expect(
      dispatchViewerApiRequest(
        { type: "viewer.events.unsubscribe", data: { events: [] } },
        grant,
        {},
        dependencies,
      ),
    ).resolves.toEqual({
      accepted: true,
      subscriptions: ["viewer.action.completed"],
    });
    expect(dispatchedCalls).toContainEqual(["subscription", "viewer.events.subscribe"]);
    expect(dispatchedCalls).toContainEqual(["subscription", "viewer.events.unsubscribe"]);
    await expect(
      dispatchViewerApiRequest(
        { type: "viewer.unknown", data: {} },
        grant,
        {},
        dependencies,
      ),
    ).resolves.toEqual({
      accepted: false,
      reason: "renderer handler unavailable",
    });
  });

  it("initializes client event state and denies subscriptions without required scope", () => {
    const queue = new ViewerApiEventQueue();
    const clientState = createViewerApiClientState();

    const result = queue.handleEventSubscription(
      {
        type: "viewer.events.subscribe",
        data: { events: [{ name: "viewer.action.completed" }] },
      },
      { scopes: [] },
      { clientState },
    );

    expect(result).toEqual({
      accepted: false,
      reason: "scope denied",
      details: { requiredScopes: ["read:actions"] },
    });
    expect(clientState.subscriptions).toBeInstanceOf(Map);
    expect(clientState.eventQueue).toEqual([]);
  });

  it("coalesces dropped-event control messages outside the normal event queue", () => {
    const queue = new ViewerApiEventQueue({ nextEventId: () => "evt-test" });
    const clientState = createViewerApiClientState();
    const fakeWs = { readyState: 1, send: () => undefined };
    clientState.eventFlushScheduled = true;

    queue.enqueueDroppedEvent(fakeWs, clientState, "queue_overflow", 1);
    queue.enqueueDroppedEvent(fakeWs, clientState, "queue_overflow", 2);

    expect(clientState.controlEventQueue).toHaveLength(1);
    expect(JSON.parse(clientState.controlEventQueue[0].serialized)).toMatchObject({
      type: "viewer.events.dropped",
      data: { category: "queue_overflow", count: 3 },
    });
  });

  it("serializes grant revocation events with the negotiated preview shape", () => {
    expect(
      JSON.parse(
        serializeGrantRevokedEvent({
          eventId: "evt-1",
          fingerprint: "grant-fingerprint",
          timestamp: 123,
          version: "0.preview",
        }),
      ),
    ).toEqual({
      api: "ViviViewerApi",
      version: "0.preview",
      type: "viewer.api.grant.revoked",
      ok: true,
      eventId: "evt-1",
      timestamp: 123,
      data: { fingerprint: "grant-fingerprint", reason: "revoked" },
    });
  });

  it("continues publishing to healthy clients when one event client state is invalid", () => {
    const warnings: unknown[] = [];
    const goodState = createViewerApiClientState();
    goodState.eventFlushScheduled = true;
    goodState.subscriptions.set("viewer.action.completed", {});
    const brokenState = {
      subscriptions: new Map([["viewer.action.completed", {}]]),
      lastEventSent: new Map(),
    };
    const queue = new ViewerApiEventQueue({
      getClients: () => [
        { __viewerApiClientState: brokenState },
        { __viewerApiClientState: goodState },
      ],
      getGrantForClient: () => ({ scopes: ["read:actions"] }),
      isActiveGrantSession: () => true,
      logger: { warn: (...args: unknown[]) => warnings.push(args) },
      nextEventId: () => "evt-test",
    });

    expect(
      queue.publishEvent({
        name: "viewer.action.completed",
        data: { actionId: "wave" },
        timestamp: 123,
      }),
    ).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(goodState.eventQueue).toHaveLength(1);
  });
});
