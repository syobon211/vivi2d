import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GRAPH_PAD, useGraphCoordinates } from "../useGraphCoordinates";

function createContainerRef(width: number, height: number) {
  return {
    current: { clientWidth: width, clientHeight: height } as HTMLDivElement,
  };
}

describe("useGraphCoordinates", () => {
  const duration = 91;
  const valueRange = { min: 0, max: 1 };

  describe("getSize", () => {
    it("コンテナの幅と高さを返す", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      expect(result.current.getSize()).toEqual({ w: 800, h: 300 });
    });

    it("コンテナがnullの場合はデフォルト値を返す", () => {
      const ref = { current: null };
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      expect(result.current.getSize()).toEqual({ w: 600, h: 180 });
    });
  });

  describe("frameToX", () => {
    it("フレーム0はGRAPH_PAD.leftに対応する", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      expect(result.current.frameToX(0)).toBe(GRAPH_PAD.left);
    });

    it("最終フレームは右端パディング手前に対応する", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      const maxFrame = duration - 1;
      const expected = 800 - GRAPH_PAD.right;
      expect(result.current.frameToX(maxFrame)).toBeCloseTo(expected, 5);
    });

    it("中間フレームは線形補間される", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      const maxFrame = duration - 1;
      const plotW = 800 - GRAPH_PAD.left - GRAPH_PAD.right;
      const halfFrame = maxFrame / 2;
      const expected = GRAPH_PAD.left + (halfFrame / maxFrame) * plotW;
      expect(result.current.frameToX(halfFrame)).toBeCloseTo(expected, 5);
    });

    it("duration=1の場合はdivision by zeroを回避する", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, 1, valueRange));
      expect(result.current.frameToX(0)).toBe(GRAPH_PAD.left);
    });
  });

  describe("valueToY", () => {
    it("最大値はGRAPH_PAD.topに対応する（上が最大）", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      expect(result.current.valueToY(1)).toBeCloseTo(GRAPH_PAD.top, 5);
    });

    it("最小値は下端パディング手前に対応する", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      const expected = 300 - GRAPH_PAD.bottom;
      expect(result.current.valueToY(0)).toBeCloseTo(expected, 5);
    });

    it("中間値は中央に位置する", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      const plotH = 300 - GRAPH_PAD.top - GRAPH_PAD.bottom;
      const expected = GRAPH_PAD.top + plotH * 0.5;
      expect(result.current.valueToY(0.5)).toBeCloseTo(expected, 5);
    });

    it("range=0の場合はプロットエリアの中央を返す", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() =>
        useGraphCoordinates(ref, duration, { min: 5, max: 5 }),
      );
      const plotH = 300 - GRAPH_PAD.top - GRAPH_PAD.bottom;
      const expected = GRAPH_PAD.top + plotH / 2;
      expect(result.current.valueToY(5)).toBeCloseTo(expected, 5);
    });

    it("負の値範囲にも対応する", () => {
      const ref = createContainerRef(800, 300);
      const range = { min: -30, max: 30 };
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, range));
      const plotH = 300 - GRAPH_PAD.top - GRAPH_PAD.bottom;
      const expected = GRAPH_PAD.top + plotH * 0.5;
      expect(result.current.valueToY(0)).toBeCloseTo(expected, 5);
    });
  });

  describe("yToValue", () => {
    it("GRAPH_PAD.topは最大値に対応する", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      expect(result.current.yToValue(GRAPH_PAD.top)).toBeCloseTo(1, 5);
    });

    it("下端パディング手前は最小値に対応する", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      const bottomY = 300 - GRAPH_PAD.bottom;
      expect(result.current.yToValue(bottomY)).toBeCloseTo(0, 5);
    });

    it("valueToYとyToValueは逆変換関係にある", () => {
      const ref = createContainerRef(800, 300);
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, valueRange));
      for (const v of [0, 0.25, 0.5, 0.75, 1]) {
        const y = result.current.valueToY(v);
        expect(result.current.yToValue(y)).toBeCloseTo(v, 10);
      }
    });

    it("負の値範囲でも逆変換が成立する", () => {
      const ref = createContainerRef(800, 300);
      const range = { min: -100, max: 100 };
      const { result } = renderHook(() => useGraphCoordinates(ref, duration, range));
      for (const v of [-100, -50, 0, 50, 100]) {
        const y = result.current.valueToY(v);
        expect(result.current.yToValue(y)).toBeCloseTo(v, 10);
      }
    });
  });
});
