import type { ViviMeshNode } from "@vivi2d/core/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTextures, getTexture, setTexture } from "@/lib/texture-store";

vi.mock("ag-psd", () => ({
  readPsd: vi.fn(),
}));

import { readPsd } from "ag-psd";
import { parsePsd } from "@/lib/psd-loader";

const mockReadPsd = vi.mocked(readPsd);

describe("parsePsd", () => {
  afterEach(() => {
    clearTextures();
  });

  it("PSD のサイズとファイル名を正しく変換する", () => {
    mockReadPsd.mockReturnValue({
      width: 1920,
      height: 1080,
      children: [],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "character.psd");

    expect(result.name).toBe("character");
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.layers).toEqual([]);
  });

  it("ファイル名から .psd 拡張子を除去する（大文字小文字不問）", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [],
    } as any);

    expect(parsePsd(new ArrayBuffer(0), "Test.PSD").name).toBe("Test");
    expect(parsePsd(new ArrayBuffer(0), "model.Psd").name).toBe("model");
  });

  it("レイヤーを正しく変換する", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 150;

    mockReadPsd.mockReturnValue({
      width: 1000,
      height: 800,
      children: [
        {
          name: "目",
          left: 100,
          top: 50,
          right: 300,
          bottom: 200,
          canvas,
          opacity: 0.784,
          hidden: false,
          blendMode: "multiply",
        },
        { name: "既定不透明", left: 0, top: 0, right: 50, bottom: 50 },
      ],
    } as any);

    const buffer = new ArrayBuffer(8);
    const result = parsePsd(buffer, "face.psd");

    expect(mockReadPsd).toHaveBeenCalledWith(buffer, {
      useImageData: false,
      skipThumbnail: true,
      log: expect.any(Function),
    });
    expect(result.layers).toHaveLength(2);
    const layer = result.layers[0]!;
    expect(layer.name).toBe("目");
    expect(layer.x).toBe(100);
    expect(layer.y).toBe(50);
    expect(layer.width).toBe(200);
    expect(layer.height).toBe(150);
    expect(layer.opacity).toBeCloseTo(0.784);
    expect(layer.visible).toBe(true);
    expect(layer.blendMode).toBe("multiply");
    expect(layer.kind).toBe("viviMesh");
    expect(layer.id).toMatch(/\S/);
    expect(getTexture(layer.id)).toBe(canvas);
    if (layer.kind !== "viviMesh") throw new Error("Expected mesh");
    expect(layer.mesh.divisionsX).toBe(3);
    expect(layer.mesh.divisionsY).toBe(3);
    expect(layer.mesh.vertices).toHaveLength(32);
    expect(layer.mesh.uvs).toHaveLength(32);
    expect(layer.mesh.indices).toHaveLength(54);
    expect(layer.mesh.vertices.slice(0, 2)).toEqual([0, 0]);
    expect(layer.mesh.vertices.slice(-2)).toEqual([200, 150]);
    expect(result.layers[1]!.opacity).toBe(1);
  });

  it("非表示レイヤーの visible が false になる", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        { name: "hidden", hidden: true, left: 0, top: 0, right: 50, bottom: 50 },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.visible).toBe(false);
  });

  it("グループレイヤーを正しく変換する", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        {
          name: "顔パーツ",
          children: [
            { name: "目", left: 10, top: 20, right: 30, bottom: 40 },
            { name: "口", left: 15, top: 50, right: 35, bottom: 60 },
          ],
        },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "model.psd");

    expect(result.layers).toHaveLength(1);
    const group = result.layers[0]!;
    expect(group.name).toBe("顔パーツ");
    expect(group.kind).toBe("group");
    expect(group.children).toHaveLength(2);
    expect(group.children[0]!.name).toBe("目");
    expect(group.children[1]!.name).toBe("口");
  });

  it("canvas がないレイヤーは texture-store に保存しない", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "空レイヤー", left: 0, top: 0, right: 50, bottom: 50 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(getTexture(result.layers[0]!.id)).toBeUndefined();
  });

  it("再読み込み時に前回のテクスチャをクリアする", () => {
    const canvas1 = document.createElement("canvas");
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        { name: "A", canvas: canvas1, left: 0, top: 0, right: 100, bottom: 100 },
      ],
    } as any);
    const first = parsePsd(new ArrayBuffer(0), "first.psd");

    const canvas2 = document.createElement("canvas");
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        { name: "B", canvas: canvas2, left: 0, top: 0, right: 100, bottom: 100 },
      ],
    } as any);
    parsePsd(new ArrayBuffer(0), "second.psd");

    expect(getTexture(first.layers[0]!.id)).toBeUndefined();
  });

  it("各レイヤーに一意のIDを付与する", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        { name: "A", left: 0, top: 0, right: 50, bottom: 50 },
        { name: "B", left: 0, top: 0, right: 50, bottom: 50 },
        { name: "C", left: 0, top: 0, right: 50, bottom: 50 },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    const ids = result.layers.map((l) => l.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });

  it("全レイヤーに適切な kind が設定される", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        { name: "通常", left: 0, top: 0, right: 50, bottom: 50 },
        {
          name: "グループ",
          children: [{ name: "子", left: 10, top: 10, right: 40, bottom: 40 }],
        },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");

    expect(result.layers[0]!.kind).toBe("viviMesh");
    expect(result.layers[1]!.kind).toBe("group");
    expect(result.layers[1]!.children[0]!.kind).toBe("viviMesh");
  });

  it("グループレイヤーには mesh が生成されない", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        {
          name: "グループ",
          children: [{ name: "子", left: 0, top: 0, right: 50, bottom: 50 }],
        },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");

    expect(result.layers[0]!.kind).toBe("group");
    expect("mesh" in result.layers[0]!).toBe(false);
  });

  it("canvas なし（幅0）のレイヤーには mesh が生成されない", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "空", left: 50, top: 50, right: 50, bottom: 50 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");

    expect(result.layers[0]!.kind).toBe("group");
    expect("mesh" in result.layers[0]!).toBe(false);
  });
});

