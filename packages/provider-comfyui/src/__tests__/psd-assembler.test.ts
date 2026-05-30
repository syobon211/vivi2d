import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assemblePsd,
  mapSeethroughCategory,
  toCompatPsdLayerName,
  toLayerName,
} from "../psd-assembler";

vi.mock("ag-psd", () => ({
  writePsd: vi.fn(() => new ArrayBuffer(2048)),
}));

const { writePsd } = await import("ag-psd");

describe("mapSeethroughCategory", () => {
  it("顔パーツが正しくマッピングされる", () => {
    expect(mapSeethroughCategory("face")).toBe("face");
    expect(mapSeethroughCategory("iris_left")).toBe("eyeLeft");
    expect(mapSeethroughCategory("iris_right")).toBe("eyeRight");
    expect(mapSeethroughCategory("eye_white_left")).toBe("eyeLeft");
    expect(mapSeethroughCategory("eye_white_right")).toBe("eyeRight");
    expect(mapSeethroughCategory("eyelash_left")).toBe("eyeLeft");
    expect(mapSeethroughCategory("eyelash_right")).toBe("eyeRight");
    expect(mapSeethroughCategory("eyebrow_left")).toBe("eyebrowLeft");
    expect(mapSeethroughCategory("eyebrow_right")).toBe("eyebrowRight");
    expect(mapSeethroughCategory("eyewear")).toBe("accessory");
    expect(mapSeethroughCategory("mouth")).toBe("mouth");
    expect(mapSeethroughCategory("nose")).toBe("nose");
    expect(mapSeethroughCategory("ear_left")).toBe("ear");
    expect(mapSeethroughCategory("ear_right")).toBe("ear");
    expect(mapSeethroughCategory("ear_accessory_left")).toBe("accessory");
    expect(mapSeethroughCategory("ear_accessory_right")).toBe("accessory");
  });

  it("髪パーツが正しくマッピングされる", () => {
    expect(mapSeethroughCategory("hair_front")).toBe("hairFront");
    expect(mapSeethroughCategory("hair_back")).toBe("hairBack");
  });

  it("体パーツが正しくマッピングされる", () => {
    expect(mapSeethroughCategory("neck")).toBe("body");
    expect(mapSeethroughCategory("torso_wear")).toBe("body");
    expect(mapSeethroughCategory("leg_wear")).toBe("body");
    expect(mapSeethroughCategory("foot_wear")).toBe("body");
  });

  it("手パーツが正しくマッピングされる", () => {
    expect(mapSeethroughCategory("hand_accessory_left")).toBe("handLeft");
    expect(mapSeethroughCategory("hand_accessory_right")).toBe("handRight");
  });

  it("その他パーツが正しくマッピングされる", () => {
    expect(mapSeethroughCategory("tail")).toBe("tail");
    expect(mapSeethroughCategory("headwear")).toBe("accessory");
    expect(mapSeethroughCategory("wings")).toBe("accessory");
  });

  it("未知のラベルでunknownを返す", () => {
    expect(mapSeethroughCategory("something_unknown")).toBe("unknown");
    expect(mapSeethroughCategory("")).toBe("unknown");
    expect(mapSeethroughCategory("FACE")).toBe("unknown");
  });
});

describe("toLayerName", () => {
  it("st:プレフィックスを付与する", () => {
    expect(toLayerName("face")).toBe("st:face");
    expect(toLayerName("hair_front")).toBe("st:hair_front");
    expect(toLayerName("iris_left")).toBe("st:iris_left");
    expect(toLayerName("")).toBe("st:");
  });
});

describe("toCompatPsdLayerName", () => {
  it("embeds the Vivi2D leaf token in PSD export names", () => {
    expect(toCompatPsdLayerName("layer_001", "face")).toBe("v2d[layer_001] face");
  });
});

function buildFakeOffscreenCanvas(width: number, height: number) {
  return class {
    width = width;
    height = height;
    constructor(w?: number, h?: number) {
      if (typeof w === "number") this.width = w;
      if (typeof h === "number") this.height = h;
    }
    getContext(type: string) {
      if (type !== "2d") return null;
      return {
        drawImage: vi.fn(),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
      };
    }
  };
}

