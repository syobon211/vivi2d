import { findClipInProject } from "@vivi2d/core/scene-utils";
import type { AnimationTrack } from "@vivi2d/core/types";
import { memo, useCallback } from "react";
import { useTimelineSync } from "@/hooks/useTimelineSync";
import { useT } from "@/lib/i18n";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useTimelineStore } from "@/stores/timelineStore";

export const TrackRow = memo(function TrackRow({
  track,
  clipId,
  duration,
}: {
  track: AnimationTrack;
  clipId: string;
  duration: number;
}) {
  const t = useT();
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const project = useEditorStore((s) => s.project);
  const param = project?.parameters.find((p) => p.id === track.parameterId);
  const { syncParametersAtFrame } = useTimelineSync();

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = Math.round((x / rect.width) * (duration - 1));
      useTimelineStore.getState().seekTo(frame);

      const proj = useEditorStore.getState().project;
      const clip = proj ? findClipInProject(proj, clipId) : undefined;
      syncParametersAtFrame(clip, frame);
    },
    [clipId, duration, syncParametersAtFrame],
  );

  const handleAddKeyframe = useCallback(() => {
    if (!param) return;
    const value =
      useParameterStore.getState().parameterValues[track.parameterId] ??
      param.defaultValue;
    useClipStore.getState().addKeyframe(clipId, track.parameterId, currentFrame, value);
  }, [clipId, track.parameterId, currentFrame, param]);

  const handleRemoveKeyframe = useCallback(() => {
    useClipStore.getState().removeKeyframe(clipId, track.parameterId, currentFrame);
  }, [clipId, track.parameterId, currentFrame]);

  const hasKeyframeAtCurrent = track.keyframes.some((kf) => kf.frame === currentFrame);

  return (
    <div className="tl-track-row">
      {}
      {}
      <button
        type="button"
        className="tl-track-content"
        onClick={handleTrackClick}
        aria-label={t("timeline.trackAria").replace(
          "{name}",
          param?.name ?? track.parameterId,
        )}
      >
        {track.keyframes.map((kf) => (
          <span
            key={kf.frame}
            className={`tl-keyframe ${kf.frame === currentFrame ? "active" : ""}`}
            style={{ left: `${(kf.frame / (duration - 1)) * 100}%` }}
            title={`F${kf.frame}: ${kf.value.toFixed(2)} (${kf.interpolation})`}
          />
        ))}
      </button>
      <div className="tl-track-actions">
        <button
          type="button"
          className="tl-kf-btn"
          onClick={handleAddKeyframe}
          title={t("timeline.addKeyframeTitle")}
        >
          ◆+
        </button>
        {hasKeyframeAtCurrent && (
          <button
            type="button"
            className="tl-kf-btn tl-btn-danger"
            onClick={handleRemoveKeyframe}
            title={t("timeline.deleteKeyframeTitle")}
          >
            ◆-
          </button>
        )}
      </div>
    </div>
  );
});
