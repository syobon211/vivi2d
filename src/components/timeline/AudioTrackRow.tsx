import type { AudioTrack } from "@vivi2d/core/types";
import { memo, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { getAudioTrackFrameRange } from "@/lib/timeline-audio";
import { useTimelineStore } from "@/stores/timelineStore";

export const AudioTrackRow = memo(function AudioTrackRow({
  track,
  clipId,
  duration,
  fps,
}: {
  track: AudioTrack;
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

  const range = getAudioTrackFrameRange(track, fps, Math.max(fps, 1));
  const left = (range.startFrame / Math.max(1, duration - 1)) * 100;
  const width =
    ((Math.min(duration, range.endFrameExclusive) - range.startFrame) /
      Math.max(1, duration - 1)) *
    100;
  const isActive =
    currentFrame >= range.startFrame && currentFrame < range.endFrameExclusive;

  return (
    <div className="tl-track-row" data-clip-id={clipId}>
      <button
        type="button"
        className="tl-track-content"
        onClick={handleTrackClick}
        aria-label={t("timeline.audioTrackAria").replace("{name}", track.name)}
      >
        <span
          className={`tl-audio-block ${isActive ? "active" : ""}`}
          style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
          title={track.name}
        />
      </button>
      <div className="tl-track-actions" />
    </div>
  );
});
