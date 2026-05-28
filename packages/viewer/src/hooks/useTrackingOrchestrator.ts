import { type RefObject, useCallback, useEffect, useRef } from "react";
import {
  createTrackingSignalFrame,
  type ProcessTrackingSignalOptions,
} from "../calibration/calibration-engine";
import type {
  TrackingSignalFrame,
  TrackingSignalSource,
} from "../calibration/calibration-types";
import type { TranslationKey } from "../i18n";
import { faceChannelsToParams } from "../tracking/platform-face-channels";
import {
  type FaceTrackingResult,
  mapLandmarksToParams,
  trackingResultToParams,
} from "../tracking/face-mapper";
import { FaceTracker } from "../tracking/face-tracker";
import {
  type HandTrackingResult,
  handTrackingResultToParams,
  mapHandDetectionsToParams,
} from "../tracking/hand-mapper";
import { HandTracker } from "../tracking/hand-tracker";
import {
  mapPoseLandmarksToParams,
  type PoseTrackingResult,
  poseTrackingResultToParams,
} from "../tracking/pose-mapper";
import { PoseTracker } from "../tracking/pose-tracker";
import type { UseViewerStateResult } from "./useViewerState";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface UseTrackingOrchestratorParams {
  applyParameters: (values: Record<string, number>) => void;
  calibrationProcessorRef?: RefObject<TrackingCalibrationProcessor>;
  state: Pick<
    UseViewerStateResult,
    | "tracking"
    | "setTracking"
    | "handTracking"
    | "setHandTracking"
    | "poseTracking"
    | "setPoseTracking"
    | "selectedCamera"
    | "setError"
    | "trackingMapRef"
    | "platformFaceMapRef"
    | "handTrackingMapRef"
    | "poseTrackingMapRef"
    | "smoothingRef"
  >;
  t: (key: TranslationKey) => string;
}

export interface TrackingCalibrationProcessor {
  processFrame(
    frame: TrackingSignalFrame,
    options?: ProcessTrackingSignalOptions,
  ): TrackingSignalFrame;
}

export interface UseTrackingOrchestratorResult {
  trackerRef: RefObject<FaceTracker | null>;
  handTrackerRef: RefObject<HandTracker | null>;
  poseTrackerRef: RefObject<PoseTracker | null>;
  toggleTracking: () => Promise<void>;
  toggleHandTracking: () => Promise<void>;
  togglePoseTracking: () => Promise<void>;
}

