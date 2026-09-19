import type { ViviFileData } from "@vivi2d/model/types";
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

function createMinimalFileData(): ViviFileData {
  return {
    version: 5,
    project: {
      name: "test",
      width: 200,
      height: 200,
      layers: [
        {
          kind: "viviMesh" as const,
          id: "mesh-1",
          name: "テスト",
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
      ],
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
    atlases: [
      {
        image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk",
        width: 200,
        height: 200,
        entries: [{ layerId: "mesh-1", x: 0, y: 0, width: 100, height: 100 }],
      },
    ],
  } as ViviFileData;
}

describe("extractTextures (@vivi2d/loader)", () => {
  it("rejects oversized decoded atlases before creating a canvas", async () => {
    const fileData = createMinimalFileData();
    fileData.atlases[0]!.width = 1_000_000;
    fileData.atlases[0]!.height = 1_000_000;
    const callsBefore = vi.mocked(document.createElement).mock.calls.length;
    await expect(extractTextures(fileData)).rejects.toThrow();
    expect(vi.mocked(document.createElement).mock.calls.length).toBe(callsBefore);
  });
  it("アトラスからテクスチャCanvasが抽出される", async () => {
    const result = await extractTextures(createMinimalFileData());
    expect(result.size).toBe(1);
    expect(result.has("mesh-1")).toBe(true);
    expect(result.get("mesh-1")!.tagName).toBe("CANVAS");
    expect(result.get("mesh-1")!.width).toBe(100);
    expect(result.get("mesh-1")!.height).toBe(100);
  });

  it.each([
    { width: 0, height: 2, expected: [0, 0, 0, 0, 0, 0.5, 0, 0.5] },
    { width: 2, height: 0, expected: [0, 0, 0.5, 0, 0, 0, 0.5, 0] },
    { width: 0, height: 0, expected: [0, 0, 0, 0, 0, 0, 0, 0] },
  ])("canonicalizes zero axes and retains a $width x $height texture", async ({
    width,
    height,
    expected,
  }) => {
    const fileData = createMinimalFileData();
    const atlas = fileData.atlases[0]!;
    atlas.width = 8;
    atlas.height = 8;
    atlas.entries = [{ layerId: "mesh-1", x: 2, y: 2, width, height }];
    const mesh = fileData.project.layers[0]!;
    if (mesh.kind !== "viviMesh") throw new Error("Expected mesh fixture");
    mesh.mesh.uvs = [0.25, 0.25, 0.375, 0.25, 0.25, 0.375, 0.375, 0.375];

    const textures = await extractTextures(fileData);

    expect([...textures.keys()]).toEqual(["mesh-1"]);
    expect(textures.get("mesh-1")!.width).toBe(width);
    expect(textures.get("mesh-1")!.height).toBe(height);
    expect(mesh.mesh.uvs).toEqual(expected);
    expect(mesh.mesh.uvs.every(Number.isFinite)).toBe(true);
  });

  it("空アトラスで空マップが返る", async () => {
    const fd = createMinimalFileData();
    fd.atlases = [];
    const result = await extractTextures(fd);
    expect(result.size).toBe(0);
  });

  it("walks nested layer trees when extracting textures", async () => {
    const fd = createMinimalFileData();
    const mesh = fd.project.layers[0]!;
    fd.project.layers = [
      {
        kind: "group",
        id: "group-1",
        name: "group",
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        blendMode: "normal",
        expanded: true,
        children: [mesh],
      },
    ] as ViviFileData["project"]["layers"];

    const result = await extractTextures(fd);

    expect(result.size).toBe(1);
    expect(result.has("mesh-1")).toBe(true);
  });

  it("does not crash on legacy leaf layers without children", async () => {
    const fd = createMinimalFileData();
    delete (fd.project.layers[0] as { children?: unknown }).children;

    const result = await extractTextures(fd);

    expect(result.size).toBe(1);
    expect(result.has("mesh-1")).toBe(true);
  });
});

const PNG_FIXTURE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk";
function createAtlasFixture(overrides: {
  atlases?: ViviFileData["atlases"];
  layers?: ViviFileData["project"]["layers"];
}): ViviFileData {
  const fixture = createMinimalFileData();
  if (overrides.atlases) fixture.atlases = overrides.atlases;
  if (overrides.layers) fixture.project.layers = overrides.layers;
  return fixture;
}
describe("atlas extraction and UV remapping (moved from renderer adapter)", () => {
  it("複数アトラス/複数エントリでそれぞれテクスチャが抽出される", async () => {
    const fileData = createAtlasFixture({
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
          image: PNG_FIXTURE,
          width: 200,
          height: 200,
          entries: [{ layerId: "mesh-A", x: 0, y: 0, width: 50, height: 50 }],
        },
        {
          image: PNG_FIXTURE,
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

    const fileData = createAtlasFixture({
      layers: [layer],
      atlases: [
        {
          image: PNG_FIXTURE,
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

    const fileData = createAtlasFixture({
      layers: [layer],
      atlases: [
        {
          image: PNG_FIXTURE,
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
    const fileData = createAtlasFixture({
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
          image: PNG_FIXTURE,
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