describe("parsePsd ゼロサイズメッシュガード", () => {
  afterEach(() => {
    clearTextures();
  });

  it("canvasがあるがwidth=0のレイヤーは空メッシュになる", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 100;

    mockReadPsd.mockReturnValue({
      width: 500,
      height: 500,
      children: [{ name: "幅ゼロ", canvas, left: 0, top: 0, right: 0, bottom: 100 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    const layer = result.layers[0] as ViviMeshNode;
    expect(layer.kind).toBe("viviMesh");
    expect(layer.mesh.vertices).toHaveLength(0);
    expect(layer.mesh.indices).toHaveLength(0);
  });

  it("canvasがあるがheight=0のレイヤーは空メッシュになる", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 0;

    mockReadPsd.mockReturnValue({
      width: 500,
      height: 500,
      children: [{ name: "高さゼロ", canvas, left: 0, top: 0, right: 100, bottom: 0 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    const layer = result.layers[0] as ViviMeshNode;
    expect(layer.kind).toBe("viviMesh");
    expect(layer.mesh.vertices).toHaveLength(0);
    expect(layer.mesh.indices).toHaveLength(0);
  });

  it("width=0かつheight=0のcanvas付きレイヤーは空メッシュになる", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 0;

    mockReadPsd.mockReturnValue({
      width: 500,
      height: 500,
      children: [{ name: "両方ゼロ", canvas, left: 10, top: 10, right: 10, bottom: 10 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    const layer = result.layers[0]!;
    expect(layer.kind).toBe("viviMesh");
  });
});

describe("parsePsd BlendMode変換", () => {
  afterEach(() => {
    clearTextures();
  });

  it("スペース区切りのブレンドモードがハイフン化される", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;

    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        {
          name: "CドッジA",
          canvas,
          left: 0,
          top: 0,
          right: 50,
          bottom: 50,
          blendMode: "color dodge",
        },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.blendMode).toBe("color-dodge");
  });

  it("未定義のブレンドモードは normal にフォールバック", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;

    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        {
          name: "未知",
          canvas,
          left: 0,
          top: 0,
          right: 50,
          bottom: 50,
          blendMode: "unknown-mode",
        },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.blendMode).toBe("normal");
  });

  it("blendMode 未指定は normal", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;

    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "なし", canvas, left: 0, top: 0, right: 50, bottom: 50 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.blendMode).toBe("normal");
  });
});

describe("parsePsd グループ vs viviMesh 分類", () => {
  afterEach(() => {
    clearTextures();
  });

  it("子レイヤーがあれば常にグループになる", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;

    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        {
          name: "canvasありグループ",
          canvas,
          left: 0,
          top: 0,
          right: 50,
          bottom: 50,
          children: [{ name: "子", left: 0, top: 0, right: 10, bottom: 10 }],
        },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.kind).toBe("group");
  });

  it("canvas無し+サイズあり→viviMeshになる", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "サイズあり", left: 0, top: 0, right: 80, bottom: 60 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.kind).toBe("viviMesh");
  });

  it("名前未指定レイヤーにデフォルト名が付与される", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [{ left: 0, top: 0, right: 50, bottom: 50 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(typeof result.layers[0]!.name).toBe("string");
    expect(result.layers[0]!.name.length).toBeGreaterThan(0);
  });
});

describe("parsePsd エラーハンドリング", () => {
  afterEach(() => {
    clearTextures();
  });

  it("readPsd がエラーを投げた場合、ユーザー向けメッセージ付きで re-throw する", () => {
    const existing = document.createElement("canvas");
    setTexture("existing", existing);
    mockReadPsd.mockImplementation(() => {
      throw new Error("Invalid PSD signature");
    });
    expect(() => parsePsd(new ArrayBuffer(0), "broken.psd")).toThrow(
      "Failed to load PSD file.",
    );
    expect(getTexture("existing")).toBe(existing);
  });

  it("非 Error オブジェクトが throw された場合もラップする", () => {
    mockReadPsd.mockImplementation(() => {
      throw "unexpected string error";
    });

    expect(() => parsePsd(new ArrayBuffer(0), "broken.psd")).toThrow(
      "Failed to load PSD file.",
    );
  });
});
