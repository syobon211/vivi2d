import { describe, expect, it } from "vitest";
import { parseViviViewerEndpoint } from "../endpoint.js";
import {
  createMemoryTokenStore,
  createSessionStorageTokenStore,
  normalizeGrant,
} from "../token-store.js";

const endpoint = parseViviViewerEndpoint("ws://127.0.0.1:3000", {
  environment: "browser",
});

describe("Viewer API token stores", () => {
  it("normalizes stored grants", () => {
    expect(
      normalizeGrant({
        token: "token",
        scopes: ["read:state", 1, "write:props"],
        ignored: true,
      }),
    ).toEqual({ token: "token", scopes: ["read:state", "write:props"] });
    expect(normalizeGrant({ scopes: ["read:state"] })).toBeNull();
  });

  it("stores grants in memory", async () => {
    const store = createMemoryTokenStore();
    await store.save(endpoint, { token: "token", scopes: ["read:state"] });
    expect(await store.load(endpoint)).toEqual({
      token: "token",
      scopes: ["read:state"],
    });
    await store.clear(endpoint);
    expect(await store.load(endpoint)).toBeNull();
  });

  it("stores grants in caller-provided session storage", async () => {
    const backing = new Map<string, string>();
    const store = createSessionStorageTokenStore({
      storage: {
        getItem: (key) => backing.get(key) ?? null,
        setItem: (key, value) => backing.set(key, value),
        removeItem: (key) => backing.delete(key),
      },
    });
    await store.save(endpoint, { token: "token", scopes: ["read:state"] });
    expect(await store.load(endpoint)).toEqual({
      token: "token",
      scopes: ["read:state"],
    });
  });
});
