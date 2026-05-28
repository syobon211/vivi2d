import { ellipseInterpolation, snsInterpolation } from "@vivi2d/core/timeline-utils";
import { describe, expect, it } from "vitest";

// ============================================================
// ellipseInterpolation
// ============================================================

describe("ellipseInterpolation", () => {
  it("t=0でstart値を返す", () => {
    expect(ellipseInterpolation(0, 10, 90)).toBeCloseTo(10);
  });

  it("t=1でend値を返す", () => {
    expect(ellipseInterpolation(1, 10, 90)).toBeCloseTo(90);
  });

  it("ratio=0で線形補間に退化する", () => {
    const start = 0;
    const end = 100;
    expect(ellipseInterpolation(0.5, start, end, 0)).toBeCloseTo(50);
    expect(ellipseInterpolation(0.25, start, end, 0)).toBeCloseTo(25);
    expect(ellipseInterpolation(0.75, start, end, 0)).toBeCloseTo(75);
  });

  it("中間点でオーバーシュートする（楕円経路、ratio>0）", () => {
    const start = 0;
    const end = 100;
    const mid = ellipseInterpolation(0.5, start, end, 0.5, "cw");

    expect(mid).not.toBeCloseTo(50);
  });

  it("方向cw/ccwで膨らみの向きが逆転する", () => {
    const start = 0;
    const end = 100;
    const midCw = ellipseInterpolation(0.5, start, end, 0.5, "cw");
    const midCcw = ellipseInterpolation(0.5, start, end, 0.5, "ccw");

    const linear = 50;
    const offsetCw = midCw - linear;
    const offsetCcw = midCcw - linear;
    expect(offsetCw * offsetCcw).toBeLessThan(0);
  });

  it("ratio=1で最大の楕円膨らみ", () => {
    const start = 0;
    const end = 100;
    const midR1 = ellipseInterpolation(0.5, start, end, 1, "cw");
    const midR05 = ellipseInterpolation(0.5, start, end, 0.5, "cw");

    const deviationR1 = Math.abs(midR1 - 50);
    const deviationR05 = Math.abs(midR05 - 50);
    expect(deviationR1).toBeGreaterThan(deviationR05);
  });

  it("start === end の場合は常にその値を返す", () => {
    expect(ellipseInterpolation(0.5, 42, 42, 0.5)).toBeCloseTo(42);
  });
});

// ============================================================
// snsInterpolation
// ============================================================

describe("snsInterpolation", () => {
  it("t=0でstart値を返す", () => {
    expect(snsInterpolation(0, 10, 90)).toBeCloseTo(10);
  });

  it("t=1でend値を返す", () => {
    expect(snsInterpolation(1, 10, 90)).toBeCloseTo(90);
  });

  it("oscillations=0で通常のsmoothstep補間", () => {
    const start = 0;
    const end = 100;
    const mid = snsInterpolation(0.5, start, end, 0);
    // smoothstep(0.5) = 0.5 * 0.5 * (3 - 2*0.5) = 0.25 * 2 = 0.5
    expect(mid).toBeCloseTo(50);
  });

  it("damping=0で振動成分が大きい（smoothstepからの逸脱）", () => {
    const start = 0;
    const end = 100;
    let maxDeviation = 0;
    for (let t = 0.01; t < 1; t += 0.01) {
      const snsVal = snsInterpolation(t, start, end, 2, 0);
      const smoothstep = t * t * (3 - 2 * t) * 100;
      maxDeviation = Math.max(maxDeviation, Math.abs(snsVal - smoothstep));
    }
    expect(maxDeviation).toBeGreaterThan(5);
  });

  it("高dampingではオーバーシュートが抑制される", () => {
    const start = 0;
    const end = 100;
    let maxVal = -Infinity;
    let minVal = Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const val = snsInterpolation(t, start, end, 1, 10);
      maxVal = Math.max(maxVal, val);
      minVal = Math.min(minVal, val);
    }
    expect(maxVal).toBeLessThan(end + 20);
    expect(minVal).toBeGreaterThan(start - 20);
  });

  it("t=0とt=1で常に正確な値を返す（各パラメータで）", () => {
    for (const osc of [0, 1, 2, 5]) {
      for (const damp of [0, 0.5, 1, 5]) {
        expect(snsInterpolation(0, 0, 100, osc, damp)).toBeCloseTo(0, 1);
        expect(snsInterpolation(1, 0, 100, osc, damp)).toBeCloseTo(100, 1);
      }
    }
  });
});
