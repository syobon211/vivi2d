import { GRAPH_EDITOR } from "@vivi2d/core/constants";
import { memo, useCallback, useRef } from "react";

interface GraphKeyframeProps {
  parameterId: string;

  frame: number;

  cx: number;

  cy: number;

  handleOutX: number | null;

  handleOutY: number | null;

  handleInX: number | null;

  handleInY: number | null;

  selected: boolean;

  onDragKeyframe: (dy: number) => void;

  onDragHandleOut: ((dx: number, dy: number) => void) | null;

  onDragHandleIn: ((dx: number, dy: number) => void) | null;

  onDragEnd: () => void;

  onClick: () => void;

  onRequestEditValue?: (clientX: number, clientY: number) => void;

  ariaLabel?: string;
}

export const GraphKeyframe = memo(function GraphKeyframe({
  parameterId,
  frame,
  cx,
  cy,
  handleOutX,
  handleOutY,
  handleInX,
  handleInY,
  selected,
  onDragKeyframe,
  onDragHandleOut,
  onDragHandleIn,
  onDragEnd,
  onClick,
  onRequestEditValue,
  ariaLabel,
}: GraphKeyframeProps) {
  const dragTarget = useRef<"kf" | "out" | "in" | null>(null);
  const lastPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback(
    (target: "kf" | "out" | "in") => (e: React.PointerEvent) => {
      e.stopPropagation();
      dragTarget.current = target;
      lastPos.current = { x: e.clientX, y: e.clientY };
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      if (target === "kf") onClick();
    },
    [onClick],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragTarget.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };

      switch (dragTarget.current) {
        case "kf":
          onDragKeyframe(dy);
          break;
        case "out":
          onDragHandleOut?.(dx, dy);
          break;
        case "in":
          onDragHandleIn?.(dx, dy);
          break;
      }
    },
    [onDragKeyframe, onDragHandleOut, onDragHandleIn],
  );

  const handlePointerUp = useCallback(() => {
    if (dragTarget.current) {
      dragTarget.current = null;
      onDragEnd();
    }
  }, [onDragEnd]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onRequestEditValue) return;
      e.preventDefault();
      e.stopPropagation();
      onClick();
      onRequestEditValue(e.clientX, e.clientY);
    },
    [onRequestEditValue, onClick],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!onRequestEditValue) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      onClick();
      const rect = (e.target as SVGElement).getBoundingClientRect();
      onRequestEditValue(rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [onRequestEditValue, onClick],
  );

  const R = GRAPH_EDITOR.KEYFRAME_RADIUS;
  const HR = GRAPH_EDITOR.HANDLE_RADIUS;

  return (
    <g onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      {}
      {handleOutX !== null && handleOutY !== null && (
        <>
          <line
            x1={cx}
            y1={cy}
            x2={handleOutX}
            y2={handleOutY}
            stroke={GRAPH_EDITOR.HANDLE_COLOR}
            strokeWidth={GRAPH_EDITOR.HANDLE_LINE_WIDTH}
          />
          <circle
            cx={handleOutX}
            cy={handleOutY}
            r={HR}
            fill={GRAPH_EDITOR.HANDLE_COLOR}
            className="graph-handle"
            onPointerDown={handlePointerDown("out")}
          />
        </>
      )}

      {}
      {handleInX !== null && handleInY !== null && (
        <>
          <line
            x1={cx}
            y1={cy}
            x2={handleInX}
            y2={handleInY}
            stroke={GRAPH_EDITOR.HANDLE_COLOR}
            strokeWidth={GRAPH_EDITOR.HANDLE_LINE_WIDTH}
          />
          <circle
            cx={handleInX}
            cy={handleInY}
            r={HR}
            fill={GRAPH_EDITOR.HANDLE_COLOR}
            className="graph-handle"
            onPointerDown={handlePointerDown("in")}
          />
        </>
      )}

      {}
      {}
      {/* biome-ignore lint/a11y/useSemanticElements: SVG keyframes cannot be represented by an HTML button without leaving the graph coordinate space. */}
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill={selected ? GRAPH_EDITOR.CURVE_COLOR : GRAPH_EDITOR.KEYFRAME_COLOR}
        stroke={GRAPH_EDITOR.CURVE_COLOR}
        strokeWidth={selected ? 2 : 1}
        className="graph-keyframe-dot"
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-keyshortcuts="Enter Space"
        data-kf-id={`${parameterId}-${frame}`}
        onPointerDown={handlePointerDown("kf")}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      />
    </g>
  );
});
