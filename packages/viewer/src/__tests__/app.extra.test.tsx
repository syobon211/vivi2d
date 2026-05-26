import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appMocks = vi.hoisted(() => ({
  generateThumbnailMock: vi.fn(() => "data:image/png;base64,thumb"),
  downloadConfigMock: vi.fn(),
  importConfigMock: vi.fn(),
  loadSettingsMock: vi.fn(() => ({
    bgMode: "transparent",
    smoothing: 0.5,
    alwaysOnTop: false,
    lipSyncMode: "rms",
    recordingFormat: "webm",
    colliderEffects: false,
  })),
  updateSettingsMock: vi.fn(),
  showToastMock: vi.fn(),
  setErrorMock: vi.fn(),
  setBgModeMock: vi.fn(),
  setAlwaysOnTopMock: vi.fn(),
  setSmoothingMock: vi.fn(),
  setLipSyncModeMock: vi.fn(),
  setRecordingFormatMock: vi.fn(),
  setColliderEffectsMock: vi.fn(),
  setPanelOpenMock: vi.fn(),
  setCurrentVowelMock: vi.fn(),
  setHudStatsMock: vi.fn(),
  trackingMapRef: { current: {} as Record<string, string> },
  platformFaceMapRef: { current: {} as Record<string, string> },
  handTrackingMapRef: { current: {} as Record<string, string> },
  poseTrackingMapRef: { current: {} as Record<string, string> },
}));

vi.mock("@vivi2d/renderer-pixi", () => ({
  generateThumbnail: appMocks.generateThumbnailMock,
}));

vi.mock("../components/HudOverlay", () => ({
  HudOverlay: () => <div data-testid="hud-overlay" />,
}));

vi.mock("../components/Indicators", () => ({
  PresetIndicator: () => <div data-testid="preset-indicator" />,
  RecordingIndicator: () => <div data-testid="recording-indicator" />,
  Toast: ({ message }: { message: string }) => <div data-testid="toast">{message}</div>,
  VowelIndicator: () => <div data-testid="vowel-indicator" />,
}));

vi.mock("../components/Toolbar", () => ({
  Toolbar: () => <div data-testid="toolbar" />,
}));

vi.mock("../components/SettingsPanel", () => ({
  SettingsPanel: ({
    onBgModeChange,
    onToggleAlwaysOnTop,
    onSaveThumbnail,
    onImportConfig,
    onExportConfig,
  }: {
    onBgModeChange: (value: string) => void;
    onToggleAlwaysOnTop: () => Promise<void> | void;
    onSaveThumbnail: () => void;
    onImportConfig: () => void;
    onExportConfig: () => void;
  }) => (
    <div data-testid="settings-panel">
      <button type="button" onClick={() => onBgModeChange("green")}>
        bg-green
      </button>
      <button type="button" onClick={() => void onToggleAlwaysOnTop()}>
        toggle-aot
      </button>
      <button type="button" onClick={onSaveThumbnail}>
        save-thumb
      </button>
      <button type="button" onClick={onExportConfig}>
        export-config
      </button>
      <button type="button" onClick={onImportConfig}>
        import-config
      </button>
    </div>
  ),
}));

vi.mock("../components/SessionPanel", () => ({
  SessionPanel: ({
    onBgModeChange,
    onToggleAlwaysOnTop,
    onSaveThumbnail,
    onImportConfig,
    onExportConfig,
  }: {
    onBgModeChange: (value: string) => void;
    onToggleAlwaysOnTop: () => Promise<void> | void;
    onSaveThumbnail: () => void;
    onImportConfig: () => void;
    onExportConfig: () => void;
  }) => (
    <div data-testid="session-panel">
      <button type="button" onClick={() => onBgModeChange("green")}>
        bg-green
      </button>
      <button type="button" onClick={() => void onToggleAlwaysOnTop()}>
        toggle-aot
      </button>
      <button type="button" onClick={onSaveThumbnail}>
        save-thumb
      </button>
      <button type="button" onClick={onExportConfig}>
        export-config
      </button>
      <button type="button" onClick={onImportConfig}>
        import-config
      </button>
    </div>
  ),
}));

vi.mock("../hooks/useCamerasList", () => ({
  useCamerasList: () => ({ cameras: [] }),
}));

vi.mock("../hooks/useExpressionPresetHotkeys", () => ({
  useExpressionPresetHotkeys: () => null,
}));

vi.mock("../hooks/useHitIndicator", () => ({
  useHitIndicator: () => ({ lastHit: null, showHit: vi.fn() }),
}));

vi.mock("../hooks/useInputDevices", () => ({
  useInputDevices: () => ({ toggleGamepad: vi.fn(), toggleMidi: vi.fn() }),
}));

vi.mock("../hooks/useLipSync", () => ({
  useLipSync: () => ({
    lipSyncVolumeRef: { current: 0 },
    lipSyncVowelRef: { current: "silent" },
    toggleLipSync: vi.fn(),
  }),
}));

