import type { BonePosition } from "@vivi2d/core/skin-utils";
import {
  computeDistanceWeights,
  findVerticesInRadius,
  smoothWeights,
} from "@vivi2d/core/skin-utils";
import { describe, expect, it } from "vitest";

// ============================================================
// computeDistanceWeights
// ============================================================

describe("computeDistanceWeights", () => {
  it("ボーンに近い頂点のウェイトが大きい", () => {
    const vertices = [0, 0];
    const bones: BonePosition[] = [
      { id: "boneA", x: 1, y: 0 },
      { id: "boneB", x: 100, y: 0 },
    ];
    const result = computeDistanceWeights(vertices, bones);
    expect(result).toHaveLength(1);
    const weights = result[0]!;
    const wA = weights.find((w) => w.boneId === "boneA");
    const wB = weights.find((w) => w.boneId === "boneB");
    expect(wA).toBeDefined();
    if (wB) {
      expect(wA!.weight).toBeGreaterThan(wB.weight);
    }
  });

  it("各頂点のウェイト合計が1に正規化されている", () => {
    const vertices = [0, 0, 50, 50, 100, 100];
    const bones: BonePosition[] = [
      { id: "b1", x: 0, y: 0 },
      { id: "b2", x: 50, y: 50 },
      { id: "b3", x: 100, y: 100 },
    ];
    const result = computeDistanceWeights(vertices, bones);
    expect(result).toHaveLength(3);
    for (const vertexWeights of result) {
      if (vertexWeights.length > 0) {
        const total = vertexWeights.reduce((sum, w) => sum + w.weight, 0);
        expect(total).toBeCloseTo(1);
      }
    }
  });

  it("ボーンが空なら各頂点に空配列を返す", () => {
    const vertices = [10, 20, 30, 40];
    const bones: BonePosition[] = [];
    const result = computeDistanceWeights(vertices, bones);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([]);
    expect(result[1]).toEqual([]);
  });

  it("頂点がボーン位置と一致する場合でもエラーにならない", () => {
    const vertices = [10, 20];
    const bones: BonePosition[] = [{ id: "b1", x: 10, y: 20 }];
    const result = computeDistanceWeights(vertices, bones);
    expect(result).toHaveLength(1);
    expect(result[0]!).toHaveLength(1);
    expect(result[0]![0]!.weight).toBeCloseTo(1);
  });
});

// ============================================================
// findVerticesInRadius
// ============================================================

describe("findVerticesInRadius", () => {
  it("半径内の頂点のみを返す", () => {
    const vertices = [0, 0, 3, 0, 10, 0];
    const result = findVerticesInRadius(vertices, 0, 0, 5);
    expect(result).toHaveLength(2);
    expect(result.find((v) => v.index === 0)).toBeDefined();
    expect(result.find((v) => v.index === 1)).toBeDefined();
  });

  it("半径外の頂点は含まれない", () => {
    const vertices = [0, 0, 100, 100];
    const result = findVerticesInRadius(vertices, 0, 0, 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.index).toBe(0);
    expect(result[0]!.distance).toBeCloseTo(0);
  });

  it("ちょうど半径上の頂点も含む", () => {
    const vertices = [5, 0];
    const result = findVerticesInRadius(vertices, 0, 0, 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.distance).toBeCloseTo(5);
  });

  it("空の頂点配列では空配列を返す", () => {
    const result = findVerticesInRadius([], 0, 0, 10);
    expect(result).toEqual([]);
  });

  it("距離が正しく計算される", () => {
    const vertices = [3, 4];
    const result = findVerticesInRadius(vertices, 0, 0, 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.distance).toBeCloseTo(5);
  });
});

// ============================================================
// smoothWeights
// ============================================================

describe("smoothWeights", () => {
  it("平滑化後もウェイトが正規化されている", () => {
    const weights = [
      [
        { boneId: "b1", weight: 1 },
        { boneId: "b2", weight: 0 },
      ],
      [
        { boneId: "b1", weight: 0 },
        { boneId: "b2", weight: 1 },
      ],
      [
        { boneId: "b1", weight: 0.5 },
        { boneId: "b2", weight: 0.5 },
      ],
    ];
    const indices = [0, 1, 2];
    const result = smoothWeights(weights, indices, 3);
    expect(result).toHaveLength(3);
    for (const vw of result) {
      if (vw.length > 0) {
        const total = vw.reduce((sum, w) => sum + w.weight, 0);
        expect(total).toBeCloseTo(1);
      }
    }
  });

  it("iterations=0 で元のウェイトと同じ値を返す", () => {
    const weights = [
      [{ boneId: "b1", weight: 1 }],
      [{ boneId: "b2", weight: 1 }],
      [
        { boneId: "b1", weight: 0.5 },
        { boneId: "b2", weight: 0.5 },
      ],
    ];
    const indices = [0, 1, 2];
    const result = smoothWeights(weights, indices, 0);
    expect(result[0]![0]!.weight).toBeCloseTo(1);
    expect(result[1]![0]!.weight).toBeCloseTo(1);
  });

  it("平滑化により隣接頂点のウェイトが近づく", () => {
    const weights = [
      [{ boneId: "boneA", weight: 1 }],
      [{ boneId: "boneB", weight: 1 }],
      [
        { boneId: "boneA", weight: 0.5 },
        { boneId: "boneB", weight: 0.5 },
      ],
    ];
    const indices = [0, 1, 2];
    const result = smoothWeights(weights, indices, 5);
    const v0BoneB = result[0]!.find((w) => w.boneId === "boneB");
    expect(v0BoneB).toBeDefined();
    expect(v0BoneB!.weight).toBeGreaterThan(0);
  });

  it("隣接なし（空のインデックス）では変化しない", () => {
    const weights = [[{ boneId: "b1", weight: 1 }]];
    const indices: number[] = [];
    const result = smoothWeights(weights, indices, 10);
    expect(result[0]![0]!.weight).toBeCloseTo(1);
  });
});
