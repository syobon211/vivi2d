import { type RefObject, useCallback } from "react";

export const GRAPH_PAD = { left: 40, right: 12, top: 16, bottom: 20 } as const;

interface ValueRange {
  min: number;
  max: number;
}

export function useGraphCoordinates(
  containerRef: RefObject<HTMLDivElement | null>,
  duration: number,
  valueRange: ValueRange,
) {
  const getSize = useCallback(() => {
    const el = containerRef.current;
    return {
      w: el ? el.clientWidth : 600,
      h: el ? el.clientHeight : 180,
    };
  }, [containerRef]);

  const frameToX = useCallback(
    (frame: number) => {
      const { w } = getSize();
      const plotW = w - GRAPH_PAD.left - GRAPH_PAD.right;
      const maxFrame = Math.max(duration - 1, 1);
      return GRAPH_PAD.left + (frame / maxFrame) * plotW;
    },
    [duration, getSize],
  );

  const valueToY = useCallback(
    (value: number) => {
      const { h } = getSize();
      const plotH = h - GRAPH_PAD.top - GRAPH_PAD.bottom;
      const range = valueRange.max - valueRange.min;
      if (range === 0) return GRAPH_PAD.top + plotH / 2;
      const t = (value - valueRange.min) / range;
      return GRAPH_PAD.top + plotH * (1 - t);
    },
    [valueRange, getSize],
  );

  const yToValue = useCallback(
    (y: number) => {
      const { h } = getSize();
      const plotH = h - GRAPH_PAD.top - GRAPH_PAD.bottom;
      const range = valueRange.max - valueRange.min;
      const t = 1 - (y - GRAPH_PAD.top) / plotH;
      return valueRange.min + t * range;
    },
    [valueRange, getSize],
  );

  return { getSize, frameToX, valueToY, yToValue } as const;
}
