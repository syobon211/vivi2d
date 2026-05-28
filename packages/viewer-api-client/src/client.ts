import {
  assertGrantHasRequiredScopes,
  assertRequestedScopesAdvertised,
  resolveRequiredScopeAlternatives,
  validateCapabilities,
} from "./capabilities.js";
import type { ViviViewerEndpoint } from "./endpoint.js";
import { ViviViewerApiClientError } from "./errors.js";
import type { ViviViewerTokenStore } from "./token-store.js";
import { normalizeGrant } from "./token-store.js";
import { ViviViewerTransport, type ViviViewerWebSocketFactory } from "./transport.js";
import type {
  ViviViewerApiCapabilities,
  ViviViewerApiEventListener,
  ViviViewerAuthenticatedGrant,
  ViviViewerGrant,
  ViviViewerPairingChallenge,
} from "./protocol.js";
import { DEFAULT_VIEWER_API_PAIRING_APPROVAL_TIMEOUT_MS } from "./protocol.js";

export interface ViviViewerClientCoreOptions {
  endpoint: string;
  validateEndpoint(endpoint: string): Promise<ViviViewerEndpoint> | ViviViewerEndpoint;
  webSocketFactory: ViviViewerWebSocketFactory;
  appName?: string;
  scopes?: readonly string[];
  tokenStore?: ViviViewerTokenStore;
  timeoutMs?: number;
  maxFrameBytes?: number;
  maxRequestBytes?: number;
}

export interface ViviViewerPairOptions {
  appName?: string;
  scopes?: readonly string[];
  approvalTimeoutMs?: number;
  onChallenge?: (challenge: ViviViewerPairingChallenge) => void | Promise<void>;
}

export interface ViviViewerClient {
  readonly endpoint: ViviViewerEndpoint | null;
  readonly capabilities: ViviViewerApiCapabilities | null;
  readonly grant: ViviViewerGrant | null;
  connect(): Promise<ViviViewerApiCapabilities>;
  disconnect(): void;
  authenticate(token: string): Promise<ViviViewerAuthenticatedGrant>;
  authenticateStoredGrant(): Promise<boolean>;
  pair(options?: ViviViewerPairOptions): Promise<ViviViewerAuthenticatedGrant>;
  beginPairingChallenge(options?: ViviViewerPairOptions): Promise<{
    id: string;
    challenge: ViviViewerPairingChallenge;
  }>;
  request<TData = unknown>(
    type: string,
    data?: Record<string, unknown>,
  ): Promise<TData>;
  onEvent(listener: ViviViewerApiEventListener): () => void;
  clearStoredGrant(): Promise<void>;
  state: {
    get(): Promise<unknown>;
  };
  props: {
    list(): Promise<unknown>;
  };
  actions: {
    list(): Promise<unknown>;
  };
  signals: {
    list(): Promise<unknown>;
  };
  calibration: {
    get(): Promise<unknown>;
  };
  events: {
    list(): Promise<unknown>;
    subscribe(options: {
      mode?: "add" | "replace";
      events: Array<{ name: string; filter?: Record<string, unknown> }>;
    }): Promise<unknown>;
    unsubscribe(events: Array<{ name: string }>): Promise<unknown>;
    clearSubscriptions(): Promise<unknown>;
  };
}

