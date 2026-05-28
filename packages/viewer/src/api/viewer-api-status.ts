import type {
  ViewerApiGrantSummary,
  ViewerApiPendingChallenge,
  ViewerApiScope,
  ViewerApiScopeMetadata,
  ViewerApiStatus,
} from "./viewer-api-client-types";

const SCOPES = new Set<ViewerApiScope>([
  "read:state",
  "read:signals",
  "read:props",
  "read:actions",
  "read:calibration",
  "run:actions:safe",
  "write:signals",
  "write:props",
  "write:calibration",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asScopeList(value: unknown): ViewerApiScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter((scope): scope is ViewerApiScope => SCOPES.has(scope));
}

function parseScopeMetadata(value: unknown): ViewerApiScopeMetadata | null {
  if (!isRecord(value) || !SCOPES.has(value.scope as ViewerApiScope)) return null;
  if (value.surface !== "core" && value.surface !== "extension") return null;
  if (value.risk !== "low" && value.risk !== "medium" && value.risk !== "high") {
    return null;
  }
  return {
    scope: value.scope as ViewerApiScope,
    surface: value.surface,
    risk: value.risk,
    category: asString(value.category),
    description: asString(value.description),
    requiresUserMediatedAssets:
      value.requiresUserMediatedAssets === true ? true : undefined,
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asTokenPersistence(
  value: unknown,
): ViewerApiStatus["tokenPersistence"] {
  if (value === "persistent" || value === "session" || value === "unavailable") {
    return value;
  }
  return undefined;
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

function parseGrant(value: unknown): ViewerApiGrantSummary | null {
  if (!isRecord(value)) return null;
  return {
    id: asString(value.id),
    fingerprint: typeof value.fingerprint === "string" ? value.fingerprint : undefined,
    appName: asString(value.appName, "Unknown client"),
    scopes: asScopeList(value.scopes),
    scopeMetadata: Array.isArray(value.scopeMetadata)
      ? value.scopeMetadata.map(parseScopeMetadata).filter(isNonNull)
      : undefined,
    originBinding: asString(value.originBinding, "no-origin"),
    origins: Array.isArray(value.origins)
      ? value.origins.filter((origin): origin is string => typeof origin === "string")
      : undefined,
    createdAt: asNumber(value.createdAt),
    lastUsedAt:
      typeof value.lastUsedAt === "number" && Number.isFinite(value.lastUsedAt)
        ? value.lastUsedAt
        : null,
  };
}

function parsePending(value: unknown): ViewerApiPendingChallenge | null {
  if (!isRecord(value)) return null;
  return {
    id: asString(value.id),
    appName: asString(value.appName, "Unknown client"),
    scopes: asScopeList(value.scopes),
    originBinding: asString(value.originBinding, "no-origin"),
    createdAt: asNumber(value.createdAt),
    expiresAt: asNumber(value.expiresAt),
    badCodeAttempts: asNumber(value.badCodeAttempts),
  };
}

export function parseViewerApiStatus(value: unknown): ViewerApiStatus {
  if (!isRecord(value)) return { enabled: false };
  return {
    enabled: value.enabled === true,
    port: typeof value.port === "number" ? value.port : undefined,
    endpoint:
      typeof value.endpoint === "string" || value.endpoint === null
        ? (value.endpoint as string | null)
        : undefined,
    version: typeof value.version === "string" ? value.version : undefined,
    persistentGrantsAvailable: value.persistentGrantsAvailable === true,
    tokenPersistence:
      asTokenPersistence(value.tokenPersistence) ??
      (value.persistentGrantsAvailable === true ? "persistent" : "unavailable"),
    pairingWindowOpen: value.pairingWindowOpen === true,
    pairingWindowExpiresAt:
      typeof value.pairingWindowExpiresAt === "number"
        ? value.pairingWindowExpiresAt
        : null,
    pairingAllowedOrigins: Array.isArray(value.pairingAllowedOrigins)
      ? value.pairingAllowedOrigins.filter(
          (origin): origin is string => typeof origin === "string",
        )
      : [],
    pendingChallenges: Array.isArray(value.pendingChallenges)
      ? value.pendingChallenges.map(parsePending).filter(isNonNull)
      : [],
    grants: Array.isArray(value.grants)
      ? value.grants.map(parseGrant).filter(isNonNull)
      : [],
  };
}

export function describeScopeRisk(scope: ViewerApiScope): "low" | "medium" | "high" {
  if (
    scope === "read:state" ||
    scope === "read:props" ||
    scope === "read:signals" ||
    scope === "read:actions" ||
    scope === "read:calibration"
  ) {
    return "low";
  }
  if (scope === "write:props" || scope === "write:signals") return "medium";
  return "high";
}
