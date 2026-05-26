import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerSheetSection } from "../components/viewer-workflow";

const appShellMocks = vi.hoisted(() => {
  const modelRef = {
    current: {
      parameterValues: {},
      hitTest: vi.fn(() => null),
      setParameters: vi.fn(),
      applyExpressionPreset: vi.fn(),
    },
  };
  const rendererRef = {
    current: {
      screenToWorld: vi.fn((x: number, y: number) => ({ x, y })),
    },
  };
  const particlesRef = {
    current: {
      play: vi.fn(),
    },
  };
  const state = {
    loaded: true,
    error: null as string | null,
    setError: vi.fn(),
    modelName: "hero.vivi",
    dragging: false,
    tracking: false,
    handTracking: false,
    poseTracking: false,
    lipSync: false,
    bgMode: "transparent" as const,
    setBgMode: vi.fn(),
    alwaysOnTop: false,
    setAlwaysOnTop: vi.fn(),
    smoothing: 0.5,
    setSmoothing: vi.fn(),
    selectedCamera: "",
    setSelectedCamera: vi.fn(),
    lipSyncMode: "rms" as const,
    setLipSyncMode: vi.fn(),
    recordingFormat: "webm" as const,
    setRecordingFormat: vi.fn(),
    colliderEffects: true,
    setColliderEffects: vi.fn(),
    trackingMapRef: { current: {} as Record<string, string> },
    platformFaceMapRef: { current: {} as Record<string, string> },
    handTrackingMapRef: { current: {} as Record<string, string> },
    poseTrackingMapRef: { current: {} as Record<string, string> },
    mappedCount: 0,
    platformFaceMappedCount: 0,
    handMappedCount: 0,
    poseMappedCount: 0,
    showHud: false,
    setShowHud: vi.fn(),
    hudStats: { fps: 0, meshes: 0, vertices: 0 },
    setHudStats: vi.fn(),
    panelOpen: true,
    setPanelOpen: vi.fn(),
    currentVowel: "silent",
    setCurrentVowel: vi.fn(),
    recordingState: "idle" as const,
    recordingElapsed: 0,
    gamepadActive: false,
    midiActive: false,
    showHudRef: { current: false },
    smoothingRef: { current: 0.5 },
    initialSettings: {
      recommendationSuppressions: {},
    },
  };
  return {
    state,
    modelRef,
    rendererRef,
    particlesRef,
    showToast: vi.fn(),
    updateSettings: vi.fn(),
    viewerApiStatus: {
      enabled: false,
      grants: [],
    },
    controllerSnapshot: {
      props: [
        {
          id: "prop-hidden",
          name: "Hidden prop",
          kind: "image",
          visible: false,
          drawOrder: 1,
          opacity: 1,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          source: {
            kind: "inlineBase64",
            mimeType: "image/png",
            bytes: "AAAA",
            portable: true,
          },
        },
      ],
      calibration: {
        activeProfileId: "default",
        profiles: [{ id: "default" }],
        diagnostics: [
          {
            channelId: "face.x",
            source: "face",
            value: 1,
            calibrated: true,
            clipped: true,
            stale: false,
          },
        ],
      },
    },
    lastController: null as null | {
      dispatch: ReturnType<typeof vi.fn>;
      snapshot: ReturnType<typeof vi.fn>;
      subscribe: ReturnType<typeof vi.fn>;
      setActionCapabilities: ReturnType<typeof vi.fn>;
      runAction: ReturnType<typeof vi.fn>;
      exportCalibrationConfig: ReturnType<typeof vi.fn>;
      processTrackingFrame: ReturnType<typeof vi.fn>;
    },
    lastSideSheetInput: null as null | Record<string, Record<string, unknown>>,
  };
});

function applyStateSetter<T>(current: T, value: T | ((previous: T) => T)): T {
  return typeof value === "function"
    ? (value as (previous: T) => T)(current)
    : value;
}

vi.mock("@vivi2d/renderer-pixi", () => ({
  generateThumbnail: vi.fn(() => "data:image/png;base64,thumb"),
}));

