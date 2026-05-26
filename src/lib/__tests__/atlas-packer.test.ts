import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAtlases,
  nextPowerOfTwo,
  type PackRect,
  packRects,
  remapUvs,
  renderAtlases,
  unremapUvs,
} from "@/lib/atlas-packer";
import { mockCanvasContext } from "@/test/mocks";


function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function makeTextures(
  specs: [string, number, number][],
): ReadonlyMap<string, HTMLCanvasElement> {
  const map = new Map<string, HTMLCanvasElement>();
  for (const [id, w, h] of specs) {
    map.set(id, makeCanvas(w, h));
  }
  return map;
}

// ============================================================
// packRects
// ============================================================

describe("packRects", () => {
  it("空配列に対して空配列を返す", () => {
    expect(packRects([])).toEqual([]);
  });

  it("1つの矩形をパッキングできる", () => {
    const rects: PackRect[] = [{ id: "a", width: 100, height: 100 }];
    const packed = packRects(rects, 4096, 2);

    expect(packed).toHaveLength(1);
    expect(packed[0]!.id).toBe("a");
    expect(packed[0]!.width).toBe(100);
    expect(packed[0]!.height).toBe(100);
    expect(packed[0]!.atlasIndex).toBe(0);
    expect(packed[0]!.x).toBe(2);
    expect(packed[0]!.y).toBe(2);
  });

  it("複数の矩形をパッキングできる", () => {
    const rects: PackRect[] = [
      { id: "a", width: 64, height: 64 },
      { id: "b", width: 128, height: 128 },
      { id: "c", width: 32, height: 32 },
    ];
    const packed = packRects(rects, 4096, 2);

    expect(packed).toHaveLength(3);
    for (const r of packed) {
      expect(r.atlasIndex).toBe(0);
    }
    const byId = Object.fromEntries(packed.map((r) => [r.id, r]));
    expect(byId.a!.width).toBe(64);
    expect(byId.b!.width).toBe(128);
    expect(byId.c!.width).toBe(32);
  });

  it("パディングが反映される", () => {
    const rects: PackRect[] = [{ id: "a", width: 50, height: 50 }];
    const padding = 4;
    const packed = packRects(rects, 4096, padding);

    expect(packed[0]!.x).toBe(padding);
    expect(packed[0]!.y).toBe(padding);
  });

  it("矩形同士が重ならない", () => {
    const rects: PackRect[] = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      width: 50 + i * 10,
      height: 50 + i * 5,
    }));
    const packed = packRects(rects, 4096, 2);

    for (let i = 0; i < packed.length; i++) {
      for (let j = i + 1; j < packed.length; j++) {
        const a = packed[i]!;
        const b = packed[j]!;
        if (a.atlasIndex !== b.atlasIndex) continue;
        const noOverlap =
          a.x + a.width + 2 <= b.x ||
          b.x + b.width + 2 <= a.x ||
          a.y + a.height + 2 <= b.y ||
          b.y + b.height + 2 <= a.y;
        expect(noOverlap).toBe(true);
      }
    }
  });

  it("最大サイズを超える場合に複数アトラスに分割する", () => {
    const rects: PackRect[] = [
      { id: "a", width: 200, height: 200 },
      { id: "b", width: 200, height: 200 },
      { id: "c", width: 200, height: 200 },
    ];
    const packed = packRects(rects, 256, 2);

    expect(packed).toHaveLength(3);
    const atlasIndices = new Set(packed.map((r) => r.atlasIndex));
    expect(atlasIndices.size).toBe(3);
  });

  it("単一テクスチャが maxSize を超える場合に例外をスローする", () => {
    const rects: PackRect[] = [{ id: "huge", width: 5000, height: 5000 }];
    expect(() => packRects(rects, 4096, 0)).toThrow(
      'Texture "huge" (5000x5000) exceeds the atlas max size',
    );
  });

  it("パディングを含めて maxSize を超える場合に例外をスローする", () => {
    const rects: PackRect[] = [{ id: "big", width: 4095, height: 4095 }];
    expect(() => packRects(rects, 4096, 2)).toThrow(
      'Texture "big" (4095x4095) exceeds the atlas max size',
    );
  });

  it("パディング0で動作する", () => {
    const rects: PackRect[] = [{ id: "a", width: 100, height: 100 }];
    const packed = packRects(rects, 4096, 0);
    expect(packed[0]!.x).toBe(0);
    expect(packed[0]!.y).toBe(0);
  });
});

// ============================================================
// nextPowerOfTwo
// ============================================================

describe("nextPowerOfTwo", () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 4],
    [5, 8],
    [127, 128],
    [128, 128],
    [129, 256],
    [1000, 1024],
    [4096, 4096],
    [4097, 8192],
  ])("%d → %d", (input, expected) => {
    expect(nextPowerOfTwo(input)).toBe(expected);
  });
});

