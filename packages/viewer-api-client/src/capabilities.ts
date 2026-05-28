import { ViviViewerApiClientError } from "./errors.js";
import type {
  ViviViewerApiCapabilities,
  ViviViewerApiEventMetadata,
  ViviViewerApiRequestMetadata,
  ViviViewerApiScope,
  ViviViewerGrant,
} from "./protocol.js";
import { VIVI_VIEWER_API_NAME, VIVI_VIEWER_API_VERSION } from "./protocol.js";

const AUTH_FREE_REQUESTS = new Set([
  "viewer.api.capabilities.get",
  "viewer.auth.challenge",
  "viewer.auth.authenticate",
]);

export function validateCapabilities(
  capabilities: unknown,
  { authenticated = false }: { authenticated?: boolean } = {},
): ViviViewerApiCapabilities {
  if (!isRecord(capabilities)) {
    throw new ViviViewerApiClientError({
      code: "protocol_mismatch",
      message: "Viewer API capabilities payload is missing.",
    });
  }
  if (
    capabilities.api !== VIVI_VIEWER_API_NAME ||
    capabilities.version !== VIVI_VIEWER_API_VERSION ||
    capabilities.stability !== "preview"
  ) {
    throw new ViviViewerApiClientError({
      code: "protocol_mismatch",
      message: "Viewer API host does not expose the supported preview contract.",
    });
  }
  const parsed = capabilities as unknown as ViviViewerApiCapabilities;
  assertKnownCapabilitySurfaces(parsed);
  const requests = collectRequests(parsed);
  collectEvents(parsed);
  assertValidRequestScopeMetadata(requests);
  if (authenticated && requests.length === 0) {
    throw new ViviViewerApiClientError({
      code: "host_capability_unavailable",
      message: "Authenticated Viewer API capabilities did not include request metadata.",
    });
  }
  return parsed;
}

export function collectRequests(
  capabilities: ViviViewerApiCapabilities | null | undefined,
): ViviViewerApiRequestMetadata[] {
  if (!capabilities) return [];
  const requests: ViviViewerApiRequestMetadata[] = [];
  for (const item of capabilities.requestTypes ?? []) {
    if (typeof item === "string") {
      requests.push({ name: item, surface: "core" });
    } else if (isRequestMetadata(item)) {
      requests.push(item);
    }
  }
  for (const section of [capabilities.core, capabilities.extensions]) {
    for (const item of section?.requestTypes ?? []) {
      if (isRequestMetadata(item)) requests.push(item);
    }
  }
  return dedupeByName(requests, "request");
}

export function collectEvents(
  capabilities: ViviViewerApiCapabilities | null | undefined,
): ViviViewerApiEventMetadata[] {
  if (!capabilities) return [];
  const events: ViviViewerApiEventMetadata[] = [];
  for (const item of capabilities.eventTypes ?? []) {
    if (typeof item === "string") {
      events.push({ name: item, surface: "core" });
    } else if (isEventMetadata(item)) {
      events.push(item);
    }
  }
  for (const section of [capabilities.core, capabilities.extensions]) {
    for (const item of section?.eventTypes ?? []) {
      if (isEventMetadata(item)) events.push(item);
    }
  }
  return dedupeByName(events, "event");
}

export function assertRequestedScopesAdvertised(
  capabilities: ViviViewerApiCapabilities,
  scopes: readonly ViviViewerApiScope[],
) {
  const advertised = new Set(
    [
      ...(capabilities.scopeMetadata ?? []),
      ...(capabilities.core?.scopes ?? []),
      ...(capabilities.extensions?.scopes ?? []),
    ].map((scope) => scope.scope),
  );
  for (const scope of scopes) {
    if (!advertised.has(scope)) {
      throw new ViviViewerApiClientError({
        code: "host_capability_unavailable",
        message: `Requested scope is not advertised by the Viewer API host: ${scope}`,
        details: { scope },
      });
    }
  }
}

export function resolveRequiredScopeAlternatives(
  capabilities: ViviViewerApiCapabilities | null,
  type: string,
  data: Record<string, unknown>,
): ViviViewerApiScope[][] {
  if (AUTH_FREE_REQUESTS.has(type)) return [[]];
  const request = collectRequests(capabilities).find((item) => item.name === type);
  if (!request) {
    throw new ViviViewerApiClientError({
      code: "host_capability_unavailable",
      message: `Viewer API request is not advertised by the host: ${type}`,
      details: { requestType: type },
    });
  }
  const staticAlternatives = normalizeRequiredScopeAlternatives(request.requiredScopes);
  if (request.scopeMode === "event-derived" || request.scopeDerivation === "requestedEvents") {
    const eventAlternatives = scopesForRequestedEvents(capabilities, data);
    if (
      staticAlternatives.length === 0 &&
      eventAlternatives.length === 1 &&
      eventAlternatives[0]?.length === 0
    ) {
      return [];
    }
    return combineScopeAlternatives(
      staticAlternatives.length > 0 ? staticAlternatives : [[]],
      eventAlternatives,
    );
  }
  if (staticAlternatives.length > 0) {
    return staticAlternatives;
  }
  if (request.scopeMode === "static") return request.authRequired === false ? [[]] : [];
  throw new ViviViewerApiClientError({
    code: "host_capability_unavailable",
    message: `Viewer API request uses an unsupported scope mode: ${request.scopeMode ?? "missing"}`,
    details: { requestType: type, scopeMode: request.scopeMode ?? null },
  });
}

