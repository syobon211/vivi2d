import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecorder } from "../hooks/useRecorder";
import type { UseViewerStateResult } from "../hooks/useViewerState";
import type { RecordingFormat, ViewerRecorder } from "../recorder";

const downloadBlobMock = vi.fn();
const getExtMock = vi.fn();

vi.mock("../recorder", async () => {
  const actual = await vi.importActual<typeof import("../recorder")>("../recorder");
  return {
    ...actual,
    downloadBlob: (...args: unknown[]) => downloadBlobMock(...args),
    getRecordingExtension: (fmt: RecordingFormat) => {
      getExtMock(fmt);
      return actual.getRecordingExtension(fmt);
    },
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
    start: vi.fn((options, onStateChange) => {
      onStateChange?.("recording", 0);
      return options.format;
    }),
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
  const initiallyRecording = state.recordingState === "recording";
  if (initiallyRecording) state.recordingState = "idle";
  const recorderRef = {
    current: (recorder as unknown as ViewerRecorder) ?? null,
  };
  const hook = renderHook(() => {
    const t = (k: string) => `t:${k}`;
    return { ...useRecorder({ recorderRef, state, t }), state };
  });
  if (initiallyRecording) {
    // Establish a real hook-owned session instead of merely faking its UI state.
    act(() => {
      void hook.result.current.toggleRecording();
    });
    state.recordingState = "recording";
    hook.rerender();
  }
  return { ...hook, recorderRef };
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
        expect.any(Function),
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

    it.each([
      "manual",
      "automatic",
    ])("uses the actual WebM fallback for requested MP4 on %s completion", async (completion) => {
      const rec = makeRecorder();
      rec.start.mockImplementationOnce((_options, onStateChange) => {
        onStateChange?.("recording", 0);
        return "webm";
      });
      const { result } = renderUseRecorder(rec, {
        recordingState: "recording",
        recordingFormat: "mp4",
      });
      expect(rec.start.mock.calls[0]![0].format).toBe("mp4");
      if (completion === "manual") {
        await act(async () => {
          await result.current.toggleRecording();
        });
      } else {
        const complete = rec.start.mock.calls[0]![2] as (blob: Blob) => void;
        act(() => complete(new Blob(["fallback"], { type: "video/webm" })));
      }
      expect(getExtMock).toHaveBeenCalledExactlyOnceWith("webm");
      expect(downloadBlobMock).toHaveBeenCalledExactlyOnceWith(
        expect.any(Blob),
        expect.stringMatching(/^ViviModel-\d+\.webm$/),
      );
      expect(result.current.state.setError).not.toHaveBeenCalled();
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

  describe("recording completion ownership", () => {
    it("uses the same completion path for automatic stop exactly once", async () => {
      const rec = makeRecorder();
      const { result } = renderUseRecorder(rec);
      await act(async () => {
        await result.current.toggleRecording();
      });
      const complete = rec.start.mock.calls[0]![2] as (blob: Blob) => void;
      act(() => {
        complete(new Blob(["recorded"]));
        complete(new Blob(["duplicate"]));
      });
      expect(downloadBlobMock).toHaveBeenCalledOnce();
      expect(result.current.state.setError).not.toHaveBeenCalled();
    });

    it("does not save an empty completion", async () => {
      const rec = makeRecorder();
      const { result } = renderUseRecorder(rec);
      await act(async () => {
        await result.current.toggleRecording();
      });
      const complete = rec.start.mock.calls[0]![2] as (blob: Blob) => void;
      act(() => complete(new Blob()));
      expect(downloadBlobMock).not.toHaveBeenCalled();
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errRecording");
    });

    it("ignores all late callbacks after unmount", async () => {
      const rec = makeRecorder();
      const { result, unmount } = renderUseRecorder(rec);
      await act(async () => {
        await result.current.toggleRecording();
      });
      const [, stateChanged, completed, failed] = rec.start.mock.calls[0]!;
      const state = result.current.state;
      vi.mocked(state.setRecordingState).mockClear();
      unmount();
      (stateChanged as (s: string, n: number) => void)("idle", 0);
      (completed as (b: Blob) => void)(new Blob(["obsolete"]));
      (failed as (e: Error) => void)(new Error("synthetic detail"));
      expect(downloadBlobMock).not.toHaveBeenCalled();
      expect(state.setRecordingState).not.toHaveBeenCalled();
      expect(state.setError).not.toHaveBeenCalled();
    });

    it("does not download a pending manual stop after unmount", async () => {
      const rec = makeRecorder();
      let resolve!: (blob: Blob) => void;
      rec.stop.mockReturnValue(
        new Promise<Blob>((done) => {
          resolve = done;
        }),
      );
      const { result, unmount } = renderUseRecorder(rec, { recordingState: "recording" });
      const stopped = result.current.toggleRecording();
      unmount();
      resolve(new Blob(["obsolete"]));
      await stopped;
      expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it("clears external cancellation and ignores old completion after restart", async () => {
      const rec = makeRecorder();
      const { result } = renderUseRecorder(rec);
      await act(async () => {
        await result.current.toggleRecording();
      });
      const completed = rec.start.mock.calls[0]![2] as (b: Blob) => void;
      const failed = rec.start.mock.calls[0]![3] as (e: Error) => void;
      act(() => failed(new DOMException("Recording cancelled.", "AbortError")));
      await act(async () => {
        await result.current.toggleRecording();
      });
      completed(new Blob(["obsolete"]));
      expect(rec.start).toHaveBeenCalledTimes(2);
      expect(downloadBlobMock).not.toHaveBeenCalled();
      expect(result.current.state.setError).not.toHaveBeenCalled();
    });

    it("releases a replaced recorder and starts the new one", async () => {
      const old = makeRecorder();
      const next = makeRecorder();
      const { result, recorderRef } = renderUseRecorder(old);
      await act(async () => {
        await result.current.toggleRecording();
      });
      recorderRef.current = next as unknown as ViewerRecorder;
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(old.cancel).toHaveBeenCalledOnce();
      expect(next.start).toHaveBeenCalledOnce();
    });

    it("does not stop twice when manual and automatic completion overlap", async () => {
      const rec = makeRecorder();
      let resolve!: (blob: Blob) => void;
      rec.stop.mockReturnValue(
        new Promise<Blob>((done) => {
          resolve = done;
        }),
      );
      const { result } = renderUseRecorder(rec, { recordingState: "recording" });
      const first = result.current.toggleRecording();
      await result.current.toggleRecording();
      const complete = rec.start.mock.calls[0]![2] as (b: Blob) => void;
      complete(new Blob(["automatic"]));
      resolve(new Blob(["manual"]));
      await first;
      expect(rec.stop).toHaveBeenCalledOnce();
      expect(downloadBlobMock).toHaveBeenCalledOnce();
    });
  });
});