vi.mock("../controller/viewer-controller", () => ({
  ViviViewerController: class MockViviViewerController {
    dispatch = vi.fn(async () => ({ accepted: true }));
    snapshot = vi.fn(() => appShellMocks.controllerSnapshot);
    subscribe = vi.fn(() => () => {});
    setActionCapabilities = vi.fn();
    runAction = vi.fn();
    exportCalibrationConfig = vi.fn(() => ({ profiles: [] }));
    processTrackingFrame = vi.fn();

    constructor() {
      appShellMocks.lastController = this;
    }
  },
}));

vi.mock("../hooks/useLocaleToggle", () => ({
  useLocaleToggle: () => ({
    locale: "en",
    t: (key: string) => (key === "readyToStream" ? "Ready to stream" : key),
    setLocale: vi.fn(),
    cycleLocale: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("../hooks/useViewerState", () => ({
  useViewerState: () => appShellMocks.state,
}));

vi.mock("../hooks/useModelSession", () => ({
  useModelSession: () => ({
    modelRef: appShellMocks.modelRef,
    rendererRef: appShellMocks.rendererRef,
    particlesRef: appShellMocks.particlesRef,
    loading: false,
    handleFileLoad: vi.fn(),
    handleUrlLoad: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
  }),
}));

vi.mock("../hooks/useTrackingOrchestrator", () => ({
  useTrackingOrchestrator: () => ({
    toggleTracking: vi.fn(),
    toggleHandTracking: vi.fn(),
    togglePoseTracking: vi.fn(),
  }),
}));

vi.mock("../hooks/useCamerasList", () => ({
  useCamerasList: () => ({ cameras: [] }),
}));

vi.mock("../hooks/useHitIndicator", () => ({
  useHitIndicator: () => ({
    lastHit: null,
    showHit: vi.fn(),
  }),
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
    showToast: appShellMocks.showToast,
  }),
}));

vi.mock("../props/useViewerOverlayActions", () => ({
  useViewerOverlayActions: () => ({
    error: null,
    handleAddFile: vi.fn(),
    handleCreateApiAsset: vi.fn(),
    handleListApiAssets: vi.fn(),
    handleExtendApiAsset: vi.fn(),
    handleRevokeApiAsset: vi.fn(),
    handleDuplicateProp: vi.fn(),
    handleRemoveProp: vi.fn(),
    handlePatchTransform: vi.fn(),
    handleSetVisible: vi.fn(),
    handleUpdateProp: vi.fn(),
    handleCycleGroup: vi.fn(),
    handleSpawnBurst: vi.fn(),
  }),
}));

vi.mock("../hooks/useViewerApiStatus", () => ({
  useViewerApiStatus: () => ({
    status: appShellMocks.viewerApiStatus,
  }),
}));

vi.mock("../hooks/useViewerApiEventPublisher", () => ({
  useViewerApiEventPublisher: () => vi.fn(),
}));

vi.mock("../hooks/useViewerApiRendererBridge", () => ({
  useViewerApiRendererBridge: vi.fn(),
}));

vi.mock("../hooks/useLipSync", () => ({
  useLipSync: () => ({
    lipSyncVolumeRef: { current: 0 },
    lipSyncVowelRef: { current: "silent" },
    toggleLipSync: vi.fn(),
  }),
}));

vi.mock("../hooks/useRecorder", () => ({
  useRecorder: () => ({
    toggleRecording: vi.fn(),
  }),
}));

vi.mock("../hooks/useInputDevices", () => ({
  useInputDevices: () => ({
    toggleGamepad: vi.fn(),
    toggleMidi: vi.fn(),
  }),
}));

vi.mock("../hooks/useViewerLoop", () => ({
  useViewerLoop: vi.fn(),
}));

vi.mock("../hooks/useExpressionPresetHotkeys", () => ({
  useExpressionPresetHotkeys: () => null,
}));

vi.mock("../settings", () => ({
  loadSettings: vi.fn(() => ({
    bgMode: "transparent",
    smoothing: 0.5,
    alwaysOnTop: false,
    lipSyncMode: "rms",
    recordingFormat: "webm",
    colliderEffects: true,
  })),
  updateSettings: appShellMocks.updateSettings,
  downloadConfig: vi.fn(),
  importConfig: vi.fn(),
}));

vi.mock("../recorder", () => ({
  ViewerRecorder: vi.fn(),
}));

vi.mock("../shell/ViewerShellFrame", () => ({
  ViewerShellFrame: ({
    toolbarProps,
    sideSheetProps,
    children,
  }: {
    toolbarProps: {
      onPrimaryAction: () => void;
      onTogglePanel: () => void;
      onToggleHud: () => void;
    };
    sideSheetProps: {
      open: boolean;
      activeSection: ViewerSheetSection;
      onClose: () => void;
      onSectionChange: (section: ViewerSheetSection) => void;
    };
    children: ReactNode;
  }) => (
    <div>
      <button type="button" data-testid="primary" onClick={toolbarProps.onPrimaryAction}>
        primary
      </button>
      <button type="button" data-testid="toggle-panel" onClick={toolbarProps.onTogglePanel}>
        toggle panel
      </button>
      <button type="button" data-testid="toggle-hud" onClick={toolbarProps.onToggleHud}>
        toggle stats
      </button>
      <button type="button" data-testid="close-sheet" onClick={sideSheetProps.onClose}>
        close sheet
      </button>
      <button
        type="button"
        data-testid="section-calibration"
        onClick={() => sideSheetProps.onSectionChange("calibration")}
      >
        section calibration
      </button>
      <span data-testid="sheet-state">
        {sideSheetProps.open ? "open" : "closed"}:{sideSheetProps.activeSection}
      </span>
      {children}
    </div>
  ),
}));

vi.mock("../panels/ViewerSideSheetSections", () => ({
  createViewerSideSheetSections: vi.fn((input: Record<string, Record<string, unknown>>) => {
    appShellMocks.lastSideSheetInput = input;
    return {
      session: <div data-testid="section-session" />,
      connect: <div data-testid="section-connect" />,
      overlays: <div data-testid="section-overlays" />,
      calibration: <div data-testid="section-calibration-body" />,
      inputEffects: <div data-testid="section-input-effects" />,
    };
  }),
}));

vi.mock("../shell/ViewerStage", () => ({
  ViewerStage: ({
    canvasRef,
    onCanvasClick,
    readinessWarnings,
    onClearReadinessWarnings,
    onOpenSheetSection,
    onDismissRecommendation,
    onRestoreRecommendation,
  }: {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    onCanvasClick: React.MouseEventHandler<HTMLCanvasElement>;
    readinessWarnings: Array<{
      id: string;
      label: string;
      targetSection: ViewerSheetSection;
      recommendationKey?: string;
      dismissed?: boolean;
    }>;
    onClearReadinessWarnings: () => void;
    onOpenSheetSection: (section: ViewerSheetSection) => void;
    onDismissRecommendation: (key: string) => void;
    onRestoreRecommendation: (key: string) => void;
  }) => (
    <section data-testid="mock-stage">
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        data-testid="stage-canvas"
        onClick={onCanvasClick}
      />
      <button type="button" data-testid="clear-warnings" onClick={onClearReadinessWarnings}>
        clear warnings
      </button>
      {readinessWarnings.map((warning) => (
        <article key={warning.id} data-testid={`warning-${warning.id}`}>
          <span>{warning.label}</span>
          <button
            type="button"
            data-testid={`open-${warning.id}`}
            onClick={() => onOpenSheetSection(warning.targetSection)}
          >
            open
          </button>
          {warning.recommendationKey && !warning.dismissed && (
            <button
              type="button"
              data-testid={`dismiss-${warning.id}`}
              onClick={() => onDismissRecommendation(warning.recommendationKey!)}
            >
              dismiss
            </button>
          )}
          {warning.recommendationKey && warning.dismissed && (
            <button
              type="button"
              data-testid={`restore-${warning.id}`}
              onClick={() => onRestoreRecommendation(warning.recommendationKey!)}
            >
              restore
            </button>
          )}
        </article>
      ))}
    </section>
  ),
}));

import App from "../App";

describe("App shell contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appShellMocks.viewerApiStatus.enabled = false;
    appShellMocks.viewerApiStatus.grants = [];
    appShellMocks.state.loaded = true;
    appShellMocks.state.error = null;
    appShellMocks.state.modelName = "hero.vivi";
    appShellMocks.state.panelOpen = true;
    appShellMocks.state.colliderEffects = true;
    appShellMocks.state.initialSettings = { recommendationSuppressions: {} };
    appShellMocks.lastSideSheetInput = null;
    appShellMocks.state.setPanelOpen.mockImplementation((value: unknown) => {
      appShellMocks.state.panelOpen = applyStateSetter(
        appShellMocks.state.panelOpen,
        value as boolean | ((previous: boolean) => boolean),
      );
    });
    appShellMocks.state.setShowHud.mockImplementation((value: unknown) => {
      appShellMocks.state.showHud = applyStateSetter(
        appShellMocks.state.showHud,
        value as boolean | ((previous: boolean) => boolean),
      );
    });
    appShellMocks.controllerSnapshot.props = [
      {
        id: "prop-hidden",
        name: "Hidden prop",
        kind: "image",
        visible: false,
        drawOrder: 1,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        source: {
          kind: "inlineBase64",
          mimeType: "image/png",
          bytes: "AAAA",
          portable: true,
        },
      },
    ];
    appShellMocks.controllerSnapshot.calibration = {
      activeProfileId: "default",
      profiles: [{ id: "default" }],
      diagnostics: [
        {
          channelId: "face.x",
          source: "face",
          value: 1,
          calibrated: true,
          clipped: true,
          stale: false,
        },
      ],
    };
    appShellMocks.modelRef.current.hitTest.mockReturnValue(null);
    appShellMocks.rendererRef.current.screenToWorld.mockReturnValue({ x: 25, y: 50 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as typeof window & { viviAPI?: unknown }).viviAPI;
  });

  it("runs the go-live check and exposes actionable readiness warnings", async () => {
    appShellMocks.viewerApiStatus.enabled = true;
    appShellMocks.controllerSnapshot.calibration = {
      activeProfileId: "default",
      profiles: [],
      diagnostics: [],
    };
    render(<App />);

    fireEvent.click(screen.getByTestId("primary"));

    expect(screen.getByTestId("warning-hidden-props")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("open-hidden-props"));
    expect(appShellMocks.state.setPanelOpen).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId("clear-warnings"));
    expect(screen.queryByTestId("warning-hidden-props")).toBeNull();
  });

  it("shows a success toast when the go-live check has no warnings", async () => {
    appShellMocks.viewerApiStatus.enabled = true;
    appShellMocks.controllerSnapshot.props = [];
    appShellMocks.controllerSnapshot.calibration = {
      activeProfileId: "default",
      profiles: [],
      diagnostics: [],
    };

    render(<App />);
    fireEvent.click(screen.getByTestId("primary"));

    await waitFor(() => {
      expect(appShellMocks.showToast).toHaveBeenCalledWith("Ready to stream");
    });
  });

  it("handles panel and stats shortcuts from the shell", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("toggle-panel"));
    expect(appShellMocks.state.setPanelOpen).toHaveBeenCalledWith(expect.any(Function));

    fireEvent.keyDown(window, { key: "v", altKey: true, shiftKey: true });
    expect(appShellMocks.state.setPanelOpen).toHaveBeenCalledWith(expect.any(Function));

    fireEvent.click(screen.getByTestId("toggle-hud"));
    expect(appShellMocks.state.setShowHud).toHaveBeenCalledWith(expect.any(Function));

    fireEvent.click(screen.getByTestId("close-sheet"));
    expect(appShellMocks.state.setPanelOpen).toHaveBeenCalledWith(false);
  });

  it("persists session panel changes through App-owned callbacks", async () => {
    const setBackgroundMode = vi.fn();
    const toggleAlwaysOnTop = vi.fn().mockResolvedValue(true);
    (window as typeof window & { viviAPI: unknown }).viviAPI = {
      setBackgroundMode,
      toggleAlwaysOnTop,
      toggleFrame: vi.fn(async () => {}),
      setWindowSize: vi.fn(async () => {}),
      onBackgroundModeChanged: vi.fn(() => () => {}),
    };
    render(<App />);

    const session = appShellMocks.lastSideSheetInput?.session as {
      onBgModeChange: (mode: "green") => void;
      onSmoothingChange: (value: number) => void;
      onToggleAlwaysOnTop: () => Promise<void>;
      onRecordingFormatChange: (format: "mp4") => void;
      onToggleHud: () => void;
      onSaveThumbnail: () => void;
    };

    session.onBgModeChange("green");
    session.onSmoothingChange(0.8);
    session.onRecordingFormatChange("mp4");
    session.onToggleHud();
    await session.onToggleAlwaysOnTop();
    session.onSaveThumbnail();

    expect(appShellMocks.state.setBgMode).toHaveBeenCalledWith("green");
    expect(setBackgroundMode).toHaveBeenCalledWith("green");
    expect(appShellMocks.state.setSmoothing).toHaveBeenCalledWith(0.8);
    expect(appShellMocks.state.setRecordingFormat).toHaveBeenCalledWith("mp4");
    expect(toggleAlwaysOnTop).toHaveBeenCalledTimes(1);
    expect(appShellMocks.state.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(appShellMocks.state.setShowHud).toHaveBeenCalledWith(expect.any(Function));
  });

  it("routes calibration section commands through the viewer controller", () => {
    render(<App />);

    const calibration = appShellMocks.lastSideSheetInput?.calibration as {
      onApplyProfile: (profileId: string) => void;
      onCaptureNeutral: (source: "face") => void;
      onSuggestRanges: (source: "hand") => void;
      onReset: () => void;
    };

    calibration.onApplyProfile("streaming");
    calibration.onCaptureNeutral("face");
    calibration.onSuggestRanges("hand");
    calibration.onReset();

    expect(appShellMocks.lastController?.dispatch).toHaveBeenCalledWith({
      type: "calibration.applyProfile",
      profileId: "streaming",
      scopes: ["write:calibration"],
    });
    expect(appShellMocks.lastController?.dispatch).toHaveBeenCalledWith({
      type: "calibration.captureNeutral",
      source: "face",
      scopes: ["write:calibration"],
    });
    expect(appShellMocks.lastController?.dispatch).toHaveBeenCalledWith({
      type: "calibration.suggestRanges",
      source: "hand",
      scopes: ["write:calibration"],
    });
    expect(appShellMocks.lastController?.dispatch).toHaveBeenCalledWith({
      type: "calibration.reset",
      scopes: ["write:calibration"],
    });
  });

  it("opens targeted workflow sections for calibration and connection recommendations", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("primary"));
    expect(screen.getByTestId("sheet-state")).toHaveTextContent("calibration");

    appShellMocks.controllerSnapshot.calibration = {
      activeProfileId: "default",
      profiles: [],
      diagnostics: [],
    };
    const { unmount } = render(<App />);
    fireEvent.click(screen.getAllByTestId("primary").at(-1)!);
    expect(screen.getAllByTestId("sheet-state").at(-1)).toHaveTextContent("connect");
    unmount();
  });

  it("maps canvas clicks through renderer hit testing and collider effects", () => {
    appShellMocks.modelRef.current.hitTest.mockReturnValue({
      colliderName: "Heart",
      tag: "face",
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 240,
      width: 320,
      height: 240,
      toJSON: () => ({}),
    } as DOMRect);

    render(<App />);
    fireEvent.click(screen.getByTestId("stage-canvas"), {
      clientX: 25,
      clientY: 50,
    });

    expect(appShellMocks.rendererRef.current.screenToWorld).toHaveBeenCalledWith(25, 50);
    expect(appShellMocks.modelRef.current.hitTest).toHaveBeenCalledWith(25, 50);
    expect(appShellMocks.particlesRef.current.play).toHaveBeenCalledWith("hearts", {
      x: 25,
      y: 50,
    });
  });

  it("keeps the error workflow primary action focused on opening the panel", () => {
    appShellMocks.state.error = "load failed";

    render(<App />);
    fireEvent.click(screen.getByTestId("primary"));

    expect(appShellMocks.state.setPanelOpen).toHaveBeenCalledWith(true);
  });
});
