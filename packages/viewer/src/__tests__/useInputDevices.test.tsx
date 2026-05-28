import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInputDevices } from "../hooks/useInputDevices";
import type { UseViewerStateResult } from "../hooks/useViewerState";


const gamepadStop = vi.fn();
const gamepadSetMappings = vi.fn();
let gamepadCallback: ((values: Record<string, number>) => void) | null = null;

vi.mock("../tracking/gamepad-controller", () => ({
  GamepadController: class {
    stop = gamepadStop;
    setMappings = gamepadSetMappings;
    start(cb: (values: Record<string, number>) => void) {
      gamepadCallback = cb;
    }
  },
}));

const midiInit = vi.fn();
const midiStop = vi.fn();
const midiSetMappings = vi.fn();
let midiCallback: ((values: Record<string, number>) => void) | null = null;
let midiSupported = true;

vi.mock("../tracking/midi-controller", () => ({
  MidiController: class {
    static isSupported() {
      return midiSupported;
    }
    init = midiInit;
    stop = midiStop;
    setMappings = midiSetMappings;
    start(cb: (values: Record<string, number>) => void) {
      midiCallback = cb;
    }
  },
}));

function createMockState(
  overrides: Partial<UseViewerStateResult> = {},
): UseViewerStateResult {
  const noopFn = () => {};
  return {
    gamepadActive: false,
    setGamepadActive: vi.fn(),
    midiActive: false,
    setMidiActive: vi.fn(),
    setError: vi.fn(),
    trackingMapRef: {
      current: {
        headRotationY: "ParamCustomAngleY",
        headRotationX: "ParamCustomAngleX",
      },
    },
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
    lipSync: false,
    setLipSync: noopFn,
    lipSyncMode: "rms",
    setLipSyncMode: noopFn,
    recordingFormat: "webm",
    setRecordingFormat: noopFn,
    colliderEffects: true,
    setColliderEffects: noopFn,
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
    recordingState: "idle",
    setRecordingState: noopFn,
    recordingElapsed: 0,
    setRecordingElapsed: noopFn,
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

function renderUseInputDevices(stateOverrides: Partial<UseViewerStateResult> = {}) {
  const state = createMockState(stateOverrides);
  const setParameters = vi.fn();
  return {
    ...renderHook(() => {
      const t = (k: string) => `t:${k}`;
      return {
        ...useInputDevices({ applyParameters: setParameters, state, t }),
        state,
      };
    }),
    setParameters,
  };
}

describe("useInputDevices", () => {
  beforeEach(() => {
    gamepadStop.mockReset();
    gamepadSetMappings.mockReset();
    gamepadCallback = null;
    midiInit.mockReset().mockResolvedValue(undefined);
    midiStop.mockReset();
    midiSetMappings.mockReset();
    midiCallback = null;
    midiSupported = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("初期値", () => {
    it("gamepadRef / midiRef は null", () => {
      const { result } = renderUseInputDevices();
      expect(result.current.gamepadRef.current).toBeNull();
      expect(result.current.midiRef.current).toBeNull();
    });
  });

  describe("toggleGamepad: OFF → ON", () => {
    it("setMappings + start + setGamepadActive(true)", () => {
      const { result } = renderUseInputDevices();
      act(() => {
        result.current.toggleGamepad();
      });
      expect(gamepadSetMappings).toHaveBeenCalled();
      expect(gamepadCallback).not.toBeNull();
      expect(result.current.state.setGamepadActive).toHaveBeenCalledWith(true);
    });

    it("trackingMapRef の paramId を尊重", () => {
      const { result } = renderUseInputDevices();
      act(() => {
        result.current.toggleGamepad();
      });
      const mappings = gamepadSetMappings.mock.calls[0]?.[0] as Array<{
        type: string;
        index: number;
        parameterId: string;
      }>;
      expect(mappings.find((m) => m.index === 0)?.parameterId).toBe("ParamCustomAngleY");
      expect(mappings.find((m) => m.index === 1)?.parameterId).toBe("ParamCustomAngleX");
    });

    it("trackingMapRef に無いキーは fallback", () => {
      const { result } = renderUseInputDevices();
      act(() => {
        result.current.toggleGamepad();
      });
      const mappings = gamepadSetMappings.mock.calls[0]?.[0] as Array<{
        type: string;
        index: number;
        parameterId: string;
      }>;
      expect(mappings.find((m) => m.index === 2)?.parameterId).toBe(
        "vivi.mouth.width",
      );
    });
  });

  describe("toggleGamepad: ON → OFF", () => {
    it("既起動なら stop + setGamepadActive(false)", () => {
      const { result } = renderUseInputDevices();
      act(() => {
        result.current.toggleGamepad();
      });
      gamepadStop.mockClear();
      const off = renderUseInputDevices({ gamepadActive: true });
      act(() => {
        off.result.current.gamepadRef.current = {
          stop: gamepadStop,
        } as unknown as InstanceType<
          typeof import("../tracking/gamepad-controller").GamepadController
        > | null;
        off.result.current.toggleGamepad();
      });
      expect(gamepadStop).toHaveBeenCalled();
      expect(off.result.current.state.setGamepadActive).toHaveBeenCalledWith(false);
    });
  });

  describe("toggleGamepad callback", () => {
    it("values を model.setParameters に渡す", () => {
      const { result, setParameters } = renderUseInputDevices();
      act(() => {
        result.current.toggleGamepad();
      });
      gamepadCallback?.({ ParamAngleY: 0.5 });
      expect(setParameters).toHaveBeenCalledWith({ ParamAngleY: 0.5 });
    });
  });

  describe("toggleMidi: OFF → ON", () => {
    it("init + setMappings + setMidiActive(true)", async () => {
      const { result } = renderUseInputDevices();
      await act(async () => {
        await result.current.toggleMidi();
      });
      expect(midiInit).toHaveBeenCalled();
      expect(midiSetMappings).toHaveBeenCalled();
      expect(result.current.state.setMidiActive).toHaveBeenCalledWith(true);
    });

    it("isSupported=false なら setError(errMidiNotSupported)", async () => {
      midiSupported = false;
      const { result } = renderUseInputDevices();
      await act(async () => {
        await result.current.toggleMidi();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errMidiNotSupported");
      expect(midiInit).not.toHaveBeenCalled();
      expect(result.current.state.setMidiActive).not.toHaveBeenCalledWith(true);
    });

    it("init throw で setError(message)", async () => {
      midiInit.mockRejectedValueOnce(new Error("midi denied"));
      const { result } = renderUseInputDevices();
      await act(async () => {
        await result.current.toggleMidi();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("midi denied");
    });

    it("非 Error 例外は t('errMidiInit') にフォールバック", async () => {
      midiInit.mockRejectedValueOnce("not error");
      const { result } = renderUseInputDevices();
      await act(async () => {
        await result.current.toggleMidi();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errMidiInit");
    });
  });

  describe("toggleMidi: ON → OFF", () => {
    it("既起動なら stop + setMidiActive(false)", async () => {
      const off = renderUseInputDevices({ midiActive: true });
      act(() => {
        off.result.current.midiRef.current = {
          stop: midiStop,
        } as unknown as InstanceType<
          typeof import("../tracking/midi-controller").MidiController
        > | null;
      });
      await act(async () => {
        await off.result.current.toggleMidi();
      });
      expect(midiStop).toHaveBeenCalled();
      expect(off.result.current.state.setMidiActive).toHaveBeenCalledWith(false);
    });
  });

  describe("toggleMidi callback", () => {
    it("values を model.setParameters に渡す", async () => {
      const { result, setParameters } = renderUseInputDevices();
      await act(async () => {
        await result.current.toggleMidi();
      });
      midiCallback?.({ ParamMouthOpenY: 0.7 });
      expect(setParameters).toHaveBeenCalledWith({ ParamMouthOpenY: 0.7 });
    });
  });

  describe("unmount cleanup", () => {
    it("起動済 gamepad / midi は unmount で stop", async () => {
      const { result, unmount } = renderUseInputDevices();
      act(() => {
        result.current.toggleGamepad();
      });
      await act(async () => {
        await result.current.toggleMidi();
      });
      gamepadStop.mockClear();
      midiStop.mockClear();
      unmount();
      expect(gamepadStop).toHaveBeenCalled();
      expect(midiStop).toHaveBeenCalled();
    });

    it("未起動なら stop は呼ばれない", () => {
      const { unmount } = renderUseInputDevices();
      unmount();
      expect(gamepadStop).not.toHaveBeenCalled();
      expect(midiStop).not.toHaveBeenCalled();
    });
  });
});
