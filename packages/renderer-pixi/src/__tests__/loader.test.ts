import type { ViviFileData } from "@vivi2d/core/types";
import { describe, expect, it, vi } from "vitest";
import { extractTextures } from "../loader";


vi.stubGlobal(
  "Image",
  class MockImage {
    width = 100;
    height = 100;
    onload: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    private _src = "";
    get src() {
      return this._src;
    }
    set src(val: string) {
      this._src = val;
      setTimeout(() => this.onload?.(), 0);
    }
  },
);

const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
  const el = originalCreateElement(tag);
  if (tag === "canvas") {
    (el as HTMLCanvasElement).getContext = (() => ({
      drawImage: vi.fn(),
    })) as any;
  }
  return el;
});


function createMinimalFileData(overrides?: {
  atlases?: ViviFileData["atlases"];
  layers?: ViviFileData["project"]["layers"];
}): ViviFileData {
  const layers = overrides?.layers ?? [
    {
      kind: "viviMesh" as const,
      id: "mesh-1",
      name: "テストメッシュ",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      blendMode: "normal" as const,
      expanded: true,
      children: [],
      mesh: {
        vertices: [0, 0, 100, 0, 0, 100, 100, 100],
        uvs: [0, 0, 0.5, 0, 0, 0.5, 0.5, 0.5],
        indices: [0, 1, 2, 1, 2, 3],
        divisionsX: 1,
        divisionsY: 1,
      },
    },
  ];

  const atlases = overrides?.atlases ?? [
    {
      image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk",
      width: 200,
      height: 200,
      entries: [{ layerId: "mesh-1", x: 0, y: 0, width: 100, height: 100 }],
    },
  ];

  return {
    version: 5,
    project: {
      name: "test",
      width: 200,
      height: 200,
      layers,
      parameters: [],
      clips: [],
      scenes: [],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        parameterIds: [],
        smoothing: 0.5,
        sensitivity: 1.0,
      },
      skins: {},
    },
    atlases,
  } as ViviFileData;
}


