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

  it("非対称3x2グリッドの全座標・UV・有効三角形を生成する", () => {
    const mesh = generateGridMesh(300, 200, 3, 2);
    expect(mesh.divisionsX).toBe(3);
    expect(mesh.divisionsY).toBe(2);
    expect(mesh.vertices).toEqual([
      0, 0, 100, 0, 200, 0, 300, 0, 0, 100, 100, 100, 200, 100, 300, 100, 0, 200, 100,
      200, 200, 200, 300, 200,
    ]);
    expect(mesh.uvs).toEqual([
      0,
      0,
      1 / 3,
      0,
      2 / 3,
      0,
      1,
      0,
      0,
      0.5,
      1 / 3,
      0.5,
      2 / 3,
      0.5,
      1,
      0.5,
      0,
      1,
      1 / 3,
      1,
      2 / 3,
      1,
      1,
      1,
    ]);
    expect(mesh.indices).toHaveLength(36);
    for (const index of mesh.indices) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(12);
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = mesh.indices.slice(i, i + 3);
      const ax = mesh.vertices[a! * 2]!,
        ay = mesh.vertices[a! * 2 + 1]!;
      const bx = mesh.vertices[b! * 2]!,
        by = mesh.vertices[b! * 2 + 1]!;
      const cx = mesh.vertices[c! * 2]!,
        cy = mesh.vertices[c! * 2 + 1]!;
      expect(Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay))).toBe(10_000);
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
    expect(Array.from(typed.vertices)).toEqual(mesh.vertices);
    expect(Array.from(typed.uvs)).toEqual(mesh.uvs);
    expect(Array.from(typed.indices)).toEqual(mesh.indices);
  });
});
