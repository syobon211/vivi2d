import { DRAW_ORDER } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePsd } from "@/lib/psd-loader";
import { clearTextures } from "@/lib/texture-store";


describe("parsePsd — drawOrder 自動配分", () => {
  beforeEach(() => {
    clearTextures();
  });

  afterEach(() => {
    clearTextures();
  });

  it("単一レイヤー: drawOrder は 0", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "背景", left: 0, top: 0, right: 100, bottom: 100 }],
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    const flat = flattenLayers(project.layers);

    expect(flat).toHaveLength(1);
    expect(flat[0]!.drawOrder).toBe(0);
  });

  it("2レイヤー: 0 と 1000 に配分される", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 200,
      height: 200,
      children: [
        { name: "前面", left: 0, top: 0, right: 100, bottom: 100 },
        { name: "背面", left: 0, top: 0, right: 100, bottom: 100 },
      ],
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    const flat = flattenLayers(project.layers);

    expect(flat).toHaveLength(2);
    // i=0: 0, i=1: 1000
    const orders = flat.map((l) => l.drawOrder).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(orders).toEqual([0, 1000]);
  });

  it("5レイヤー: 等間隔に配分される（0, 250, 500, 750, 1000）", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 200,
      height: 200,
      children: [
        { name: "L1", left: 0, top: 0, right: 50, bottom: 50 },
        { name: "L2", left: 0, top: 0, right: 50, bottom: 50 },
        { name: "L3", left: 0, top: 0, right: 50, bottom: 50 },
        { name: "L4", left: 0, top: 0, right: 50, bottom: 50 },
        { name: "L5", left: 0, top: 0, right: 50, bottom: 50 },
      ],
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    const flat = flattenLayers(project.layers);

    expect(flat).toHaveLength(5);
    const orders = flat.map((l) => l.drawOrder).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(orders).toEqual([0, 250, 500, 750, 1000]);
  });

  it("全 drawOrder は MIN-MAX 範囲内", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 100,
      height: 100,
      children: Array.from({ length: 20 }, (_, i) => ({
        name: `Layer${i}`,
        left: 0,
        top: 0,
        right: 50,
        bottom: 50,
      })),
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    const flat = flattenLayers(project.layers);

    for (const layer of flat) {
      expect(layer.drawOrder).toBeGreaterThanOrEqual(DRAW_ORDER.MIN);
      expect(layer.drawOrder).toBeLessThanOrEqual(DRAW_ORDER.MAX);
    }
  });

  it("全 drawOrder は整数（Math.round 適用）", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 100,
      height: 100,
      children: Array.from({ length: 7 }, (_, i) => ({
        name: `Layer${i}`,
        left: 0,
        top: 0,
        right: 50,
        bottom: 50,
      })),
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    const flat = flattenLayers(project.layers);

    for (const layer of flat) {
      expect(Number.isInteger(layer.drawOrder)).toBe(true);
    }
  });

  it("グループの子レイヤーも含めて drawOrder が配分される", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 200,
      height: 200,
      children: [
        {
          name: "グループ",
          children: [
            { name: "子A", left: 0, top: 0, right: 50, bottom: 50 },
            { name: "子B", left: 0, top: 0, right: 50, bottom: 50 },
          ],
        },
        { name: "独立", left: 0, top: 0, right: 50, bottom: 50 },
      ],
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    const flat = flattenLayers(project.layers);

    for (const layer of flat) {
      expect(layer.drawOrder).toBeDefined();
      expect(typeof layer.drawOrder).toBe("number");
    }

    const orders = flat.map((l) => l.drawOrder);
    const unique = new Set(orders);
    expect(unique.size).toBe(flat.length);
  });

  it("PSD 上の上位レイヤー（前面）ほど高い drawOrder が割り当てられる", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 100,
      height: 100,
      children: [
        { name: "前面", left: 0, top: 0, right: 50, bottom: 50 },
        { name: "中間", left: 0, top: 0, right: 50, bottom: 50 },
        { name: "背面", left: 0, top: 0, right: 50, bottom: 50 },
      ],
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    const flat = flattenLayers(project.layers);
    const frontLayer = flat.find((l) => l.name === "前面")!;
    const backLayer = flat.find((l) => l.name === "背面")!;

    expect(frontLayer.drawOrder).toBeGreaterThan(backLayer.drawOrder!);
  });

  it("子なしレイヤー 0 件では例外を投げない", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 100,
      height: 100,
      children: [],
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(project.layers).toHaveLength(0);
  });

  it("PSD 読み込み直後は multiplyColor/screenColor/culling は未設定", () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "テスト", left: 0, top: 0, right: 50, bottom: 50 }],
    } as any);

    const project = parsePsd(new ArrayBuffer(0), "test.psd");
    const flat = flattenLayers(project.layers);

    for (const layer of flat) {
      expect(layer.multiplyColor).toBeUndefined();
      expect(layer.screenColor).toBeUndefined();
      if (layer.kind === "viviMesh") {
        expect(layer.culling).toBeUndefined();
      }
    }
  });
});
