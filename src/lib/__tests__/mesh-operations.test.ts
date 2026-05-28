import {
  mergeVertices,
  mirrorMesh,
  retriangulateMesh,
  selectVerticesInPolygon,
} from "@vivi2d/core/mesh-operations";
import type { MeshData } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

function createSquareMesh(): MeshData {
  return {
    vertices: [
      0,
      0,
      100,
      0,
      100,
      100,
      0,
      100,
    ],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [
      0,
      3,
      1,
      1,
      3,
      2,
    ],
    divisionsX: 0,
    divisionsY: 0,
  };
}

function createDiamondMesh(): MeshData {
  return {
    vertices: [
      50,
      0,
      100,
      50,
      50,
      100,
      0,
      50,
      50,
      50,
    ],
    uvs: [0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5, 0.5, 0.5],
    indices: [
      0,
      4,
      1,
      1,
      4,
      2,
      2,
      4,
      3,
      3,
      4,
      0,
    ],
    divisionsX: 0,
    divisionsY: 0,
  };
}

// ============================================================
// selectVerticesInPolygon
// ============================================================
describe("selectVerticesInPolygon", () => {
  it("ポリゴン内の頂点インデックスを返す", () => {
    const vertices = [10, 10, 50, 50, 90, 90, 150, 150];
    const polygon = [0, 0, 100, 0, 100, 100, 0, 100];

    const result = selectVerticesInPolygon(vertices, polygon);
    expect(result).toEqual([0, 1, 2]);
    expect(result).not.toContain(3);
  });

  it("ポリゴンが3点未満なら空配列", () => {
    const vertices = [10, 10];
    const polygon = [0, 0, 100, 0];

    expect(selectVerticesInPolygon(vertices, polygon)).toEqual([]);
  });

  it("ポリゴン外の頂点は含まない", () => {
    const vertices = [200, 200, 300, 300];
    const polygon = [0, 0, 100, 0, 100, 100, 0, 100];

    expect(selectVerticesInPolygon(vertices, polygon)).toEqual([]);
  });

  it("凹ポリゴン（L字型）で正しく判定する", () => {
    const polygon = [0, 0, 100, 0, 100, 50, 50, 50, 50, 100, 0, 100];
    const vertices = [
      25,
      25,
      75,
      25,
      75,
      75,
      25,
      75,
    ];
    const result = selectVerticesInPolygon(vertices, polygon);
    expect(result).toContain(0); // (25,25)
    expect(result).toContain(1); // (75,25)
    expect(result).not.toContain(2);
    expect(result).toContain(3); // (25,75)
  });

  it("頂点が空なら空配列を返す", () => {
    const polygon = [0, 0, 100, 0, 100, 100, 0, 100];
    expect(selectVerticesInPolygon([], polygon)).toEqual([]);
  });
});

// ============================================================
// mergeVertices
// ============================================================
describe("mergeVertices", () => {
  it("2頂点を重心にマージする", () => {
    const mesh = createSquareMesh();
    const result = mergeVertices(mesh, [0, 1]);
    expect(result).not.toBeNull();
    expect(result!.vertices.length / 2).toBe(3);
    expect(result!.vertices[0]).toBe(50);
    expect(result!.vertices[1]).toBe(0);
  });

  it("選択頂点が2未満なら null を返す", () => {
    const mesh = createSquareMesh();
    expect(mergeVertices(mesh, [0])).toBeNull();
    expect(mergeVertices(mesh, [])).toBeNull();
  });

  it("退化三角形が除去される", () => {
    const mesh = createSquareMesh();
    const result = mergeVertices(mesh, [0, 3]);
    expect(result).not.toBeNull();
    for (let i = 0; i < result!.indices.length; i += 3) {
      const a = result!.indices[i];
      const b = result!.indices[i + 1];
      const c = result!.indices[i + 2];
      expect(a !== b || b !== c).toBe(true);
    }
  });

  it("UV も正しくマージされる", () => {
    const mesh = createSquareMesh();
    const result = mergeVertices(mesh, [0, 1]);
    expect(result).not.toBeNull();
    expect(result!.uvs[0]).toBeCloseTo(0.5);
    expect(result!.uvs[1]).toBeCloseTo(0);
  });

  it("中央頂点と周辺頂点をマージできる", () => {
    const mesh = createDiamondMesh();
    const result = mergeVertices(mesh, [0, 4]);
    expect(result).not.toBeNull();
    expect(result!.vertices.length / 2).toBe(4);
  });

  it("全頂点をマージすると1頂点になる", () => {
    const mesh = createSquareMesh();
    const result = mergeVertices(mesh, [0, 1, 2, 3]);
    expect(result).not.toBeNull();
    expect(result!.vertices.length / 2).toBe(1);
    expect(result!.vertices[0]).toBe(50);
    expect(result!.vertices[1]).toBe(50);
    expect(result!.indices).toHaveLength(0);
  });

  it("3頂点マージで重心が正しく計算される", () => {
    const mesh = createSquareMesh();
    const result = mergeVertices(mesh, [0, 1, 2]);
    expect(result).not.toBeNull();
    expect(result!.vertices[0]).toBeCloseTo(200 / 3);
    expect(result!.vertices[1]).toBeCloseTo(100 / 3);
  });

  it("インデックスのリマッピングが正しい", () => {
    const mesh = createSquareMesh();
    const result = mergeVertices(mesh, [0, 1]);
    expect(result).not.toBeNull();
    const vertCount = result!.vertices.length / 2;
    for (const idx of result!.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertCount);
    }
  });
});

