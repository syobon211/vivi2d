import { describe, expect, it } from "vitest";
import {
  assertGrantHasRequiredScopes,
  resolveRequiredScopeAlternatives,
  validateCapabilities,
} from "../capabilities.js";

const baseCapabilities = {
  api: "ViviViewerApi",
  version: "0.preview",
  stability: "preview",
  core: {
    requestTypes: [],
    eventTypes: [],
    scopes: [],
  },
  extensions: {
    requestTypes: [],
    eventTypes: [],
    scopes: [],
  },
};

describe("Viewer API capabilities", () => {
  it("rejects unknown request and event surfaces instead of silently dropping them", () => {
    expect(() =>
      validateCapabilities({
        ...baseCapabilities,
        core: {
          ...baseCapabilities.core,
          requestTypes: [{ name: "viewer.state.get", surface: "private" }],
        },
      }),
    ).toThrow(/unknown surface/);

    expect(() =>
      validateCapabilities({
        ...baseCapabilities,
        core: {
          ...baseCapabilities.core,
          eventTypes: [{ name: "viewer.model.loaded", surface: "private" }],
        },
      }),
    ).toThrow(/unknown surface/);
  });

  it("fails closed when request scope mode is unknown", () => {
    const capabilities = validateCapabilities({
      ...baseCapabilities,
      core: {
        ...baseCapabilities.core,
        requestTypes: [
          {
            name: "viewer.state.get",
            surface: "core",
            scopeMode: "future-derived",
          },
        ],
      },
    });

    expect(() =>
      resolveRequiredScopeAlternatives(capabilities, "viewer.state.get", {}),
    ).toThrow(/unsupported scope mode/);
  });

  it("keeps static request scopes when deriving scopes from requested events", () => {
    const capabilities = validateCapabilities({
      ...baseCapabilities,
      core: {
        ...baseCapabilities.core,
        requestTypes: [
          {
            name: "viewer.events.subscribe",
            surface: "core",
            scopeMode: "event-derived",
            scopeDerivation: "requestedEvents",
            requiredScopes: [["read:state"]],
          },
        ],
        eventTypes: [
          {
            name: "viewer.model.loaded",
            surface: "core",
            scope: "read:model",
          },
        ],
      },
    });

    expect(
      resolveRequiredScopeAlternatives(capabilities, "viewer.events.subscribe", {
        events: [{ name: "viewer.model.loaded" }],
      }),
    ).toEqual([["read:model", "read:state"]]);
    expect(
      resolveRequiredScopeAlternatives(capabilities, "viewer.events.subscribe", {
        events: [],
      }),
    ).toEqual([["read:state"]]);
  });

  it("rejects duplicate request metadata with conflicting surfaces", () => {
    expect(() =>
      validateCapabilities(
        {
          ...baseCapabilities,
          core: {
            ...baseCapabilities.core,
            requestTypes: [
              {
                name: "viewer.state.get",
                surface: "core",
                scopeMode: "static",
                requiredScopes: [["read:state"]],
              },
            ],
          },
          extensions: {
            ...baseCapabilities.extensions,
            requestTypes: [
              {
                name: "viewer.state.get",
                surface: "extension",
                scopeMode: "static",
                requiredScopes: [["write:props"]],
              },
            ],
          },
        },
        { authenticated: true },
      ),
    ).toThrow(/duplicate request metadata/);
  });

  it("rejects duplicate request metadata even when the surface matches", () => {
    expect(() =>
      validateCapabilities(
        {
          ...baseCapabilities,
          core: {
            ...baseCapabilities.core,
            requestTypes: [
              {
                name: "viewer.state.get",
                surface: "core",
                scopeMode: "static",
                requiredScopes: [["read:state"]],
              },
              {
                name: "viewer.state.get",
                surface: "core",
                scopeMode: "static",
                requiredScopes: [["write:props"]],
              },
            ],
          },
        },
        { authenticated: true },
      ),
    ).toThrow(/duplicate request metadata/);
  });

  it("rejects empty required scope alternatives instead of treating them as auth-free", () => {
    expect(() =>
      validateCapabilities({
        ...baseCapabilities,
        core: {
          ...baseCapabilities.core,
          requestTypes: [
            {
              name: "viewer.state.get",
              surface: "core",
              scopeMode: "static",
              requiredScopes: [[], ["read:state"]],
            },
          ],
        },
      }),
    ).toThrow(/empty required scope alternative/);
  });

  it("allows explicit empty scope metadata for auth-free handshake requests", () => {
    const capabilities = validateCapabilities({
      ...baseCapabilities,
      core: {
        ...baseCapabilities.core,
        requestTypes: [
          {
            name: "viewer.api.capabilities.get",
            surface: "core",
            scopeMode: "static",
            requiredScopes: [[]],
          },
        ],
      },
    });

    expect(
      resolveRequiredScopeAlternatives(
        capabilities,
        "viewer.api.capabilities.get",
        {},
      ),
    ).toEqual([[]]);
  });

  it("requires a grant for authenticated requests that do not need additional scopes", () => {
    const capabilities = validateCapabilities({
      ...baseCapabilities,
      core: {
        ...baseCapabilities.core,
        requestTypes: [
          {
            name: "viewer.events.list",
            surface: "core",
            scopeMode: "static",
            authRequired: true,
          },
          {
            name: "viewer.events.subscribe",
            surface: "core",
            scopeMode: "event-derived",
            scopeDerivation: "requestedEvents",
            authRequired: true,
          },
        ],
      },
    });

    const listAlternatives = resolveRequiredScopeAlternatives(
      capabilities,
      "viewer.events.list",
      {},
    );
    const emptySubscriptionAlternatives = resolveRequiredScopeAlternatives(
      capabilities,
      "viewer.events.subscribe",
      { events: [] },
    );

    expect(listAlternatives).toEqual([]);
    expect(emptySubscriptionAlternatives).toEqual([]);
    expect(() => assertGrantHasRequiredScopes(null, listAlternatives)).toThrow(
      /authenticated grant/,
    );
    expect(() =>
      assertGrantHasRequiredScopes({ scopes: [] }, emptySubscriptionAlternatives),
    ).not.toThrow();
  });
});