// ============================================================
// remapUvs / unremapUvs
// ============================================================

describe("remapUvs", () => {
  const entry = { layerId: "a", x: 100, y: 200, width: 50, height: 80 };
  const atlasW = 1024;
  const atlasH = 1024;

  it("左上 (0,0) をアトラス座標に変換する", () => {
    const result = remapUvs([0, 0], entry, atlasW, atlasH);
    expect(result[0]).toBeCloseTo(100 / 1024);
    expect(result[1]).toBeCloseTo(200 / 1024);
  });

  it("右下 (1,1) をアトラス座標に変換する", () => {
    const result = remapUvs([1, 1], entry, atlasW, atlasH);
    expect(result[0]).toBeCloseTo(150 / 1024);
    expect(result[1]).toBeCloseTo(280 / 1024);
  });

  it("中央 (0.5,0.5) をアトラス座標に変換する", () => {
    const result = remapUvs([0.5, 0.5], entry, atlasW, atlasH);
    expect(result[0]).toBeCloseTo(125 / 1024);
    expect(result[1]).toBeCloseTo(240 / 1024);
  });

  it("複数のUV組を一括変換する", () => {
    const result = remapUvs([0, 0, 1, 1], entry, atlasW, atlasH);
    expect(result).toHaveLength(4);
  });
});

describe("unremapUvs", () => {
  const entry = { layerId: "a", x: 100, y: 200, width: 50, height: 80 };
  const atlasW = 1024;
  const atlasH = 1024;

  it("remapUvs の逆変換でローカルUVに戻る", () => {
    const localUvs = [0, 0, 1, 1, 0.25, 0.75];
    const atlas = remapUvs(localUvs, entry, atlasW, atlasH);
    const restored = unremapUvs(atlas, entry, atlasW, atlasH);

    for (let i = 0; i < localUvs.length; i++) {
      expect(restored[i]).toBeCloseTo(localUvs[i]!);
    }
  });

  it("空配列に対して空配列を返す", () => {
    expect(unremapUvs([], entry, atlasW, atlasH)).toEqual([]);
  });
});

// ============================================================
// renderAtlases
// ============================================================

describe("renderAtlases", () => {
  beforeEach(() => mockCanvasContext());
  afterEach(() => vi.restoreAllMocks());

  it("指定された枚数のCanvasを生成する", () => {
    const textures = makeTextures([["a", 64, 64]]);
    const packed = [{ id: "a", x: 2, y: 2, width: 64, height: 64, atlasIndex: 0 }];
    const canvases = renderAtlases(packed, textures, 1);

    expect(canvases).toHaveLength(1);
    expect(canvases[0]!).toBeInstanceOf(HTMLCanvasElement);
  });

  it("アトラスサイズが2の冪になる", () => {
    const textures = makeTextures([["a", 100, 100]]);
    const packed = [{ id: "a", x: 2, y: 2, width: 100, height: 100, atlasIndex: 0 }];
    const canvases = renderAtlases(packed, textures, 1, 2, 4096, 256);

    expect(canvases[0]!.width).toBe(256);
    expect(canvases[0]!.height).toBe(256);
  });

  it("複数アトラスを生成できる", () => {
    const textures = makeTextures([
      ["a", 64, 64],
      ["b", 64, 64],
    ]);
    const packed = [
      { id: "a", x: 2, y: 2, width: 64, height: 64, atlasIndex: 0 },
      { id: "b", x: 2, y: 2, width: 64, height: 64, atlasIndex: 1 },
    ];
    const canvases = renderAtlases(packed, textures, 2);

    expect(canvases).toHaveLength(2);
  });

  it("テクスチャが存在しないIDはスキップする", () => {
    const textures = new Map<string, HTMLCanvasElement>();
    const packed = [{ id: "missing", x: 2, y: 2, width: 64, height: 64, atlasIndex: 0 }];

    const canvases = renderAtlases(packed, textures, 1);
    expect(canvases).toHaveLength(1);
  });

  it("minSize よりも小さい配置でも minSize が最小サイズとなる", () => {
    const textures = makeTextures([["tiny", 8, 8]]);
    const packed = [{ id: "tiny", x: 2, y: 2, width: 8, height: 8, atlasIndex: 0 }];
    const canvases = renderAtlases(packed, textures, 1, 2, 4096, 512);
    expect(canvases[0]!.width).toBe(512);
    expect(canvases[0]!.height).toBe(512);
  });

  it("maxSize を超えないようにクランプされる", () => {
    const textures = makeTextures([["big", 3000, 3000]]);
    const packed = [{ id: "big", x: 2, y: 2, width: 3000, height: 3000, atlasIndex: 0 }];
    const canvases = renderAtlases(packed, textures, 1, 2, 4096, 256);
    expect(canvases[0]!.width).toBeLessThanOrEqual(4096);
    expect(canvases[0]!.height).toBeLessThanOrEqual(4096);
  });
});