export function createViviViewerClientCore(
  options: ViviViewerClientCoreOptions,
): ViviViewerClient {
  let endpoint: ViviViewerEndpoint | null = null;
  let transport: ViviViewerTransport | null = null;
  let capabilities: ViviViewerApiCapabilities | null = null;
  let grant: ViviViewerGrant | null = null;

  const ensureTransport = () => {
    if (!transport) {
      throw new ViviViewerApiClientError({
        code: "disconnected",
        message: "Call connect() before using the Viewer API client.",
      });
    }
    return transport;
  };

  const client: ViviViewerClient = {
    get endpoint() {
      return endpoint;
    },
    get capabilities() {
      return capabilities;
    },
    get grant() {
      return grant;
    },
    async connect() {
      transport?.close();
      transport = null;
      grant = null;
      endpoint = await options.validateEndpoint(options.endpoint);
      transport = new ViviViewerTransport({
        endpoint: endpoint.href,
        webSocketFactory: options.webSocketFactory,
        timeoutMs: options.timeoutMs,
        maxFrameBytes: options.maxFrameBytes,
        maxRequestBytes: options.maxRequestBytes,
      });
      await transport.connect();
      const data = await requestUnchecked<{ capabilities?: unknown }>(
        "viewer.api.capabilities.get",
      );
      capabilities = validateCapabilities(data.capabilities);
      assertRequestedScopesAdvertised(capabilities, options.scopes ?? []);
      return capabilities;
    },
    disconnect() {
      transport?.close();
      transport = null;
      grant = null;
    },
    async authenticate(token: string) {
      const data = await requestUnchecked<{
        grantId?: unknown;
        fingerprint?: unknown;
        scopes?: unknown;
        tokenPersistence?: unknown;
      }>("viewer.auth.authenticate", { token });
      const authenticated = readAuthenticatedGrant(data);
      grant = { token, ...authenticated };
      await options.tokenStore?.save(endpointRequired(), grant);
      await refreshAuthenticatedCapabilities();
      return authenticated;
    },
    async authenticateStoredGrant() {
      const stored = normalizeGrant(await options.tokenStore?.load(endpointRequired()));
      if (!stored) return false;
      try {
        await client.authenticate(stored.token);
        return true;
      } catch (error) {
        if (error instanceof ViviViewerApiClientError) {
          if (error.code === "unauthenticated" || error.code === "grant_revoked") {
            await options.tokenStore?.clear(endpointRequired());
            return false;
          }
        }
        throw error;
      }
    },
    async beginPairingChallenge(pairOptions = {}) {
      const requestedScopes = [...(pairOptions.scopes ?? options.scopes ?? [])];
      if (capabilities) assertRequestedScopesAdvertised(capabilities, requestedScopes);
      const id = ensureTransport().send("viewer.auth.challenge", {
        appName: pairOptions.appName ?? options.appName ?? "Vivi2D Viewer API Client",
        scopes: requestedScopes,
      });
      const pending = await ensureTransport().waitForId<{
        phase?: unknown;
        challengeId?: unknown;
        code?: unknown;
        expiresAt?: unknown;
      }>(id);
      if (!pending.ok) {
        throw ViviViewerApiClientError.fromProtocol(
          pending.error,
          "Viewer API pairing challenge failed.",
        );
      }
      const challenge = readPairingChallenge(pending.data);
      await pairOptions.onChallenge?.(challenge);
      return { id, challenge };
    },
    async pair(pairOptions = {}) {
      const { id } = await client.beginPairingChallenge(pairOptions);
      const completed = await ensureTransport().waitForId<{
        token?: unknown;
        scopes?: unknown;
        grantId?: unknown;
        fingerprint?: unknown;
      }>(id, {
        timeoutMs:
          pairOptions.approvalTimeoutMs ??
          DEFAULT_VIEWER_API_PAIRING_APPROVAL_TIMEOUT_MS,
      });
      if (!completed.ok) {
        throw ViviViewerApiClientError.fromProtocol(
          completed.error,
          "Viewer API pairing did not complete.",
        );
      }
      const token = readString(completed.data, "token");
      readRequiredStringArray(completed.data, "scopes");
      return client.authenticate(token);
    },
    async request<TData = unknown>(type: string, data: Record<string, unknown> = {}) {
      const alternatives = resolveRequiredScopeAlternatives(capabilities, type, data);
      assertGrantHasRequiredScopes(grant, alternatives);
      return requestUnchecked<TData>(type, data);
    },
    onEvent(listener) {
      return ensureTransport().onEvent(listener);
    },
    async clearStoredGrant() {
      await options.tokenStore?.clear(endpointRequired());
      grant = null;
    },
    state: {
      get: () => client.request("viewer.state.get"),
    },
    props: {
      list: () => client.request("viewer.props.list"),
    },
    actions: {
      list: () => client.request("viewer.actions.list"),
    },
    signals: {
      list: () => client.request("viewer.signals.list"),
    },
    calibration: {
      get: () => client.request("viewer.calibration.get"),
    },
    events: {
      list: () => client.request("viewer.events.list"),
      subscribe: (subscribeOptions) =>
        client.request("viewer.events.subscribe", subscribeOptions),
      unsubscribe: (events) =>
        client.request("viewer.events.unsubscribe", {
          mode: "remove",
          events,
        }),
      clearSubscriptions: () =>
        client.request("viewer.events.unsubscribe", {
          mode: "clear",
          events: [],
        }),
    },
  };

  async function requestUnchecked<TData>(
    type: string,
    data: Record<string, unknown> = {},
  ): Promise<TData> {
    const response = await ensureTransport().request<TData>(type, data);
    if (!response.ok) {
      throw ViviViewerApiClientError.fromProtocol(
        response.error,
        `Viewer API request failed: ${type}`,
      );
    }
    return (response.data ?? {}) as TData;
  }

  async function refreshAuthenticatedCapabilities() {
    const data = await requestUnchecked<{ capabilities?: unknown }>(
      "viewer.api.capabilities.get",
    );
    capabilities = validateCapabilities(data.capabilities, { authenticated: true });
  }

  function endpointRequired() {
    if (!endpoint) {
      throw new ViviViewerApiClientError({
        code: "disconnected",
        message: "Viewer API endpoint is not available before connect().",
      });
    }
    return endpoint;
  }

  return client;
}

