import { describe, expect, it } from "vitest";
import {
  extractContour,
  generateAutoMesh,
  generateInteriorPoints,
  pointInPolygon,
  simplifyContour,
  triangulate,
} from "../auto-mesh";


class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, w: number, h: number) {
    this.data = data;
    this.width = w;
    this.height = h;
  }
}
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as any).ImageData = MockImageData;
}


function createImageData(
  w: number,
  h: number,
  fill: (x: number, y: number) => number,
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const alpha = fill(x, y);
      data[idx] = 255; // R
      data[idx + 1] = 255; // G
      data[idx + 2] = 255; // B
      data[idx + 3] = alpha; // A
    }
  }
  return new ImageData(data, w, h);
}

function opaqueImageData(w: number, h: number): ImageData {
  return createImageData(w, h, () => 255);
}

function rectImageData(
  w: number,
  h: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): ImageData {
  return createImageData(w, h, (x, y) =>
    x >= rx && x < rx + rw && y >= ry && y < ry + rh ? 255 : 0,
  );
}

function circleImageData(
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
): ImageData {
  return createImageData(w, h, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r ? 255 : 0;
  });
}

// ============================================================
// extractContour
// ============================================================

describe("extractContour", () => {
  it("全透明画像では空または極小の輪郭を返す", () => {
    const img = createImageData(10, 10, () => 0);
    const contour = extractContour(img);
    expect(contour.length).toBeLessThan(6);
  });

  it("矩形画像から輪郭を抽出できる", () => {
    const img = rectImageData(20, 20, 5, 5, 10, 10);
    const contour = extractContour(img);
    expect(contour.length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < contour.length; i++) {
      expect(Number.isFinite(contour[i])).toBe(true);
    }
  });

  it("円形画像から輪郭を抽出できる", () => {
    const img = circleImageData(30, 30, 15, 15, 10);
    const contour = extractContour(img);
    expect(contour.length).toBeGreaterThanOrEqual(6);
  });

  it("全面不透明画像から輪郭を抽出できる", () => {
    const img = opaqueImageData(10, 10);
    const contour = extractContour(img);
    expect(contour.length).toBeGreaterThanOrEqual(6);
  });

  it("楕円の輪郭が正しくポリゴンを形成する", () => {
    const img = circleImageData(64, 64, 32, 32, 25);
    const contour = extractContour(img);
    expect(contour.length).toBeGreaterThanOrEqual(6);

    expect(pointInPolygon(32, 32, contour)).toBe(true);
    expect(pointInPolygon(0, 0, contour)).toBe(false);
    expect(pointInPolygon(63, 63, contour)).toBe(false);
  });

  it("楕円のImageDataから輪郭内部判定が正しい", () => {
    const img = createImageData(128, 130, (x, y) => {
      const cx = 64,
        cy = 65,
        rx = 62,
        ry = 63;
      const dx = (x - cx) / rx,
        dy = (y - cy) / ry;
      return dx * dx + dy * dy <= 1 ? 255 : 0;
    });
    const contour = extractContour(img);
    expect(contour.length).toBeGreaterThanOrEqual(6);

    expect(pointInPolygon(64, 65, contour)).toBe(true);
    expect(pointInPolygon(0, 0, contour)).toBe(false);
    expect(pointInPolygon(127, 129, contour)).toBe(false);
  });

  it("閾値以下のアルファは透明扱い", () => {
    const img = createImageData(10, 10, () => 5);
    const contour = extractContour(img, 10);
    expect(contour.length).toBeLessThan(6);
  });

  it("L字型の凹形状で凹部分が保持される", () => {
    //  ##....
    //  ##....
    //  ##....
    //  ######
    //  ######
    //  ######
    const img = createImageData(30, 30, (x, y) => {
      if (y < 15) return x < 10 ? 255 : 0;
      return 255;
    });
    const contour = extractContour(img);

    const concaveAreaInside = pointInPolygon(15, 8, contour);

    expect(concaveAreaInside).toBe(false);
  });
});

// ============================================================
// simplifyContour
// ============================================================

describe("simplifyContour", () => {
  it("3点以下はそのまま返す", () => {
    const pts = [0, 0, 10, 0, 10, 10];
    expect(simplifyContour(pts, 1)).toEqual(pts);
  });

  it("直線上の点を除去する", () => {
    const pts = [0, 0, 5, 0, 10, 0, 10, 10];
    const result = simplifyContour(pts, 0.5);
    expect(result.length).toBe(6);
    expect(result).toEqual([0, 0, 10, 0, 10, 10]);
  });

  it("tolerance=0 では全点を保持する", () => {
    const pts = [0, 0, 5, 1, 10, 0, 10, 10];
    const result = simplifyContour(pts, 0);
    expect(result.length).toBe(pts.length);
  });

  it("大きな tolerance で始点と終点のみに簡略化", () => {
    const pts = [0, 0, 5, 1, 10, 2, 15, 1, 20, 0];
    const result = simplifyContour(pts, 100);
    expect(result.length).toBe(4);
  });
});

// ============================================================
// pointInPolygon
// ============================================================

describe("pointInPolygon", () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];

  it("内部の点は true", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it("外部の点は false", () => {
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
  });

  it("三角形の内部判定", () => {
    const tri = [0, 0, 20, 0, 10, 20];
    expect(pointInPolygon(10, 5, tri)).toBe(true);
    expect(pointInPolygon(0, 20, tri)).toBe(false);
  });
});

// ============================================================
// generateInteriorPoints
// ============================================================

