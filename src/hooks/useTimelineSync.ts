import { mergeParameterDefaults } from "@vivi2d/core/parameter-utils";
import { evaluateClipAtFrame } from "@vivi2d/core/timeline-utils";
import type { AnimationClip } from "@vivi2d/core/types";
import { useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";

export function syncParametersAtFrame(
  clip: AnimationClip | null | undefined,
  frame: number,
): void {
  if (!clip) return;

  const project = useEditorStore.getState().project;
  const values = evaluateClipAtFrame(clip, frame);
  const merged = mergeParameterDefaults(project?.parameters ?? [], values);
  useParameterStore.getState().setAllValues(merged);
}

export function useTimelineSync() {
  const sync = useCallback(
    (clip: AnimationClip | null | undefined, frame: number) =>
      syncParametersAtFrame(clip, frame),
    [],
  );

  return { syncParametersAtFrame: sync };
}
