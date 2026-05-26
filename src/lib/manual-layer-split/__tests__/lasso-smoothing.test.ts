import { describe, expect, it } from "vitest";
import {
  computeMaskDirtyRect,
  createLassoSmoothingOptions,
  pointerEventToSourcePoint,
  resolveEffectiveLassoStrength,
  smoothLassoPath,
  type LassoPoint,
} from "../lasso-smoothing";

function point(x: number, y: number, t = 0): LassoPoint {
  return { x, y, t };
}

function circle(count: number, radius = 40, center = 50): LassoPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count;
    return point(
      center + Math.cos(angle) * radius,
      center + Math.sin(angle) * radius,
      index * 33,
    );
  });
}

function signedArea(points: readonly LassoPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

describe("manual layer split lasso smoothing", () => {
  it("keeps precision from increasing off strength", () => {
    expect(resolveEffectiveLassoStrength("off", true)).toBe("off");
    expect(resolveEffectiveLassoStrength("high", true)).toBe("low");
  });

  it("smooths sparse lasso input without falling back to the raw polygon", () => {
    const result = smoothLassoPath(
      [
        point(10, 10, 0),
        point(90, 10, 10),
        point(90, 90, 20),
        point(10, 90, 30),
      ],
      createLassoSmoothingOptions("medium", 100, 100),
    );

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.acceptedIterations).toBe(2);
    expect(result.acceptedPoints.length).toBeGreaterThan(result.rawPoints.length);
    expect(result.usedFallback).toBe(false);
  });

  it("keeps high strength within the output point cap", () => {
    const result = smoothLassoPath(
      circle(4096, 400, 500),
      createLassoSmoothingOptions("high", 1000, 1000),
    );

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.acceptedPoints.length).toBeLessThanOrEqual(8192);
    expect(result.warnings).toContain("detailReducedForSmoothing");
  });

  it("reduces over-limit raw input and keeps accepted path orientation", () => {
    const raw = circle(5000, 400, 500);
    const result = smoothLassoPath(
      raw,
      createLassoSmoothingOptions("high", 1000, 1000),
    );

    expect(result.warnings).toContain("pointLimitReduced");
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(Math.sign(signedArea(result.rawPoints))).toBe(
      Math.sign(signedArea(result.acceptedPoints)),
    );
  });

  it("rejects too-short and degenerate strokes without accepted points", () => {
    const tooShort = smoothLassoPath(
      [point(0, 0), point(1, 1)],
      createLassoSmoothingOptions("medium", 100, 100),
    );
    expect(tooShort.status).toBe("rejectedTooFewPoints");
    expect("acceptedPoints" in tooShort).toBe(false);

    const degenerate = smoothLassoPath(
      [point(10, 10), point(20, 20), point(30, 30), point(40, 40)],
      createLassoSmoothingOptions("off", 100, 100),
    );
    expect(degenerate.status).toBe("rejectedDegenerate");
    expect("acceptedPoints" in degenerate).toBe(false);
  });

  it("treats bow-tie lasso input as ambiguous even when smoothing is off", () => {
    const result = smoothLassoPath(
      [
        point(10, 10),
        point(90, 90),
        point(10, 90),
        point(80, 20),
      ],
      createLassoSmoothingOptions("off", 100, 100),
    );

    expect(result.status).toBe("ambiguousSelfIntersection");
    expect(result.warnings).toContain("selfIntersectionSuspected");
    expect("acceptedPoints" in result).toBe(false);
  });

  it("converts pointer coordinates through the manual split viewport transform", () => {
    const result = pointerEventToSourcePoint(
      { clientX: 50, clientY: 80, timeStamp: 123 },
      { left: 0, top: 10 },
      {
        cssToBackingScaleX: 2,
        cssToBackingScaleY: 2,
        panX: 20,
        panY: 30,
        zoom: 2,
        sourceOffsetX: 10,
        sourceOffsetY: 5,
        sourceWidth: 100,
        sourceHeight: 100,
        version: 1,
      },
    );

    expect(result).toEqual({ x: 30, y: 50, t: 123 });
  });

  it("rejects invalid viewport transforms instead of producing bad points", () => {
    expect(
      pointerEventToSourcePoint(
        { clientX: 50, clientY: 80, timeStamp: 123 },
        { left: 0, top: 0 },
        {
          cssToBackingScaleX: Number.POSITIVE_INFINITY,
          cssToBackingScaleY: 2,
          panX: 0,
          panY: 0,
          zoom: 1,
          sourceOffsetX: 0,
          sourceOffsetY: 0,
          sourceWidth: 100,
          sourceHeight: 100,
          version: 1,
        },
      ),
    ).toBeNull();
  });

  it("rounds and clips dirty rects for mask history", () => {
    expect(
      computeMaskDirtyRect(
        { x: -0.5, y: 2.2, width: 12.2, height: 6.1 },
        10,
        10,
        { aaPaddingPx: 1, extraPaddingPx: 1 },
      ),
    ).toEqual({ x: 0, y: 0, width: 10, height: 10 });

    expect(
      computeMaskDirtyRect(
        { x: 20, y: 20, width: 2, height: 2 },
        10,
        10,
        { aaPaddingPx: 1, extraPaddingPx: 1 },
      ),
    ).toBeNull();
  });
});
