import type { ViviModel } from "@vivi2d/core/model";
import type { ParticleEffectRenderer, ViviPixiRenderer } from "@vivi2d/renderer-pixi";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from "react";
import {
  createTrackingSignalFrame,
  type ProcessTrackingSignalOptions,
} from "../calibration/calibration-engine";
import type { TrackingSignalFrame } from "../calibration/calibration-types";
import { UI_TIMING } from "../constants";
import type { TrackingParameterMap } from "../tracking/face-mapper";
import {
  type LipSyncMode,
  type Vowel,
  vowelToMouthParams,
} from "../tracking/lipsync-analyser";
import type { HudStats } from "./useViewerState";

export interface UseViewerLoopArgs {
  loaded: boolean;
  lipSync: boolean;
  lipSyncMode: LipSyncMode;
  setCurrentVowel: Dispatch<SetStateAction<Vowel>>;
  setHudStats: Dispatch<SetStateAction<HudStats>>;
  modelRef: RefObject<ViviModel | null>;
  rendererRef: RefObject<ViviPixiRenderer | null>;
  particlesRef: RefObject<ParticleEffectRenderer | null>;
  applyParameters: (values: Record<string, number>) => void;
  calibrationProcessorRef?: RefObject<TrackingCalibrationProcessor>;
  smoothingRef?: RefObject<number>;
  lipSyncVolumeRef: RefObject<number>;
  lipSyncVowelRef: RefObject<Vowel>;
  trackingMapRef: RefObject<TrackingParameterMap>;
  showHudRef: RefObject<boolean>;
}

export interface TrackingCalibrationProcessor {
  processFrame(
    frame: TrackingSignalFrame,
    options?: ProcessTrackingSignalOptions,
  ): TrackingSignalFrame;
}

export function useViewerLoop({
  loaded,
  lipSync,
  lipSyncMode,
  setCurrentVowel,
  setHudStats,
  modelRef,
  rendererRef,
  particlesRef,
  applyParameters,
  calibrationProcessorRef,
  smoothingRef,
  lipSyncVolumeRef,
  lipSyncVowelRef,
  trackingMapRef,
  showHudRef,
}: UseViewerLoopArgs): void {
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const fpsFramesRef = useRef<number[]>([]);
  const hudUpdateCounterRef = useRef<number>(0);

  useEffect(() => {
    if (!loaded) return;
    const loop = (time: number) => {
      const dt = lastTimeRef.current > 0 ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;
      const model = modelRef.current;
      const renderer = rendererRef.current;
      if (model && renderer) {
        const vol = lipSyncVolumeRef.current;
        if (vol > 0) {
          const vowel = lipSyncVowelRef.current;
          if (vowel !== "silent" && lipSyncMode === "viseme") {
            const mouth = vowelToMouthParams(vowel, vol);
            const calibrated = calibrationProcessorRef?.current?.processFrame(
              createTrackingSignalFrame("lipSync", {
                mouthOpen: mouth.mouthOpen,
                mouthWidth: mouth.mouthForm,
              }),
              { fallbackSmoothing: smoothingRef?.current ?? 0 },
            ).channels ?? {
              mouthOpen: mouth.mouthOpen,
              mouthWidth: mouth.mouthForm,
            };
            const mouthParamId = trackingMapRef.current.mouthOpen;
            const formParamId = trackingMapRef.current.mouthWidth;
            const params: Record<string, number> = {};
            if (mouthParamId) params[mouthParamId] = calibrated.mouthOpen ?? 0;
            if (formParamId) params[formParamId] = calibrated.mouthWidth ?? 0.5;
            applyParameters(params);
          } else {
            const calibrated = calibrationProcessorRef?.current?.processFrame(
              createTrackingSignalFrame("lipSync", { mouthOpen: vol }),
              { fallbackSmoothing: smoothingRef?.current ?? 0 },
            ).channels ?? { mouthOpen: vol };
            const mouthParamId = trackingMapRef.current.mouthOpen;
            if (mouthParamId) {
              applyParameters({ [mouthParamId]: calibrated.mouthOpen ?? 0 });
            }
          }
        }
        model.update(dt);
        particlesRef.current?.update(dt);
        renderer.render();

        if (lipSync && lipSyncMode === "viseme") {
          hudUpdateCounterRef.current++;
          if (hudUpdateCounterRef.current % 10 === 0) {
            setCurrentVowel(lipSyncVowelRef.current);
          }
        }

        if (showHudRef.current) {
          const frames = fpsFramesRef.current;
          frames.push(time);
          while (frames.length > 0 && frames[0]! < time - 1000) frames.shift();
          hudUpdateCounterRef.current++;
          if (hudUpdateCounterRef.current % UI_TIMING.HUD_UPDATE_INTERVAL === 0) {
            const states = model.getAllMeshStates();
            let totalVerts = 0;
            let visibleCount = 0;
            for (const [, s] of states) {
              if (s.visible && !s.culled) {
                visibleCount++;
                totalVerts += s.vertices.length / 2;
              }
            }
            setHudStats({
              fps: frames.length,
              meshes: visibleCount,
              vertices: totalVerts,
            });
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    loaded,
    lipSyncMode,
    lipSync,
    setCurrentVowel,
    setHudStats,
    modelRef,
    rendererRef,
    particlesRef,
    applyParameters,
    calibrationProcessorRef,
    smoothingRef,
    lipSyncVolumeRef,
    lipSyncVowelRef,
    trackingMapRef,
    showHudRef,
  ]);
}
