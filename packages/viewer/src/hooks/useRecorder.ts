import { type RefObject, useCallback, useEffect } from "react";
import { RECORDING_MAX_DURATION } from "../constants";
import type { TranslationKey } from "../i18n";
import { downloadBlob, getRecordingExtension, type ViewerRecorder } from "../recorder";
import type { UseViewerStateResult } from "./useViewerState";

export interface UseRecorderParams {
  recorderRef: RefObject<ViewerRecorder | null>;
  state: Pick<
    UseViewerStateResult,
    | "recordingState"
    | "setRecordingState"
    | "setRecordingElapsed"
    | "recordingFormat"
    | "modelName"
    | "setError"
  >;
  t: (key: TranslationKey) => string;
}

export interface UseRecorderResult {
  toggleRecording: () => Promise<void>;
}

export function useRecorder({
  recorderRef,
  state,
  t,
}: UseRecorderParams): UseRecorderResult {
  const toggleRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;

    if (state.recordingState === "recording") {
      try {
        const blob = await rec.stop();
        const ext = getRecordingExtension(state.recordingFormat);
        const filename = `${state.modelName || "vivi"}-${Date.now()}.${ext}`;
        downloadBlob(blob, filename);
        state.setRecordingState("idle");
        state.setRecordingElapsed(0);
      } catch (_e) {
        state.setError(t("errRecording"));
        state.setRecordingState("idle");
      }
      return;
    }

    try {
      rec.start(
        { format: state.recordingFormat, maxDuration: RECORDING_MAX_DURATION },
        (s, elapsed) => {
          state.setRecordingState(s);
          state.setRecordingElapsed(elapsed);
        },
      );
      state.setRecordingState("recording");
    } catch (_e) {
      state.setError(t("errRecording"));
    }
  }, [recorderRef, state, t]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
    };
  }, [recorderRef]);

  return {
    toggleRecording,
  };
}
