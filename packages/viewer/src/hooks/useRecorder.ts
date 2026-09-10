import { type RefObject, useCallback, useEffect, useRef } from "react";
import { RECORDING_MAX_DURATION } from "../constants";
import type { TranslationKey } from "../i18n";
import {
  downloadBlob,
  getRecordingExtension,
  type RecordingFormat,
  type ViewerRecorder,
} from "../recorder";
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

interface OwnedRecording {
  recorder: ViewerRecorder;
  format: RecordingFormat;
  modelName: string;
  finishing: boolean;
  generation: number;
}

export function useRecorder({
  recorderRef,
  state,
  t,
}: UseRecorderParams): UseRecorderResult {
  const mountedRef = useRef(true);
  const activeRef = useRef<OwnedRecording | null>(null);
  const generationRef = useRef(0);
  const toggleRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || !mountedRef.current) return;
    const obsolete = activeRef.current;
    if (obsolete && obsolete.recorder !== rec) {
      activeRef.current = null;
      generationRef.current++;
      obsolete.recorder.cancel();
    }

    const isLatest = (recording: OwnedRecording) =>
      mountedRef.current &&
      generationRef.current === recording.generation &&
      recorderRef.current === recording.recorder;
    const isCurrent = (recording: OwnedRecording) =>
      isLatest(recording) && activeRef.current === recording;
    const fail = (recording: OwnedRecording, error?: unknown) => {
      if (!isCurrent(recording)) return;
      activeRef.current = null;
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        state.setError(t("errRecording"));
      }
      state.setRecordingState("idle");
      state.setRecordingElapsed(0);
    };
    const complete = (recording: OwnedRecording, blob: Blob) => {
      if (!isCurrent(recording)) return;
      if (blob.size === 0) {
        fail(recording);
        return;
      }
      // Claim delivery once before any download operation can reenter the hook.
      activeRef.current = null;
      try {
        const ext = getRecordingExtension(recording.format);
        downloadBlob(blob, `${recording.modelName || "vivi"}-${Date.now()}.${ext}`);
      } catch {
        if (isLatest(recording)) state.setError(t("errRecording"));
      }
      if (isLatest(recording)) {
        state.setRecordingState("idle");
        state.setRecordingElapsed(0);
      }
    };

    const current = activeRef.current;
    if (current) {
      if (current.finishing || current.recorder !== rec) return;
      current.finishing = true;
      try {
        const blob = await rec.stop();
        complete(current, blob);
      } catch (error) {
        fail(current, error);
      }
      return;
    }

    const recording: OwnedRecording = {
      recorder: rec,
      format: state.recordingFormat,
      modelName: state.modelName,
      finishing: false,
      generation: ++generationRef.current,
    };
    activeRef.current = recording;
    try {
      recording.format = rec.start(
        { format: state.recordingFormat, maxDuration: RECORDING_MAX_DURATION },
        (s, elapsed) => {
          if (!isCurrent(recording)) return;
          if (s === "processing") recording.finishing = true;
          state.setRecordingState(s);
          state.setRecordingElapsed(elapsed);
        },
        (blob) => complete(recording, blob),
        (error) => fail(recording, error),
      );
    } catch (error) {
      fail(recording, error);
    }
  }, [recorderRef, state, t]);

  // unmount cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      activeRef.current = null;
      recorderRef.current?.cancel();
    };
  }, [recorderRef]);

  return {
    toggleRecording,
  };
}
