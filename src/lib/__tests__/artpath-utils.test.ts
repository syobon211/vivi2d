import {
  artPathToMesh,
  buildStrokeMesh,
  tessellateArtPath,
  tessellateSegment,
} from "@vivi2d/core/artpath-utils";
import type { ArtPathControlPoint, ArtPathStyle } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

function makePoint(
  x: number,
  y: number,
  opts: Partial<ArtPathControlPoint> = {},
): ArtPathControlPoint {
  return {
    x,
    y,
    handleInX: 0,
    handleInY: 0,
    handleOutX: 0,
    handleOutY: 0,
    width: 1,
    opacity: 1,
    ...opts,
  };
}

const defaultStyle: ArtPathStyle = {
  color: 0x000000,
  baseWidth: 10,
  lineCap: "round",
  lineJoin: "round",
};

describe("tessellateSegment", () => {
  it("直線セグメントを正しく分割する", () => {
    const p0 = makePoint(0, 0);
    const p1 = makePoint(100, 0);
    const points = tessellateSegment(p0, p1, 4);
    expect(points).toHaveLength(5); // 0, 25, 50, 75, 100
    expect(points[0]!.x).toBeCloseTo(0, 3);
    expect(points[2]!.x).toBeCloseTo(50, 3);
    expect(points[4]!.x).toBeCloseTo(100, 3);
    for (const p of points) expect(p.y).toBeCloseTo(0, 3);
  });

  it("ベジェハンドルで曲線になる", () => {
    const p0 = makePoint(0, 0, { handleOutX: 50, handleOutY: 50 });
    const p1 = makePoint(100, 0, { handleInX: -50, handleInY: 50 });
    const points = tessellateSegment(p0, p1, 8);
    expect(points).toHaveLength(9);
    const mid = points[4]!;
    expect(mid.y).toBeGreaterThan(0);
  });

  it("幅と不透明度が線形補間される", () => {
    const p0 = makePoint(0, 0, { width: 2, opacity: 1 });
    const p1 = makePoint(100, 0, { width: 8, opacity: 0 });
    const points = tessellateSegment(p0, p1, 4);
    expect(points[2]!.width).toBeCloseTo(5, 3);
    expect(points[2]!.opacity).toBeCloseTo(0.5, 3);
  });
});

describe("tessellateArtPath", () => {
  it("2点のパスをテッセレーションする", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const points = tessellateArtPath(cps, false, 4);
    expect(points).toHaveLength(5);
  });

  it("3点のパスで2セグメント分の点列を生成する", () => {
    const cps = [makePoint(0, 0), makePoint(50, 0), makePoint(100, 0)];
    const points = tessellateArtPath(cps, false, 4);
    expect(points).toHaveLength(9);
  });

  it("閉じたパスで始点→終点→始点のセグメントが含まれる", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0), makePoint(50, 50)];
    const openPoints = tessellateArtPath(cps, false, 4);
    const closedPoints = tessellateArtPath(cps, true, 4);
    expect(closedPoints.length).toBeGreaterThan(openPoints.length);
  });

  it("制御点が1つ以下の場合は空配列を返す", () => {
    expect(tessellateArtPath([], false)).toEqual([]);
    expect(tessellateArtPath([makePoint(0, 0)], false)).toEqual([]);
  });
});

describe("buildStrokeMesh", () => {
  it("直線から三角形ストリップメッシュを生成する", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const points = tessellateArtPath(cps, false, 4);
    const mesh = buildStrokeMesh(points, defaultStyle);

    expect(mesh.vertices.length).toBe(20);
    expect(mesh.uvs.length).toBe(20);
    expect(mesh.indices.length).toBe(24);
  });

  it("1点以下の入力で空メッシュを返す", () => {
    const mesh = buildStrokeMesh([], defaultStyle);
    expect(mesh.vertices.length).toBe(0);
    expect(mesh.indices.length).toBe(0);
  });

  it("頂点が法線方向にオフセットされる", () => {
    const points = tessellateArtPath(
      [makePoint(0, 0, { width: 1 }), makePoint(100, 0, { width: 1 })],
      false,
      1,
    );
    const mesh = buildStrokeMesh(points, { ...defaultStyle, baseWidth: 20 });

    const leftY = mesh.vertices[1];
    const rightY = mesh.vertices[3];
    expect(Math.abs(leftY!)).toBeCloseTo(10, 3);
    expect(Math.abs(rightY!)).toBeCloseTo(10, 3);
    expect(leftY!).toBeCloseTo(-rightY!, 3);
  });

  it("UVのu成分が0から1まで変化する", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const points = tessellateArtPath(cps, false, 4);
    const mesh = buildStrokeMesh(points, defaultStyle);

    expect(mesh.uvs[0]).toBeCloseTo(0, 3);
    const lastU = mesh.uvs[mesh.uvs.length - 4];
    expect(lastU).toBeCloseTo(1, 3);
  });
});

describe("artPathToMesh", () => {
  it("統合関数が正しいメッシュを生成する", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0), makePoint(100, 100)];
    const mesh = artPathToMesh(cps, false, defaultStyle, 4);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it("閉じたパスでも動作する", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0), makePoint(50, 100)];
    const mesh = artPathToMesh(cps, true, defaultStyle, 4);
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });
});
