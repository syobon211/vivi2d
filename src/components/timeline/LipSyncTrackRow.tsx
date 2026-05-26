import type { AudioTrack, LipSyncTrack } from "@vivi2d/core/types";
import { memo, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { getAudioTrackFrameRange } from "@/lib/timeline-audio";
import { useTimelineStore } from "@/stores/timelineStore";

export const LipSyncTrackRow = memo(function LipSyncTrackRow({
  track,
  sourceTrack,
  clipId,
  duration,
  fps,
}: {
  track: LipSyncTrack;
  sourceTrack: AudioTrack | null;
  clipId: string;
  duration: number;
  fps: number;
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

  const range = sourceTrack
    ? getAudioTrackFrameRange(sourceTrack, fps, Math.max(fps, 1))
    : null;
  const left = range == null ? 0 : (range.startFrame / Math.max(1, duration - 1)) * 100;
  const width =
    range == null
      ? 0
      : ((Math.min(duration, range.endFrameExclusive) - range.startFrame) /
          Math.max(1, duration - 1)) *
        100;
  const isActive =
    range != null &&
    currentFrame >= range.startFrame &&
    currentFrame < range.endFrameExclusive;

  return (
    <div className="tl-track-row" data-clip-id={clipId}>
      <button
        type="button"
        className="tl-track-content"
        onClick={handleTrackClick}
        aria-label={t("timeline.lipSyncTrackAria").replace("{name}", track.name)}
      >
        {range ? (
          <span
            className={`tl-lipsync-block ${isActive ? "active" : ""}`}
            style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
            title={track.name}
          />
        ) : (
          <span
            className="tl-lipsync-block missing"
            title={t("timeline.lipSyncMissingSourceTitle").replace(
              "{name}",
              track.name,
            )}
          />
        )}
      </button>
      <div className="tl-track-actions" />
    </div>
  );
});
