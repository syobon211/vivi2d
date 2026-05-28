import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecorder } from "../hooks/useRecorder";
import type { UseViewerStateResult } from "../hooks/useViewerState";
import type { ViewerRecorder } from "../recorder";


const downloadBlobMock = vi.fn();
const getExtMock = vi.fn((fmt: string) => (fmt === "mp4" ? "mp4" : "webm"));

vi.mock("../recorder", async () => {
  const actual = await vi.importActual<typeof import("../recorder")>("../recorder");
  return {
    ...actual,
    downloadBlob: (...args: unknown[]) => downloadBlobMock(...args),
    getRecordingExtension: (fmt: string) => getExtMock(fmt),
  };
});

vi.mock("../constants", async () => {
  const actual = await vi.importActual<typeof import("../constants")>("../constants");
  return {
    ...actual,
    RECORDING_MAX_DURATION: 60,
  };
});

interface FakeRecorder {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

function makeRecorder(): FakeRecorder {
  return {
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(new Blob(["x"])),
    cancel: vi.fn(),
  };
}

function createMockState(
  overrides: Partial<UseViewerStateResult> = {},
): UseViewerStateResult {
  const noopFn = () => {};
  return {
    recordingState: "idle",
    setRecordingState: vi.fn(),
    recordingElapsed: 0,
    setRecordingElapsed: vi.fn(),
    recordingFormat: "webm",
    setRecordingFormat: noopFn,
    modelName: "ViviModel",
    setModelName: noopFn,
    setError: vi.fn(),
    loaded: false,
    error: null,
    setLoaded: noopFn,
    dragging: false,
    setDragging: noopFn,
    tracking: false,
    setTracking: noopFn,
    handTracking: false,
    setHandTracking: noopFn,
    poseTracking: false,
    setPoseTracking: noopFn,
    bgMode: "transparent",
    setBgMode: noopFn,
    alwaysOnTop: false,
    setAlwaysOnTop: noopFn,
    smoothing: 0.6,
    setSmoothing: noopFn,
    selectedCamera: "",
    setSelectedCamera: noopFn,
    lipSync: false,
    setLipSync: noopFn,
    lipSyncMode: "rms",
    setLipSyncMode: noopFn,
    colliderEffects: true,
    setColliderEffects: noopFn,
    trackingMapRef: { current: {} },
    platformFaceMapRef: { current: {} },
    handTrackingMapRef: { current: {} },
    poseTrackingMapRef: { current: {} },
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
    gamepadActive: false,
    setGamepadActive: noopFn,
    midiActive: false,
    setMidiActive: noopFn,
    smoothingRef: { current: 0.6 },
    showHudRef: { current: false },
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

function renderUseRecorder(
  recorder: FakeRecorder | null,
  stateOverrides: Partial<UseViewerStateResult> = {},
) {
  const state = createMockState(stateOverrides);
  const recorderRef = {
    current: (recorder as unknown as ViewerRecorder) ?? null,
  };
  return {
    ...renderHook(() => {
      const t = (k: string) => `t:${k}`;
      return { ...useRecorder({ recorderRef, state, t }), state };
    }),
    recorderRef,
  };
}

describe("useRecorder", () => {
  beforeEach(() => {
    downloadBlobMock.mockReset();
    getExtMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("toggleRecording: recorderRef なし", () => {
    it("recorderRef.current が null なら no-op", async () => {
      const { result } = renderUseRecorder(null);
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(result.current.state.setRecordingState).not.toHaveBeenCalled();
    });
  });

  describe("toggleRecording: idle → recording (start)", () => {
    it("start + setRecordingState('recording')", async () => {
      const rec = makeRecorder();
      const { result } = renderUseRecorder(rec);
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(rec.start).toHaveBeenCalledWith(
        { format: "webm", maxDuration: 60 },
        expect.any(Function),
      );
      expect(result.current.state.setRecordingState).toHaveBeenCalledWith("recording");
    });

    it("start callback で setRecordingState / setRecordingElapsed", async () => {
      const rec = makeRecorder();
      const { result } = renderUseRecorder(rec);
      await act(async () => {
        await result.current.toggleRecording();
      });
      const cb = rec.start.mock.calls[0]?.[1] as (s: string, e: number) => void;
      cb("processing", 1500);
      expect(result.current.state.setRecordingState).toHaveBeenCalledWith("processing");
      expect(result.current.state.setRecordingElapsed).toHaveBeenCalledWith(1500);
    });

    it("start throw で setError(errRecording)", async () => {
      const rec = makeRecorder();
      rec.start.mockImplementationOnce(() => {
        throw new Error("rec failed");
      });
      const { result } = renderUseRecorder(rec);
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errRecording");
    });
  });

  describe("toggleRecording: recording → idle (stop)", () => {
    it("stop + downloadBlob + setRecordingState('idle') + setRecordingElapsed(0)", async () => {
      const rec = makeRecorder();
      const { result } = renderUseRecorder(rec, { recordingState: "recording" });
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(rec.stop).toHaveBeenCalled();
      expect(downloadBlobMock).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^ViviModel-\d+\.webm$/),
      );
      expect(result.current.state.setRecordingState).toHaveBeenCalledWith("idle");
      expect(result.current.state.setRecordingElapsed).toHaveBeenCalledWith(0);
    });

    it("modelName が空なら 'vivi' プレフィックス", async () => {
      const rec = makeRecorder();
      const { result } = renderUseRecorder(rec, {
        recordingState: "recording",
        modelName: "",
      });
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(downloadBlobMock).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^vivi-\d+\.webm$/),
      );
    });

    it("recordingFormat=mp4 なら拡張子 mp4", async () => {
      const rec = makeRecorder();
      const { result } = renderUseRecorder(rec, {
        recordingState: "recording",
        recordingFormat: "mp4",
      });
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(downloadBlobMock).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/\.mp4$/),
      );
    });

    it("stop reject で setError + setRecordingState('idle')", async () => {
      const rec = makeRecorder();
      rec.stop.mockRejectedValueOnce(new Error("stop failed"));
      const { result } = renderUseRecorder(rec, { recordingState: "recording" });
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errRecording");
      expect(result.current.state.setRecordingState).toHaveBeenCalledWith("idle");
      expect(downloadBlobMock).not.toHaveBeenCalled();
    });
  });

  describe("unmount cleanup", () => {
    it("recorderRef.current?.cancel() が呼ばれる", () => {
      const rec = makeRecorder();
      const { unmount } = renderUseRecorder(rec);
      unmount();
      expect(rec.cancel).toHaveBeenCalled();
    });

    it("recorderRef が null でも throw しない", () => {
      const { unmount } = renderUseRecorder(null);
      expect(() => unmount()).not.toThrow();
    });
  });
});
