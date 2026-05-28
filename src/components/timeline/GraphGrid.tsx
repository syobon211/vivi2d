import { GRAPH_EDITOR } from "@vivi2d/core/constants";
import { memo, useMemo } from "react";
import { GRAPH_PAD } from "@/hooks/useGraphCoordinates";

interface GraphGridProps {
  duration: number;
  fps: number;
  valueRange: { min: number; max: number };
  frameToX: (frame: number) => number;
  valueToY: (value: number) => number;
  getSize: () => { w: number; h: number };
}

export const GraphGrid = memo(function GraphGrid({
  duration,
  fps,
  valueRange,
  frameToX,
  valueToY,
  getSize,
}: GraphGridProps) {
  const lines = useMemo(() => {
    const size = getSize();
    const result: React.ReactNode[] = [];
    const maxFrame = duration - 1;

    for (let s = 0; s * fps <= maxFrame; s++) {
      const x = frameToX(s * fps);
      result.push(
        <line
          key={`t${s}`}
          x1={x}
          y1={GRAPH_PAD.top}
          x2={x}
          y2={size.h - GRAPH_PAD.bottom}
          stroke={GRAPH_EDITOR.GRID_COLOR}
          strokeWidth={0.5}
        />,
      );
      result.push(
        <text
          key={`tl${s}`}
          x={x}
          y={size.h - 4}
          fill={GRAPH_EDITOR.GRID_COLOR}
          fontSize={9}
          textAnchor="middle"
        >
          {s}s
        </text>,
      );
    }

    const range = valueRange.max - valueRange.min;
    const step = range <= 2 ? 0.5 : range <= 10 ? 1 : Math.ceil(range / 5);
    for (
      let v = Math.ceil(valueRange.min / step) * step;
      v <= valueRange.max;
      v += step
    ) {
      const y = valueToY(v);
      result.push(
        <line
          key={`v${v}`}
          x1={GRAPH_PAD.left}
          y1={y}
          x2={size.w - GRAPH_PAD.right}
          y2={y}
          stroke={GRAPH_EDITOR.GRID_COLOR}
          strokeWidth={0.5}
        />,
      );
      result.push(
        <text
          key={`vl${v}`}
          x={GRAPH_PAD.left - 4}
          y={y + 3}
          fill={GRAPH_EDITOR.GRID_COLOR}
          fontSize={9}
          textAnchor="end"
        >
          {Number.isInteger(v) ? v : v.toFixed(1)}
        </text>,
      );
    }

    return result;
  }, [duration, fps, frameToX, valueToY, valueRange, getSize]);

  return <>{lines}</>;
});