describe("buildAtlases", () => {
  beforeEach(() => mockCanvasContext());
  afterEach(() => vi.restoreAllMocks());

  it("空のテクスチャマップに対して空配列を返す", () => {
    const result = buildAtlases(new Map());
    expect(result).toEqual([]);
  });

  it("テクスチャからアトラスデータを生成する", () => {
    const textures = makeTextures([
      ["a", 64, 64],
      ["b", 32, 32],
    ]);
    const atlases = buildAtlases(textures);

    expect(atlases.length).toBeGreaterThanOrEqual(1);
    for (const atlas of atlases) {
      expect(atlas.width).toBeGreaterThan(0);
      expect(atlas.height).toBeGreaterThan(0);
      expect(typeof atlas.image).toBe("string");
      expect(atlas.entries.length).toBeGreaterThan(0);
    }
    const allEntries = atlases.flatMap((a) => a.entries);
    const ids = allEntries.map((e) => e.layerId);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("エントリの座標がアトラス範囲内に収まる", () => {
    const textures = makeTextures([
      ["x", 100, 100],
      ["y", 200, 150],
    ]);
    const atlases = buildAtlases(textures);

    for (const atlas of atlases) {
      for (const entry of atlas.entries) {
        expect(entry.x).toBeGreaterThanOrEqual(0);
        expect(entry.y).toBeGreaterThanOrEqual(0);
        expect(entry.x + entry.width).toBeLessThanOrEqual(atlas.width);
        expect(entry.y + entry.height).toBeLessThanOrEqual(atlas.height);
      }
    }
  });
});


describe("packRects — ブランチカバレッジ強化", () => {
  it("同じサイズの矩形が複数あっても正しくパッキングされる", () => {
    const rects: PackRect[] = Array.from({ length: 5 }, (_, i) => ({
      id: `same-${i}`,
      width: 100,
      height: 100,
    }));
    const packed = packRects(rects, 4096, 2);
    expect(packed).toHaveLength(5);
    const ids = packed.map((r) => r.id);
    for (let i = 0; i < 5; i++) {
      expect(ids).toContain(`same-${i}`);
    }
  });

  it("非常に多くの小さい矩形でもパッキングが成功する", () => {
    const rects: PackRect[] = Array.from({ length: 50 }, (_, i) => ({
      id: `r${i}`,
      width: 16,
      height: 16,
    }));
    const packed = packRects(rects, 4096, 2);
    expect(packed).toHaveLength(50);
  });

  it("幅が非常に広く高さが小さい矩形のパッキング", () => {
    const rects: PackRect[] = [{ id: "wide", width: 3000, height: 10 }];
    const packed = packRects(rects, 4096, 0);
    expect(packed).toHaveLength(1);
    expect(packed[0]!.id).toBe("wide");
  });

  it("高さが非常に高く幅が小さい矩形のパッキング", () => {
    const rects: PackRect[] = [{ id: "tall", width: 10, height: 3000 }];
    const packed = packRects(rects, 4096, 0);
    expect(packed).toHaveLength(1);
    expect(packed[0]!.id).toBe("tall");
  });
});

describe("nextPowerOfTwo — ブランチカバレッジ強化", () => {
  it("負の数に対して 1 を返す", () => {
    expect(nextPowerOfTwo(-5)).toBe(1);
    expect(nextPowerOfTwo(-100)).toBe(1);
  });

  it("非常に大きな値（65536）でも正しく動作する", () => {
    expect(nextPowerOfTwo(65536)).toBe(65536);
    expect(nextPowerOfTwo(65537)).toBe(131072);
  });
});

describe("remapUvs — ブランチカバレッジ強化", () => {
  const entry = { layerId: "a", x: 10, y: 20, width: 50, height: 80 };

  it("奇数個の要素（不完全なUVペア）でも安全に処理する", () => {
    const result = remapUvs([0.5, 0.5, 0.5], entry, 1024, 1024);
    expect(result).toHaveLength(4);
    expect(result[2]).toBeDefined();
    expect(result[3]).toBeDefined();
  });

  it("空の UV 配列に対して空配列を返す", () => {
    expect(remapUvs([], entry, 1024, 1024)).toEqual([]);
  });
});

describe("unremapUvs — ブランチカバレッジ強化", () => {
  const entry = { layerId: "a", x: 10, y: 20, width: 50, height: 80 };

  it("奇数個の要素でも安全に処理する", () => {
    const result = unremapUvs([0.05, 0.05, 0.05], entry, 1024, 1024);
    expect(result).toHaveLength(4);
    expect(result[3]).toBeDefined();
  });
});
