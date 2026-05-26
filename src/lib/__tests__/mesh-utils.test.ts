import { generateGridMesh, meshDataToTypedArrays } from "@vivi2d/core/mesh-utils";
import { describe, expect, it } from "vitest";

describe("generateGridMesh", () => {
  it("1x1 分割で 4 頂点・2 三角形を生成する", () => {
    const mesh = generateGridMesh(100, 80, 1, 1);

    expect(mesh.divisionsX).toBe(1);
    expect(mesh.divisionsY).toBe(1);
    expect(mesh.vertices.length).toBe(4 * 2);
    expect(mesh.uvs.length).toBe(4 * 2);
    expect(mesh.indices.length).toBe(6);
  });

  it("3x3 分割で 16 頂点・18 三角形を生成する", () => {
    const mesh = generateGridMesh(200, 150, 3, 3);

    expect(mesh.divisionsX).toBe(3);
    expect(mesh.divisionsY).toBe(3);
    expect(mesh.vertices.length).toBe(16 * 2);
    expect(mesh.uvs.length).toBe(16 * 2);
    expect(mesh.indices.length).toBe(54);
  });

  it("頂点座標が 0 から width/height の範囲に収まる", () => {
    const mesh = generateGridMesh(200, 100, 2, 2);

    for (let i = 0; i < mesh.vertices.length; i += 2) {
      expect(mesh.vertices[i]).toBeGreaterThanOrEqual(0);
      expect(mesh.vertices[i]).toBeLessThanOrEqual(200);
      expect(mesh.vertices[i + 1]).toBeGreaterThanOrEqual(0);
      expect(mesh.vertices[i + 1]).toBeLessThanOrEqual(100);
    }
  });

  it("UV 座標が 0..1 の範囲に収まる", () => {
    const mesh = generateGridMesh(100, 100, 4, 3);

    for (let i = 0; i < mesh.uvs.length; i++) {
      expect(mesh.uvs[i]).toBeGreaterThanOrEqual(0);
      expect(mesh.uvs[i]).toBeLessThanOrEqual(1);
    }
  });

  it("四隅の頂点とUVが正確に配置される", () => {
    const mesh = generateGridMesh(200, 100, 2, 2);
    const cols = 3; // divisionsX + 1

    expect(mesh.vertices[0]).toBe(0);
    expect(mesh.vertices[1]).toBe(0);
    expect(mesh.uvs[0]).toBe(0);
    expect(mesh.uvs[1]).toBe(0);

    expect(mesh.vertices[(cols - 1) * 2]).toBe(200);
    expect(mesh.vertices[(cols - 1) * 2 + 1]).toBe(0);
    expect(mesh.uvs[(cols - 1) * 2]).toBe(1);
    expect(mesh.uvs[(cols - 1) * 2 + 1]).toBe(0);

    const blIdx = cols * 2 * 2; // row=2, col=0
    expect(mesh.vertices[blIdx]).toBe(0);
    expect(mesh.vertices[blIdx + 1]).toBe(100);
    expect(mesh.uvs[blIdx]).toBe(0);
    expect(mesh.uvs[blIdx + 1]).toBe(1);

    const brIdx = (cols * 2 + cols - 1) * 2;
    expect(mesh.vertices[brIdx]).toBe(200);
    expect(mesh.vertices[brIdx + 1]).toBe(100);
    expect(mesh.uvs[brIdx]).toBe(1);
    expect(mesh.uvs[brIdx + 1]).toBe(1);
  });

  it("インデックスが頂点数の範囲内に収まる", () => {
    const mesh = generateGridMesh(100, 100, 5, 4);
    const vertCount = mesh.vertices.length / 2;

    for (const idx of mesh.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertCount);
    }
  });

  it("分割数 0 以下は 1 にクランプされる", () => {
    const mesh = generateGridMesh(100, 100, 0, -1);

    expect(mesh.divisionsX).toBe(1);
    expect(mesh.divisionsY).toBe(1);
    expect(mesh.vertices.length).toBe(4 * 2);
  });

  it("非整数の分割数は丸められる", () => {
    const mesh = generateGridMesh(100, 100, 2.7, 3.2);

    expect(mesh.divisionsX).toBe(3);
    expect(mesh.divisionsY).toBe(3);
  });

  it("大きなグリッド (10x10) で正しい頂点数と三角形数を生成する", () => {
    const mesh = generateGridMesh(500, 500, 10, 10);

    expect(mesh.divisionsX).toBe(10);
    expect(mesh.divisionsY).toBe(10);
    expect(mesh.vertices.length).toBe(121 * 2);
    expect(mesh.indices.length).toBe(600);
  });

  it("非対称分割 (1x5) で正しい頂点数を生成する", () => {
    const mesh = generateGridMesh(200, 100, 1, 5);

    expect(mesh.vertices.length).toBe(12 * 2);
    expect(mesh.indices.length).toBe(30);
  });

  it("幅 0 のメッシュでも安全に生成される", () => {
    const mesh = generateGridMesh(0, 100, 2, 2);

    for (let i = 0; i < mesh.vertices.length; i += 2) {
      expect(mesh.vertices[i]).toBe(0);
    }
    for (let i = 0; i < mesh.uvs.length; i += 2) {
      expect(mesh.uvs[i]).toBeGreaterThanOrEqual(0);
      expect(mesh.uvs[i]).toBeLessThanOrEqual(1);
    }
  });

  it("三角形の面積が正（退化三角形がない）", () => {
    const mesh = generateGridMesh(100, 100, 2, 2);
    const { vertices, indices } = mesh;

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];

      const ax = vertices[a! * 2]!;
      const ay = vertices[a! * 2 + 1]!;
      const bx = vertices[b! * 2]!;
      const by = vertices[b! * 2 + 1]!;
      const cx = vertices[c! * 2]!;
      const cy = vertices[c! * 2 + 1]!;

      const crossProduct = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
      expect(crossProduct).toBeGreaterThan(0);
    }
  });

  it("中間頂点の座標が等間隔に配置される", () => {
    const mesh = generateGridMesh(300, 200, 3, 2);

    const cols = 4; // divisionsX + 1
    expect(mesh.vertices[(1 * cols + 0) * 2]).toBeCloseTo(0);
    expect(mesh.vertices[(1 * cols + 1) * 2]).toBeCloseTo(100);
    expect(mesh.vertices[(1 * cols + 2) * 2]).toBeCloseTo(200);
    expect(mesh.vertices[(1 * cols + 3) * 2]).toBeCloseTo(300);

    expect(mesh.vertices[(1 * cols + 0) * 2 + 1]).toBeCloseTo(100);
  });
});

describe("meshDataToTypedArrays", () => {
  it("number[] を正しい TypedArray に変換する", () => {
    const mesh = generateGridMesh(100, 100, 1, 1);
    const typed = meshDataToTypedArrays(mesh);

    expect(typed.vertices).toBeInstanceOf(Float32Array);
    expect(typed.uvs).toBeInstanceOf(Float32Array);
    expect(typed.indices).toBeInstanceOf(Uint32Array);
    expect(typed.vertices.length).toBe(mesh.vertices.length);
    expect(typed.uvs.length).toBe(mesh.uvs.length);
    expect(typed.indices.length).toBe(mesh.indices.length);
  });

  it("値が正確に保持される", () => {
    const mesh = generateGridMesh(50, 30, 2, 2);
    const typed = meshDataToTypedArrays(mesh);

    for (let i = 0; i < mesh.vertices.length; i++) {
      expect(typed.vertices[i]).toBeCloseTo(mesh.vertices[i]!);
    }
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(typed.indices[i]).toBe(mesh.indices[i]);
    }
  });
});
