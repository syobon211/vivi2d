
import { describe, expect, it } from "vitest";
import {
  type BoneHandle,
  buildBiharmonicMatrix,
  buildLumpedMass,
  computeBBWWeights,
} from "../bbw-weights";
import { buildCotangentLaplacian } from "../heat-weights";
import { computeDistanceWeights } from "../skin-utils";


function createSquareMesh() {
  return {
    vertices: [0, 0, 100, 0, 0, 100, 100, 100],
    indices: [0, 1, 3, 0, 3, 2],
  };
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
// Lumped Mass Matrix
// ============================================================

describe("buildLumpedMass", () => {
  it("全要素が非負", () => {
    const { vertices, indices } = createGridMesh(5, 5);
    const M = buildLumpedMass(vertices, indices);
    for (const m of M) expect(m).toBeGreaterThanOrEqual(0);
  });

  it("合計がメッシュの総面積に一致する", () => {
    const { vertices, indices } = createGridMesh(5, 5, 100);
    const M = buildLumpedMass(vertices, indices);
    const totalMass = M.reduce((s, m) => s + m, 0);
    expect(totalMass).toBeCloseTo(10000, 0);
  });
});

// ============================================================
// Biharmonic Matrix
// ============================================================

describe("buildBiharmonicMatrix", () => {
  it("対称行列を生成する", () => {
    const { vertices, indices } = createGridMesh(4, 4);
    const L = buildCotangentLaplacian(vertices, indices);
    const M = buildLumpedMass(vertices, indices);
    const B = buildBiharmonicMatrix(L, M);

    expect(B.rows).toBe(16);
    expect(B.cols).toBe(16);

    for (let i = 0; i < B.rows; i++) {
      for (let j = i + 1; j < B.cols; j++) {
        expect(Math.abs(B.data[j * B.rows + i]! - B.data[i * B.rows + j]!)).toBeLessThan(
          1e-8,
        );
      }
    }
  });

  it("半正定値（対角要素が非負）", () => {
    const { vertices, indices } = createGridMesh(5, 5);
    const L = buildCotangentLaplacian(vertices, indices);
    const M = buildLumpedMass(vertices, indices);
    const B = buildBiharmonicMatrix(L, M);

    for (let i = 0; i < B.rows; i++) {
      expect(B.data[i * B.rows + i]!).toBeGreaterThanOrEqual(-1e-10);
    }
  });
});


describe("computeBBWWeights", () => {
  it("空のメッシュでは空のウェイト配列を返す", () => {
    const result = computeBBWWeights([], [], []);
    expect(result).toEqual([]);
  });

  it("ボーン1本では全頂点がそのボーンに 100%", () => {
    const { vertices, indices } = createSquareMesh();
    const bones: BoneHandle[] = [{ id: "b1", x: 50, y: 50, parentId: null }];

    const result = computeBBWWeights(vertices, indices, bones);
    expect(result).toHaveLength(4);
    for (const vw of result) {
      expect(vw).toHaveLength(1);
      expect(vw[0]!.boneId).toBe("b1");
      expect(vw[0]!.weight).toBeCloseTo(1.0, 4);
    }
  });

  it("各頂点のウェイト合計が 1.0（パーティション・オブ・ユニティ）", () => {
    const { vertices, indices } = createGridMesh(6, 6);
    const bones: BoneHandle[] = [
      { id: "b1", x: 15, y: 50, parentId: null },
      { id: "b2", x: 85, y: 50, parentId: null },
    ];

    const result = computeBBWWeights(vertices, indices, bones);
    expect(result).toHaveLength(36);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 3);
    }
  });

  it("各ウェイトが非負（bounded constraint）", () => {
    const { vertices, indices } = createGridMesh(6, 6);
    const bones: BoneHandle[] = [
      { id: "b1", x: 10, y: 50, parentId: null },
      { id: "b2", x: 90, y: 50, parentId: null },
    ];

    const result = computeBBWWeights(vertices, indices, bones);
    for (const vw of result) {
      for (const w of vw) {
        expect(w.weight).toBeGreaterThanOrEqual(0);
        expect(w.weight).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it("制約頂点でのウェイトが正しく設定される", () => {
    const { vertices, indices } = createGridMesh(5, 5, 100);
    const bones: BoneHandle[] = [
      { id: "topLeft", x: 0, y: 0, parentId: null },
      { id: "bottomRight", x: 100, y: 100, parentId: null },
    ];

    const result = computeBBWWeights(vertices, indices, bones);

    const v0 = result[0]!;
    const wTL = v0.find((w) => w.boneId === "topLeft")?.weight ?? 0;
    const wBR = v0.find((w) => w.boneId === "bottomRight")?.weight ?? 0;
    expect(wTL).toBeGreaterThan(wBR);

    const v24 = result[24]!;
    const wTL24 = v24.find((w) => w.boneId === "topLeft")?.weight ?? 0;
    const wBR24 = v24.find((w) => w.boneId === "bottomRight")?.weight ?? 0;
    expect(wBR24).toBeGreaterThan(wTL24);
  });

  it("中央の頂点でウェイトがほぼ均等（対称配置）", () => {
    const { vertices, indices } = createGridMesh(11, 11, 100);
    const bones: BoneHandle[] = [
      { id: "left", x: 0, y: 50, parentId: null },
      { id: "right", x: 100, y: 50, parentId: null },
    ];

    const result = computeBBWWeights(vertices, indices, bones);

    const center = result[60]!;
    const leftW = center.find((w) => w.boneId === "left")?.weight ?? 0;
    const rightW = center.find((w) => w.boneId === "right")?.weight ?? 0;
    expect(Math.abs(leftW - rightW)).toBeLessThan(0.15);
  });

  it("3本以上のボーンでも正しく動作する", () => {
    const { vertices, indices } = createGridMesh(8, 8, 100);
    const bones: BoneHandle[] = [
      { id: "head", x: 50, y: 10, parentId: null },
      { id: "body", x: 50, y: 50, parentId: null },
      { id: "armL", x: 10, y: 40, parentId: "body" },
      { id: "armR", x: 90, y: 40, parentId: "body" },
    ];

    const result = computeBBWWeights(vertices, indices, bones);
    expect(result).toHaveLength(64);

    for (const vw of result) {
      expect(vw.length).toBeGreaterThan(0);
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
    }
  });

  it("BBWのバイハーモニックエネルギーが距離法より低い", () => {
    const { vertices, indices } = createGridMesh(8, 8, 100);
    const bones: BoneHandle[] = [
      { id: "b1", x: 15, y: 50, parentId: null },
      { id: "b2", x: 85, y: 50, parentId: null },
    ];

    const bbwWeights = computeBBWWeights(vertices, indices, bones);

    const distWeights = computeDistanceWeights(
      vertices,
      bones.map((b) => ({ id: b.id, x: b.x, y: b.y })),
    );

    const L = buildCotangentLaplacian(vertices, indices);
    const M = buildLumpedMass(vertices, indices);
    const B = buildBiharmonicMatrix(L, M);
    const n = vertices.length / 2;
    const m = bones.length;

    function computeEnergy(weights: { boneId: string; weight: number }[][]): number {
      let energy = 0;
      for (let bi = 0; bi < m; bi++) {
        const w = new Array<number>(n).fill(0);
        for (let vi = 0; vi < n; vi++) {
          const sw = weights[vi]!.find((x) => x.boneId === bones[bi]!.id);
          w[vi] = sw?.weight ?? 0;
        }
        // w^T B w
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            energy += 0.5 * w[i]! * B.data[j * B.rows + i]! * w[j]!;
          }
        }
      }
      return energy;
    }

    const bbwEnergy = computeEnergy(bbwWeights);
    const distEnergy = computeEnergy(distWeights);

    expect(bbwEnergy).toBeLessThan(distEnergy);
  });

  it("全ウェイトが閾値以下の頂点はフォールバック（最近ボーン100%）", () => {
    const { vertices, indices } = createGridMesh(4, 4, 100);
    const bones: BoneHandle[] = [
      { id: "b1", x: 25, y: 25, parentId: null },
      { id: "b2", x: 75, y: 75, parentId: null },
    ];

    const result = computeBBWWeights(vertices, indices, bones, { weightThreshold: 0.99 });
    for (const vw of result) {
      expect(vw.length).toBeGreaterThan(0);
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 4);
    }
  });

  it("退化三角形（面積ゼロ）を含むメッシュでクラッシュしない", () => {
    const vertices = [0, 0, 50, 0, 100, 0, 50, 50];
    const indices = [0, 1, 2, 0, 2, 3];
    const bones: BoneHandle[] = [{ id: "b1", x: 50, y: 25, parentId: null }];

    const result = computeBBWWeights(vertices, indices, bones);
    expect(result).toHaveLength(4);
  });

  it("maxIterations=1 でも結果を返す（早期終了）", () => {
    const { vertices, indices } = createGridMesh(4, 4);
    const bones: BoneHandle[] = [
      { id: "b1", x: 10, y: 50, parentId: null },
      { id: "b2", x: 90, y: 50, parentId: null },
    ];

    const result = computeBBWWeights(vertices, indices, bones, { maxIterations: 1 });
    expect(result).toHaveLength(16);
    for (const vw of result) {
      expect(vw.length).toBeGreaterThan(0);
    }
  });

  it("バイハーモニックエネルギーの滑らかさ: 隣接頂点のウェイト差が小さい", () => {
    const cols = 10;
    const { vertices, indices } = createGridMesh(cols, cols, 100);
    const bones: BoneHandle[] = [
      { id: "left", x: 5, y: 50, parentId: null },
      { id: "right", x: 95, y: 50, parentId: null },
    ];

    const result = computeBBWWeights(vertices, indices, bones);

    let maxDiff = 0;
    for (let c = 0; c < cols - 1; c++) {
      const vi1 = 5 * cols + c;
      const vi2 = 5 * cols + c + 1;
      const w1 = result[vi1]!.find((w) => w.boneId === "left")?.weight ?? 0;
      const w2 = result[vi2]!.find((w) => w.boneId === "left")?.weight ?? 0;
      maxDiff = Math.max(maxDiff, Math.abs(w1 - w2));
    }
    expect(maxDiff).toBeLessThan(0.25);
  });


  it("親子階層ボーン（parentId付き）でウェイトが正常に計算される", () => {
    const cols = 8;
    const rows = 8;
    const size = 100;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        vertices.push((c / (cols - 1)) * size, (r / (rows - 1)) * size);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = r * cols + c;
        indices.push(tl, tl + 1, tl + cols + 1, tl, tl + cols + 1, tl + cols);
      }
    }

    const bones: BoneHandle[] = [
      { id: "body", x: 50, y: 80, parentId: null },
      { id: "head", x: 50, y: 20, parentId: "body" },
    ];

    const result = computeBBWWeights(vertices, indices, bones);
    expect(result).toHaveLength(64);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
    }
  });

  it("3段階層ボーン（body→head→eye）でウェイト合計が1.0", () => {
    const cols = 6;
    const rows = 6;
    const size = 100;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        vertices.push((c / (cols - 1)) * size, (r / (rows - 1)) * size);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = r * cols + c;
        indices.push(tl, tl + 1, tl + cols + 1, tl, tl + cols + 1, tl + cols);
      }
    }

    const bones: BoneHandle[] = [
      { id: "body", x: 50, y: 90, parentId: null },
      { id: "head", x: 50, y: 50, parentId: "body" },
      { id: "eye", x: 50, y: 10, parentId: "head" },
    ];

    const result = computeBBWWeights(vertices, indices, bones);
    expect(result).toHaveLength(36);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
      for (const w of vw) {
        expect(w.weight).toBeGreaterThanOrEqual(0);
        expect(w.weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it("スター型階層（1親+4子）でウェイトが正常に計算される", () => {
    const cols = 8;
    const rows = 8;
    const size = 100;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        vertices.push((c / (cols - 1)) * size, (r / (rows - 1)) * size);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = r * cols + c;
        indices.push(tl, tl + 1, tl + cols + 1, tl, tl + cols + 1, tl + cols);
      }
    }

    const bones: BoneHandle[] = [
      { id: "center", x: 50, y: 50, parentId: null },
      { id: "top", x: 50, y: 5, parentId: "center" },
      { id: "bottom", x: 50, y: 95, parentId: "center" },
      { id: "left", x: 5, y: 50, parentId: "center" },
      { id: "right", x: 95, y: 50, parentId: "center" },
    ];

    const result = computeBBWWeights(vertices, indices, bones);
    expect(result).toHaveLength(64);

    for (const vw of result) {
      expect(vw.length).toBeGreaterThan(0);
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
    }
  });

  it("全ボーンがparentId=nullでも正常に動作する", () => {
    const cols = 6;
    const rows = 6;
    const size = 100;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        vertices.push((c / (cols - 1)) * size, (r / (rows - 1)) * size);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = r * cols + c;
        indices.push(tl, tl + 1, tl + cols + 1, tl, tl + cols + 1, tl + cols);
      }
    }

    const bones: BoneHandle[] = [
      { id: "a", x: 25, y: 25, parentId: null },
      { id: "b", x: 75, y: 25, parentId: null },
      { id: "c", x: 50, y: 75, parentId: null },
    ];

    const result = computeBBWWeights(vertices, indices, bones);
    expect(result).toHaveLength(36);

    for (const vw of result) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
    }
  });
});
