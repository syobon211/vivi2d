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

describe("artpath-utils: 全制御点が同一座標", () => {
  it("tessellateSegment: 同一座標の2点で全点が同一位置", () => {
    const p0 = makePoint(50, 50);
    const p1 = makePoint(50, 50);
    const points = tessellateSegment(p0, p1, 4);
    expect(points).toHaveLength(5);
    points.forEach((p) => {
      expect(p.x).toBeCloseTo(50, 5);
      expect(p.y).toBeCloseTo(50, 5);
    });
  });

  it("tessellateArtPath: 同一座標3点で全点が同一位置", () => {
    const cps = [makePoint(0, 0), makePoint(0, 0), makePoint(0, 0)];
    const points = tessellateArtPath(cps, false, 4);
    expect(points.length).toBeGreaterThan(0);
    points.forEach((p) => {
      expect(p.x).toBeCloseTo(0, 5);
      expect(p.y).toBeCloseTo(0, 5);
    });
  });

  it("buildStrokeMesh: 同一座標の点列でもクラッシュしない", () => {
    const cps = [makePoint(10, 20), makePoint(10, 20)];
    const points = tessellateArtPath(cps, false, 4);
    const mesh = buildStrokeMesh(points, defaultStyle);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});

describe("artpath-utils: 巨大なハンドル値", () => {
  it("ハンドルが制御点間距離の100倍でもテッセレーションできる", () => {
    const p0 = makePoint(0, 0, { handleOutX: 10000, handleOutY: 10000 });
    const p1 = makePoint(100, 0, { handleInX: -10000, handleInY: 10000 });
    const points = tessellateSegment(p0, p1, 16);
    expect(points).toHaveLength(17);
    const maxY = Math.max(...points.map((p) => Math.abs(p.y)));
    expect(maxY).toBeGreaterThan(1000);
  });

  it("巨大ハンドルでメッシュ生成がクラッシュしない", () => {
    const cps = [
      makePoint(0, 0, { handleOutX: 5000, handleOutY: 5000 }),
      makePoint(100, 0, { handleInX: -5000, handleInY: 5000 }),
    ];
    const mesh = artPathToMesh(cps, false, defaultStyle, 8);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});

describe("artpath-utils: width=0 のストローク", () => {
  it("幅0の点列でメッシュ生成がクラッシュしない", () => {
    const cps = [makePoint(0, 0, { width: 0 }), makePoint(100, 0, { width: 0 })];
    const points = tessellateArtPath(cps, false, 4);
    const mesh = buildStrokeMesh(points, defaultStyle);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.vertices[1]).toBeCloseTo(mesh.vertices[3]!, 5);
  });

  it("baseWidth=0 でも動作する", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const points = tessellateArtPath(cps, false, 4);
    const mesh = buildStrokeMesh(points, { ...defaultStyle, baseWidth: 0 });
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });
});

describe("artpath-utils: opacity=0", () => {
  it("不透明度0でもテッセレーション結果に含まれる", () => {
    const p0 = makePoint(0, 0, { opacity: 0 });
    const p1 = makePoint(100, 0, { opacity: 0 });
    const points = tessellateSegment(p0, p1, 4);
    expect(points).toHaveLength(5);
    points.forEach((p) => {
      expect(p.opacity).toBeCloseTo(0, 5);
    });
  });

  it("片端が opacity=0、もう片端が opacity=1 で補間される", () => {
    const p0 = makePoint(0, 0, { opacity: 0 });
    const p1 = makePoint(100, 0, { opacity: 1 });
    const points = tessellateSegment(p0, p1, 4);
    expect(points[0]!.opacity).toBeCloseTo(0, 5);
    expect(points[2]!.opacity).toBeCloseTo(0.5, 5);
    expect(points[4]!.opacity).toBeCloseTo(1, 5);
  });
});

describe("artpath-utils: 閉じたパスで制御点2つ", () => {
  it("2点の閉じたパスは2セグメント（往復）を生成する", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const openPoints = tessellateArtPath(cps, false, 4);
    const closedPoints = tessellateArtPath(cps, true, 4);
    expect(openPoints).toHaveLength(5);
    expect(closedPoints).toHaveLength(9);
  });

  it("閉じたパスの最終点が始点に戻る", () => {
    const cps = [makePoint(0, 0), makePoint(100, 50)];
    const points = tessellateArtPath(cps, true, 4);
    const last = points[points.length - 1];
    expect(last!.x).toBeCloseTo(0, 3);
    expect(last!.y).toBeCloseTo(0, 3);
  });
});

describe("artpath-utils: segmentsPerCurve=1", () => {
  it("分割数1で始点と終点のみ", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const points = tessellateArtPath(cps, false, 1);
    expect(points).toHaveLength(2);
    expect(points[0]!.x).toBeCloseTo(0, 5);
    expect(points[1]!.x).toBeCloseTo(100, 5);
  });

  it("分割数1でメッシュ生成が可能", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const mesh = artPathToMesh(cps, false, defaultStyle, 1);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});

describe("artpath-utils: segmentsPerCurve=100", () => {
  it("高分割でも正常にテッセレーションされる", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const points = tessellateArtPath(cps, false, 100);
    expect(points).toHaveLength(101);
  });

  it("高分割でメッシュの頂点数が正しい", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0)];
    const mesh = artPathToMesh(cps, false, defaultStyle, 100);
    expect(mesh.vertices.length).toBe(404);
    expect(mesh.indices.length).toBe(600);
  });
});

