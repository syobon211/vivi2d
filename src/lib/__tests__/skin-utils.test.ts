import { type Affine2D, IDENTITY } from "@vivi2d/core/bone-utils";
import {
  computeSkinnedVertices,
  normalizeWeights,
  smoothWeights,
} from "@vivi2d/core/skin-utils";
import type { SkinData, SkinWeight } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

describe("computeSkinnedVertices", () => {
  it("単一ボーン、単位行列 → レスト位置と同じ", () => {
    const rest = [10, 20, 30, 40];
    const skin: SkinData = {
      weights: [[{ boneId: "b1", weight: 1 }], [{ boneId: "b1", weight: 1 }]],
      bindPoseInverse: { b1: [...IDENTITY] },
    };
    const worlds = new Map<string, Affine2D>([["b1", [...IDENTITY]]]);
    const result = computeSkinnedVertices(rest, skin, worlds);
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it("ボーンが平行移動 → 頂点も移動", () => {
    const rest = [0, 0];
    const skin: SkinData = {
      weights: [[{ boneId: "b1", weight: 1 }]],
      bindPoseInverse: { b1: [...IDENTITY] },
    };
    const worlds = new Map<string, Affine2D>([["b1", [1, 0, 0, 1, 100, 50]]]);
    const result = computeSkinnedVertices(rest, skin, worlds);
    expect(result[0]).toBeCloseTo(100);
    expect(result[1]).toBeCloseTo(50);
  });

  it("2つのボーンで50:50ブレンド", () => {
    const rest = [0, 0];
    const skin: SkinData = {
      weights: [
        [
          { boneId: "b1", weight: 0.5 },
          { boneId: "b2", weight: 0.5 },
        ],
      ],
      bindPoseInverse: {
        b1: [...IDENTITY],
        b2: [...IDENTITY],
      },
    };
    const worlds = new Map<string, Affine2D>([
      ["b1", [1, 0, 0, 1, 100, 0]], // (100, 0)
      ["b2", [1, 0, 0, 1, 0, 100]], // (0, 100)
    ]);
    const result = computeSkinnedVertices(rest, skin, worlds);
    expect(result[0]).toBeCloseTo(50);
    expect(result[1]).toBeCloseTo(50);
  });

  it("ウェイトなしの頂点はレスト位置を維持", () => {
    const rest = [10, 20, 30, 40];
    const skin: SkinData = {
      weights: [
        [],
        [{ boneId: "b1", weight: 1 }],
      ],
      bindPoseInverse: { b1: [...IDENTITY] },
    };
    const worlds = new Map<string, Affine2D>([["b1", [1, 0, 0, 1, 5, 5]]]);
    const result = computeSkinnedVertices(rest, skin, worlds);
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
    expect(result[2]).toBeCloseTo(35);
    expect(result[3]).toBeCloseTo(45);
  });

  it("bindPoseInverse を考慮した変形", () => {
    const rest = [10, 0];
    const bindInv: Affine2D = [1, 0, 0, 1, -10, 0];
    const skin: SkinData = {
      weights: [[{ boneId: "b1", weight: 1 }]],
      bindPoseInverse: { b1: bindInv },
    };
    const worlds = new Map<string, Affine2D>([["b1", [1, 0, 0, 1, 20, 0]]]);
    const result = computeSkinnedVertices(rest, skin, worlds);
    expect(result[0]).toBeCloseTo(20);
    expect(result[1]).toBeCloseTo(0);
  });

  it("存在しないボーンIDのウェイトは無視される", () => {
    const rest = [10, 20];
    const skin: SkinData = {
      weights: [[{ boneId: "missing", weight: 1 }]],
      bindPoseInverse: {},
    };
    const worlds = new Map<string, Affine2D>();
    const result = computeSkinnedVertices(rest, skin, worlds);
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
  });

  it("不足している残りウェイト分はレスト位置を適用する", () => {
    const rest = [10, 20];
    const skin: SkinData = {
      weights: [[{ boneId: "b1", weight: 0.25 }]],
      bindPoseInverse: { b1: [...IDENTITY] },
    };
    const worlds = new Map<string, Affine2D>([["b1", [...IDENTITY]]]);
    const result = computeSkinnedVertices(rest, skin, worlds);
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
  });

  it("空の頂点配列 → 空配列を返す", () => {
    const skin: SkinData = { weights: [], bindPoseInverse: {} };
    const result = computeSkinnedVertices([], skin, new Map());
    expect(result).toEqual([]);
  });
});

describe("normalizeWeights", () => {
  it("合計が1になるように正規化", () => {
    const weights = [
      { boneId: "a", weight: 3 },
      { boneId: "b", weight: 1 },
    ];
    const normalized = normalizeWeights(weights);
    expect(normalized[0]!.weight).toBeCloseTo(0.75);
    expect(normalized[1]!.weight).toBeCloseTo(0.25);
  });

  it("すでに合計1の場合はそのまま", () => {
    const weights = [
      { boneId: "a", weight: 0.6 },
      { boneId: "b", weight: 0.4 },
    ];
    const normalized = normalizeWeights(weights);
    expect(normalized[0]!.weight).toBeCloseTo(0.6);
    expect(normalized[1]!.weight).toBeCloseTo(0.4);
  });

  it("全ウェイト0の場合はそのまま返す", () => {
    const weights = [
      { boneId: "a", weight: 0 },
      { boneId: "b", weight: 0 },
    ];
    const normalized = normalizeWeights(weights);
    expect(normalized[0]!.weight).toBe(0);
    expect(normalized[1]!.weight).toBe(0);
  });

  it("空配列 → 空配列", () => {
    expect(normalizeWeights([])).toEqual([]);
  });
});

describe("smoothWeights", () => {
  it("平滑化後のウェイト合計が1.0以下を維持する", () => {
    const weights: SkinWeight[][] = [
      [
        { boneId: "b1", weight: 0.8 },
        { boneId: "b2", weight: 0.2 },
      ],
      [
        { boneId: "b1", weight: 0.3 },
        { boneId: "b2", weight: 0.7 },
      ],
      [
        { boneId: "b1", weight: 0.5 },
        { boneId: "b2", weight: 0.5 },
      ],
    ];
    const indices = [0, 1, 2];
    const result = smoothWeights(weights, indices, 5);
    expect(result).toHaveLength(3);
    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeLessThanOrEqual(1.0 + 1e-9);
    }
  });

  it("隣接頂点が互いに近づく方向へ平滑化される", () => {
    const weights: SkinWeight[][] = [
      [{ boneId: "boneA", weight: 1 }],
      [{ boneId: "boneB", weight: 1 }],
    ];
    const indices = [0, 1, 0];
    const result = smoothWeights(weights, indices, 3);

    const v0BoneB = result[0]!.find((w) => w.boneId === "boneB");
    expect(v0BoneB).not.toBeUndefined();
    expect(v0BoneB!.weight).toBeGreaterThan(0);

    const v1BoneA = result[1]!.find((w) => w.boneId === "boneA");
    expect(v1BoneA).not.toBeUndefined();
    expect(v1BoneA!.weight).toBeGreaterThan(0);
  });

  it("エッジ頂点（隣接なし）でクラッシュしない", () => {
    const weights: SkinWeight[][] = [
      [{ boneId: "b1", weight: 1 }],
      [{ boneId: "b2", weight: 1 }],
      [
        { boneId: "b1", weight: 0.5 },
        { boneId: "b2", weight: 0.5 },
      ],
    ];
    const indices = [1, 2, 1];
    const result = smoothWeights(weights, indices, 3);
    expect(result[0]!).toHaveLength(1);
    expect(result[0]![0]!.boneId).toBe("b1");
    expect(result[0]![0]!.weight).toBeCloseTo(1);
  });

  it("空のウェイト配列でクラッシュしない", () => {
    const weights: SkinWeight[][] = [];
    const indices: number[] = [];
    const result = smoothWeights(weights, indices, 5);
    expect(result).toEqual([]);
  });

  it("複数回の反復は1回の反復より滑らかな結果を生む", () => {
    const weights: SkinWeight[][] = [
      [{ boneId: "b1", weight: 1 }],
      [{ boneId: "b1", weight: 1 }],
      [{ boneId: "b1", weight: 1 }],
      [{ boneId: "b2", weight: 1 }],
      [{ boneId: "b2", weight: 1 }],
    ];
    const indices = [0, 1, 2, 1, 2, 3, 2, 3, 4];

    const result1 = smoothWeights(weights, indices, 1);
    const result5 = smoothWeights(weights, indices, 5);

    const getB1Weight = (vw: SkinWeight[]): number =>
      vw.find((w) => w.boneId === "b1")?.weight ?? 0;

    const diff1_23 = Math.abs(getB1Weight(result1[2]!) - getB1Weight(result1[3]!));
    const diff5_23 = Math.abs(getB1Weight(result5[2]!) - getB1Weight(result5[3]!));

    expect(diff5_23).toBeLessThan(diff1_23);
  });
});
