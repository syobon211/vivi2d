import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextPow2 } from "@/lib/export/texture-exporter";
import { clearTextures, setTexture } from "@/lib/texture-store";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";


const mockDrawImage = vi.fn();
const mockGetContext = vi.fn().mockReturnValue({
  drawImage: mockDrawImage,
});
const mockToBlob = vi.fn((callback: (blob: Blob | null) => void) => {
  callback(new Blob(["fake-png"], { type: "image/png" }));
});

const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
  if (tag === "canvas") {
    const canvas = originalCreateElement("canvas");
    canvas.getContext = mockGetContext as unknown as typeof canvas.getContext;
    canvas.toBlob = mockToBlob as unknown as typeof canvas.toBlob;
    return canvas;
  }
  return originalCreateElement(tag);
});

describe("nextPow2", () => {
  it("1 → 1（すでに2の累乗）", () => {
    expect(nextPow2(1)).toBe(1);
  });

  it("2 → 2（すでに2の累乗）", () => {
    expect(nextPow2(2)).toBe(2);
  });

  it("3 → 4（次の2の累乗に切り上げ）", () => {
    expect(nextPow2(3)).toBe(4);
  });

  it("5 → 8（次の2の累乗に切り上げ）", () => {
    expect(nextPow2(5)).toBe(8);
  });

  it("1023 → 1024（大きな値でも正しく丸める）", () => {
    expect(nextPow2(1023)).toBe(1024);
  });

  it("1024 → 1024（すでに2の累乗）", () => {
    expect(nextPow2(1024)).toBe(1024);
  });

  it("0 → 1（Math.max(1, n) により最小値は1）", () => {
    expect(nextPow2(0)).toBe(1);
  });
});

describe("exportTextures", () => {
  let exportTextures: typeof import("@/lib/export/texture-exporter").exportTextures;

  beforeEach(async () => {
    clearTextures();
    mockDrawImage.mockClear();
    mockGetContext.mockClear();
    mockToBlob.mockClear();

    const mod = await import("@/lib/export/texture-exporter");
    exportTextures = mod.exportTextures;
  });

  afterEach(() => {
    clearTextures();
  });

  it("空プロジェクト（レイヤーなし）は空配列を返す", async () => {
    const project = createEmptyProject();
    const result = await exportTextures(project);
    expect(result).toEqual([]);
  });

  it("テクスチャ未登録のプロジェクトは空配列を返す", async () => {
    const mesh = createViviMesh({ name: "メッシュA" });
    const project = createEmptyProject();
    project.layers = [mesh];

    const result = await exportTextures(project);
    expect(result).toEqual([]);
  });

  it("テクスチャ有りのプロジェクトは texture_00.png を返す", async () => {
    const mesh = createViviMesh({ name: "メッシュA" });
    const project = createEmptyProject();
    project.layers = [mesh];

    const texCanvas = originalCreateElement("canvas");
    texCanvas.width = 128;
    texCanvas.height = 128;
    setTexture(mesh.id, texCanvas);

    const result = await exportTextures(project);
    expect(result).toHaveLength(1);
    expect(result[0]!.fileName).toBe("texture_00.png");
    expect(result[0]!.blob).toBeInstanceOf(Blob);
  });

  it("toBlob が null を返す場合はエラーになる", async () => {
    const mesh = createViviMesh({ name: "メッシュA" });
    const project = createEmptyProject();
    project.layers = [mesh];

    const texCanvas = originalCreateElement("canvas");
    texCanvas.width = 128;
    texCanvas.height = 128;
    setTexture(mesh.id, texCanvas);

    mockToBlob.mockImplementationOnce((callback: (blob: Blob | null) => void) => {
      callback(null);
    });

    await expect(exportTextures(project)).rejects.toThrow(
      "Texture Blob conversion failed",
    );
  });

  it("複数ViviMeshのテクスチャを1枚のアトラスにまとめる", async () => {
    const meshA = createViviMesh({ name: "メッシュA" });
    const meshB = createViviMesh({ name: "メッシュB" });
    const project = createEmptyProject();
    project.layers = [meshA, meshB];

    const canvasA = originalCreateElement("canvas");
    canvasA.width = 64;
    canvasA.height = 64;
    setTexture(meshA.id, canvasA);

    const canvasB = originalCreateElement("canvas");
    canvasB.width = 64;
    canvasB.height = 64;
    setTexture(meshB.id, canvasB);

    const result = await exportTextures(project);
    expect(result).toHaveLength(1);
    expect(result[0]!.fileName).toBe("texture_00.png");
  });
});
