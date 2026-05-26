import { isPolygonFlipped } from "@vivi2d/core/culling-utils";
import { describe, expect, it } from "vitest";

describe("isPolygonFlipped", () => {
  it("時計回り（CW）の三角形は表面（not flipped）", () => {
    const vertices = [0, 0, 1, 0, 0, 1];
    expect(isPolygonFlipped(vertices)).toBe(false);
  });

  it("反時計回り（CCW）の三角形は裏面（flipped）", () => {
    const vertices = [0, 0, 0, 1, 1, 0];
    expect(isPolygonFlipped(vertices)).toBe(true);
  });

  it("頂点数が3未満の場合は false", () => {
    expect(isPolygonFlipped([])).toBe(false);
    expect(isPolygonFlipped([0, 0])).toBe(false);
    expect(isPolygonFlipped([0, 0, 1, 1])).toBe(false);
  });

  it("CW の四角形は表面", () => {
    const vertices = [0, 0, 1, 0, 1, 1, 0, 1];
    expect(isPolygonFlipped(vertices)).toBe(false);
  });

  it("CCW の四角形は裏面", () => {
    const vertices = [0, 0, 0, 1, 1, 1, 1, 0];
    expect(isPolygonFlipped(vertices)).toBe(true);
  });

  it("退化三角形（面積0）は false", () => {
    const vertices = [0, 0, 1, 0, 2, 0];
    expect(isPolygonFlipped(vertices)).toBe(false);
  });

  it("Float32Array でも動作する", () => {
    const vertices = new Float32Array([0, 0, 0, 1, 1, 0]);
    expect(isPolygonFlipped(vertices)).toBe(true);
  });


  it("5頂点以上のポリゴンでも正しく判定する", () => {
    const cw = [0, 0, 2, 0, 3, 1, 1.5, 3, -1, 1];
    expect(isPolygonFlipped(cw)).toBe(false);

    const ccw = [0, 0, -1, 1, 1.5, 3, 3, 1, 2, 0];
    expect(isPolygonFlipped(ccw)).toBe(true);
  });

  it("全頂点が同一座標（退化）→ false", () => {
    const vertices = [5, 5, 5, 5, 5, 5, 5, 5];
    expect(isPolygonFlipped(vertices)).toBe(false);
  });

  it("極小座標（精度限界付近）でも判定できる", () => {
    const cw = [0, 0, 1e-8, 0, 0, 1e-8];
    expect(isPolygonFlipped(cw)).toBe(false);

    const ccw = [0, 0, 0, 1e-8, 1e-8, 0];
    expect(isPolygonFlipped(ccw)).toBe(true);
  });

  it("大座標（1e6 スケール）でも正しく判定する", () => {
    const cw = [0, 0, 1e6, 0, 0, 1e6];
    expect(isPolygonFlipped(cw)).toBe(false);

    const ccw = [0, 0, 0, 1e6, 1e6, 0];
    expect(isPolygonFlipped(ccw)).toBe(true);
  });

  it("正方形メッシュ（典型的な 4 頂点グリッド）を正しく判定", () => {
    const cw = [0, 0, 100, 0, 100, 100, 0, 100];
    expect(isPolygonFlipped(cw)).toBe(false);

    const flipped = [0, 0, -100, 0, -100, 100, 0, 100];
    expect(isPolygonFlipped(flipped)).toBe(true);
  });

  it("Uint16Array でも動作する（PixiJS のインデックスバッファ型）", () => {
    const vertices = new Uint16Array([0, 0, 100, 0, 0, 100]);
    expect(isPolygonFlipped(vertices)).toBe(false);
  });

  it("通常の number[] 配列でも動作する", () => {
    const vertices = [0, 0, 0, 1, 1, 0];
    expect(isPolygonFlipped(vertices)).toBe(true);
  });

  it("ちょうど 3 頂点（最小有効サイズ）で正しく判定", () => {
    const cw = [0, 0, 1, 0, 0.5, 1];
    expect(isPolygonFlipped(cw)).toBe(false);
  });

  it("5 要素（奇数、頂点ペアが不完全）→ false", () => {
    const vertices = [0, 0, 1, 0, 0];
    expect(isPolygonFlipped(vertices)).toBe(false);
  });
});
