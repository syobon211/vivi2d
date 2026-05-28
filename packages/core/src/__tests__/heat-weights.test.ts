
import { describe, expect, it } from "vitest";
import {
  type BoneHandle,
  buildCotangentLaplacian,
  computeHeatWeights,
  conjugateGradient,
} from "../heat-weights";


function createSquareMesh() {
  const vertices = [
    0,
    0,
    100,
    0,
    0,
    100,
    100,
    100,
  ];
  const indices = [
    0,
    1,
    3,
    0,
    3,
    2,
  ];
  return { vertices, indices };
}

function createGridMesh(cols: number, rows: number, size = 100) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const dx = size / (cols - 1);
  const dy = size / (rows - 1);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      vertices.push(c * dx, r * dy);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = r * cols + c;
      const tr = tl + 1;
      const bl = tl + cols;
      const br = bl + 1;
      indices.push(tl, tr, br);
      indices.push(tl, br, bl);
    }
  }

  return { vertices, indices };
}

// ============================================================
// Cotangent Laplacian
// ============================================================

describe("buildCotangentLaplacian", () => {
  it("正方形メッシュで 4×4 の対称行列を生成する", () => {
    const { vertices, indices } = createSquareMesh();
    const L = buildCotangentLaplacian(vertices, indices);

    expect(L.n).toBe(4);
    expect(L.rowPointers).toHaveLength(5);
  });

  it("各行の合計がゼロになる（ラプラシアンの性質）", () => {
    const { vertices, indices } = createSquareMesh();
    const L = buildCotangentLaplacian(vertices, indices);

    for (let i = 0; i < L.n; i++) {
      let rowSum = 0;
      for (let k = L.rowPointers[i]!; k < L.rowPointers[i + 1]!; k++) {
        rowSum += L.values[k]!;
      }
      expect(Math.abs(rowSum)).toBeLessThan(1e-10);
    }
  });

  it("対角要素が非正（ラプラシアンの性質）", () => {
    const { vertices, indices } = createGridMesh(5, 5);
    const L = buildCotangentLaplacian(vertices, indices);

    for (let i = 0; i < L.n; i++) {
      for (let k = L.rowPointers[i]!; k < L.rowPointers[i + 1]!; k++) {
        if (L.colIndices[k] === i) {
          expect(L.values[k]!).toBeLessThanOrEqual(1e-10);
        }
      }
    }
  });

  it("対称性を持つ（L_ij === L_ji）", () => {
    const { vertices, indices } = createGridMesh(4, 4);
    const L = buildCotangentLaplacian(vertices, indices);

    const dense: number[][] = Array.from({ length: L.n }, () => new Array(L.n).fill(0));
    for (let i = 0; i < L.n; i++) {
      for (let k = L.rowPointers[i]!; k < L.rowPointers[i + 1]!; k++) {
        dense[i]![L.colIndices[k]!] = L.values[k]!;
      }
    }
    for (let i = 0; i < L.n; i++) {
      for (let j = i + 1; j < L.n; j++) {
        expect(Math.abs(dense[i]![j]! - dense[j]![i]!)).toBeLessThan(1e-10);
      }
    }
  });
});


describe("conjugateGradient", () => {
  it("単位行列で恒等解を返す", () => {
    const n = 4;
    const values = [1, 1, 1, 1];
    const colIndices = [0, 1, 2, 3];
    const rowPointers = [0, 1, 2, 3, 4];
    const A = { n, values, colIndices, rowPointers };
    const b = [1, 2, 3, 4];

    const x = conjugateGradient(A, b);
    for (let i = 0; i < n; i++) {
      expect(x[i]).toBeCloseTo(b[i]!, 6);
    }
  });

  it("対称正定値行列で正確な解を返す", () => {
    // A = [[4, 1], [1, 3]], b = [1, 2]
    const A = {
      n: 2,
      values: [4, 1, 1, 3],
      colIndices: [0, 1, 0, 1],
      rowPointers: [0, 2, 4],
    };
    const b = [1, 2];

    const x = conjugateGradient(A, b);
    expect(x[0]).toBeCloseTo(1 / 11, 6);
    expect(x[1]).toBeCloseTo(7 / 11, 6);
  });
});