vi.mock("../hooks/useLocaleToggle", () => ({
  useLocaleToggle: () => ({
    locale: "en",
    t: (key: string) => key,
    toggleLocale: vi.fn(),
  }),
}));

vi.mock("../hooks/useModelSession", () => ({
  useModelSession: () => ({
    modelRef: { current: null },
    rendererRef: { current: null },
    particlesRef: { current: null },
    handleFileLoad: vi.fn(),
    handleUrlLoad: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
  }),
}));

vi.mock("../hooks/useRecorder", () => ({
  useRecorder: () => ({ toggleRecording: vi.fn() }),
}));

vi.mock("../hooks/useScriptRunner", () => ({
  useScriptRunner: () => ({
    scriptInput: "",
    setScriptInput: vi.fn(),
    scriptRunning: false,
    runScript: vi.fn(),
  }),
}));

vi.mock("../hooks/useToast", () => ({
  useToast: () => ({
    toast: null,
    showToast: appMocks.showToastMock,
  }),
}));

vi.mock("../hooks/useTrackingOrchestrator", () => ({
  useTrackingOrchestrator: () => ({
    toggleTracking: vi.fn(),
    toggleHandTracking: vi.fn(),
    togglePoseTracking: vi.fn(),
  }),
}));

vi.mock("../hooks/useViewerLoop", () => ({
  useViewerLoop: vi.fn(),
}));

vi.mock("../hooks/useViewerState", () => ({
  useViewerState: () => ({
    loaded: true,
    error: null,
    setError: appMocks.setErrorMock,
    modelName: "viewer-model",
    dragging: false,
    tracking: false,
    handTracking: false,
    poseTracking: false,
    lipSync: false,
    bgMode: "transparent",
    setBgMode: appMocks.setBgModeMock,
    alwaysOnTop: false,
    setAlwaysOnTop: appMocks.setAlwaysOnTopMock,
    smoothing: 0.5,
    setSmoothing: appMocks.setSmoothingMock,
    selectedCamera: "",
    setSelectedCamera: vi.fn(),
    lipSyncMode: "rms",
    setLipSyncMode: appMocks.setLipSyncModeMock,
    recordingFormat: "webm",
    setRecordingFormat: appMocks.setRecordingFormatMock,
    colliderEffects: false,
    setColliderEffects: appMocks.setColliderEffectsMock,
    trackingMapRef: appMocks.trackingMapRef,
    platformFaceMapRef: appMocks.platformFaceMapRef,
    handTrackingMapRef: appMocks.handTrackingMapRef,
    poseTrackingMapRef: appMocks.poseTrackingMapRef,
    mappedCount: 0,
    platformFaceMappedCount: 0,
    handMappedCount: 0,
    poseMappedCount: 0,
    showHud: false,
    setShowHud: vi.fn(),
    hudStats: { fps: 0, meshes: 0, vertices: 0 },
    setHudStats: appMocks.setHudStatsMock,
    panelOpen: true,
    setPanelOpen: appMocks.setPanelOpenMock,
    currentVowel: "silent",
    setCurrentVowel: appMocks.setCurrentVowelMock,
    recordingState: "idle",
    recordingElapsed: 0,
    gamepadActive: false,
    midiActive: false,
    showHudRef: { current: false },
  }),
}));

vi.mock("../recorder", () => ({
  ViewerRecorder: vi.fn(),
}));

vi.mock("../settings", () => ({
  downloadConfig: appMocks.downloadConfigMock,
  importConfig: appMocks.importConfigMock,
  loadSettings: appMocks.loadSettingsMock,
  updateSettings: appMocks.updateSettingsMock,
}));

import App from "../App";

