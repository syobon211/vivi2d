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

  it("7レイヤーの前後順序と整数 drawOrder を保持する", () => {
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
    expect(
      flattenLayers(project.layers).map((layer) => [layer.name, layer.drawOrder]),
    ).toEqual([
      ["Layer0", 1000],
      ["Layer1", 833],
      ["Layer2", 667],
      ["Layer3", 500],
      ["Layer4", 333],
      ["Layer5", 167],
      ["Layer6", 0],
    ]);
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