describe("generateInteriorPoints", () => {
  it("正方形内にグリッド点を生成する", () => {
    const contour = [0, 0, 100, 0, 100, 100, 0, 100];
    const points = generateInteriorPoints(contour, 20, {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    });
    expect(points.length).toBeGreaterThan(0);
    expect(points.length % 2).toBe(0);
    for (let i = 0; i < points.length; i += 2) {
      expect(pointInPolygon(points[i]!, points[i + 1]!, contour)).toBe(true);
    }
  });

  it("狭いスペースでは点が生成されない", () => {
    const contour = [0, 0, 5, 0, 5, 5, 0, 5];
    const points = generateInteriorPoints(contour, 20, {
      x: 0,
      y: 0,
      w: 5,
      h: 5,
    });
    expect(points.length).toBe(0);
  });

  it("輪郭頂点に近すぎる点は除外される", () => {
    const contour = [0, 0, 100, 0, 100, 100, 0, 100];
    const points = generateInteriorPoints(contour, 10, {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    });
    for (let i = 0; i < points.length; i += 2) {
      for (let j = 0; j < contour.length; j += 2) {
        const dx = points[i]! - contour[j]!;
        const dy = points[i + 1]! - contour[j + 1]!;
        expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(10 * 0.5 - 0.01);
      }
    }
  });
});

// ============================================================
// triangulate
// ============================================================

describe("triangulate", () => {
  it("正方形の4点を三角分割する", () => {
    const points = [0, 0, 10, 0, 10, 10, 0, 10];
    const indices = triangulate(points, points);
    expect(indices.length).toBe(6);
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
    }
  });

  it("3点未満では空配列を返す", () => {
    expect(triangulate([0, 0, 10, 0], [0, 0, 10, 0])).toEqual([]);
    expect(triangulate([], [])).toEqual([]);
  });

  it("輪郭外の三角形は除去される", () => {
    const contour = [0, 0, 10, 0, 10, 5, 5, 5, 5, 10, 0, 10];
    const indices = triangulate(contour, contour);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!;
      const b = indices[i + 1]!;
      const c = indices[i + 2]!;
      const cx = (contour[a * 2]! + contour[b * 2]! + contour[c * 2]!) / 3;
      const cy = (contour[a * 2 + 1]! + contour[b * 2 + 1]! + contour[c * 2 + 1]!) / 3;
      expect(pointInPolygon(cx, cy, contour)).toBe(true);
    }
  });
});

// ============================================================
// generateAutoMesh
// ============================================================

describe("generateAutoMesh", () => {
  function createMockCanvas(w: number, h: number, imageData: ImageData) {
    const ctx = {
      getImageData: () => imageData,
    };
    return {
      width: w,
      height: h,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
  }

  it("不透明矩形画像から MeshData を生成する", () => {
    const img = opaqueImageData(20, 20);
    const canvas = createMockCanvas(20, 20, img);
    const mesh = generateAutoMesh(canvas, 100, 100, "standard");
    expect(mesh).not.toBeNull();
    if (!mesh) return;
    expect(mesh.vertices.length).toBe(mesh.uvs.length);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.divisionsX).toBe(0);
    expect(mesh.divisionsY).toBe(0);
    for (const uv of mesh.uvs) {
      expect(uv).toBeGreaterThanOrEqual(-0.01);
      expect(uv).toBeLessThanOrEqual(1.01);
    }
  });

  it("全透明画像では null を返す", () => {
    const img = createImageData(10, 10, () => 0);
    const canvas = createMockCanvas(10, 10, img);
    const mesh = generateAutoMesh(canvas, 100, 100, "standard");
    expect(mesh).toBeNull();
  });

  it("keeps the alphaBoundary fallback fixture stable", () => {
    const img = createImageData(4, 2, (x) => (x === 0 || x === 3 ? 255 : 0));
    const canvas = createMockCanvas(4, 2, img);
    const mesh = generateAutoMesh(canvas, 40, 20, "standard");

    expect(mesh).toEqual({
      vertices: [0, 0, 20, 0, 40, 0, 0, 20, 20, 20, 40, 20],
      uvs: [0, 0, 0.5, 0, 1, 0, 0, 1, 0.5, 1, 1, 1],
      indices: [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5],
      divisionsX: 2,
      divisionsY: 1,
    });
  });

  it("プリセットにより頂点数が変わる", () => {
    const img = opaqueImageData(50, 50);
    const canvas = createMockCanvas(50, 50, img);
    const coarse = generateAutoMesh(canvas, 200, 200, "coarse");
    const fine = generateAutoMesh(canvas, 200, 200, "fine");
    expect(coarse).not.toBeNull();
    expect(fine).not.toBeNull();
    expect(fine!.vertices.length).toBeGreaterThan(coarse!.vertices.length);
  });

  it("Canvas 2D コンテキストが取れない場合 null", () => {
    const canvas = {
      width: 10,
      height: 10,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    expect(generateAutoMesh(canvas, 100, 100, "standard")).toBeNull();
  });

  it("テクスチャとレイヤーのサイズ比が正しく反映される", () => {
    const img = opaqueImageData(10, 10);
    const canvas = createMockCanvas(10, 10, img);
    const mesh = generateAutoMesh(canvas, 200, 100, "standard");
    expect(mesh).not.toBeNull();
    if (!mesh) return;
    for (let i = 0; i < mesh.vertices.length; i += 2) {
      expect(mesh.vertices[i]).toBeGreaterThanOrEqual(-1);
      expect(mesh.vertices[i]).toBeLessThanOrEqual(201);
    }
  });
});