function readPairingChallenge(value: unknown): ViviViewerPairingChallenge {
  return {
    challengeId: readOptionalString(value, "challengeId"),
    code: readString(value, "code"),
    expiresAt: readOptionalString(value, "expiresAt"),
  };
}

function readAuthenticatedGrant(value: unknown): ViviViewerAuthenticatedGrant {
  return {
    grantId: readString(value, "grantId"),
    fingerprint: readOptionalString(value, "fingerprint"),
    scopes: readStringArray(value, "scopes"),
    tokenPersistence: readTokenPersistence(value),
  };
}

function readTokenPersistence(value: unknown) {
  const tokenPersistence = readOptionalString(value, "tokenPersistence");
  if (tokenPersistence === "persistent" || tokenPersistence === "session") {
    return tokenPersistence;
  }
  return undefined;
}

function readString(value: unknown, key: string) {
  const target = readRecord(value)[key];
  if (typeof target !== "string" || target.length === 0) {
    throw new ViviViewerApiClientError({
      code: "invalid_message",
      message: `Viewer API response did not include string field: ${key}`,
    });
  }
  return target;
}

function readOptionalString(value: unknown, key: string) {
  const target = readRecord(value)[key];
  return typeof target === "string" && target.length > 0 ? target : undefined;
}

function readStringArray(value: unknown, key: string) {
  const target = readRecord(value)[key];
  return Array.isArray(target)
    ? target.filter((item): item is string => typeof item === "string")
    : [];
}

function readRequiredStringArray(value: unknown, key: string) {
  const target = readRecord(value)[key];
  if (!Array.isArray(target) || target.some((item) => typeof item !== "string")) {
    throw new ViviViewerApiClientError({
      code: "invalid_message",
      message: `Viewer API response did not include string array field: ${key}`,
    });
  }
  return target as string[];
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ViviViewerApiClientError({
      code: "invalid_message",
      message: "Viewer API response did not include an object payload.",
    });
  }
  return value as Record<string, unknown>;
}
