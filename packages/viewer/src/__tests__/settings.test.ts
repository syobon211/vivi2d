import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackingConfig, ViewerSettings } from "../settings";
import {
  DEFAULT_SETTINGS,
  downloadConfig,
  exportConfig,
  importConfig,
  loadSettings,
  saveSettings,
  updateSettings,
} from "../settings";

const STORAGE_KEY = "vivi-viewer-settings";

describe("settings", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("loadSettings", () => {
    it("returns defaults when localStorage is empty", () => {
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it("loads valid local preferences and fills missing defaults", () => {
      store[STORAGE_KEY] = JSON.stringify({
        bgMode: "green",
        smoothing: 0.8,
        cameraDeviceId: "cam-123",
        lastModelPath: "C:/local/model.vivi",
        alwaysOnTop: true,
      });

      const settings = loadSettings();

      expect(settings).toMatchObject({
        ...DEFAULT_SETTINGS,
        bgMode: "green",
        smoothing: 0.8,
        cameraDeviceId: "cam-123",
        lastModelPath: "C:/local/model.vivi",
        alwaysOnTop: true,
      });
    });

    it("drops legacy secret and bridge fields from local storage", () => {
      store[STORAGE_KEY] = JSON.stringify({
        ...DEFAULT_SETTINGS,
        bridgeEndpoint: "ws://127.0.0.1:4455",
        bridgePassword: "super-secret",
        legacyBridgeUrl: "ws://127.0.0.1:8001",
      });

      const settings = loadSettings() as unknown as Record<string, unknown>;

      expect(settings.bridgeEndpoint).toBeUndefined();
      expect(settings.bridgePassword).toBeUndefined();
      expect(settings.legacyBridgeUrl).toBeUndefined();
    });

    it("returns defaults for invalid JSON or storage errors", () => {
      store[STORAGE_KEY] = "{invalid-json";
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);

      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("disabled");
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      });
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it("ignores invalid field values and keeps valid values", () => {
      store[STORAGE_KEY] = JSON.stringify({
        bgMode: "rainbow",
        smoothing: -0.5,
        alwaysOnTop: true,
      });

      const settings = loadSettings();

      expect(settings.bgMode).toBe(DEFAULT_SETTINGS.bgMode);
      expect(settings.smoothing).toBe(DEFAULT_SETTINGS.smoothing);
      expect(settings.alwaysOnTop).toBe(true);
    });
  });

  describe("saveSettings and updateSettings", () => {
    it("round-trips local preferences", () => {
      const custom: ViewerSettings = {
        ...DEFAULT_SETTINGS,
        bgMode: "blue",
        smoothing: 0.42,
        cameraDeviceId: "device-xyz",
        lastModelPath: "/path/to/model.vivi",
        alwaysOnTop: true,
        lipSyncMode: "viseme",
        recordingFormat: "webm",
        colliderEffects: false,
      };

      saveSettings(custom);

      expect(loadSettings()).toEqual(custom);
    });

    it("sanitizes legacy secrets before persisting", () => {
      saveSettings({
        ...DEFAULT_SETTINGS,
        bridgePassword: "should-not-persist",
        legacyBridgeUrl: "ws://127.0.0.1:8001",
      } as unknown as ViewerSettings);

      const raw = JSON.parse(store[STORAGE_KEY] ?? "{}");

      expect(raw.bridgePassword).toBeUndefined();
      expect(raw.legacyBridgeUrl).toBeUndefined();
    });

    it("does not throw when localStorage writes fail", () => {
      vi.stubGlobal("localStorage", {
        getItem: vi.fn().mockReturnValue(null),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: vi.fn(),
        clear: vi.fn(),
      });

      expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    });

    it("merges partial updates with persisted settings", () => {
      saveSettings(DEFAULT_SETTINGS);

      const updated = updateSettings({ smoothing: 0.9, bgMode: "green" });

      expect(updated.smoothing).toBe(0.9);
      expect(updated.bgMode).toBe("green");
      expect(updated.colliderEffects).toBe(DEFAULT_SETTINGS.colliderEffects);
      expect(loadSettings().smoothing).toBe(0.9);
    });
  });

  describe("exportConfig", () => {
    it("exports portable viewer settings without local-only fields", () => {
      const json = exportConfig({
        ...DEFAULT_SETTINGS,
        cameraDeviceId: "private-camera",
        lastModelPath: "C:/Users/example/model.vivi",
        bridgeEndpoint: "ws://127.0.0.1:4455",
        bridgePassword: "secret",
        legacyBridgeUrl: "ws://127.0.0.1:8001",
      } as unknown as ViewerSettings);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe(1);
      expect(parsed.settings).toEqual({
        bgMode: DEFAULT_SETTINGS.bgMode,
        smoothing: DEFAULT_SETTINGS.smoothing,
        alwaysOnTop: DEFAULT_SETTINGS.alwaysOnTop,
        lipSyncMode: DEFAULT_SETTINGS.lipSyncMode,
        recordingFormat: DEFAULT_SETTINGS.recordingFormat,
        colliderEffects: DEFAULT_SETTINGS.colliderEffects,
      });
      expect(json).not.toContain("private-camera");
      expect(json).not.toContain("model.vivi");
      expect(json).not.toContain("127.0.0.1");
      expect(json).not.toContain("secret");
    });

    it("exports tracking config when provided", () => {
      const tracking = { face: { eyeOpenLeft: "ParamEyeLOpen" } };
      const parsed = JSON.parse(exportConfig(DEFAULT_SETTINGS, tracking));

      expect(parsed.tracking).toEqual(tracking);
    });

    it("sanitizes tracking config keys before export", () => {
      const parsed = JSON.parse(
        exportConfig(DEFAULT_SETTINGS, {
          face: {
            eyeOpenLeft: "ParamEyeLOpen",
            unexpected: "ParamLeak",
          },
        } as unknown as TrackingConfig),
      );

      expect(parsed.tracking).toEqual({
        face: { eyeOpenLeft: "ParamEyeLOpen" },
      });
      expect(JSON.stringify(parsed)).not.toContain("ParamLeak");
    });

    it("omits tracking when not provided", () => {
      const parsed = JSON.parse(exportConfig(DEFAULT_SETTINGS));

      expect(parsed.tracking).toBeUndefined();
    });
  });

  describe("importConfig", () => {
    it("imports portable settings and fills missing defaults", () => {
      const input = JSON.stringify({
        version: 1,
        settings: { bgMode: "green", smoothing: 0.5 },
      });

      const result = importConfig(input);

      expect(result).not.toBeNull();
      expect(result?.settings).toEqual({
        bgMode: "green",
        smoothing: 0.5,
        alwaysOnTop: DEFAULT_SETTINGS.alwaysOnTop,
        lipSyncMode: DEFAULT_SETTINGS.lipSyncMode,
        recordingFormat: DEFAULT_SETTINGS.recordingFormat,
        colliderEffects: DEFAULT_SETTINGS.colliderEffects,
      });
    });

    it("rejects invalid JSON, unsupported versions, and missing settings", () => {
      expect(importConfig("{broken!!!}")).toBeNull();
      expect(importConfig("")).toBeNull();
      expect(importConfig(JSON.stringify({ version: 2, settings: {} }))).toBeNull();
      expect(importConfig(JSON.stringify({ version: 1 }))).toBeNull();
    });

    it("ignores local-only and secret fields in imported portable configs", () => {
      const input = JSON.stringify({
        version: 1,
        settings: {
          ...DEFAULT_SETTINGS,
          cameraDeviceId: "private-camera",
          lastModelPath: "C:/Users/example/model.vivi",
          bridgeEndpoint: "ws://127.0.0.1:4455",
          bridgePassword: "should-not-persist",
          legacyBridgeUrl: "ws://127.0.0.1:8001",
        },
      });

      const result = importConfig(input);
      const settings = result?.settings as unknown as Record<string, unknown>;

      expect(result).not.toBeNull();
      expect(settings.cameraDeviceId).toBeUndefined();
      expect(settings.lastModelPath).toBeUndefined();
      expect(settings.bridgeEndpoint).toBeUndefined();
      expect(settings.bridgePassword).toBeUndefined();
      expect(settings.legacyBridgeUrl).toBeUndefined();
    });

    it("imports tracking config", () => {
      const input = JSON.stringify({
        version: 1,
        settings: DEFAULT_SETTINGS,
        tracking: { face: { eyeOpenLeft: "ParamEyeLOpen" } },
      });

      expect(importConfig(input)?.tracking).toEqual({
        face: { eyeOpenLeft: "ParamEyeLOpen" },
      });
    });

    it("rejects unknown tracking map keys during import", () => {
      const input =
        '{"version":1,"settings":{"bgMode":"blue"},"tracking":{"face":{"eyeOpenLeft":"ParamEyeLOpen","__proto__":"polluted","unexpected":"ParamLeak"}}}';

      const result = importConfig(input);

      expect(result).not.toBeNull();
      expect(result?.tracking).toEqual({
        face: { eyeOpenLeft: "ParamEyeLOpen" },
      });
      expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("ignores unknown fields and invalid setting values", () => {
      const input = JSON.stringify({
        version: 1,
        settings: {
          bgMode: "red",
          smoothing: 1.5,
          alwaysOnTop: true,
          unknownField: "ignored",
        },
        tracking: { face: {} },
        extraTopLevel: "ignored",
      });

      const result = importConfig(input);

      expect(result).not.toBeNull();
      expect(result?.settings.bgMode).toBe(DEFAULT_SETTINGS.bgMode);
      expect(result?.settings.smoothing).toBe(DEFAULT_SETTINGS.smoothing);
      expect(result?.settings.alwaysOnTop).toBe(true);
    });

    it("does not allow prototype pollution payloads", () => {
      const polluted =
        '{"version":1,"settings":{"__proto__":{"polluted":true},"bgMode":"blue"}}';
      const before = (Object.prototype as Record<string, unknown>).polluted;
      const result = importConfig(polluted);
      const after = (Object.prototype as Record<string, unknown>).polluted;

      expect(before).toBeUndefined();
      expect(after).toBeUndefined();
      expect(result?.settings.bgMode).toBe("blue");
    });
  });

  describe("downloadConfig", () => {
    function stubDownloadDom() {
      const fakeUrl = "blob:http://localhost/fake-uuid";
      const clickMock = vi.fn();
      const mockAnchor: Partial<HTMLAnchorElement> & { click: () => void } = {
        href: "",
        download: "",
        click: clickMock,
      };
      const originalCreateElement = document.createElement.bind(document);

      vi.stubGlobal("URL", {
        createObjectURL: vi.fn().mockReturnValue(fakeUrl),
        revokeObjectURL: vi.fn(),
      });
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        if (tag === "a") return mockAnchor as HTMLAnchorElement;
        return originalCreateElement(tag);
      });
      vi.spyOn(document.body, "appendChild").mockReturnValue(null as never);
      vi.spyOn(document.body, "removeChild").mockReturnValue(null as never);

      return { clickMock, mockAnchor };
    }

    it("downloads a config JSON file", () => {
      const { clickMock, mockAnchor } = stubDownloadDom();

      downloadConfig(DEFAULT_SETTINGS, { face: { eyeOpenLeft: "ParamEyeLOpen" } });

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickMock).toHaveBeenCalledTimes(1);
      expect(mockAnchor.download).toBe("vivi-viewer-config.json");
      expect(document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
      expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchor);
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });
});
