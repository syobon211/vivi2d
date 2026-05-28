import type { ViviViewerEndpoint } from "./endpoint.js";
import type { ViviViewerGrant } from "./protocol.js";

export interface ViviViewerTokenStore {
  load(endpoint: ViviViewerEndpoint): Promise<ViviViewerGrant | null> | ViviViewerGrant | null;
  save(endpoint: ViviViewerEndpoint, grant: ViviViewerGrant): Promise<void> | void;
  clear(endpoint: ViviViewerEndpoint): Promise<void> | void;
}

export function createMemoryTokenStore(initial?: ViviViewerGrant | null): ViviViewerTokenStore {
  let current = normalizeGrant(initial);
  return {
    load: () => current,
    save: (_endpoint, grant) => {
      current = normalizeGrant(grant);
    },
    clear: () => {
      current = null;
    },
  };
}

export function createSessionStorageTokenStore({
  storage = globalThis.sessionStorage,
  keyPrefix = "vivi2d-viewer-api-token",
}: {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  keyPrefix?: string;
} = {}): ViviViewerTokenStore {
  return {
    load(endpoint) {
      const raw = storage.getItem(tokenKey(keyPrefix, endpoint));
      if (!raw) return null;
      try {
        return normalizeGrant(JSON.parse(raw));
      } catch {
        return normalizeGrant({ token: raw, scopes: [] });
      }
    },
    save(endpoint, grant) {
      storage.setItem(tokenKey(keyPrefix, endpoint), JSON.stringify(normalizeGrant(grant)));
    },
    clear(endpoint) {
      storage.removeItem(tokenKey(keyPrefix, endpoint));
    },
  };
}

export function normalizeGrant(value: unknown): ViviViewerGrant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.token !== "string" || record.token.length === 0) return null;
  return {
    token: record.token,
    grantId: typeof record.grantId === "string" ? record.grantId : undefined,
    fingerprint: typeof record.fingerprint === "string" ? record.fingerprint : undefined,
    scopes: Array.isArray(record.scopes)
      ? record.scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
  };
}

function tokenKey(prefix: string, endpoint: ViviViewerEndpoint) {
  return `${prefix}:${endpoint.href}`;
}
