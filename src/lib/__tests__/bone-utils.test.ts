import {
  type Affine2D,
  buildBoneMap,
  computeBoneLocalTransform,
  computeBoneWorldTransforms,
  IDENTITY,
  invertAffine,
  multiplyAffine,
  transformPoint,
} from "@vivi2d/core/bone-utils";
import type { BoneNode, LayerNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";


function createBone(overrides: Partial<BoneNode> = {}): BoneNode {
  return {
    id: crypto.randomUUID(),
    name: "テストボーン",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    ...overrides,
  };
}


describe("Affine2D 基本演算", () => {
  it("単位行列 × 任意行列 = 任意行列", () => {
    const m: Affine2D = [2, 0, 0, 3, 10, 20];
    const result = multiplyAffine(IDENTITY, m);
    expect(result).toEqual(m);
  });

  it("任意行列 × 単位行列 = 任意行列", () => {
    const m: Affine2D = [2, 0, 0, 3, 10, 20];
    const result = multiplyAffine(m, IDENTITY);
    expect(result).toEqual(m);
  });

  it("平行移動の合成", () => {
    const t1: Affine2D = [1, 0, 0, 1, 10, 0];
    const t2: Affine2D = [1, 0, 0, 1, 0, 20];
    const result = multiplyAffine(t1, t2);
    expect(result).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it("スケール × 平行移動", () => {
    const scale: Affine2D = [2, 0, 0, 2, 0, 0];
    const translate: Affine2D = [1, 0, 0, 1, 5, 10];
    const result = multiplyAffine(scale, translate);
    expect(result).toEqual([2, 0, 0, 2, 10, 20]);
  });

  it("逆行列 × 元行列 ≈ 単位行列", () => {
    const m: Affine2D = [2, 1, -1, 3, 10, 20];
    const inv = invertAffine(m);
    const product = multiplyAffine(m, inv);
    for (let i = 0; i < 6; i++) {
      expect(product[i]).toBeCloseTo(IDENTITY[i]!, 10);
    }
  });

  it("det=0 の行列の逆行列は単位行列", () => {
    const singular: Affine2D = [0, 0, 0, 0, 5, 10];
    expect(invertAffine(singular)).toEqual([...IDENTITY]);
  });
});

describe("transformPoint", () => {
  it("単位行列はポイントを変更しない", () => {
    expect(transformPoint(IDENTITY, 3, 7)).toEqual([3, 7]);
  });

  it("平行移動", () => {
    const t: Affine2D = [1, 0, 0, 1, 10, -5];
    expect(transformPoint(t, 3, 7)).toEqual([13, 2]);
  });

  it("90度回転", () => {
    const cos = Math.cos(Math.PI / 2);
    const sin = Math.sin(Math.PI / 2);
    const r: Affine2D = [cos, sin, -sin, cos, 0, 0];
    const [x, y] = transformPoint(r, 1, 0);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
  });
});

describe("computeBoneLocalTransform", () => {
  it("角度0、スケール1 → 平行移動のみ", () => {
    const bone = createBone({ x: 100, y: 200 });
    const m = computeBoneLocalTransform(bone);
    expect(m[4]).toBe(100);
    expect(m[5]).toBe(200);
    expect(m[0]).toBeCloseTo(1);
    expect(m[3]).toBeCloseTo(1);
  });

  it("90度回転を反映", () => {
    const bone = createBone({
      bone: { angle: Math.PI / 2, length: 50, scaleX: 1, scaleY: 1 },
    });
    const m = computeBoneLocalTransform(bone);
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(1);
    expect(m[2]).toBeCloseTo(-1);
    expect(m[3]).toBeCloseTo(0);
  });

  it("スケールを反映", () => {
    const bone = createBone({
      bone: { angle: 0, length: 50, scaleX: 2, scaleY: 3 },
    });
    const m = computeBoneLocalTransform(bone);
    expect(m[0]).toBeCloseTo(2);
    expect(m[3]).toBeCloseTo(3);
  });
});

describe("buildBoneMap", () => {
  it("ネストしたボーンも収集する", () => {
    const child = createBone({ name: "子ボーン" });
    const parent = createBone({
      name: "親ボーン",
      children: [child],
    });
    const layers: LayerNode[] = [parent];
    const map = buildBoneMap(layers);
    expect(map.size).toBe(2);
    expect(map.get(parent.id)).toBe(parent);
    expect(map.get(child.id)).toBe(child);
  });

  it("ボーン以外のノードは無視する", () => {
    const layers: LayerNode[] = [
      {
        id: "g1",
        name: "グループ",
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        children: [],
        blendMode: "normal",
        expanded: true,
        kind: "group",
      },
    ];
    const map = buildBoneMap(layers);
    expect(map.size).toBe(0);
  });
});

describe("computeBoneWorldTransforms", () => {
  it("ルートボーンのワールド行列 = ローカル行列", () => {
    const root = createBone({ x: 10, y: 20 });
    const layers: LayerNode[] = [root];
    const worlds = computeBoneWorldTransforms(layers);
    const local = computeBoneLocalTransform(root);
    expect(worlds.get(root.id)).toEqual(local);
  });

  it("親子チェーンの行列が正しく伝搬する", () => {
    const parent = createBone({ x: 100, y: 0 });
    const child = createBone({
      x: 50,
      y: 0,
      parentBoneId: parent.id,
    });
    const layers: LayerNode[] = [parent, child];
    const worlds = computeBoneWorldTransforms(layers);

    const childWorld = worlds.get(child.id)!;
    const [x, y] = transformPoint(childWorld, 0, 0);
    expect(x).toBeCloseTo(150);
    expect(y).toBeCloseTo(0);
  });

  it("3段階のチェーン", () => {
    const a = createBone({ x: 10, y: 0 });
    const b = createBone({ x: 20, y: 0, parentBoneId: a.id });
    const c = createBone({ x: 30, y: 0, parentBoneId: b.id });
    const layers: LayerNode[] = [a, b, c];
    const worlds = computeBoneWorldTransforms(layers);

    const cWorld = worlds.get(c.id)!;
    const [x] = transformPoint(cWorld, 0, 0);
    expect(x).toBeCloseTo(60); // 10 + 20 + 30
  });

  it("存在しない親IDは無視してルートとして扱う", () => {
    const orphan = createBone({
      x: 10,
      y: 0,
      parentBoneId: "nonexistent",
    });
    const layers: LayerNode[] = [orphan];
    const worlds = computeBoneWorldTransforms(layers);
    const local = computeBoneLocalTransform(orphan);
    expect(worlds.get(orphan.id)).toEqual(local);
  });

  it("回転する親の子は回転した座標系で配置される", () => {
    const parent = createBone({
      x: 0,
      y: 0,
      bone: { angle: Math.PI / 2, length: 50, scaleX: 1, scaleY: 1 },
    });
    const child = createBone({
      x: 10,
      y: 0,
      parentBoneId: parent.id,
    });
    const layers: LayerNode[] = [parent, child];
    const worlds = computeBoneWorldTransforms(layers);

    const childWorld = worlds.get(child.id)!;
    const [x, y] = transformPoint(childWorld, 0, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(10);
  });

  it("ボーンがない場合は空マップを返す", () => {
    const worlds = computeBoneWorldTransforms([]);
    expect(worlds.size).toBe(0);
  });
});
