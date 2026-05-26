import { describe, expect, it } from "vitest";
import { describeScopeRisk, parseViewerApiStatus } from "../api/viewer-api-status";

describe("viewer API status parsing", () => {
  it("falls back to a disabled status for non-object payloads", () => {
    expect(parseViewerApiStatus(null)).toEqual({ enabled: false });
    expect(parseViewerApiStatus(["enabled"])).toEqual({ enabled: false });
  });

  it("normalizes malformed fields while keeping safe status data", () => {
    const status = parseViewerApiStatus({
      enabled: true,
      port: 4173,
      endpoint: null,
      version: "0.preview",
      persistentGrantsAvailable: true,
      pairingWindowOpen: true,
      pairingWindowExpiresAt: "soon",
      pairingAllowedOrigins: ["http://127.0.0.1:4173", 42],
      pendingChallenges: [
        {
          id: "pending",
          appName: 123,
          scopes: ["read:state", "private:debug"],
          originBinding: undefined,
          createdAt: Number.POSITIVE_INFINITY,
          expiresAt: 10,
          badCodeAttempts: 2,
        },
        "bad",
      ],
      grants: [
        {
          id: "grant",
          fingerprint: "fp",
          appName: "Tool",
          scopes: ["read:props", "write:props", "admin"],
          scopeMetadata: [
            {
              scope: "write:props",
              surface: "core",
              risk: "medium",
              category: "props",
              description: "Change props",
              requiresUserMediatedAssets: true,
            },
            { scope: "admin", surface: "core", risk: "high" },
            { scope: "read:state", surface: "private", risk: "low" },
          ],
          originBinding: "origin",
          origins: ["http://localhost:4173", false],
          createdAt: 1,
          lastUsedAt: Number.NaN,
        },
        null,
      ],
    });

    expect(status).toMatchObject({
      enabled: true,
      port: 4173,
      endpoint: null,
      version: "0.preview",
      persistentGrantsAvailable: true,
      pairingWindowOpen: true,
      pairingWindowExpiresAt: null,
      pairingAllowedOrigins: ["http://127.0.0.1:4173"],
    });
    expect(status.pendingChallenges).toEqual([
      {
        id: "pending",
        appName: "Unknown client",
        scopes: ["read:state"],
        originBinding: "no-origin",
        createdAt: 0,
        expiresAt: 10,
        badCodeAttempts: 2,
      },
    ]);
    expect(status.grants).toEqual([
      {
        id: "grant",
        fingerprint: "fp",
        appName: "Tool",
        scopes: ["read:props", "write:props"],
        scopeMetadata: [
          {
            scope: "write:props",
            surface: "core",
            risk: "medium",
            category: "props",
            description: "Change props",
            requiresUserMediatedAssets: true,
          },
        ],
        originBinding: "origin",
        origins: ["http://localhost:4173"],
        createdAt: 1,
        lastUsedAt: null,
      },
    ]);
  });

  it("maps scope risk labels deterministically", () => {
    expect(describeScopeRisk("read:state")).toBe("low");
    expect(describeScopeRisk("read:calibration")).toBe("low");
    expect(describeScopeRisk("write:signals")).toBe("medium");
    expect(describeScopeRisk("write:calibration")).toBe("high");
  });
});
