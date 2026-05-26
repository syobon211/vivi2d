import { findClipInProject } from "@vivi2d/core/scene-utils";
import type { BoneTrack } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";
import { memo, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";

export const BoneTrackRow = memo(function BoneTrackRow({
  track,
  clipId,
  duration,
}: {
  track: BoneTrack;
  clipId: string;
  duration: number;
}) {
  const t = useT();
  const currentFrame = useTimelineStore((s) => s.currentFrame);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = Math.round((x / rect.width) * (duration - 1));
      useTimelineStore.getState().seekTo(frame);
    },
    [duration],
  );

  const handleAddKeyframe = useCallback(() => {
    const proj = useEditorStore.getState().project;
    if (!proj) return;
    const clip = findClipInProject(proj, clipId);
    if (!clip) return;
    const layers = proj.layers;
    const findBone = (ls: typeof layers): number => {
      for (const l of ls) {
        if (l.id === track.boneId && isBone(l)) {
          return track.property === "angle"
            ? l.bone.angle
            : track.property === "scaleX"
              ? l.bone.scaleX
              : l.bone.scaleY;
        }
        const found = findBone(l.children);
        if (found !== -Infinity) return found;
      }
      return -Infinity;
    };
    const value = findBone(layers);
    if (value === -Infinity) return;
    useClipStore
      .getState()
      .addBoneKeyframe(clipId, track.boneId, track.property, currentFrame, value);
  }, [clipId, track.boneId, track.property, currentFrame]);

  const handleRemoveKeyframe = useCallback(() => {
    useClipStore
      .getState()
      .removeBoneKeyframe(clipId, track.boneId, track.property, currentFrame);
  }, [clipId, track.boneId, track.property, currentFrame]);

  const hasKeyframeAtCurrent = track.keyframes.some((kf) => kf.frame === currentFrame);

  return (
    <div className="tl-track-row">
      {}
      {}
      <button
        type="button"
        className="tl-track-content"
        onClick={handleTrackClick}
        aria-label={t("timeline.boneTrackAria")
          .replace("{boneId}", track.boneId)
          .replace("{property}", track.property)}
      >
        {track.keyframes.map((kf) => (
          <span
            key={kf.frame}
            className={`tl-keyframe tl-keyframe-bone ${kf.frame === currentFrame ? "active" : ""}`}
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
