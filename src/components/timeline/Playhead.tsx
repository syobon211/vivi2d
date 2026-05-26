import { useCallback, useRef } from "react";
import { useTimelineSync } from "@/hooks/useTimelineSync";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";

export function Playhead({
  frame,
  duration,
  clipId,
}: {
  frame: number;
  duration: number;
  clipId: string;
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = duration > 1 ? (frame / (duration - 1)) * 100 : 0;
  const { syncParametersAtFrame } = useTimelineSync();

  const seekToFrame = useCallback(
    (f: number) => {
      const clamped = Math.max(0, Math.min(duration - 1, f));
      useTimelineStore.getState().seekTo(clamped);
      const proj = useEditorStore.getState().project;
      const clip = proj?.clips.find((c) => c.id === clipId);
      syncParametersAtFrame(clip, clamped);
    },
    [clipId, duration, syncParametersAtFrame],
  );

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const container = containerRef.current?.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      seekToFrame(Math.round((x / rect.width) * (duration - 1)));
    },
    [duration, seekToFrame],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      seekFromEvent(e.clientX);
    },
    [seekFromEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      seekFromEvent(e.clientX);
    },
    [seekFromEvent],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let delta = 0;
      switch (e.key) {
        case "ArrowLeft":
          delta = -1;
          break;
        case "ArrowRight":
          delta = 1;
          break;
        case "Home":
          e.preventDefault();
          seekToFrame(0);
          return;
        case "End":
          e.preventDefault();
          seekToFrame(duration - 1);
          return;
        default:
          return;
      }
      e.preventDefault();
      seekToFrame(frame + delta * (e.shiftKey ? 10 : 1));
    },
    [duration, frame, seekToFrame],
  );

  return (
    <div
      ref={containerRef}
      className="tl-playhead"
      style={{ left: `${pct}%` }}
      role="slider"
      tabIndex={0}
      aria-label={t("timeline.playheadLabel")}
      aria-description={t("timeline.playheadDescription")}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, duration - 1)}
      aria-valuenow={frame}
      aria-valuetext={`${frame} / ${Math.max(0, duration - 1)}`}
      aria-orientation="horizontal"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <div className="tl-playhead-head" />
      <div className="tl-playhead-line" />
    </div>
  );
}
