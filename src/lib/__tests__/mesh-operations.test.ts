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
    vertices: [0, 0, 100, 0, 100, 100, 0, 100],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 3, 1, 1, 3, 2],
    divisionsX: 0,
    divisionsY: 0,
  };
}

function createDiamondMesh(): MeshData {
  return {
    vertices: [50, 0, 100, 50, 50, 100, 0, 50, 50, 50],
    uvs: [0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5, 0.5, 0.5],
    indices: [0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0],
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
    const vertices = [25, 25, 75, 25, 75, 75, 25, 75];
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
  it("2頂点を重心にマージしUVと残存triangleを正確にremapする", () => {
    const result = mergeVertices(createSquareMesh(), [0, 1]);
    expect(result).not.toBeNull();
    expect(result!.vertices).toEqual([50, 0, 100, 100, 0, 100]);
    expect(result!.uvs).toEqual([0.5, 0, 1, 1, 0, 1]);
    expect(result!.indices).toEqual([0, 2, 1]);
    // Adjacent first/last vertices exercise another repeated-index position.
    const other = mergeVertices(createSquareMesh(), [0, 3]);
    expect(other).not.toBeNull();
    expect(other!.vertices).toEqual([0, 50, 100, 0, 100, 100]);
    expect(other!.indices).toEqual([1, 0, 2]);
  });
  it("選択頂点が2未満なら null を返す", () => {
    const mesh = createSquareMesh();
    expect(mergeVertices(mesh, [0])).toBeNull();
    expect(mergeVertices(mesh, [])).toBeNull();
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
});

// ============================================================
// mirrorMesh
// ============================================================
describe("mirrorMesh", () => {
  it("X軸ミラーは座標・UV・windingを反転し入力を変えない", () => {
    const mesh = createSquareMesh();
    const original = createSquareMesh();
    const result = mirrorMesh(mesh, "x", 100, 100);
    expect(result.vertices).toEqual([100, 0, 0, 0, 0, 100, 100, 100]);
    expect(result.uvs).toEqual([1, 0, 0, 0, 0, 1, 1, 1]);
    expect(result.indices).toEqual([0, 1, 3, 1, 2, 3]);
    expect(mesh).toEqual(original);
  });
  it("Y軸ミラーで頂点のY座標が反転する", () => {
    const mesh = createSquareMesh();
    const result = mirrorMesh(mesh, "y", 100, 100);

    expect(result.vertices[0]).toBe(0);
    expect(result.vertices[1]).toBe(100);
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
});

// ============================================================
// retriangulateMesh
// ============================================================
describe("retriangulateMesh", () => {
  it("再三角分割は頂点・UVを保持し正方形に2triangleを生成する", () => {
    const mesh = createSquareMesh();
    mesh.indices = [];
    const result = retriangulateMesh(mesh, 100, 100);
    expect(result.vertices).toEqual(mesh.vertices);
    expect(result.uvs).toEqual(mesh.uvs);
    expect(result.indices).toHaveLength(6);
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
    mesh.indices = [];
    const result = retriangulateMesh(mesh, 100, 100);
    expect(result.indices).toHaveLength(12);
    expect(result.indices).toContain(4);
    expect(result.vertices.length).toBe(mesh.vertices.length);
    for (const idx of result.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(5);
    }
  });
});