// ============================================================
// mirrorMesh
// ============================================================
describe("mirrorMesh", () => {
  it("X軸ミラーで頂点のX座標が反転する", () => {
    const mesh = createSquareMesh();
    const result = mirrorMesh(mesh, "x", 100, 100);

    expect(result.vertices[0]).toBe(100); // v0.x
    expect(result.vertices[1]).toBe(0); // v0.y
    expect(result.vertices[2]).toBe(0); // v1.x
    expect(result.vertices[3]).toBe(0); // v1.y
  });

  it("Y軸ミラーで頂点のY座標が反転する", () => {
    const mesh = createSquareMesh();
    const result = mirrorMesh(mesh, "y", 100, 100);

    expect(result.vertices[0]).toBe(0);
    expect(result.vertices[1]).toBe(100);
  });

  it("X軸ミラーでUVのU座標が反転する", () => {
    const mesh = createSquareMesh();
    const result = mirrorMesh(mesh, "x", 100, 100);

    expect(result.uvs[0]).toBe(1);
    expect(result.uvs[1]).toBe(0);
  });

  it("ワインディングオーダーが反転する", () => {
    const mesh = createSquareMesh();
    const result = mirrorMesh(mesh, "x", 100, 100);

    expect(result.indices[0]).toBe(0);
    expect(result.indices[1]).toBe(1);
    expect(result.indices[2]).toBe(3);
  });

  it("2回ミラーすると元に戻る", () => {
    const mesh = createSquareMesh();
    const mirrored = mirrorMesh(mesh, "x", 100, 100);
    const restored = mirrorMesh(mirrored, "x", 100, 100);

    for (let i = 0; i < mesh.vertices.length; i++) {
      expect(restored.vertices[i]).toBeCloseTo(mesh.vertices[i]!);
    }
    for (let i = 0; i < mesh.uvs.length; i++) {
      expect(restored.uvs[i]).toBeCloseTo(mesh.uvs[i]!);
    }
  });

  it("元のメッシュは変更されない（イミュータブル）", () => {
    const mesh = createSquareMesh();
    const origVerts = [...mesh.vertices];
    mirrorMesh(mesh, "x", 100, 100);
    expect(mesh.vertices).toEqual(origVerts);
  });
});

// ============================================================
// retriangulateMesh
// ============================================================
describe("retriangulateMesh", () => {
  it("頂点数は変わらない", () => {
    const mesh = createSquareMesh();
    const result = retriangulateMesh(mesh, 100, 100);
    expect(result.vertices.length).toBe(mesh.vertices.length);
  });

  it("UV は保持される", () => {
    const mesh = createSquareMesh();
    const result = retriangulateMesh(mesh, 100, 100);
    expect(result.uvs).toEqual(mesh.uvs);
  });

  it("三角形が生成される", () => {
    const mesh = createSquareMesh();
    const result = retriangulateMesh(mesh, 100, 100);
    expect(result.indices.length).toBeGreaterThan(0);
    expect(result.indices.length).toBe(6);
  });

  it("3頂点未満のメッシュは元のメッシュを返す", () => {
    const mesh: MeshData = {
      vertices: [0, 0, 100, 100],
      uvs: [0, 0, 1, 1],
      indices: [],
      divisionsX: 0,
      divisionsY: 0,
    };
    const result = retriangulateMesh(mesh, 100, 100);
    expect(result).toBe(mesh);
  });

  it("5頂点のダイヤモンドメッシュを再三角分割できる", () => {
    const mesh = createDiamondMesh();
    const result = retriangulateMesh(mesh, 100, 100);
    expect(result.vertices.length).toBe(mesh.vertices.length);
    for (const idx of result.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(5);
    }
  });
});
