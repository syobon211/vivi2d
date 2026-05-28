import {
  ellipseInterpolation,
  interpolateTrack,
  snsInterpolation,
} from "@vivi2d/core/timeline-utils";
import type { AnimationTrack } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";


describe("ellipseInterpolation", () => {
  it("t=0 で開始値を返す", () => {
    expect(ellipseInterpolation(0, 10, 90, 0.5, "cw")).toBeCloseTo(10);
  });

  it("t=1 で終了値を返す", () => {
    expect(ellipseInterpolation(1, 10, 90, 0.5, "cw")).toBeCloseTo(90);
  });

  it("ratio=0 で linear と同じ結果になる", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const expected = 10 + (90 - 10) * t;
      expect(ellipseInterpolation(t, 10, 90, 0, "cw")).toBeCloseTo(expected);
    }
  });

  it("cw と ccw で異なる結果を返す", () => {
    const cwVal = ellipseInterpolation(0.25, 0, 100, 0.5, "cw");
    const ccwVal = ellipseInterpolation(0.25, 0, 100, 0.5, "ccw");
    expect(cwVal).not.toBeCloseTo(ccwVal);
  });

  it("t=0.5、ratio>0 の場合に linear の中間値と異なる膨らみを持つ", () => {
    const linearMid = (0 + 100) / 2; // 50
    const cwMid = ellipseInterpolation(0.5, 0, 100, 0.8, "cw");
    expect(cwMid).not.toBeCloseTo(linearMid, 0);
  });

  it("ratio=1 で最大の膨らみを生じる（cw で中間値が上に膨らむ）", () => {
    const mid = ellipseInterpolation(0.5, 0, 100, 1.0, "cw");
    expect(mid).toBeGreaterThan(50);
  });

  it("ccw 方向では cw と逆の膨らみ方向になる", () => {
    const cwMid = ellipseInterpolation(0.5, 0, 100, 0.5, "cw");
    const ccwMid = ellipseInterpolation(0.5, 0, 100, 0.5, "ccw");
    const linearMid = 50;
    expect(cwMid).toBeGreaterThan(linearMid);
    expect(ccwMid).toBeLessThan(linearMid);
  });
});


describe("snsInterpolation", () => {
  it("t=0 で開始値を返す", () => {
    expect(snsInterpolation(0, 10, 90, 1, 0.5)).toBeCloseTo(10);
  });

  it("t=1 付近で終了値に近い値を返す", () => {
    expect(snsInterpolation(1, 10, 90, 1, 0.5)).toBeCloseTo(90);
  });

  it("oscillations=0 で振動なし（smoothstep に等しい）", () => {
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const result = snsInterpolation(t, 0, 100, 0, 0.5);
      const base = t * t * (3 - 2 * t); // smoothstep
      expect(result).toBeCloseTo(base * 100);
    }
  });

  it("振動回数が多いと中間で値がオーバーシュートする", () => {
    const withOsc = snsInterpolation(0.15, 0, 100, 3, 0.2);
    const noOsc = snsInterpolation(0.15, 0, 100, 0, 0.2);
    expect(withOsc).not.toBeCloseTo(noOsc, 1);
  });

  it("減衰が大きいと振動が早く収束する", () => {
    const highDamping = snsInterpolation(0.5, 0, 100, 2, 5.0);
    const base = 0.5 * 0.5 * (3 - 2 * 0.5); // smoothstep(0.5)=0.5
    expect(highDamping).toBeCloseTo(base * 100, 0);
  });
});


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
