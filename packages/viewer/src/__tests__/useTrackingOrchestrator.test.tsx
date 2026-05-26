import { act, renderHook } from "@testing-library/react";
import type { ViviModel } from "@vivi2d/core/model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackingOrchestrator } from "../hooks/useTrackingOrchestrator";
import type { UseViewerStateResult } from "../hooks/useViewerState";

const trackerInit = vi.fn();
const trackerStart = vi.fn();
const trackerStop = vi.fn();
const trackerDestroy = vi.fn();
let lastFaceCallback: ((lm: unknown, bs?: unknown) => void) | null = null;
let lastHandCallback: ((hands: unknown) => void) | null = null;
let lastPoseCallback: ((lm: unknown) => void) | null = null;

vi.mock("../tracking/face-tracker", () => ({
  FaceTracker: class {
    init = trackerInit;
    stop = trackerStop;
    destroy = trackerDestroy;
    start(cb: (lm: unknown, bs?: unknown) => void) {
      lastFaceCallback = cb;
      return trackerStart();
    }
  },
}));

vi.mock("../tracking/hand-tracker", () => ({
  HandTracker: class {
    init = trackerInit;
    stop = trackerStop;
    destroy = trackerDestroy;
    start(cb: (hands: unknown) => void) {
      lastHandCallback = cb;
      return trackerStart();
    }
  },
}));

vi.mock("../tracking/pose-tracker", () => ({
  PoseTracker: class {
    init = trackerInit;
    stop = trackerStop;
    destroy = trackerDestroy;
    start(cb: (lm: unknown) => void) {
      lastPoseCallback = cb;
      return trackerStart();
    }
  },
}));

vi.mock("../tracking/face-mapper", () => ({
  mapLandmarksToParams: vi.fn(() => ({
    eyeOpenLeft: 1,
    eyeOpenRight: 1,
    mouthOpen: 0,
    mouthWidth: 0,
    headRotationX: 0,
    headRotationY: 0,
    headRotationZ: 0,
    browLeftY: 0,
    browRightY: 0,
  })),
  trackingResultToParams: vi.fn(() => ({ ParamFace: 0.5 })),
}));

vi.mock("../tracking/hand-mapper", () => ({
  mapHandDetectionsToParams: vi.fn(() => ({
    handLX: 0,
    handLY: 0,
    handLGrip: 0,
    handRX: 0,
    handRY: 0,
    handRGrip: 0,
  })),
  handTrackingResultToParams: vi.fn(() => ({ ParamHand: 1 })),
}));

vi.mock("../tracking/pose-mapper", () => ({
  mapPoseLandmarksToParams: vi.fn(() => ({
    bodyRotZ: 0,
    armLRaise: 0,
    armRRaise: 0,
    armLBend: 0,
    armRBend: 0,
  })),
  poseTrackingResultToParams: vi.fn(() => ({ ParamPose: 0.7 })),
}));

vi.mock("../tracking/platform-face-channels", () => ({
  faceChannelsToParams: vi.fn(() => ({ ParamPlatformFace: 0.3 })),
}));

function createMockState(
  overrides: Partial<UseViewerStateResult> = {},
): UseViewerStateResult {
  const noopFn = () => {};
  const ref = <T,>(value: T) => ({ current: value });
  return {
    setError: vi.fn(),
    setTracking: vi.fn(),
    setHandTracking: vi.fn(),
    setPoseTracking: vi.fn(),
    tracking: false,
    handTracking: false,
    poseTracking: false,
    selectedCamera: "",
    smoothingRef: ref(0.6),
    trackingMapRef: ref({}),
    platformFaceMapRef: ref({}),
    handTrackingMapRef: ref({}),
    poseTrackingMapRef: ref({}),
    loaded: false,
    error: null,
    setLoaded: noopFn,
    modelName: "",
    setModelName: noopFn,
    dragging: false,
    setDragging: noopFn,
    lipSync: false,
    setLipSync: noopFn,
    bgMode: "transparent",
    setBgMode: noopFn,
    alwaysOnTop: false,
    setAlwaysOnTop: noopFn,
    smoothing: 0.6,
    setSmoothing: noopFn,
    setSelectedCamera: noopFn,
    lipSyncMode: "rms",
    setLipSyncMode: noopFn,
    recordingFormat: "webm",
    setRecordingFormat: noopFn,
    colliderEffects: true,
    setColliderEffects: noopFn,
    mappedCount: 0,
    setMappedCount: noopFn,
    platformFaceMappedCount: 0,
    setPlatformFaceMappedCount: noopFn,
    handMappedCount: 0,
    setHandMappedCount: noopFn,
    poseMappedCount: 0,
    setPoseMappedCount: noopFn,
    showHud: false,
    setShowHud: noopFn,
    hudStats: { fps: 0, meshes: 0, vertices: 0 },
    setHudStats: noopFn,
    panelOpen: false,
    setPanelOpen: noopFn,
    currentVowel: "silent",
    setCurrentVowel: noopFn,
    recordingState: "idle",
    setRecordingState: noopFn,
    recordingElapsed: 0,
    setRecordingElapsed: noopFn,
    gamepadActive: false,
    setGamepadActive: noopFn,
    midiActive: false,
    setMidiActive: noopFn,
    showHudRef: ref(false),
    initialSettings: {
      bgMode: "transparent",
      smoothing: 0.6,
      cameraDeviceId: "",
      alwaysOnTop: false,
      lipSyncMode: "rms",
      recordingFormat: "webm",
      colliderEffects: true,
    },
    ...overrides,
  } as unknown as UseViewerStateResult;
}

