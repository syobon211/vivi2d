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
  it("アトラスからテクスチャCanvasが抽出される", async () => {
    const result = await extractTextures(createMinimalFileData());
    expect(result.size).toBe(1);
    expect(result.has("mesh-1")).toBe(true);
    expect(result.get("mesh-1")!.tagName).toBe("CANVAS");
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
