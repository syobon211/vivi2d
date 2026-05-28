import { findNearestControlPoint, findNearestVertex } from "@vivi2d/core/hit-test";
import { describe, expect, it } from "vitest";

describe("findNearestVertex", () => {
  const vertices = [0, 0, 100, 0, 50, 80];

  it("閾値内の最近傍頂点を返す", () => {
    expect(findNearestVertex(vertices, 2, 2, 10)).toBe(0);
    expect(findNearestVertex(vertices, 98, 3, 10)).toBe(1);
    expect(findNearestVertex(vertices, 52, 78, 10)).toBe(2);
  });

  it("閾値外の場合は null を返す", () => {
    expect(findNearestVertex(vertices, 50, 40, 5)).toBe(null);
  });

  it("複数の候補がある場合は最近傍を返す", () => {
    const close = [0, 0, 5, 0];
    expect(findNearestVertex(close, 3, 0, 10)).toBe(1);
  });

  it("空の頂点配列では null を返す", () => {
    expect(findNearestVertex([], 0, 0, 10)).toBe(null);
  });

  it("閾値ちょうどの距離は含まない", () => {
    expect(findNearestVertex([10, 0], 0, 0, 10)).toBe(null);
    expect(findNearestVertex([9, 0], 0, 0, 10)).toBe(0);
  });

  it("負の座標の頂点を検出する", () => {
    const verts = [-50, -30, -10, -20];
    expect(findNearestVertex(verts, -48, -28, 10)).toBe(0);
    expect(findNearestVertex(verts, -12, -22, 10)).toBe(1);
  });

  it("非常に大きい閾値では最も近い頂点を返す", () => {
    const verts = [0, 0, 1000, 0];
    expect(findNearestVertex(verts, 500, 0, 99999)).toBe(0);
  });

  it("閾値 0 では完全一致もヒットしない（strictLessThan）", () => {
    const verts = [10, 20, 30, 40];
    expect(findNearestVertex(verts, 10, 20, 0)).toBe(null);
  });

  it("非常に多くの頂点でも最近傍を正しく返す", () => {
    const manyVerts: number[] = [];
    for (let i = 0; i < 100; i++) {
      manyVerts.push(i * 10, 0);
    }
    expect(findNearestVertex(manyVerts, 423, 2, 10)).toBe(42);
  });

  it("同距離の2頂点がある場合は先に見つかった方を返す", () => {
    const verts = [0, 5, 0, -5];
    const result = findNearestVertex(verts, 0, 0, 10);
    expect(result).toBe(0);
  });
});

describe("findNearestControlPoint", () => {
  it("findNearestVertex と同じ動作をする", () => {
    const cp = [10, 20, 30, 40];
    expect(findNearestControlPoint(cp, 11, 21, 5)).toBe(0);
    expect(findNearestControlPoint(cp, 29, 39, 5)).toBe(1);
    expect(findNearestControlPoint(cp, 0, 0, 5)).toBe(null);
  });
});

describe("findNearestVertex — sparse/undefined 頂点", () => {
  it("奇数長の頂点配列で y が undefined の場合 ?? 0 フォールバック", () => {
    const sparse = [5, 10, 20];
    expect(findNearestVertex(sparse, 20, 0, 5)).toBe(1);
  });

  it("undefined 要素を含む配列で ?? 0 フォールバック", () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [undefined, undefined, 10, 20] as unknown as number[];
    expect(findNearestVertex(sparse, 0, 0, 5)).toBe(0);
    expect(findNearestVertex(sparse, 10, 20, 5)).toBe(1);
  });
});