function createMockModel(): ViviModel {
  return {
    setParameters: vi.fn(),
    setParameter: vi.fn(),
    update: vi.fn(),
  } as unknown as ViviModel;
}

function renderUseTrackingOrchestrator(
  stateOverrides: Partial<UseViewerStateResult> = {},
  model: ViviModel | null = createMockModel(),
) {
  const state = createMockState(stateOverrides);
  return renderHook(() => {
    const t = (key: string) => `t:${key}`;
    const applyParameters = (values: Record<string, number>) => {
      model?.setParameters(values);
    };
    return { ...useTrackingOrchestrator({ applyParameters, state, t }), state };
  });
}

describe("useTrackingOrchestrator", () => {
  beforeEach(() => {
    trackerInit.mockReset().mockResolvedValue(undefined);
    trackerStart.mockReset();
    trackerStop.mockReset();
    trackerDestroy.mockReset();
    lastFaceCallback = null;
    lastHandCallback = null;
    lastPoseCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("face tracking", () => {
    it("starts a face tracker from the inactive state", async () => {
      const { result } = renderUseTrackingOrchestrator();
      await act(async () => {
        await result.current.toggleTracking();
      });

      expect(trackerInit).toHaveBeenCalledWith({ deviceId: undefined });
      expect(trackerStart).toHaveBeenCalled();
      expect(result.current.state.setTracking).toHaveBeenCalledWith(true);
    });

    it("passes the selected camera device id", async () => {
      const { result } = renderUseTrackingOrchestrator({
        selectedCamera: "cam-123",
      });
      await act(async () => {
        await result.current.toggleTracking();
      });

      expect(trackerInit).toHaveBeenCalledWith({ deviceId: "cam-123" });
    });

    it("stops tracking from the active state", async () => {
      const { result } = renderUseTrackingOrchestrator({ tracking: true });
      await act(async () => {
        await result.current.toggleTracking();
      });

      expect(result.current.state.setTracking).toHaveBeenCalledWith(false);
    });

    it("reports tracker initialization errors", async () => {
      trackerInit.mockRejectedValueOnce(new Error("camera denied"));
      const { result } = renderUseTrackingOrchestrator();
      await act(async () => {
        await result.current.toggleTracking();
      });

      expect(result.current.state.setError).toHaveBeenCalledWith("camera denied");
      expect(result.current.state.setTracking).not.toHaveBeenCalledWith(true);
    });

    it("uses the translated fallback for non-Error initialization failures", async () => {
      trackerInit.mockRejectedValueOnce("not an Error");
      const { result } = renderUseTrackingOrchestrator();
      await act(async () => {
        await result.current.toggleTracking();
      });

      expect(result.current.state.setError).toHaveBeenCalledWith("t:errCameraInit");
    });

    it("emits parameter patches through the supplied controller callback", async () => {
      const model = createMockModel();
      const { result } = renderUseTrackingOrchestrator({}, model);
      await act(async () => {
        await result.current.toggleTracking();
      });

      expect(lastFaceCallback).not.toBeNull();
      lastFaceCallback?.([], undefined);
      expect(model.setParameters).toHaveBeenCalledWith({ ParamFace: 0.5 });
    });

    it("emits platform face parameters before legacy face parameters", async () => {
      const model = createMockModel();
      const { result } = renderUseTrackingOrchestrator(
        { platformFaceMapRef: { current: { eyeBlinkLeft: "p1" } } },
        model,
      );
      await act(async () => {
        await result.current.toggleTracking();
      });

      lastFaceCallback?.([], { eyeBlinkLeft: 0.4 });

      expect(model.setParameters).toHaveBeenNthCalledWith(1, {
        ParamPlatformFace: 0.3,
      });
      expect(model.setParameters).toHaveBeenNthCalledWith(2, { ParamFace: 0.5 });
    });

    it("does not throw when no model callback target exists", async () => {
      const { result } = renderUseTrackingOrchestrator({}, null);
      await act(async () => {
        await result.current.toggleTracking();
      });

      expect(() => lastFaceCallback?.([], undefined)).not.toThrow();
    });
  });

  describe("hand tracking", () => {
    it("starts and stops hand tracking", async () => {
      const { result } = renderUseTrackingOrchestrator();
      await act(async () => {
        await result.current.toggleHandTracking();
      });
      expect(trackerInit).toHaveBeenCalled();
      expect(result.current.state.setHandTracking).toHaveBeenCalledWith(true);

      const active = renderUseTrackingOrchestrator({ handTracking: true });
      await act(async () => {
        await active.result.current.toggleHandTracking();
      });
      expect(active.result.current.state.setHandTracking).toHaveBeenCalledWith(false);
    });

    it("reports hand tracker initialization errors", async () => {
      trackerInit.mockRejectedValueOnce("err");
      const { result } = renderUseTrackingOrchestrator();
      await act(async () => {
        await result.current.toggleHandTracking();
      });

      expect(result.current.state.setError).toHaveBeenCalledWith("t:errHandInit");
    });

    it("emits hand parameter patches", async () => {
      const model = createMockModel();
      const { result } = renderUseTrackingOrchestrator({}, model);
      await act(async () => {
        await result.current.toggleHandTracking();
      });

      lastHandCallback?.([]);
      expect(model.setParameters).toHaveBeenCalledWith({ ParamHand: 1 });
    });
  });

  describe("pose tracking", () => {
    it("starts and stops pose tracking", async () => {
      const { result } = renderUseTrackingOrchestrator();
      await act(async () => {
        await result.current.togglePoseTracking();
      });
      expect(trackerInit).toHaveBeenCalled();
      expect(result.current.state.setPoseTracking).toHaveBeenCalledWith(true);

      const active = renderUseTrackingOrchestrator({ poseTracking: true });
      await act(async () => {
        await active.result.current.togglePoseTracking();
      });
      expect(active.result.current.state.setPoseTracking).toHaveBeenCalledWith(false);
    });

    it("reports pose tracker initialization errors", async () => {
      trackerInit.mockRejectedValueOnce("err");
      const { result } = renderUseTrackingOrchestrator();
      await act(async () => {
        await result.current.togglePoseTracking();
      });

      expect(result.current.state.setError).toHaveBeenCalledWith("t:errPoseInit");
    });

    it("emits pose parameter patches", async () => {
      const model = createMockModel();
      const { result } = renderUseTrackingOrchestrator({}, model);
      await act(async () => {
        await result.current.togglePoseTracking();
      });

      lastPoseCallback?.([]);
      expect(model.setParameters).toHaveBeenCalledWith({ ParamPose: 0.7 });
    });
  });

  describe("cleanup and smoothing", () => {
    it("destroys started trackers on unmount", async () => {
      const { result, unmount } = renderUseTrackingOrchestrator();
      await act(async () => {
        await result.current.toggleTracking();
        await result.current.toggleHandTracking();
        await result.current.togglePoseTracking();
      });
      trackerDestroy.mockClear();

      unmount();

      expect(trackerDestroy).toHaveBeenCalledTimes(3);
    });

    it("does not stop unstarted trackers on unmount", () => {
      const { unmount } = renderUseTrackingOrchestrator();

      unmount();

      expect(trackerDestroy).not.toHaveBeenCalled();
    });

    it("blends with the previous face result on subsequent callbacks", async () => {
      const model = createMockModel();
      const { result } = renderUseTrackingOrchestrator({}, model);
      await act(async () => {
        await result.current.toggleTracking();
      });

      lastFaceCallback?.([]);
      lastFaceCallback?.([]);

      expect(model.setParameters).toHaveBeenCalledTimes(2);
    });
  });
});