describe("assemblePsd (createImageBitmap + OffscreenCanvas 経路)", () => {
  beforeEach(() => {
    vi.mocked(writePsd).mockClear();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (_blob: Blob) => ({
        width: 100,
        height: 80,
        close: vi.fn(),
      })),
    );
    vi.stubGlobal("OffscreenCanvas", buildFakeOffscreenCanvas(100, 80));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("単一レイヤーから PSD を組み立て writePsd を呼ぶ", async () => {
    const layer = {
      name: "face",
      psdLeafToken: "layer_000",
      order: 0,
      imageData: new ArrayBuffer(8),
    };
    const result = await assemblePsd([layer], 100, 80);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(writePsd).toHaveBeenCalledOnce();

    const arg = vi.mocked(writePsd).mock.calls[0]![0] as {
      width: number;
      height: number;
      children: Array<{ name: string; left: number; top: number }>;
    };
    expect(arg.width).toBe(100);
    expect(arg.height).toBe(80);
    expect(arg.children).toHaveLength(1);
    expect(arg.children[0]!.name).toBe("v2d[layer_000] face");
    expect(arg.children[0]!.left).toBe(0);
    expect(arg.children[0]!.top).toBe(0);
  });

  it("複数レイヤーは order の昇順でソートされる", async () => {
    const layers = [
      {
        name: "back",
        psdLeafToken: "layer_002",
        order: 2,
        imageData: new ArrayBuffer(4),
      },
      {
        name: "front",
        psdLeafToken: "layer_000",
        order: 0,
        imageData: new ArrayBuffer(4),
      },
      {
        name: "middle",
        psdLeafToken: "layer_001",
        order: 1,
        imageData: new ArrayBuffer(4),
      },
    ];
    await assemblePsd(layers, 200, 100);
    const arg = vi.mocked(writePsd).mock.calls[0]![0] as {
      children: Array<{ name: string }>;
    };
    expect(arg.children.map((c) => c.name)).toEqual([
      "v2d[layer_000] front",
      "v2d[layer_001] middle",
      "v2d[layer_002] back",
    ]);
  });

  it("空レイヤーリストでも writePsd を呼んで PSD を返す", async () => {
    const result = await assemblePsd([], 512, 512);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(writePsd).toHaveBeenCalledOnce();
    const arg = vi.mocked(writePsd).mock.calls[0]![0] as {
      width: number;
      height: number;
      children: unknown[];
    };
    expect(arg.width).toBe(512);
    expect(arg.height).toBe(512);
    expect(arg.children).toHaveLength(0);
  });

  it("各レイヤーの canvas には bitmap の幅/高さがそのまま入る", async () => {
    const layer = {
      name: "torso_wear",
      order: 0,
      imageData: new ArrayBuffer(16),
    };
    await assemblePsd([layer], 1024, 1024);
    const arg = vi.mocked(writePsd).mock.calls[0]![0] as {
      children: Array<{
        right: number;
        bottom: number;
        imageData: { width: number; height: number; data: Uint8ClampedArray };
      }>;
    };
    expect(arg.children[0]!.right).toBe(100);
    expect(arg.children[0]!.bottom).toBe(80);
    expect(arg.children[0]!.imageData.width).toBe(100);
    expect(arg.children[0]!.imageData.height).toBe(80);
    expect(arg.children[0]!.imageData.data.length).toBe(100 * 80 * 4);
  });

  it("レイヤーは opacity=1 / blendMode=normal で出力される", async () => {
    const layer = {
      name: "hair_front",
      order: 0,
      imageData: new ArrayBuffer(4),
    };
    await assemblePsd([layer], 64, 64);
    const arg = vi.mocked(writePsd).mock.calls[0]![0] as {
      children: Array<{ opacity: number; blendMode: string }>;
    };
    expect(arg.children[0]!.opacity).toBe(1);
    expect(arg.children[0]!.blendMode).toBe("normal");
  });

  it("createImageBitmap が呼ばれ bitmap.close で解放される", async () => {
    const closeSpy = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 50,
        height: 40,
        close: closeSpy,
      })),
    );
    vi.stubGlobal("OffscreenCanvas", buildFakeOffscreenCanvas(50, 40));

    const layers = [
      { name: "a", order: 0, imageData: new ArrayBuffer(4) },
      { name: "b", order: 1, imageData: new ArrayBuffer(4) },
    ];
    await assemblePsd(layers, 50, 40);
    expect(closeSpy).toHaveBeenCalledTimes(2);
  });

  it("OffscreenCanvas.getContext が null を返すとエラー", async () => {
    class BrokenCanvas {
      getContext(_type: string) {
        return null;
      }
    }
    vi.stubGlobal("OffscreenCanvas", BrokenCanvas);

    const layer = { name: "x", order: 0, imageData: new ArrayBuffer(4) };
    await expect(assemblePsd([layer], 10, 10)).rejects.toThrow(/OffscreenCanvas 2D/);
  });
});

describe("assemblePsd (DOM Canvas フォールバック)", () => {
  beforeEach(() => {
    vi.mocked(writePsd).mockClear();
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Image.onload 経路で PSD を組み立てる", async () => {
    const originalImage = global.Image;
    class FakeImage {
      width = 64;
      height = 48;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      _src = "";
      get src() {
        return this._src;
      }
      set src(value: string) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const fakeContext = {
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
    };
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => fakeContext,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreate(tag);
    });

    const layer = { name: "fallback", order: 0, imageData: new ArrayBuffer(4) };
    const result = await assemblePsd([layer], 64, 48);

    expect(result).toBeInstanceOf(ArrayBuffer);
    const arg = vi.mocked(writePsd).mock.calls[0]![0] as {
      children: Array<{
        name: string;
        right: number;
        bottom: number;
      }>;
    };
    expect(arg.children[0]!.name).toBe("st:fallback");
    expect(arg.children[0]!.right).toBe(64);
    expect(arg.children[0]!.bottom).toBe(48);

    // restore
    vi.stubGlobal("Image", originalImage);
  });

  it("Image.onerror で promise が reject される", async () => {
    class FailingImage {
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      _src = "";
      get src() {
        return this._src;
      }
      set src(value: string) {
        this._src = value;
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailingImage);

    const layer = { name: "broken", order: 0, imageData: new ArrayBuffer(4) };
    await expect(assemblePsd([layer], 10, 10)).rejects.toThrow(/Failed to decode image/);
  });
});

describe("assemblePsd (Node PNG fallback)", () => {
  beforeEach(() => {
    vi.mocked(writePsd).mockClear();
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("Image", undefined);
    vi.stubGlobal("document", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes PNG bytes without browser image globals", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    );
    const imageData = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);

    await assemblePsd([{ name: "node", order: 0, imageData }], 1, 1);

    const arg = vi.mocked(writePsd).mock.calls[0]![0] as {
      children: Array<{ imageData: { width: number; height: number } }>;
    };
    expect(arg.children[0]!.imageData.width).toBe(1);
    expect(arg.children[0]!.imageData.height).toBe(1);
  });
});
