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
  it("距離の逆比で両ボーンを保持し全頂点のweightを正規化する", () => {
    const result = computeDistanceWeights(
      [0, 0, 2, 0, 4, 0],
      [
        { id: "boneA", x: 1, y: 0 },
        { id: "boneB", x: 3, y: 0 },
      ],
    );
    expect(result).toHaveLength(3);
    const expected = [
      [0.75, 0.25],
      [0.5, 0.5],
      [0.25, 0.75],
    ];
    for (let i = 0; i < result.length; i++) {
      const row = result[i]!;
      expect(row.map((w) => w.boneId)).toEqual(["boneA", "boneB"]);
      expect(row[0]!.weight).toBeCloseTo(expected[i]![0]!, 12);
      expect(row[1]!.weight).toBeCloseTo(expected[i]![1]!, 12);
      expect(row.reduce((sum, w) => sum + w.weight, 0)).toBeCloseTo(1, 12);
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
  it("中心・内点・3-4-5境界を含み外点を除外して距離を返す", () => {
    expect(findVerticesInRadius([0, 0, 3, 0, 3, 4, 6, 0], 0, 0, 5)).toEqual([
      { index: 0, distance: 0 },
      { index: 1, distance: 3 },
      { index: 2, distance: 5 },
    ]);
  });

  it("空の頂点配列では空配列を返す", () => {
    const result = findVerticesInRadius([], 0, 0, 10);
    expect(result).toEqual([]);
  });
});

// ============================================================
// smoothWeights
// ============================================================

describe("smoothWeights", () => {
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
    expect(result).toHaveLength(3);
    for (const row of result) {
      expect(row).toHaveLength(2);
      expect(row.map((w) => w.boneId).sort()).toEqual(["boneA", "boneB"]);
      expect(row.reduce((sum, w) => sum + w.weight, 0)).toBeCloseTo(1, 12);
    }
  });

  it("隣接なし（空のインデックス）では変化しない", () => {
    const weights = [[{ boneId: "b1", weight: 1 }]];
    const indices: number[] = [];
    const result = smoothWeights(weights, indices, 10);
    expect(result[0]![0]!.weight).toBeCloseTo(1);
  });
});
