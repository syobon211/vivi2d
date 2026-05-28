import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { TranslationKey } from "../i18n";
import { GamepadController } from "../tracking/gamepad-controller";
import { MidiController } from "../tracking/midi-controller";
import { DEFAULT_TRACKING_MAP } from "../tracking/face-mapper";
import type { UseViewerStateResult } from "./useViewerState";

export interface UseInputDevicesParams {
  applyParameters: (values: Record<string, number>) => void;
  state: Pick<
    UseViewerStateResult,
    | "gamepadActive"
    | "setGamepadActive"
    | "midiActive"
    | "setMidiActive"
    | "setError"
    | "trackingMapRef"
  >;
  t: (key: TranslationKey) => string;
}

export interface UseInputDevicesResult {
  gamepadRef: RefObject<GamepadController | null>;
  midiRef: RefObject<MidiController | null>;
  toggleGamepad: () => void;
  toggleMidi: () => Promise<void>;
}

export function useInputDevices({
  applyParameters,
  state,
  t,
}: UseInputDevicesParams): UseInputDevicesResult {
  const gamepadRef = useRef<GamepadController | null>(null);
  const midiRef = useRef<MidiController | null>(null);

  const toggleGamepad = useCallback(() => {
    if (state.gamepadActive) {
      gamepadRef.current?.stop();
      state.setGamepadActive(false);
      return;
    }

    try {
      const gp = new GamepadController();
      gp.setMappings([
        {
          type: "axis",
          index: 0,
          parameterId:
            state.trackingMapRef.current.headRotationY ??
            DEFAULT_TRACKING_MAP.headRotationY!,
          scale: 0.5,
        },
        {
          type: "axis",
          index: 1,
          parameterId:
            state.trackingMapRef.current.headRotationX ??
            DEFAULT_TRACKING_MAP.headRotationX!,
          scale: 0.3,
        },
        {
          type: "axis",
          index: 2,
          parameterId:
            state.trackingMapRef.current.mouthWidth ?? DEFAULT_TRACKING_MAP.mouthWidth!,
        },
        {
          type: "axis",
          index: 3,
          parameterId:
            state.trackingMapRef.current.mouthOpen ?? DEFAULT_TRACKING_MAP.mouthOpen!,
        },
        {
          type: "button",
          index: 6,
          parameterId:
            state.trackingMapRef.current.eyeOpenLeft ??
            DEFAULT_TRACKING_MAP.eyeOpenLeft!,
        },
        {
          type: "button",
          index: 7,
          parameterId:
            state.trackingMapRef.current.eyeOpenRight ??
            DEFAULT_TRACKING_MAP.eyeOpenRight!,
        },
      ]);

      gp.start((values) => applyParameters(values));

      gamepadRef.current = gp;
      state.setGamepadActive(true);
    } catch (_e) {
      state.setError(t("errGamepadInit"));
    }
  }, [applyParameters, state, t]);

  const toggleMidi = useCallback(async () => {
    if (state.midiActive) {
      midiRef.current?.stop();
      state.setMidiActive(false);
      return;
    }

    try {
      if (!MidiController.isSupported()) {
        state.setError(t("errMidiNotSupported"));
        return;
      }
      state.setError(null);
      const midi = new MidiController();
      await midi.init();

      midi.setMappings([
        {
          cc: 1,
          parameterId:
            state.trackingMapRef.current.headRotationY ??
            DEFAULT_TRACKING_MAP.headRotationY!,
          min: -1,
          max: 1,
        },
        {
          cc: 2,
          parameterId:
            state.trackingMapRef.current.headRotationX ??
            DEFAULT_TRACKING_MAP.headRotationX!,
          min: -1,
          max: 1,
        },
        {
          cc: 3,
          parameterId:
            state.trackingMapRef.current.mouthOpen ?? DEFAULT_TRACKING_MAP.mouthOpen!,
        },
        {
          cc: 4,
          parameterId:
            state.trackingMapRef.current.mouthWidth ?? DEFAULT_TRACKING_MAP.mouthWidth!,
        },
        {
          cc: 7,
          parameterId:
            state.trackingMapRef.current.eyeOpenLeft ??
            DEFAULT_TRACKING_MAP.eyeOpenLeft!,
        },
        {
          cc: 11,
          parameterId:
            state.trackingMapRef.current.eyeOpenRight ??
            DEFAULT_TRACKING_MAP.eyeOpenRight!,
        },
      ]);

      midi.start((values) => applyParameters(values));

      midiRef.current = midi;
      state.setMidiActive(true);
    } catch (e) {
      state.setError(e instanceof Error ? e.message : t("errMidiInit"));
    }
  }, [applyParameters, state, t]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      gamepadRef.current?.stop();
      midiRef.current?.stop();
    };
  }, []);

  return {
    gamepadRef,
    midiRef,
    toggleGamepad,
    toggleMidi,
  };
}
