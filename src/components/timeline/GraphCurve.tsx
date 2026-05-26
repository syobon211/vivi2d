import { GRAPH_EDITOR } from "@vivi2d/core/constants";
import { ellipseInterpolation, snsInterpolation } from "@vivi2d/core/timeline-utils";
import type { AnimationTrack } from "@vivi2d/core/types";
import { memo } from "react";

interface GraphCurveProps {
  track: AnimationTrack;

  frameToX: (frame: number) => number;

  valueToY: (value: number) => number;

  selected: boolean;
}

export const GraphCurve = memo(function GraphCurve({
  track,
  frameToX,
  valueToY,
  selected,
}: GraphCurveProps) {
  const { keyframes } = track;
  if (keyframes.length === 0) return null;

  const pathSegments: string[] = [];

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i]!;
    const x = frameToX(kf.frame);
    const y = valueToY(kf.value);

    if (i === 0) {
      pathSegments.push(`M ${x} ${y}`);
      continue;
    }

    const prev = keyframes[i - 1]!;
    const px = frameToX(prev.frame);
    const py = valueToY(prev.value);
    const segWidth = x - px;
    const segHeight = y - py;

    switch (prev.interpolation) {
      case "step":
        pathSegments.push(`L ${x} ${py} L ${x} ${y}`);
        break;

      case "bezier": {
        const cp1x = prev.cp1x ?? 0.25;
        const cp1y = prev.cp1y ?? 0;
        const cp2x = prev.cp2x ?? 0.75;
        const cp2y = prev.cp2y ?? 1;

        const c1x = px + cp1x * segWidth;
        const c1y = py + cp1y * segHeight;
        const c2x = px + cp2x * segWidth;
        const c2y = py + cp2y * segHeight;

        pathSegments.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x} ${y}`);
        break;
      }

      case "ellipse":
      case "sns": {
        const steps = 20;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const frame = prev.frame + (kf.frame - prev.frame) * t;
          const val =
            prev.interpolation === "ellipse"
              ? ellipseInterpolation(
                  t,
                  prev.value,
                  kf.value,
                  prev.ellipseRatio ?? 0.5,
                  prev.ellipseDirection ?? "cw",
                )
              : snsInterpolation(
                  t,
                  prev.value,
                  kf.value,
                  prev.snsOscillations ?? 1,
                  prev.snsDamping ?? 0.5,
                );
          pathSegments.push(`L ${frameToX(frame)} ${valueToY(val)}`);
        }
        break;
      }

      default:
        // linear
        pathSegments.push(`L ${x} ${y}`);
        break;
    }
  }

  return (
    <path
      d={pathSegments.join(" ")}
      fill="none"
      stroke={selected ? GRAPH_EDITOR.CURVE_COLOR : GRAPH_EDITOR.GRID_COLOR}
      strokeWidth={
        selected ? GRAPH_EDITOR.CURVE_LINE_WIDTH : GRAPH_EDITOR.CURVE_LINE_WIDTH * 0.7
      }
      opacity={selected ? 1 : 0.5}
    />
  );
});
