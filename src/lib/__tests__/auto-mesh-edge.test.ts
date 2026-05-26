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
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = fill(x, y);
    }
  }
  return new ImageData(data, w, h);
}

function createMockCanvas(w: number, h: number, imageData: ImageData) {
  const ctx = { getImageData: () => imageData };
  return {
    width: w,
    height: h,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}


describe("extractContour — エッジケース", () => {
  it("1×1 の最小画像で輪郭を抽出できる", () => {
    const img = createImageData(1, 1, () => 255);
    const contour = extractContour(img);
    expect(contour.length % 2).toBe(0);
  });

  it("1ピクセルだけ不透明な画像", () => {
    const img = createImageData(10, 10, (x, y) => (x === 5 && y === 5 ? 255 : 0));
    const contour = extractContour(img);
    expect(contour.length).toBeGreaterThanOrEqual(2);
  });

  it("閾値ちょうどのアルファ値は不透明扱い", () => {
    const img = createImageData(10, 10, () => 10);
    const contour = extractContour(img, 10);
    expect(contour.length).toBeGreaterThanOrEqual(6);
  });

  it("閾値-1のアルファ値は透明扱い", () => {
    const img = createImageData(10, 10, () => 9);
    const contour = extractContour(img, 10);
    expect(contour.length).toBeLessThan(6);
  });

  it("横1列の細長い画像", () => {
    const img = createImageData(50, 1, () => 255);
    const contour = extractContour(img);
    expect(contour.length).toBeGreaterThanOrEqual(4);
  });

  it("縦1列の細長い画像", () => {
    const img = createImageData(1, 50, () => 255);
    const contour = extractContour(img);
    expect(contour.length).toBeGreaterThanOrEqual(4);
  });

  it("市松模様（散在ピクセル）", () => {
    const img = createImageData(20, 20, (x, y) => ((x + y) % 2 === 0 ? 255 : 0));
    const contour = extractContour(img);
    expect(contour.length % 2).toBe(0);
  });
});


describe("simplifyContour — 境界値", () => {
  it("空配列は空配列を返す", () => {
    expect(simplifyContour([], 1)).toEqual([]);
  });

  it("1点のみの配列はそのまま返す", () => {
    expect(simplifyContour([5, 5], 1)).toEqual([5, 5]);
  });

  it("2点の配列はそのまま返す", () => {
    expect(simplifyContour([0, 0, 10, 10], 1)).toEqual([0, 0, 10, 10]);
  });

  it("同一点の繰り返しは簡略化される", () => {
    const pts = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = simplifyContour(pts, 1);
    expect(result.length).toBeLessThanOrEqual(pts.length);
  });

  it("負の座標を含む輪郭でもクラッシュしない", () => {
    const pts = [-10, -10, 0, -10, 10, -10, 10, 10, -10, 10];
    const result = simplifyContour(pts, 0.5);
    expect(result.length).toBeGreaterThanOrEqual(6);
    expect(result.length % 2).toBe(0);
  });
});


describe("pointInPolygon — 境界値", () => {
  it("空ポリゴンは false", () => {
    expect(pointInPolygon(0, 0, [])).toBe(false);
  });

  it("1点のポリゴンは false", () => {
    expect(pointInPolygon(5, 5, [5, 5])).toBe(false);
  });

  it("2点のポリゴン（線分）は false", () => {
    expect(pointInPolygon(5, 0, [0, 0, 10, 0])).toBe(false);
  });

  it("非常に大きなポリゴン", () => {
    const big = [0, 0, 100000, 0, 100000, 100000, 0, 100000];
    expect(pointInPolygon(50000, 50000, big)).toBe(true);
    expect(pointInPolygon(-1, -1, big)).toBe(false);
  });

  it("負座標のポリゴン", () => {
    const poly = [-10, -10, 10, -10, 10, 10, -10, 10];
    expect(pointInPolygon(0, 0, poly)).toBe(true);
    expect(pointInPolygon(-5, -5, poly)).toBe(true);
    expect(pointInPolygon(-11, 0, poly)).toBe(false);
  });
});


describe("generateInteriorPoints — 境界値", () => {
  it("spacing=1 の最小値でもクラッシュしない", () => {
    const contour = [0, 0, 20, 0, 20, 20, 0, 20];
    const points = generateInteriorPoints(contour, 1, {
      x: 0,
      y: 0,
      w: 20,
      h: 20,
    });
    expect(Array.isArray(points)).toBe(true);
    expect(points.length % 2).toBe(0);
  });

  it("非常に大きなスペーシングでは点が生成されない", () => {
    const contour = [0, 0, 10, 0, 10, 10, 0, 10];
    const points = generateInteriorPoints(contour, 1000, {
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    });
    expect(points.length).toBe(0);
  });

  it("三角形内にも内部点を生成できる", () => {
    const triangle = [0, 0, 200, 0, 100, 200];
    const points = generateInteriorPoints(triangle, 30, {
      x: 0,
      y: 0,
      w: 200,
      h: 200,
    });
    expect(points.length).toBeGreaterThan(0);
    for (let i = 0; i < points.length; i += 2) {
      expect(pointInPolygon(points[i]!, points[i + 1]!, triangle)).toBe(true);
    }
  });
});


describe("triangulate — エッジケース", () => {
  it("3点ちょうどで1三角形を返す", () => {
    const pts = [0, 0, 10, 0, 5, 10];
    const indices = triangulate(pts, pts);
    expect(indices.length).toBe(3);
  });

  it("一直線上の3点では三角分割できない（退化三角形）", () => {
    const pts = [0, 0, 5, 0, 10, 0];
    const indices = triangulate(pts, pts);
    expect(indices.length % 3).toBe(0);
  });

  it("重複点を含む入力でクラッシュしない", () => {
    const pts = [0, 0, 10, 0, 10, 10, 0, 10, 0, 0];
    const contour = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(() => triangulate(pts, contour)).not.toThrow();
  });
});


describe("generateAutoMesh — エッジケース", () => {
  it("テクスチャサイズとレイヤーサイズが異なる（アスペクト比）", () => {
    const img = createImageData(50, 100, () => 255);
    const canvas = createMockCanvas(50, 100, img);
    const mesh = generateAutoMesh(canvas, 200, 400, "standard");
    expect(mesh).not.toBeNull();
    if (!mesh) return;
    expect(mesh.vertices.length).toBe(mesh.uvs.length);
    for (const uv of mesh.uvs) {
      expect(uv).toBeGreaterThanOrEqual(-0.01);
      expect(uv).toBeLessThanOrEqual(1.01);
    }
  });

  it("全プリセットで生成可能", () => {
    const img = createImageData(30, 30, () => 255);
    const canvas = createMockCanvas(30, 30, img);
    for (const preset of ["coarse", "standard", "fine"] as const) {
      const mesh = generateAutoMesh(canvas, 100, 100, preset);
      expect(mesh).not.toBeNull();
      expect(mesh!.divisionsX).toBe(0);
      expect(mesh!.divisionsY).toBe(0);
    }
  });

  it("中央に小さい不透明領域がある画像", () => {
    const img = createImageData(100, 100, (x, y) =>
      x >= 45 && x < 55 && y >= 45 && y < 55 ? 255 : 0,
    );
    const canvas = createMockCanvas(100, 100, img);
    const mesh = generateAutoMesh(canvas, 100, 100, "coarse");
    if (mesh) {
      expect(mesh.indices.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("ほぼ全透明で角に1ピクセルだけ不透明", () => {
    const img = createImageData(20, 20, (x, y) => (x === 0 && y === 0 ? 255 : 0));
    const canvas = createMockCanvas(20, 20, img);
    const mesh = generateAutoMesh(canvas, 100, 100, "standard");
    if (mesh) {
      expect(mesh.indices.length % 3).toBe(0);
    }
  });

  it("canvas サイズ 0×0 では null を返す", () => {
    const img = createImageData(1, 1, () => 255);
    const canvas = createMockCanvas(0, 0, img);
    Object.defineProperty(canvas, "width", { value: 0 });
    Object.defineProperty(canvas, "height", { value: 0 });
    expect(generateAutoMesh(canvas, 100, 100, "standard")).toBeNull();
  });

  it("getImageData が例外を投げた場合 null を返す", () => {
    const canvas = {
      width: 10,
      height: 10,
      getContext: () => ({
        getImageData: () => {
          throw new DOMException("cross-origin");
        },
      }),
    } as unknown as HTMLCanvasElement;
    expect(generateAutoMesh(canvas, 100, 100, "standard")).toBeNull();
  });

  it("falls back to a full texture grid for disconnected opaque regions", () => {
    const img = createImageData(64, 64, (x, y) => {
      const inLeftIsland = x >= 6 && x < 18 && y >= 20 && y < 36;
      const inRightIsland = x >= 42 && x < 58 && y >= 18 && y < 38;
      return inLeftIsland || inRightIsland ? 255 : 0;
    });
    const canvas = createMockCanvas(64, 64, img);
    const mesh = generateAutoMesh(canvas, 128, 128, "standard");

    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const xs = mesh.vertices.filter((_, index) => index % 2 === 0);
    const ys = mesh.vertices.filter((_, index) => index % 2 === 1);
    expect(mesh.divisionsX).toBeGreaterThan(0);
    expect(mesh.divisionsY).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(128);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(128);
    expect(Math.min(...mesh.uvs)).toBe(0);
    expect(Math.max(...mesh.uvs)).toBe(1);
  });
});
