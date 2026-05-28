import type { AnimationClip, ParameterDefinition } from "@vivi2d/core/types";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GRAPH_PAD, useGraphCoordinates } from "@/hooks/useGraphCoordinates";
import { useT } from "@/lib/i18n";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { GraphCurve } from "./GraphCurve";
import { GraphGrid } from "./GraphGrid";
import { GraphKeyframe } from "./GraphKeyframe";

const EMPTY_PARAMS: readonly ParameterDefinition[] = [];

interface GraphEditorProps {
  clip: AnimationClip;
}

export const GraphEditor = memo(function GraphEditor({ clip }: GraphEditorProps) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const project = useEditorStore((s) => s.project);
  const selectedTrackId = useTimelineStore((s) => s.selectedGraphTrackId);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const parameters = project?.parameters ?? EMPTY_PARAMS;

  const selectedParam = useMemo(
    () => parameters.find((p) => p.id === selectedTrackId),
    [parameters, selectedTrackId],
  );

  const visibleTracks = useMemo(() => {
    if (selectedTrackId) {
      const t = clip.tracks.find((tr) => tr.parameterId === selectedTrackId);
      return t ? [t] : [];
    }
    return clip.tracks;
  }, [clip.tracks, selectedTrackId]);

  const valueRange = useMemo(() => {
    if (selectedParam) {
      return { min: selectedParam.minValue, max: selectedParam.maxValue };
    }
    let min = 0;
    let max = 1;
    for (const track of visibleTracks) {
      const param = parameters.find((p) => p.id === track.parameterId);
      if (param) {
        min = Math.min(min, param.minValue);
        max = Math.max(max, param.maxValue);
      }
    }
    return { min, max };
  }, [selectedParam, visibleTracks, parameters]);

  const { getSize, frameToX, valueToY, yToValue } = useGraphCoordinates(
    containerRef,
    clip.duration,
    valueRange,
  );

  const playheadX = frameToX(currentFrame);
  const size = getSize();

  const makeKeyframeDragHandler = useCallback(
    (parameterId: string, frame: number) => ({
      onDragKeyframe: (dy: number) => {
        const track = clip.tracks.find((t) => t.parameterId === parameterId);
        const kf = track?.keyframes.find((k) => k.frame === frame);
        if (!kf) return;
        const newY = valueToY(kf.value) + dy;
        const newValue = Math.max(
          valueRange.min,
          Math.min(valueRange.max, yToValue(newY)),
        );
        useClipStore.getState().updateKeyframe(
          clip.id,
          parameterId,
          frame,
          {
            value: newValue,
          },
          `keyframe:${clip.id}:${parameterId}:${frame}:value`,
        );
      },
      onDragHandleOut: (track: (typeof clip.tracks)[number] | undefined) => {
        const kf = track?.keyframes.find((k) => k.frame === frame);
        if (!kf || kf.interpolation !== "bezier") return null;
        const nextKf = track?.keyframes.find((k) => k.frame > frame);
        if (!nextKf) return null;
        return (dx: number, dy: number) => {
          const segW = frameToX(nextKf.frame) - frameToX(kf.frame);
          const segH = valueToY(nextKf.value) - valueToY(kf.value);
          if (segW === 0) return;
          const cp1x = Math.max(0, Math.min(1, (kf.cp1x ?? 0.25) + dx / segW));
          const cp1y = Math.max(0, Math.min(1, (kf.cp1y ?? 0) + dy / segH));
          useClipStore.getState().updateKeyframe(
            clip.id,
            parameterId,
            frame,
            {
              cp1x,
              cp1y,
            },
            `keyframe:${clip.id}:${parameterId}:${frame}:cp1`,
          );
        };
      },
      onDragHandleIn: (track: (typeof clip.tracks)[number] | undefined) => {
        const kf = track?.keyframes.find((k) => k.frame === frame);
        if (!kf || kf.interpolation !== "bezier") return null;
        const prevKf = [...(track?.keyframes ?? [])]
          .reverse()
          .find((k) => k.frame < frame);
        if (!prevKf) return null;
  return null; // The incoming handle maps to the previous keyframe's cp2.
      },
    }),
    [clip, frameToX, valueToY, yToValue, valueRange],
  );

  const selectedKfRef = useRef<{
    parameterId: string;
    frame: number;
  } | null>(null);

  const [editing, setEditing] = useState<{
    parameterId: string;
    frame: number;
    currentValue: number;
    popupX: number;
    popupY: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const lastEditedKfRef = useRef<{ parameterId: string; frame: number } | null>(null);

  const restoreFocus = useCallback(() => {
    const target = lastEditedKfRef.current;
    if (!target) return;
    requestAnimationFrame(() => {
      const sel = `[data-kf-id="${target.parameterId}-${target.frame}"]`;
      const el = containerRef.current?.querySelector<SVGElement>(sel);
      el?.focus();
    });
  }, []);

  const handleRequestEdit = useCallback(
    (parameterId: string, frame: number, currentValue: number) =>
      (clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const popupX = rect ? clientX - rect.left : clientX;
        const popupY = rect ? clientY - rect.top : clientY;
        lastEditedKfRef.current = { parameterId, frame };
        setEditing({ parameterId, frame, currentValue, popupX, popupY });
        setEditValue(String(currentValue));
      },
    [],
  );

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setEditValue("");
    restoreFocus();
  }, [restoreFocus]);

  const submitEdit = useCallback(() => {
    if (!editing) return;
    const parsed = Number.parseFloat(editValue);
    if (!Number.isFinite(parsed)) {
      cancelEdit();
      return;
    }
    const clamped = Math.max(valueRange.min, Math.min(valueRange.max, parsed));
    useClipStore.getState().updateKeyframe(clip.id, editing.parameterId, editing.frame, {
      value: clamped,
    });
    cancelEdit();
  }, [editing, editValue, valueRange, clip.id, cancelEdit]);

  useEffect(() => {
    if (!editing) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelEdit();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [editing, cancelEdit]);

  return (
    <div ref={containerRef} className="graph-editor-container">
      <svg ref={svgRef} width="100%" height="100%" className="graph-editor-svg">
        <title>{t("timeline.graphEditorTitle")}</title>
        {/* Grid */}
        <GraphGrid
          duration={clip.duration}
          fps={clip.fps}
          valueRange={valueRange}
          frameToX={frameToX}
          valueToY={valueToY}
          getSize={getSize}
        />

        {/* Playhead */}
        <line
          x1={playheadX}
          y1={GRAPH_PAD.top}
          x2={playheadX}
          y2={size.h - GRAPH_PAD.bottom}
          stroke="var(--accent)"
          strokeWidth={1}
          opacity={0.6}
        />

        {/* Curves */}
        {visibleTracks.map((track) => (
          <GraphCurve
            key={track.parameterId}
            track={track}
            frameToX={frameToX}
            valueToY={valueToY}
            selected={!selectedTrackId || track.parameterId === selectedTrackId}
          />
        ))}

        {/* Keyframes */}
        {visibleTracks.map((track) =>
          track.keyframes.map((kf, i) => {
            const cx = frameToX(kf.frame);
            const cy = valueToY(kf.value);
            const isSelected =
              selectedKfRef.current?.parameterId === track.parameterId &&
              selectedKfRef.current?.frame === kf.frame;

            let handleOutX: number | null = null;
            let handleOutY: number | null = null;
            if (kf.interpolation === "bezier") {
              const nextKf = track.keyframes[i + 1];
              if (nextKf) {
                const segW = frameToX(nextKf.frame) - cx;
                const segH = valueToY(nextKf.value) - cy;
                handleOutX = cx + (kf.cp1x ?? 0.25) * segW;
                handleOutY = cy + (kf.cp1y ?? 0) * segH;
              }
            }

            let handleInX: number | null = null;
            let handleInY: number | null = null;
            if (i > 0) {
              const prevKf = track.keyframes[i - 1]!;
              if (prevKf.interpolation === "bezier") {
                const segW = cx - frameToX(prevKf.frame);
                const segH = cy - valueToY(prevKf.value);
                handleInX = frameToX(prevKf.frame) + (prevKf.cp2x ?? 0.75) * segW;
                handleInY = valueToY(prevKf.value) + (prevKf.cp2y ?? 1) * segH;
              }
            }

            const handlers = makeKeyframeDragHandler(track.parameterId, kf.frame);
            const trackRef = track;

            return (
              <GraphKeyframe
                key={`${track.parameterId}-${kf.frame}`}
                parameterId={track.parameterId}
                frame={kf.frame}
                cx={cx}
                cy={cy}
                handleOutX={handleOutX}
                handleOutY={handleOutY}
                handleInX={handleInX}
                handleInY={handleInY}
                selected={isSelected}
                onDragKeyframe={handlers.onDragKeyframe}
                onDragHandleOut={handlers.onDragHandleOut(trackRef)}
                onDragHandleIn={
                  i > 0
                    ? (() => {
                        const prevKf = track.keyframes[i - 1]!;
                        if (prevKf.interpolation !== "bezier") return null;
                        return (dx: number, dy: number) => {
                          const segW = frameToX(kf.frame) - frameToX(prevKf.frame);
                          const segH = valueToY(kf.value) - valueToY(prevKf.value);
                          if (segW === 0) return;
                          const cp2x = Math.max(
                            0,
                            Math.min(1, (prevKf.cp2x ?? 0.75) + dx / segW),
                          );
                          const cp2y = Math.max(
                            0,
                            Math.min(1, (prevKf.cp2y ?? 1) + dy / segH),
                          );
                          useClipStore.getState().updateKeyframe(
                            clip.id,
                            track.parameterId,
                            prevKf.frame,
                            {
                              cp2x,
                              cp2y,
                            },
                            `keyframe:${clip.id}:${track.parameterId}:${prevKf.frame}:cp2`,
                          );
                        };
                      })()
                    : null
                }
                onDragEnd={() => {}}
                onClick={() => {
                  selectedKfRef.current = {
                    parameterId: track.parameterId,
                    frame: kf.frame,
                  };
                }}
                onRequestEditValue={handleRequestEdit(
                  track.parameterId,
                  kf.frame,
                  kf.value,
                )}
                ariaLabel={t("timeline.keyframeLabel")
                  .replace("{frame}", String(kf.frame))
                  .replace("{value}", kf.value.toFixed(3))}
              />
            );
          }),
        )}
      </svg>

      {editing && (
        <div
          className="graph-keyframe-edit-popup"
          style={{ left: editing.popupX, top: editing.popupY }}
          role="dialog"
          aria-label={t("timeline.keyframeEditDialogTitle")}
        >
          <label>
            {t("timeline.keyframeEditValueLabel")}
            <input
              ref={editInputRef}
              type="number"
              step="0.01"
              min={valueRange.min}
              max={valueRange.max}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitEdit();
                }
              }}
            />
          </label>
          <div className="graph-keyframe-edit-popup-actions">
            <button type="button" onClick={cancelEdit}>
              {t("common.cancel")}
            </button>
            <button type="button" onClick={submitEdit}>
              {t("common.ok")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