export function useTrackingOrchestrator({
  applyParameters,
  calibrationProcessorRef,
  state,
  t,
}: UseTrackingOrchestratorParams): UseTrackingOrchestratorResult {
  const trackerRef = useRef<FaceTracker | null>(null);
  const handTrackerRef = useRef<HandTracker | null>(null);
  const poseTrackerRef = useRef<PoseTracker | null>(null);

  const prevTrackingRef = useRef<FaceTrackingResult | null>(null);
  const prevHandTrackingRef = useRef<HandTrackingResult | null>(null);
  const prevPoseTrackingRef = useRef<PoseTrackingResult | null>(null);
  const prevPlatformFaceRef = useRef<Record<string, number> | null>(null);

  function processResult<T extends object>(
    source: TrackingSignalSource,
    result: T,
    smoothing: number,
  ): T {
    const processor = calibrationProcessorRef?.current;
    if (!processor) return result;
    return processor.processFrame(
      createTrackingSignalFrame(source, result as Record<string, number>),
      { fallbackSmoothing: smoothing },
    ).channels as unknown as T;
  }

  function smoothResult<T extends object>(
    result: T,
    previous: T | null,
    smoothing: number,
  ): T {
    if (!previous) return result;
    const smoothed: Record<string, number> = {};
    for (const [key, value] of Object.entries(result as Record<string, number>)) {
      smoothed[key] = lerp(
        value,
        (previous as Record<string, number>)[key] ?? value,
        smoothing,
      );
    }
    return smoothed as T;
  }

  // ----- Face -----
  const toggleTracking = useCallback(async () => {
    if (state.tracking) {
      trackerRef.current?.stop();
      state.setTracking(false);
      return;
    }
    try {
      state.setError(null);
      const tracker = new FaceTracker();
      await tracker.init({ deviceId: state.selectedCamera || undefined });
      trackerRef.current = tracker;

      tracker.start((landmarks, faceChannels) => {
        const result = mapLandmarksToParams(landmarks);
        const s = state.smoothingRef.current;
        const prev = prevTrackingRef.current;
        const smoothed = calibrationProcessorRef?.current
          ? processResult("face", result, s)
          : smoothResult(result, prev, s);
        prevTrackingRef.current = smoothed;

        if (faceChannels && Object.keys(state.platformFaceMapRef.current).length > 0) {
          const previousPlatformFace = prevPlatformFaceRef.current;
          const smoothedBS = calibrationProcessorRef?.current
            ? processResult("platformFace", faceChannels, s)
            : smoothResult(faceChannels, previousPlatformFace, s);
          prevPlatformFaceRef.current = smoothedBS;
          const platformFaceParams = faceChannelsToParams(
            smoothedBS,
            state.platformFaceMapRef.current,
          );
          applyParameters(platformFaceParams);
        }

        const params = trackingResultToParams(smoothed, state.trackingMapRef.current);
        applyParameters(params);
      });

      state.setTracking(true);
    } catch (e) {
      state.setError(e instanceof Error ? e.message : t("errCameraInit"));
    }
  }, [applyParameters, calibrationProcessorRef, state, t]);

  // ----- Hand -----
  const toggleHandTracking = useCallback(async () => {
    if (state.handTracking) {
      handTrackerRef.current?.stop();
      state.setHandTracking(false);
      return;
    }
    try {
      state.setError(null);
      const tracker = new HandTracker();
      await tracker.init({ deviceId: state.selectedCamera || undefined });
      handTrackerRef.current = tracker;

      tracker.start((hands) => {
        const result = mapHandDetectionsToParams(hands);
        const s = state.smoothingRef.current;
        const prev = prevHandTrackingRef.current;
        const smoothed = calibrationProcessorRef?.current
          ? processResult("hand", result, s)
          : smoothResult(result, prev, s);
        prevHandTrackingRef.current = smoothed;

        const params = handTrackingResultToParams(
          smoothed,
          state.handTrackingMapRef.current,
        );
        applyParameters(params);
      });

      state.setHandTracking(true);
    } catch (e) {
      state.setError(e instanceof Error ? e.message : t("errHandInit"));
    }
  }, [applyParameters, calibrationProcessorRef, state, t]);

  // ----- Pose -----
  const togglePoseTracking = useCallback(async () => {
    if (state.poseTracking) {
      poseTrackerRef.current?.stop();
      state.setPoseTracking(false);
      return;
    }
    try {
      state.setError(null);
      const tracker = new PoseTracker();
      await tracker.init({ deviceId: state.selectedCamera || undefined });
      poseTrackerRef.current = tracker;

      tracker.start((landmarks) => {
        const result = mapPoseLandmarksToParams(landmarks);
        const s = state.smoothingRef.current;
        const prev = prevPoseTrackingRef.current;
        const smoothed = calibrationProcessorRef?.current
          ? processResult("pose", result, s)
          : smoothResult(result, prev, s);
        prevPoseTrackingRef.current = smoothed;

        const params = poseTrackingResultToParams(
          smoothed,
          state.poseTrackingMapRef.current,
        );
        applyParameters(params);
      });

      state.setPoseTracking(true);
    } catch (e) {
      state.setError(e instanceof Error ? e.message : t("errPoseInit"));
    }
  }, [applyParameters, calibrationProcessorRef, state, t]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      trackerRef.current?.destroy();
      handTrackerRef.current?.destroy();
      poseTrackerRef.current?.destroy();
    };
  }, []);

  return {
    trackerRef,
    handTrackerRef,
    poseTrackerRef,
    toggleTracking,
    toggleHandTracking,
    togglePoseTracking,
  };
}
