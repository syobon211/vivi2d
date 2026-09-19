import { interpolateTrack } from "@vivi2d/core/timeline-utils";
import type { AnimationTrack } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

describe("interpolateTrack（ellipse/sns 統合）", () => {
  describe("ellipse 補間", () => {
    const track: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "ellipse",
          ellipseRatio: 0.5,
          ellipseDirection: "cw",
        },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };

    it("先頭フレームで開始値を返す", () => {
      expect(interpolateTrack(track, 0)).toBe(0);
    });

    it("末尾フレームで終了値を返す", () => {
      expect(interpolateTrack(track, 10)).toBe(100);
    });

    it("中間フレームで楕円補間された値を返す（linear と異なる）", () => {
      const val = interpolateTrack(track, 5)!;
      expect(val).not.toBeCloseTo(50, 0);
    });
  });

  describe("sns 補間", () => {
    const track: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "sns",
          snsOscillations: 2,
          snsDamping: 0.5,
        },
        { frame: 20, value: 100, interpolation: "linear" },
      ],
    };

    it("先頭フレームで開始値を返す", () => {
      expect(interpolateTrack(track, 0)).toBe(0);
    });

    it("末尾フレームで終了値を返す", () => {
      expect(interpolateTrack(track, 20)).toBe(100);
    });

    it("中間フレームで SNS 補間された値を返す（smoothstep のみと異なる）", () => {
      const val = interpolateTrack(track, 3)!;
      const t = 3 / 20;
      const smoothOnly = t * t * (3 - 2 * t) * 100;
      expect(val).not.toBeCloseTo(smoothOnly, 1);
    });

    it("デフォルトパラメータでの sns 補間も動作する", () => {
      const defaultTrack: AnimationTrack = {
        parameterId: "p1",
        keyframes: [
          { frame: 0, value: 0, interpolation: "sns" },
          { frame: 10, value: 100, interpolation: "linear" },
        ],
      };
      const val = interpolateTrack(defaultTrack, 5)!;
      expect(val).toBeGreaterThan(0);
      expect(val).toBeLessThan(100);
    });
  });
});
