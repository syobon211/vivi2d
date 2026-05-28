import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLipSync } from "../hooks/useLipSync";
import type { UseViewerStateResult } from "../hooks/useViewerState";


const analyserInit = vi.fn();
const analyserStop = vi.fn();
let analyserCallback:
  | ((volume: number, vowel: "silent" | "a" | "i" | "u" | "e" | "o" | null) => void)
  | null = null;

vi.mock("../tracking/lipsync-analyser", () => ({
  LipSyncAnalyser: class {
    init = analyserInit;
    stop = analyserStop;
    start(
      cb: (volume: number, vowel: "silent" | "a" | "i" | "u" | "e" | "o" | null) => void,
    ) {
      analyserCallback = cb;
    }
  },
}));

function createMockState(
  overrides: Partial<UseViewerStateResult> = {},
): UseViewerStateResult {
  const noopFn = () => {};
  return {
    lipSync: false,
    setLipSync: vi.fn(),
    lipSyncMode: "rms",
    setError: vi.fn(),
    setCurrentVowel: vi.fn(),
    loaded: false,
    error: null,
    setLoaded: noopFn,
    modelName: "",
    setModelName: noopFn,
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
    setLipSyncMode: noopFn,
    recordingFormat: "webm",
    setRecordingFormat: noopFn,
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
    recordingState: "idle",
    setRecordingState: noopFn,
    recordingElapsed: 0,
    setRecordingElapsed: noopFn,
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

function renderUseLipSync(stateOverrides: Partial<UseViewerStateResult> = {}) {
  const state = createMockState(stateOverrides);
  return renderHook(() => {
    const t = (k: string) => `t:${k}`;
    return { ...useLipSync({ state, t }), state };
  });
}

describe("useLipSync", () => {
  beforeEach(() => {
    analyserInit.mockReset().mockResolvedValue(undefined);
    analyserStop.mockReset();
    analyserCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("初期値", () => {
    it("音量 ref は 0", () => {
      const { result } = renderUseLipSync();
      expect(result.current.lipSyncVolumeRef.current).toBe(0);
    });

    it("母音 ref は silent", () => {
      const { result } = renderUseLipSync();
      expect(result.current.lipSyncVowelRef.current).toBe("silent");
    });
  });

  describe("toggleLipSync: OFF → ON", () => {
    it("init + start が呼ばれ setLipSync(true)", async () => {
      const { result } = renderUseLipSync();
      await act(async () => {
        await result.current.toggleLipSync();
      });
      expect(analyserInit).toHaveBeenCalledWith("rms");
      expect(analyserCallback).not.toBeNull();
      expect(result.current.state.setLipSync).toHaveBeenCalledWith(true);
    });

    it("lipSyncMode が viseme の場合は init('viseme')", async () => {
      const { result } = renderUseLipSync({ lipSyncMode: "viseme" });
      await act(async () => {
        await result.current.toggleLipSync();
      });
      expect(analyserInit).toHaveBeenCalledWith("viseme");
    });

    it("init throw で setError(message)", async () => {
      analyserInit.mockRejectedValueOnce(new Error("mic denied"));
      const { result } = renderUseLipSync();
      await act(async () => {
        await result.current.toggleLipSync();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("mic denied");
      expect(result.current.state.setLipSync).not.toHaveBeenCalledWith(true);
    });

    it("非 Error 例外は t('errMicInit') にフォールバック", async () => {
      analyserInit.mockRejectedValueOnce("not error");
      const { result } = renderUseLipSync();
      await act(async () => {
        await result.current.toggleLipSync();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errMicInit");
    });
  });

  describe("toggleLipSync: ON → OFF", () => {
    it("既起動なら stop + 音量/母音を初期化 + setLipSync(false)", async () => {
      const { result, rerender: _r } = renderUseLipSync();
      await act(async () => {
        await result.current.toggleLipSync();
      });
      analyserCallback?.(0.7, "a");
      expect(result.current.lipSyncVolumeRef.current).toBe(0.7);
      expect(result.current.lipSyncVowelRef.current).toBe("a");

      const stop2 = renderUseLipSync({ lipSync: true });
      await act(async () => {
        await stop2.result.current.toggleLipSync();
      });
      expect(stop2.result.current.state.setLipSync).toHaveBeenCalledWith(false);
      expect(stop2.result.current.state.setCurrentVowel).toHaveBeenCalledWith("silent");
    });
  });

  describe("analyser callback", () => {
    it("volume 更新が ref に反映", async () => {
      const { result } = renderUseLipSync();
      await act(async () => {
        await result.current.toggleLipSync();
      });
      analyserCallback?.(0.5, null);
      expect(result.current.lipSyncVolumeRef.current).toBe(0.5);
    });

    it("vowel が null でなければ ref 更新", async () => {
      const { result } = renderUseLipSync();
      await act(async () => {
        await result.current.toggleLipSync();
      });
      analyserCallback?.(0.3, "i");
      expect(result.current.lipSyncVowelRef.current).toBe("i");
    });

    it("vowel が null なら ref は維持", async () => {
      const { result } = renderUseLipSync();
      await act(async () => {
        await result.current.toggleLipSync();
      });
      analyserCallback?.(0.2, "u");
      analyserCallback?.(0.4, null);
      expect(result.current.lipSyncVowelRef.current).toBe("u");
    });
  });

  describe("unmount cleanup", () => {
    it("起動済 analyser は unmount で stop が呼ばれる", async () => {
      const { result, unmount } = renderUseLipSync();
      await act(async () => {
        await result.current.toggleLipSync();
      });
      analyserStop.mockClear();
      unmount();
      expect(analyserStop).toHaveBeenCalled();
    });

    it("未起動なら unmount で stop は呼ばれない", () => {
      const { unmount } = renderUseLipSync();
      unmount();
      expect(analyserStop).not.toHaveBeenCalled();
    });
  });
});
