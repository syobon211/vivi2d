import { describe, expect, it, vi } from "vitest";
import { mapControllerEventToViewerApiEvents } from "../api/viewer-api-event-mapper";

// packages/viewer/electron/security.cjs is CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const security = require("../../electron/security.cjs");
const ipcContract = require("../../electron/ipc-contract.cjs");

const {
  assertTrustedSender,
  createContentSecurityPolicy,
  wrapHandler,
  isSafeExternalUrl,
  isLoopbackNetworkUrl,
  isTrustedNavigationUrl,
  openExternalIfSafe,
} = security;
const { hasIpcContract, listIpcChannels, validateIpcArgs } = ipcContract;

type FakeSender = { id: number };
type FakeEvent = { sender: FakeSender; senderFrame?: { parent: unknown } | null };

function createMainWindow(webContentsId: number, destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { id: webContentsId },
  };
}

describe("packages/viewer/electron/security.cjs", () => {
  describe("createContentSecurityPolicy", () => {
    it("keeps production CSP restrictive", () => {
      const csp = createContentSecurityPolicy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).not.toContain("localhost");
      expect(csp).not.toContain("127.0.0.1");
      expect(csp).not.toContain("ws://");
    });

    it("keeps dev-only eval explicit", () => {
      const csp = createContentSecurityPolicy({ isDev: true });
      expect(csp).toContain("'unsafe-eval'");
      expect(csp).toContain("http://localhost:*");
    });
  });

  describe("isTrustedNavigationUrl", () => {
    it("allows only the exact app entry file URL", () => {
      expect(
        isTrustedNavigationUrl("file:///C:/app/viewer/index.html", {
          appEntryFileUrl: "file:///C:/app/viewer/index.html",
        }),
      ).toBe(true);
      expect(
        isTrustedNavigationUrl("file:///C:/Users/user/Desktop/evil.html", {
          appEntryFileUrl: "file:///C:/app/viewer/index.html",
        }),
      ).toBe(false);
    });

    it("allows the exact dev server origin", () => {
      expect(
        isTrustedNavigationUrl("http://localhost:5173/viewer", {
          devServerUrl: "http://localhost:5173",
        }),
      ).toBe(true);
    });

    it("rejects prefix-confusion URLs", () => {
      expect(
        isTrustedNavigationUrl("http://localhost:5173.evil.test/viewer", {
          devServerUrl: "http://localhost:5173",
        }),
      ).toBe(false);
      expect(
        isTrustedNavigationUrl("http://localhost:5173@evil.test/viewer", {
          devServerUrl: "http://localhost:5173",
        }),
      ).toBe(false);
    });
  });

  describe("isSafeExternalUrl", () => {
    it("allows normal HTTPS URLs", () => {
      expect(isSafeExternalUrl("https://example.com/viewer")).toBe(true);
    });

    it("rejects HTTP, custom protocols, and credential URLs", () => {
      expect(isSafeExternalUrl("http://example.com/viewer")).toBe(false);
      expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeExternalUrl("https://user@example.com/viewer")).toBe(false);
      expect(isSafeExternalUrl("not a url")).toBe(false);
    });
  });

  describe("openExternalIfSafe", () => {
    it("opens only safe HTTPS URLs", () => {
      const shell = { openExternal: vi.fn() };
      expect(openExternalIfSafe(shell, "https://example.com/viewer")).toBe(true);
      expect(shell.openExternal).toHaveBeenCalledWith("https://example.com/viewer");

      expect(openExternalIfSafe(shell, "http://example.com/viewer")).toBe(false);
      expect(openExternalIfSafe(shell, "javascript:alert(1)")).toBe(false);
      expect(shell.openExternal).toHaveBeenCalledTimes(1);
    });
  });

  describe("isLoopbackNetworkUrl", () => {
    it("detects loopback HTTP and WebSocket targets", () => {
      expect(isLoopbackNetworkUrl("http://127.0.0.1:37145/status")).toBe(true);
      expect(isLoopbackNetworkUrl("ws://localhost:37145/socket")).toBe(true);
      expect(isLoopbackNetworkUrl("https://example.com")).toBe(false);
      expect(isLoopbackNetworkUrl("file:///C:/app/viewer/index.html")).toBe(false);
    });
  });

  describe("assertTrustedSender", () => {
    it("accepts the main frame sender", () => {
      const mainWindow = createMainWindow(42);
      const event: FakeEvent = { sender: { id: 42 }, senderFrame: null };
      expect(() => assertTrustedSender(event, mainWindow)).not.toThrow();
    });

    it("rejects sender id mismatches", () => {
      const mainWindow = createMainWindow(42);
      const event: FakeEvent = { sender: { id: 99 }, senderFrame: null };
      expect(() => assertTrustedSender(event, mainWindow)).toThrow();
    });

    it("rejects iframe senders", () => {
      const mainWindow = createMainWindow(42);
      const event: FakeEvent = {
        sender: { id: 42 },
        senderFrame: { parent: { id: "top" } },
      };
      expect(() => assertTrustedSender(event, mainWindow)).toThrow();
    });
  });

  describe("wrapHandler", () => {
    it("passes trusted sender events through to the handler", async () => {
      const mainWindow = createMainWindow(42);
      const handlers = new Map<string, (...args: unknown[]) => unknown>();
      const ipcMain = {
        handle(channel: string, handler: (...args: unknown[]) => unknown) {
          handlers.set(channel, handler);
        },
      };

      const register = wrapHandler(ipcMain, () => mainWindow);
      register("toggle-frame", () => "ok");

      const handler = handlers.get("toggle-frame");
      expect(handler).toBeDefined();
      await expect(handler?.({ sender: { id: 42 } })).resolves.toBe("ok");
    });

    it("rejects untrusted senders", async () => {
      const mainWindow = createMainWindow(42);
      const handlers = new Map<string, (...args: unknown[]) => unknown>();
      const ipcMain = {
        handle(channel: string, handler: (...args: unknown[]) => unknown) {
          handlers.set(channel, handler);
        },
      };

      const register = wrapHandler(ipcMain, () => mainWindow);
      register("toggle-frame", () => "secret");

      const handler = handlers.get("toggle-frame");
      await expect(handler?.({ sender: { id: 999 } })).rejects.toThrow();
    });

    it("rejects channels without an IPC contract at registration", () => {
      const mainWindow = createMainWindow(42);
      const ipcMain = {
        handle: vi.fn(),
      };

      const register = wrapHandler(ipcMain, () => mainWindow);
      expect(() => register("test-channel", () => "secret")).toThrow(
        "missing a payload contract",
      );
      expect(ipcMain.handle).not.toHaveBeenCalled();
    });

    it("rejects invalid contracted payloads before calling handlers", async () => {
      const mainWindow = createMainWindow(42);
      const wrappedHandler = vi.fn();
      const handlers = new Map<string, (...args: unknown[]) => unknown>();
      const ipcMain = {
        handle(channel: string, handler: (...args: unknown[]) => unknown) {
          handlers.set(channel, handler);
        },
      };

      const register = wrapHandler(ipcMain, () => mainWindow);
      register("set-window-size", wrappedHandler);

      const handler = handlers.get("set-window-size");
      await expect(handler?.({ sender: { id: 42 } }, 800, Number.NaN)).rejects.toThrow(
        "expected two finite numbers",
      );
      expect(wrappedHandler).not.toHaveBeenCalled();
    });
  });

  describe("ipc-contract.cjs", () => {
    it("documents viewer renderer-to-main channels", () => {
      expect(hasIpcContract("toggle-always-on-top")).toBe(true);
      expect(hasIpcContract("set-background-mode")).toBe(true);
      expect(hasIpcContract("set-window-size")).toBe(true);
      expect(hasIpcContract("viewer-api:set-enabled")).toBe(true);
      expect(hasIpcContract("test-channel")).toBe(false);
      expect(listIpcChannels()).toEqual([
        "set-background-mode",
        "set-window-size",
        "toggle-always-on-top",
        "toggle-frame",
        "viewer-api:approve-pairing",
        "viewer-api:close-pairing-window",
        "viewer-api:create-prop-asset",
        "viewer-api:extend-prop-asset",
        "viewer-api:get-status",
        "viewer-api:list-grants",
        "viewer-api:list-prop-assets",
        "viewer-api:open-pairing-window",
        "viewer-api:publish-event",
        "viewer-api:renderer-response",
        "viewer-api:revoke-grant",
        "viewer-api:revoke-prop-asset",
        "viewer-api:rotate-grant",
        "viewer-api:set-enabled",
      ]);
    });

    it("accepts valid viewer payloads", () => {
      expect(() => validateIpcArgs("toggle-frame", [])).not.toThrow();
      expect(() => validateIpcArgs("set-background-mode", ["transparent"])).not.toThrow();
      expect(() => validateIpcArgs("set-window-size", [800, 600])).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:set-enabled", [{ enabled: true, port: 37145 }]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:open-pairing-window", [{ durationMs: 60000 }]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:open-pairing-window", [
          { durationMs: 60000, origins: ["http://localhost:5173"] },
        ]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:approve-pairing", [
          { challengeId: "challenge", code: "123456" },
        ]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:rotate-grant", [{ grantId: "grant" }]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:create-prop-asset", [
          {
            grantId: "grant",
            displayName: "badge.png",
            mimeType: "image/png",
            bytesBase64: "AAAA",
          },
        ]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:list-prop-assets", [{ grantId: "grant" }]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:extend-prop-asset", [
          { grantId: "grant", assetId: "vpa_asset" },
        ]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:revoke-prop-asset", [
          { grantId: "grant", assetId: "vpa_asset" },
        ]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:publish-event", [
          {
            name: "viewer.action.completed",
            data: { actionId: "wave", kind: "effectPreset", status: "completed" },
          },
        ]),
      ).not.toThrow();
      expect(() =>
        validateIpcArgs("viewer-api:renderer-response", [
          {
            requestId: "renderer-1",
            ok: true,
            data: { props: [] },
          },
        ]),
      ).not.toThrow();
    });

    it("keeps renderer event mapper output aligned with the IPC allowlist", () => {
      const mappedEvents = [
        ...mapControllerEventToViewerApiEvents({
          type: "viewer.action.event",
          event: {
            actionId: "wave",
            kind: "effectPreset",
            status: "completed",
            timestamp: 1,
          },
        }),
        ...mapControllerEventToViewerApiEvents({
          type: "viewer.action.event",
          event: {
            actionId: "disabled",
            kind: "effectPreset",
            status: "skipped",
            timestamp: 2,
          },
        }),
        ...mapControllerEventToViewerApiEvents({
          type: "viewer.signals.changed",
          source: "tracking",
          signalIds: ["vivi.signal.headYaw"],
        }),
        ...mapControllerEventToViewerApiEvents({
          type: "viewer.prop.event",
          event: "updated",
          propId: "hat",
          prop: {
            id: "hat",
            name: "Hat",
            kind: "image",
            visible: true,
            drawOrder: 0,
            opacity: 1,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            source: {
              kind: "inlineBase64",
              mimeType: "image/png",
              bytes: "AAAA",
              portable: true,
            },
          },
        }),
        ...mapControllerEventToViewerApiEvents({
          type: "viewer.calibration.changed",
          snapshot: {
            activeProfileId: "balanced",
            profiles: [],
            diagnostics: [],
            observedRanges: [],
          },
        }),
      ];

      for (const event of mappedEvents) {
        expect(() =>
          validateIpcArgs("viewer-api:publish-event", [
            { name: event.name, data: event.data, timestamp: event.timestamp },
          ]),
        ).not.toThrow();
      }
    });

    it("rejects malformed viewer payloads", () => {
      expect(() => validateIpcArgs("test-channel", [])).toThrow(
        "has no payload contract",
      );
      expect(() =>
        validateIpcArgs("viewer-api:set-enabled", [
          { enabled: true, port: 37145, debug: true },
        ]),
      ).toThrow("unknown field debug");
      expect(() => validateIpcArgs("toggle-frame", ["extra"])).toThrow(
        "expected no arguments",
      );
      expect(() => validateIpcArgs("set-background-mode", ["remote-image"])).toThrow(
        "unsupported background mode",
      );
      expect(() => validateIpcArgs("set-window-size", [800, "600"])).toThrow(
        "expected two finite numbers",
      );
      expect(() =>
        validateIpcArgs("viewer-api:set-enabled", [{ enabled: true, port: 1 }]),
      ).toThrow("port is invalid");
      expect(() =>
        validateIpcArgs("viewer-api:approve-pairing", [
          { challengeId: "", code: "123456" },
        ]),
      ).toThrow("challengeId is invalid");
      expect(() =>
        validateIpcArgs("viewer-api:renderer-response", [
          {
            requestId: "renderer-1",
            ok: true,
            data: [],
          },
        ]),
      ).toThrow("data must be an object");
      expect(() =>
        validateIpcArgs("viewer-api:approve-pairing", [
          { challengeId: "challenge", code: "12345x" },
        ]),
      ).toThrow("code is invalid");
      expect(() =>
        validateIpcArgs("viewer-api:create-prop-asset", [
          {
            grantId: "grant",
            mimeType: "image/svg+xml",
            bytesBase64: "AAAA",
          },
        ]),
      ).toThrow("mimeType is invalid");
      expect(() =>
        validateIpcArgs("viewer-api:create-prop-asset", [
          {
            grantId: "grant",
            mimeType: "image/png",
            bytesBase64: "../not-base64",
          },
        ]),
      ).toThrow("bytesBase64 is invalid");
      expect(() =>
        validateIpcArgs("viewer-api:revoke-prop-asset", [
          { grantId: "grant", assetId: "asset" },
        ]),
      ).toThrow("assetId is invalid");
      expect(() =>
        validateIpcArgs("viewer-api:open-pairing-window", [{ origins: [""] }]),
      ).toThrow("origins is invalid");
      expect(() =>
        validateIpcArgs("viewer-api:publish-event", [
          { name: "viewer.unknown", data: {} },
        ]),
      ).toThrow("event name is invalid");
      expect(() =>
        validateIpcArgs("viewer-api:publish-event", [
          { name: "viewer.api.grant.revoked", data: {} },
        ]),
      ).toThrow("event name is invalid");
    });
  });
});