function click(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("App extra coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    appMocks.importConfigMock.mockReset();
    appMocks.importConfigMock.mockReturnValue(null);
    appMocks.showToastMock.mockReset();
    appMocks.setErrorMock.mockReset();
    appMocks.setBgModeMock.mockReset();
    appMocks.setAlwaysOnTopMock.mockReset();
    appMocks.updateSettingsMock.mockReset();
    appMocks.trackingMapRef.current = {};
    appMocks.platformFaceMapRef.current = {};
    appMocks.handTrackingMapRef.current = {};
    appMocks.poseTrackingMapRef.current = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as typeof window & { viviAPI?: unknown }).viviAPI;
  });

  it("saves thumbnails through the pixi thumbnail generator", () => {
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<App />);
    click("save-thumb");

    expect(appMocks.generateThumbnailMock).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({
        width: 512,
        height: 512,
        format: "png",
      }),
    );
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  });

  it("updates the background mode and forwards it to the electron bridge", () => {
    const setBackgroundMode = vi.fn();
    (window as typeof window & { viviAPI?: unknown }).viviAPI = {
      setBackgroundMode,
      toggleAlwaysOnTop: vi.fn(),
      toggleFrame: vi.fn(),
      setWindowSize: vi.fn(),
      onBackgroundModeChanged: vi.fn(() => () => {}),
    };

    render(<App />);
    click("bg-green");

    expect(appMocks.setBgModeMock).toHaveBeenCalledWith("green");
    expect(appMocks.updateSettingsMock).toHaveBeenCalledWith({ bgMode: "green" });
    expect(setBackgroundMode).toHaveBeenCalledWith("green");
  });

  it("syncs always-on-top state through the electron bridge and persisted settings", async () => {
    const toggleAlwaysOnTop = vi.fn().mockResolvedValue(true);
    (window as typeof window & { viviAPI?: unknown }).viviAPI = {
      setBackgroundMode: vi.fn(),
      toggleAlwaysOnTop,
      toggleFrame: vi.fn(),
      setWindowSize: vi.fn(),
      onBackgroundModeChanged: vi.fn(() => () => {}),
    };

    render(<App />);
    click("toggle-aot");

    await waitFor(() => {
      expect(toggleAlwaysOnTop).toHaveBeenCalledTimes(1);
    });
    expect(appMocks.setAlwaysOnTopMock).toHaveBeenCalledWith(true);
    expect(appMocks.updateSettingsMock).toHaveBeenCalledWith({ alwaysOnTop: true });
  });

  it("imports a config file, updates runtime settings, and shows a success toast", async () => {
    appMocks.importConfigMock.mockReturnValue({
      settings: {
        bgMode: "green",
        smoothing: 0.75,
        alwaysOnTop: true,
        lipSyncMode: "viseme",
        recordingFormat: "mp4",
        colliderEffects: true,
      },
      tracking: {
        face: { jaw: "ParamMouthOpenY" },
        platformFace: { BrowInnerUp: "ParamBrowLY" },
        hand: { pinch: "ParamHand" },
        pose: { lean: "ParamBodyAngleX" },
      },
    });

    const realCreateElement = document.createElement.bind(document);
    let createdInput: HTMLInputElement | null = null;
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = realCreateElement(tagName);
      if (tagName === "input") {
        createdInput = element as HTMLInputElement;
      }
      return element;
    }) as typeof document.createElement);

    render(<App />);
    click("import-config");

    expect(createdInput).not.toBeNull();
    const file = new File(["{}"], "viewer-config.json", {
      type: "application/json",
    });
    Object.defineProperty(createdInput!, "files", {
      value: [file],
      configurable: true,
    });

    await (createdInput!.onchange as (event: Event) => Promise<void>)(
      new Event("change"),
    );

    expect(appMocks.updateSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bgMode: "green",
        smoothing: 0.75,
        alwaysOnTop: true,
        lipSyncMode: "viseme",
      }),
    );
    expect(appMocks.setBgModeMock).toHaveBeenCalledWith("green");
    expect(appMocks.setSmoothingMock).toHaveBeenCalledWith(0.75);
    expect(appMocks.setAlwaysOnTopMock).toHaveBeenCalledWith(true);
    expect(appMocks.setLipSyncModeMock).toHaveBeenCalledWith("viseme");
    expect(appMocks.setRecordingFormatMock).toHaveBeenCalledWith("mp4");
    expect(appMocks.setColliderEffectsMock).toHaveBeenCalledWith(true);
    expect(appMocks.trackingMapRef.current).toEqual({ jaw: "ParamMouthOpenY" });
    expect(appMocks.platformFaceMapRef.current).toEqual({ BrowInnerUp: "ParamBrowLY" });
    expect(appMocks.handTrackingMapRef.current).toEqual({ pinch: "ParamHand" });
    expect(appMocks.poseTrackingMapRef.current).toEqual({ lean: "ParamBodyAngleX" });
    expect(appMocks.showToastMock).toHaveBeenCalledWith("importSuccess");
  });

  it("surfaces import failures without updating settings", async () => {
    appMocks.importConfigMock.mockReturnValue(null);

    const realCreateElement = document.createElement.bind(document);
    let createdInput: HTMLInputElement | null = null;
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = realCreateElement(tagName);
      if (tagName === "input") {
        createdInput = element as HTMLInputElement;
      }
      return element;
    }) as typeof document.createElement);

    render(<App />);
    click("import-config");

    const file = new File(["{}"], "broken-config.json", {
      type: "application/json",
    });
    Object.defineProperty(createdInput!, "files", {
      value: [file],
      configurable: true,
    });

    await (createdInput!.onchange as (event: Event) => Promise<void>)(
      new Event("change"),
    );

    expect(appMocks.updateSettingsMock).not.toHaveBeenCalled();
    expect(appMocks.showToastMock).not.toHaveBeenCalled();
    expect(appMocks.setErrorMock).toHaveBeenCalledWith("importFailed");
  });
});