function assertKnownCapabilitySurfaces(capabilities: ViviViewerApiCapabilities) {
  for (const item of [
    ...(capabilities.requestTypes ?? []),
    ...(capabilities.core?.requestTypes ?? []),
    ...(capabilities.extensions?.requestTypes ?? []),
  ]) {
    if (typeof item === "string") continue;
    if (!isRecord(item) || (item.surface !== "core" && item.surface !== "extension")) {
      throw new ViviViewerApiClientError({
        code: "protocol_mismatch",
        message: "Viewer API capabilities contained request metadata with an unknown surface.",
      });
    }
  }
  for (const item of [
    ...(capabilities.eventTypes ?? []),
    ...(capabilities.core?.eventTypes ?? []),
    ...(capabilities.extensions?.eventTypes ?? []),
  ]) {
    if (typeof item === "string") continue;
    if (!isRecord(item) || (item.surface !== "core" && item.surface !== "extension")) {
      throw new ViviViewerApiClientError({
        code: "protocol_mismatch",
        message: "Viewer API capabilities contained event metadata with an unknown surface.",
      });
    }
  }
}

export function assertGrantHasRequiredScopes(
  grant: ViviViewerGrant | null,
  alternatives: ViviViewerApiScope[][],
) {
  if (alternatives.length === 0) {
    if (!grant) {
      throw new ViviViewerApiClientError({
        code: "unauthenticated",
        message: "Viewer API request requires an authenticated grant.",
      });
    }
    return;
  }
  if (alternatives.some((scopes) => scopes.length === 0)) return;
  const requiredAlternatives = alternatives.filter((scopes) => scopes.length > 0);
  if (requiredAlternatives.length === 0) return;
  if (!grant) {
    throw new ViviViewerApiClientError({
      code: "unauthenticated",
      message: "Viewer API request requires an authenticated grant.",
    });
  }
  const granted = new Set(grant.scopes);
  if (requiredAlternatives.some((scopes) => scopes.every((scope) => granted.has(scope)))) {
    return;
  }
  const requiredScopes = [...new Set(requiredAlternatives.flat())].sort();
  throw new ViviViewerApiClientError({
    code: "scope_denied",
    message: "Viewer API grant does not include the required scopes.",
    details: { requiredScopes },
    retryable: false,
  });
}

function scopesForRequestedEvents(
  capabilities: ViviViewerApiCapabilities | null,
  data: Record<string, unknown>,
) {
  const events = Array.isArray(data.events) ? data.events : [];
  const eventMetadata = new Map(collectEvents(capabilities).map((event) => [event.name, event]));
  const scopes = events
    .map((item) => (isRecord(item) ? item.name : null))
    .filter(isNonEmptyString)
    .map((name) => eventMetadata.get(name)?.scope)
    .filter(isNonEmptyString);
  return scopes.length > 0 ? [[...new Set(scopes)].sort()] : [[]];
}

function normalizeRequiredScopeAlternatives(
  requiredScopes: ViviViewerApiRequestMetadata["requiredScopes"],
): ViviViewerApiScope[][] {
  if (!Array.isArray(requiredScopes)) return [];
  const alternatives = requiredScopes.map((scopes) =>
    Array.isArray(scopes) ? scopes.filter(isNonEmptyString) : [],
  );
  if (alternatives.some((scopes) => scopes.length === 0)) {
    throw new ViviViewerApiClientError({
      code: "protocol_mismatch",
      message: "Viewer API request metadata contained an empty required scope alternative.",
    });
  }
  return alternatives;
}

function combineScopeAlternatives(
  leftAlternatives: ViviViewerApiScope[][],
  rightAlternatives: ViviViewerApiScope[][],
): ViviViewerApiScope[][] {
  const combined: ViviViewerApiScope[][] = [];
  for (const left of leftAlternatives) {
    for (const right of rightAlternatives) {
      combined.push([...new Set([...left, ...right])].sort());
    }
  }
  return combined.length > 0 ? combined : [[]];
}

function isRequestMetadata(value: unknown): value is ViviViewerApiRequestMetadata {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.surface === "core" || value.surface === "extension")
  );
}

function isEventMetadata(value: unknown): value is ViviViewerApiEventMetadata {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.surface === "core" || value.surface === "extension")
  );
}

function dedupeByName<T extends { name: string; surface?: unknown }>(
  items: T[],
  kind: "request" | "event",
) {
  const map = new Map<string, T>();
  for (const item of items) {
    const existing = map.get(item.name);
    if (existing) {
      throw new ViviViewerApiClientError({
        code: "protocol_mismatch",
        message: `Viewer API capabilities contained duplicate ${kind} metadata.`,
        details: { name: item.name },
      });
    }
    map.set(item.name, item);
  }
  return [...map.values()];
}

function assertValidRequestScopeMetadata(requests: ViviViewerApiRequestMetadata[]) {
  for (const request of requests) {
    if (!Array.isArray(request.requiredScopes)) continue;
    const alternatives = request.requiredScopes.map((scopes) =>
      Array.isArray(scopes) ? scopes.filter(isNonEmptyString) : [],
    );
    if (
      alternatives.some((scopes) => scopes.length === 0) &&
      !AUTH_FREE_REQUESTS.has(request.name)
    ) {
      throw new ViviViewerApiClientError({
        code: "protocol_mismatch",
        message: "Viewer API request metadata contained an empty required scope alternative.",
        details: { requestType: request.name },
      });
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