describe("computeHeatWeights", () => {
  it("空のメッシュでは空のウェイト配列を返す", () => {
    const result = computeHeatWeights([], [], []);
    expect(result).toEqual([]);
  });

  it("ボーンなしでは空のウェイト配列を返す", () => {
    const { vertices, indices } = createSquareMesh();
    const result = computeHeatWeights(vertices, indices, []);
    expect(result).toHaveLength(4);
    for (const w of result) {
      expect(w).toEqual([]);
    }
  });

  it("ボーン1本では全頂点がそのボーンに 100%", () => {
    const { vertices, indices } = createSquareMesh();
    const bones: BoneHandle[] = [{ id: "b1", x: 50, y: 50, parentId: null }];

    const result = computeHeatWeights(vertices, indices, bones);
    expect(result).toHaveLength(4);
    for (const vw of result) {
      expect(vw).toHaveLength(1);
      expect(vw[0]!.boneId).toBe("b1");
      expect(vw[0]!.weight).toBeCloseTo(1.0, 4);
    }
  });

  it("各頂点のウェイト合計が 1.0（パーティション・オブ・ユニティ）", () => {
    const { vertices, indices } = createGridMesh(5, 5);
    const bones: BoneHandle[] = [
      { id: "b1", x: 10, y: 10, parentId: null },
      { id: "b2", x: 90, y: 90, parentId: null },
    ];

    const result = computeHeatWeights(vertices, indices, bones);
    expect(result).toHaveLength(25);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 4);
    }
  });

  it("各ウェイトが非負", () => {
    const { vertices, indices } = createGridMesh(6, 6);
    const bones: BoneHandle[] = [
      { id: "b1", x: 10, y: 50, parentId: null },
      { id: "b2", x: 90, y: 50, parentId: null },
    ];

    const result = computeHeatWeights(vertices, indices, bones);
    for (const vw of result) {
      for (const w of vw) {
        expect(w.weight).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("近いボーンのウェイトが大きい（局所性）", () => {
    const { vertices, indices } = createGridMesh(10, 10, 100);
    const bones: BoneHandle[] = [
      { id: "left", x: 0, y: 50, parentId: null },
      { id: "right", x: 100, y: 50, parentId: null },
    ];

    const result = computeHeatWeights(vertices, indices, bones);

    const leftVertex = result[50]!;
    const leftWeight = leftVertex.find((w) => w.boneId === "left")?.weight ?? 0;
    const rightWeight = leftVertex.find((w) => w.boneId === "right")?.weight ?? 0;
    expect(leftWeight).toBeGreaterThan(rightWeight);

    const rightVertex = result[59]!;
    const rightW = rightVertex.find((w) => w.boneId === "right")?.weight ?? 0;
    const leftW = rightVertex.find((w) => w.boneId === "left")?.weight ?? 0;
    expect(rightW).toBeGreaterThan(leftW);
  });

  it("中央の頂点では両ボーンのウェイトがほぼ均等", () => {
    const { vertices, indices } = createGridMesh(11, 11, 100);
    const bones: BoneHandle[] = [
      { id: "left", x: 0, y: 50, parentId: null },
      { id: "right", x: 100, y: 50, parentId: null },
    ];

    const result = computeHeatWeights(vertices, indices, bones);

    const centerVertex = result[60]!;
    const leftW = centerVertex.find((w) => w.boneId === "left")?.weight ?? 0;
    const rightW = centerVertex.find((w) => w.boneId === "right")?.weight ?? 0;
    expect(Math.abs(leftW - rightW)).toBeLessThan(0.1);
  });

  it("ボーンセグメント（親子関係あり）で正しく距離計算される", () => {
    const { vertices, indices } = createGridMesh(10, 10, 100);
    const bones: BoneHandle[] = [
      { id: "parent", x: 0, y: 50, parentId: null },
      { id: "child", x: 50, y: 50, parentId: "parent" },
    ];

    const result = computeHeatWeights(vertices, indices, bones);
    expect(result).toHaveLength(100);

    for (const vw of result) {
      expect(vw.length).toBeGreaterThan(0);
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 4);
    }
  });

  it("smoothPasses=0 でも正しく動作する", () => {
    const { vertices, indices } = createSquareMesh();
    const bones: BoneHandle[] = [{ id: "b1", x: 50, y: 50, parentId: null }];

    const result = computeHeatWeights(vertices, indices, bones, { smoothPasses: 0 });
    expect(result).toHaveLength(4);
    for (const vw of result) {
      expect(vw[0]!.weight).toBeCloseTo(1.0, 4);
    }
  });

  it("距離法よりメッシュ形状を考慮したウェイトを生成する", () => {
    //
    //   0--1--2
    //   |  |  |
    //   3--4--5
    //      |  |
    //      6--7
    //      |  |
    //      8--9
    //
    const vertices = [
      0,
      0, // 0
      25,
      0, // 1
      50,
      0, // 2
      0,
      25, // 3
      25,
      25, // 4
      50,
      25, // 5
      25,
      50, // 6
      50,
      50, // 7
      25,
      75, // 8
      50,
      75, // 9
    ];
    const indices = [
      0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 4, 5, 7, 4, 7, 6, 6, 7, 9, 6, 9, 8,
    ];
    const bones: BoneHandle[] = [
      { id: "A", x: 0, y: 0, parentId: null },
      { id: "B", x: 50, y: 75, parentId: null },
    ];

    const result = computeHeatWeights(vertices, indices, bones);

    const v0 = result[0]!;
    const wA = v0.find((w) => w.boneId === "A")?.weight ?? 0;
    const wB = v0.find((w) => w.boneId === "B")?.weight ?? 0;
    expect(wA).toBeGreaterThan(wB);

    const v9 = result[9]!;
    const wA9 = v9.find((w) => w.boneId === "A")?.weight ?? 0;
    const wB9 = v9.find((w) => w.boneId === "B")?.weight ?? 0;
    expect(wB9).toBeGreaterThan(wA9);
  });

  it("全ウェイトが閾値以下の頂点はフォールバック（最近ボーン100%）", () => {
    const { vertices, indices } = createSquareMesh();
    const bones: BoneHandle[] = [
      { id: "b1", x: 50, y: 50, parentId: null },
      { id: "b2", x: 150, y: 150, parentId: null },
    ];

    const result = computeHeatWeights(vertices, indices, bones, {
      weightThreshold: 1.0,
      smoothPasses: 0,
    });
    for (const vw of result) {
      expect(vw).toHaveLength(1);
      expect(vw[0]!.weight).toBeCloseTo(1.0, 4);
    }
  });

  it("隣接のない孤立頂点でもクラッシュしない", () => {
    const vertices = [0, 0, 100, 0, 50, 100, 200, 200];
    const indices = [0, 1, 2];
    const bones: BoneHandle[] = [{ id: "b1", x: 50, y: 50, parentId: null }];

    const result = computeHeatWeights(vertices, indices, bones, { smoothPasses: 2 });
    expect(result).toHaveLength(4);
    expect(result[3]!.length).toBeGreaterThan(0);
  });

  it("3本以上のボーンでも正しく動作する", () => {
    const { vertices, indices } = createGridMesh(8, 8, 100);
    const bones: BoneHandle[] = [
      { id: "head", x: 50, y: 10, parentId: null },
      { id: "body", x: 50, y: 50, parentId: null },
      { id: "armL", x: 10, y: 40, parentId: "body" },
      { id: "armR", x: 90, y: 40, parentId: "body" },
    ];

    const result = computeHeatWeights(vertices, indices, bones);
    expect(result).toHaveLength(64);

    for (const vw of result) {
      expect(vw.length).toBeGreaterThan(0);
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 4);
    }
  });


  it("親子階層ボーンでウェイトが正常に計算される", () => {
    const { vertices, indices } = createGridMesh(8, 8, 100);
    const bonesWithParent: BoneHandle[] = [
      { id: "body", x: 50, y: 80, parentId: null },
      { id: "head", x: 50, y: 20, parentId: "body" },
    ];

    const result = computeHeatWeights(vertices, indices, bonesWithParent);
    expect(result).toHaveLength(64);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 4);
    }

    const bonesWithoutParent: BoneHandle[] = [
      { id: "body", x: 50, y: 80, parentId: null },
      { id: "head", x: 50, y: 20, parentId: null },
    ];
    const resultNoParent = computeHeatWeights(vertices, indices, bonesWithoutParent);

    let hasDifference = false;
    for (let i = 0; i < result.length; i++) {
      const w1 = result[i]!.find((w) => w.boneId === "head")?.weight ?? 0;
      const w2 = resultNoParent[i]!.find((w) => w.boneId === "head")?.weight ?? 0;
      if (Math.abs(w1 - w2) > 0.01) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);
  });

  it("3段階層（body→head→eye）でウェイトが正常に計算される", () => {
    const { vertices, indices } = createGridMesh(8, 8, 100);
    const bones: BoneHandle[] = [
      { id: "body", x: 50, y: 90, parentId: null },
      { id: "head", x: 50, y: 50, parentId: "body" },
      { id: "eye", x: 50, y: 10, parentId: "head" },
    ];

    const result = computeHeatWeights(vertices, indices, bones);
    expect(result).toHaveLength(64);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 4);
      for (const w of vw) {
        expect(w.weight).toBeGreaterThanOrEqual(0);
        expect(w.weight).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it("parentIdが無効な場合でもクラッシュしない（ポイントとして扱われる）", () => {
    const { vertices, indices } = createGridMesh(6, 6, 100);
    const bones: BoneHandle[] = [
      { id: "a", x: 25, y: 50, parentId: null },
      { id: "b", x: 75, y: 50, parentId: "nonexistent" },
    ];

    const result = computeHeatWeights(vertices, indices, bones);
    expect(result).toHaveLength(36);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 3);
    }
  });

  it("親と子が同じ位置のボーンはポイントとして扱われる", () => {
    const { vertices, indices } = createGridMesh(6, 6, 100);
    const bones: BoneHandle[] = [
      { id: "parent", x: 50, y: 50, parentId: null },
      { id: "child", x: 50, y: 50, parentId: "parent" },
    ];

    const result = computeHeatWeights(vertices, indices, bones);
    expect(result).toHaveLength(36);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 3);
    }
  });

  it("スター型階層で各方向にウェイトが分散する", () => {
    const { vertices, indices } = createGridMesh(10, 10, 100);
    const bones: BoneHandle[] = [
      { id: "center", x: 50, y: 50, parentId: null },
      { id: "top", x: 50, y: 5, parentId: "center" },
      { id: "bottom", x: 50, y: 95, parentId: "center" },
      { id: "left", x: 5, y: 50, parentId: "center" },
      { id: "right", x: 95, y: 50, parentId: "center" },
    ];

    const result = computeHeatWeights(vertices, indices, bones);
    expect(result).toHaveLength(100);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 3);
    }

    const topLeft = result[0]!;
    const topW = topLeft.find((w) => w.boneId === "top")?.weight ?? 0;
    const leftW = topLeft.find((w) => w.boneId === "left")?.weight ?? 0;
    const bottomW = topLeft.find((w) => w.boneId === "bottom")?.weight ?? 0;
    const rightW = topLeft.find((w) => w.boneId === "right")?.weight ?? 0;
    expect(topW + leftW).toBeGreaterThan(bottomW + rightW);
  });
});