describe("extractTextures", () => {
  it("アトラス1つ/エントリ1つでCanvasマップが返る", async () => {
    const fileData = createMinimalFileData();

    const result = await extractTextures(fileData);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(1);
    expect(result.has("mesh-1")).toBe(true);

    const texCanvas = result.get("mesh-1")!;
    expect(texCanvas.tagName).toBe("CANVAS");
    expect(texCanvas.width).toBe(100);
    expect(texCanvas.height).toBe(100);
  });

  it("アトラスが空の場合、空マップが返る", async () => {
    const fileData = createMinimalFileData({ atlases: [] });

    const result = await extractTextures(fileData);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("複数アトラス/複数エントリでそれぞれテクスチャが抽出される", async () => {
    const fileData = createMinimalFileData({
      layers: [
        {
          kind: "viviMesh" as const,
          id: "mesh-A",
          name: "A",
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          blendMode: "normal" as const,
          expanded: true,
          children: [],
          mesh: {
            vertices: [0, 0, 50, 0, 0, 50, 50, 50],
            uvs: [0, 0, 0.25, 0, 0, 0.25, 0.25, 0.25],
            indices: [0, 1, 2, 1, 2, 3],
            divisionsX: 1,
            divisionsY: 1,
          },
        },
        {
          kind: "viviMesh" as const,
          id: "mesh-B",
          name: "B",
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 80,
          height: 80,
          blendMode: "normal" as const,
          expanded: true,
          children: [],
          mesh: {
            vertices: [0, 0, 80, 0, 0, 80, 80, 80],
            uvs: [0, 0, 0.4, 0, 0, 0.4, 0.4, 0.4],
            indices: [0, 1, 2, 1, 2, 3],
            divisionsX: 1,
            divisionsY: 1,
          },
        },
      ],
      atlases: [
        {
          image: "iVBOR1",
          width: 200,
          height: 200,
          entries: [{ layerId: "mesh-A", x: 0, y: 0, width: 50, height: 50 }],
        },
        {
          image: "iVBOR2",
          width: 200,
          height: 200,
          entries: [{ layerId: "mesh-B", x: 10, y: 10, width: 80, height: 80 }],
        },
      ],
    });

    const result = await extractTextures(fileData);

    expect(result.size).toBe(2);
    expect(result.has("mesh-A")).toBe(true);
    expect(result.has("mesh-B")).toBe(true);

    expect(result.get("mesh-A")!.width).toBe(50);
    expect(result.get("mesh-A")!.height).toBe(50);
    expect(result.get("mesh-B")!.width).toBe(80);
    expect(result.get("mesh-B")!.height).toBe(80);
  });

  it("ViviMeshノードのUVがアトラス空間からローカル空間に逆リマッピングされる", async () => {
    const layer = {
      kind: "viviMesh" as const,
      id: "mesh-uv",
      name: "UVテスト",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      blendMode: "normal" as const,
      expanded: true,
      children: [],
      mesh: {
        vertices: [0, 0, 100, 0, 0, 100, 100, 100],
        uvs: [0.25, 0.25, 0.75, 0.25, 0.25, 0.75, 0.75, 0.75],
        indices: [0, 1, 2, 1, 2, 3],
        divisionsX: 1,
        divisionsY: 1,
      },
    };

    const fileData = createMinimalFileData({
      layers: [layer],
      atlases: [
        {
          image: "iVBOR",
          width: 200,
          height: 200,
          entries: [{ layerId: "mesh-uv", x: 50, y: 50, width: 100, height: 100 }],
        },
      ],
    });

    await extractTextures(fileData);

    // (0.25*200 - 50)/100 = 0.0, (0.75*200 - 50)/100 = 1.0
    const uvs = fileData.project.layers[0]!.mesh.uvs;
    expect(uvs[0]).toBeCloseTo(0.0, 5); // u0
    expect(uvs[1]).toBeCloseTo(0.0, 5); // v0
    expect(uvs[2]).toBeCloseTo(1.0, 5); // u1
    expect(uvs[3]).toBeCloseTo(0.0, 5); // v1
    expect(uvs[4]).toBeCloseTo(0.0, 5); // u2
    expect(uvs[5]).toBeCloseTo(1.0, 5); // v2
    expect(uvs[6]).toBeCloseTo(1.0, 5); // u3
    expect(uvs[7]).toBeCloseTo(1.0, 5); // v3
  });

  it("viviMesh以外のレイヤーはUV変換をスキップする", async () => {
    const fileData = createMinimalFileData({
      layers: [
        {
          kind: "group" as const,
          id: "group-1",
          name: "グループ",
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          blendMode: "normal" as const,
          expanded: true,
          children: [],
        } as ViviFileData["project"]["layers"][0],
      ],
      atlases: [],
    });

    const result = await extractTextures(fileData);

    expect(result.size).toBe(0);
  });

  it("エントリにマッピングがないviviMeshのUVは変更されない", async () => {
    const layer = {
      kind: "viviMesh" as const,
      id: "mesh-orphan",
      name: "孤立メッシュ",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      blendMode: "normal" as const,
      expanded: true,
      children: [],
      mesh: {
        vertices: [0, 0, 100, 0, 0, 100, 100, 100],
        uvs: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        indices: [0, 1, 2, 1, 2, 3],
        divisionsX: 1,
        divisionsY: 1,
      },
    };

    const fileData = createMinimalFileData({
      layers: [layer],
      atlases: [
        {
          image: "iVBOR",
          width: 200,
          height: 200,
          entries: [{ layerId: "other-mesh", x: 0, y: 0, width: 100, height: 100 }],
        },
      ],
    });

    await extractTextures(fileData);

    const uvs = fileData.project.layers[0]!.mesh.uvs;
    expect(uvs[0]).toBeCloseTo(0.1, 5);
    expect(uvs[1]).toBeCloseTo(0.2, 5);
    expect(uvs[2]).toBeCloseTo(0.3, 5);
    expect(uvs[3]).toBeCloseTo(0.4, 5);
  });

  it("1アトラス内の複数エントリが正しく処理される", async () => {
    const fileData = createMinimalFileData({
      layers: [
        {
          kind: "viviMesh" as const,
          id: "mesh-1",
          name: "M1",
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 80,
          height: 80,
          blendMode: "normal" as const,
          expanded: true,
          children: [],
          mesh: {
            vertices: [0, 0, 80, 0, 0, 80, 80, 80],
            uvs: [0, 0, 0.4, 0, 0, 0.4, 0.4, 0.4],
            indices: [0, 1, 2, 1, 2, 3],
            divisionsX: 1,
            divisionsY: 1,
          },
        },
        {
          kind: "viviMesh" as const,
          id: "mesh-2",
          name: "M2",
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 60,
          height: 60,
          blendMode: "normal" as const,
          expanded: true,
          children: [],
          mesh: {
            vertices: [0, 0, 60, 0, 0, 60, 60, 60],
            uvs: [0.5, 0, 0.8, 0, 0.5, 0.3, 0.8, 0.3],
            indices: [0, 1, 2, 1, 2, 3],
            divisionsX: 1,
            divisionsY: 1,
          },
        },
      ],
      atlases: [
        {
          image: "iVBOR",
          width: 200,
          height: 200,
          entries: [
            { layerId: "mesh-1", x: 0, y: 0, width: 80, height: 80 },
            { layerId: "mesh-2", x: 100, y: 0, width: 60, height: 60 },
          ],
        },
      ],
    });

    const result = await extractTextures(fileData);

    expect(result.size).toBe(2);
    expect(result.get("mesh-1")!.width).toBe(80);
    expect(result.get("mesh-2")!.width).toBe(60);
  });
});
