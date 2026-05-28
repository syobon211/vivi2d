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
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "face.psd");

    expect(result.layers).toHaveLength(1);
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

  it("canvas を texture-store に保存する", () => {
    const canvas = document.createElement("canvas");
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "レイヤー", canvas, left: 0, top: 0, right: 100, bottom: 100 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    const layerId = result.layers[0]!.id;

    expect(getTexture(layerId)).toBe(canvas);
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

  it("opacity 未指定時は不透明(1.0)になる", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "A", left: 0, top: 0, right: 50, bottom: 50 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.opacity).toBe(1);
  });

  it("useImageData: false で readPsd を呼ぶ", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [],
    } as any);

    const buf = new ArrayBuffer(8);
    parsePsd(buf, "test.psd");

    expect(mockReadPsd).toHaveBeenCalledWith(buf, { useImageData: false });
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

  it("非グループレイヤーに 3x3 デフォルトメッシュが生成される", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 150;

    mockReadPsd.mockReturnValue({
      width: 500,
      height: 500,
      children: [
        { name: "メッシュ付き", canvas, left: 10, top: 20, right: 210, bottom: 170 },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    const layer = result.layers[0] as ViviMeshNode;

    expect(layer.kind).toBe("viviMesh");
    expect(layer.mesh).toBeDefined();
    expect(layer.mesh.divisionsX).toBe(3);
    expect(layer.mesh.divisionsY).toBe(3);
    expect(layer.mesh.vertices.length).toBe(16 * 2);
    expect(layer.mesh.uvs.length).toBe(16 * 2);
    expect(layer.mesh.indices.length).toBe(54);
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

  it("メッシュの頂点がレイヤーサイズに基づく", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;

    mockReadPsd.mockReturnValue({
      width: 500,
      height: 500,
      children: [{ name: "L", canvas, left: 0, top: 0, right: 120, bottom: 80 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    const mesh = (result.layers[0] as ViviMeshNode).mesh;

    const lastVertIdx = (mesh.vertices.length / 2 - 1) * 2;
    expect(mesh.vertices[lastVertIdx]).toBe(120);
    expect(mesh.vertices[lastVertIdx + 1]).toBe(80);
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

  it("multiply はそのまま変換される", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;

    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        {
          name: "乗算",
          canvas,
          left: 0,
          top: 0,
          right: 50,
          bottom: 50,
          blendMode: "multiply",
        },
      ],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.blendMode).toBe("multiply");
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

  it("子レイヤーがundefinedの場合はviviMeshになる", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;

    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [
        {
          name: "undefined children",
          canvas,
          left: 0,
          top: 0,
          right: 50,
          bottom: 50,
          children: undefined,
        },
      ],
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

describe("parsePsd drawOrder 自動配分", () => {
  afterEach(() => {
    clearTextures();
  });

  it("複数レイヤーに drawOrder が等間隔で割り当てられる", () => {
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
    for (const layer of result.layers) {
      expect(layer.drawOrder).toBeDefined();
      expect(typeof layer.drawOrder).toBe("number");
    }
  });

  it("1レイヤーでも drawOrder が設定される", () => {
    mockReadPsd.mockReturnValue({
      width: 100,
      height: 100,
      children: [{ name: "唯一", left: 0, top: 0, right: 50, bottom: 50 }],
    } as any);

    const result = parsePsd(new ArrayBuffer(0), "test.psd");
    expect(result.layers[0]!.drawOrder).toBeDefined();
  });
});

describe("parsePsd エラーハンドリング", () => {
  afterEach(() => {
    clearTextures();
  });

  it("readPsd がエラーを投げた場合、ユーザー向けメッセージ付きで re-throw する", () => {
    mockReadPsd.mockImplementation(() => {
      throw new Error("Invalid PSD signature");
    });

    expect(() => parsePsd(new ArrayBuffer(0), "broken.psd")).toThrow(
      "Failed to load PSD file: Invalid PSD signature",
    );
  });

  it("readPsd がエラーを投げた場合、clearTextures を呼ばない", () => {
    mockReadPsd.mockImplementation(() => {
      throw new Error("corrupt");
    });

    setTexture("existing", document.createElement("canvas"));
    expect(getTexture("existing")).not.toBeUndefined();

    expect(() => parsePsd(new ArrayBuffer(0), "broken.psd")).toThrow();

    expect(getTexture("existing")).not.toBeUndefined();
  });

  it("非 Error オブジェクトが throw された場合もラップする", () => {
    mockReadPsd.mockImplementation(() => {
      throw "unexpected string error";
    });

    expect(() => parsePsd(new ArrayBuffer(0), "broken.psd")).toThrow(
      "Failed to load PSD file: unexpected string error",
    );
  });
});