describe("artpath-utils: 制御点100個のパス", () => {
  it("100個の制御点で正常にテッセレーションされる", () => {
    const cps: ArtPathControlPoint[] = [];
    for (let i = 0; i < 100; i++) {
      cps.push(makePoint(i * 10, Math.sin(i * 0.1) * 50));
    }
    const points = tessellateArtPath(cps, false, 4);
    // 98*4 + 5 = 397
    expect(points).toHaveLength(397);
  });

  it("100個の制御点でメッシュ生成が合理的時間で完了する", () => {
    const cps: ArtPathControlPoint[] = [];
    for (let i = 0; i < 100; i++) {
      cps.push(makePoint(i * 10, Math.sin(i * 0.1) * 50));
    }
    const start = performance.now();
    const mesh = artPathToMesh(cps, false, defaultStyle, 16);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });

  it("100個の制御点で閉じたパスも正常に動作する", () => {
    const cps: ArtPathControlPoint[] = [];
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2;
      cps.push(makePoint(Math.cos(angle) * 200, Math.sin(angle) * 200));
    }
    const points = tessellateArtPath(cps, true, 4);
    expect(points.length).toBeGreaterThan(400);
  });
});

describe("buildStrokeMesh: 全点が同一座標", () => {
  it("接線がゼロベクトルでもフォールバックで処理される", () => {
    const points = [
      { x: 50, y: 50, width: 1, opacity: 1 },
      { x: 50, y: 50, width: 1, opacity: 1 },
      { x: 50, y: 50, width: 1, opacity: 1 },
    ];
    const mesh = buildStrokeMesh(points, defaultStyle);
    expect(mesh.vertices.length).toBe(12);
    expect(mesh.indices.length).toBe(12);
    for (let i = 0; i < mesh.vertices.length; i++) {
      expect(Number.isFinite(mesh.vertices[i])).toBe(true);
    }
  });
});

describe("artpath-utils: 連続する同一制御点", () => {
  it("最初の2点が同一座標の場合でもクラッシュしない", () => {
    const cps = [makePoint(0, 0), makePoint(0, 0), makePoint(100, 0)];
    const mesh = artPathToMesh(cps, false, defaultStyle, 4);
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });

  it("最後の2点が同一座標の場合でもクラッシュしない", () => {
    const cps = [makePoint(0, 0), makePoint(100, 0), makePoint(100, 0)];
    const mesh = artPathToMesh(cps, false, defaultStyle, 4);
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });

  it("全て同一座標でもメッシュが生成される", () => {
    const cps = [makePoint(0, 0), makePoint(0, 0), makePoint(0, 0), makePoint(0, 0)];
    const mesh = artPathToMesh(cps, false, defaultStyle, 4);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh.vertices.length; i++) {
      expect(Number.isFinite(mesh.vertices[i])).toBe(true);
    }
  });
});
