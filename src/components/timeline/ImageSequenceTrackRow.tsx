import type { ImageSequenceTrack } from "@vivi2d/core/types";
import { memo, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useClipStore } from "@/stores/clipStore";
import { useTimelineStore } from "@/stores/timelineStore";

export const ImageSequenceTrackRow = memo(function ImageSequenceTrackRow({
  track,
  clipId,
  duration,
}: {
  track: ImageSequenceTrack;
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

  const handleAddEntry = useCallback(() => {
    useClipStore
      .getState()
      .addImageSequenceEntry(
        clipId,
        track.targetMeshId,
        currentFrame,
        track.targetMeshId,
      );
  }, [clipId, track.targetMeshId, currentFrame]);

  const handleRemoveEntry = useCallback(() => {
    useClipStore
      .getState()
      .removeImageSequenceEntry(clipId, track.targetMeshId, currentFrame);
  }, [clipId, track.targetMeshId, currentFrame]);

  const hasEntryAtCurrent = track.entries.some((e) => e.startFrame === currentFrame);

  return (
    <div className="tl-track-row">
      {}
      {}
      <button
        type="button"
        className="tl-track-content"
        onClick={handleTrackClick}
        aria-label={t("timeline.imageSequenceTrackAria").replace(
          "{targetMeshId}",
          track.targetMeshId,
        )}
      >
        {track.entries.map((entry, i) => {
          const nextEntry = track.entries[i + 1];
          const nextStart = nextEntry ? nextEntry.startFrame : duration;
          const left = (entry.startFrame / (duration - 1)) * 100;
          const width = ((nextStart - entry.startFrame) / (duration - 1)) * 100;
          const isActive = currentFrame >= entry.startFrame && currentFrame < nextStart;

          return (
            <span
              key={entry.startFrame}
              className={`tl-imgseq-block ${isActive ? "active" : ""}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`F${entry.startFrame}-${nextStart - 1}: ${entry.imageId}`}
            />
          );
        })}
      </button>
      <div className="tl-track-actions">
        <button
          type="button"
          className="tl-kf-btn"
          onClick={handleAddEntry}
          title={t("timeline.addEntryTitle")}
        >
          ▮+
        </button>
        {hasEntryAtCurrent && (
          <button
            type="button"
            className="tl-kf-btn tl-btn-danger"
            onClick={handleRemoveEntry}
            title={t("timeline.deleteEntryTitle")}
          >
            ▮-
          </button>
        )}
      </div>
    </div>
  );
});
