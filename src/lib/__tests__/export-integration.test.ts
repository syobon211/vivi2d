import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportedTexture } from "@/lib/export/texture-exporter";
import {
  createAnimationClip,
  createViviMesh,
  createBoneNode,
  createEmptyProject,
} from "@/test/fixtures";

vi.mock("@/lib/export/texture-exporter", () => ({
  exportTextures: vi.fn(),
}));

import { exportForSpine } from "@/lib/export/index";
import { exportTextures } from "@/lib/export/texture-exporter";

const mockedExportTextures = vi.mocked(exportTextures);

describe("exportForSpine（統合テスト）", () => {
  beforeEach(() => {
    mockedExportTextures.mockReset();
  });

  it("空プロジェクト（レイヤーなし）は spine.json のみ返す", async () => {
    mockedExportTextures.mockResolvedValue([]);

    const project = createEmptyProject();
    const result = await exportForSpine(project, []);

    expect(result.files).toHaveLength(1);
    const jsonFile = result.files.find((f) => f.path.endsWith(".spine.json"));
    expect(jsonFile).toBeDefined();

    const textureFile = result.files.find((f) => f.path.endsWith(".png"));
    expect(textureFile).toBeUndefined();
  });

  it("基本プロジェクトは spine.json と texture_00.png を返す", async () => {
    const fakeBlob = new Blob(["fake-png"], { type: "image/png" });
    mockedExportTextures.mockResolvedValue([
      { fileName: "texture_00.png", blob: fakeBlob },
    ] satisfies ExportedTexture[]);

    const mesh = createViviMesh({ name: "テスト素材" });
    const project = createEmptyProject();
    project.name = "テストモデル";
    project.layers = [mesh];

    const result = await exportForSpine(project, []);

    expect(result.files).toHaveLength(2);

    const jsonFile = result.files.find((f) => f.path.endsWith(".spine.json"));
    expect(jsonFile).toBeDefined();
    expect(jsonFile!.path).toBe("テストモデル.spine.json");

    const textureFile = result.files.find((f) => f.path === "texture_00.png");
    expect(textureFile).toBeDefined();
    expect(textureFile!.content).toBeInstanceOf(Blob);
  });

  it("アニメーションクリップ付きプロジェクトは json.animations にクリップが含まれる", async () => {
    mockedExportTextures.mockResolvedValue([]);

    const project = createEmptyProject();
    project.name = "アニメモデル";

    const clip = createAnimationClip({ name: "待機モーション" });
    const result = await exportForSpine(project, [clip]);

    const jsonFile = result.files.find((f) => f.path.endsWith(".spine.json"));
    expect(jsonFile).toBeDefined();

    const spineJson = JSON.parse(jsonFile!.content as string);
    expect(spineJson.animations).toHaveProperty("待機モーション");
  });

  it("layerIds フィルタで指定したViviMeshのみエクスポートされる", async () => {
    const fakeBlob = new Blob(["fake-png"], { type: "image/png" });
    mockedExportTextures.mockResolvedValue([
      { fileName: "texture_00.png", blob: fakeBlob },
    ] satisfies ExportedTexture[]);

    const meshA = createViviMesh({ name: "顔" });
    const meshB = createViviMesh({ name: "体" });
    const project = createEmptyProject();
    project.name = "部分モデル";
    project.layers = [meshA, meshB];

    const result = await exportForSpine(project, [], {
      layerIds: new Set([meshA.id]),
    });

    const jsonFile = result.files.find((f) => f.path.endsWith(".spine.json"));
    const spineJson = JSON.parse(jsonFile!.content as string);

    expect(spineJson.slots).toHaveLength(1);
    expect(spineJson.slots[0].name).toBe("顔");

    expect(mockedExportTextures).toHaveBeenCalledWith(project, new Set([meshA.id]));
  });

  it("clipIds フィルタで指定したクリップのみエクスポートされる", async () => {
    mockedExportTextures.mockResolvedValue([]);

    const project = createEmptyProject();
    project.name = "クリップフィルタ";

    const clipA = createAnimationClip({ name: "待機" });
    const clipB = createAnimationClip({ name: "歩行" });

    const result = await exportForSpine(project, [clipA, clipB], {
      clipIds: new Set([clipA.id]),
    });

    const jsonFile = result.files.find((f) => f.path.endsWith(".spine.json"));
    const spineJson = JSON.parse(jsonFile!.content as string);

    expect(Object.keys(spineJson.animations)).toEqual(["待機"]);
  });

  it("フィルタ未指定時は全件エクスポートされる（後方互換）", async () => {
    mockedExportTextures.mockResolvedValue([]);

    const project = createEmptyProject();
    project.name = "全件";

    const clipA = createAnimationClip({ name: "A" });
    const clipB = createAnimationClip({ name: "B" });

    const result = await exportForSpine(project, [clipA, clipB]);

    const jsonFile = result.files.find((f) => f.path.endsWith(".spine.json"));
    const spineJson = JSON.parse(jsonFile!.content as string);

    expect(Object.keys(spineJson.animations)).toEqual(["A", "B"]);
    expect(mockedExportTextures).toHaveBeenCalledWith(project, undefined);
  });

  it("ボーン付きプロジェクトは json.bones にルート + カスタムボーンが含まれる", async () => {
    mockedExportTextures.mockResolvedValue([]);

    const bone = createBoneNode({
      name: "左腕ボーン",
      x: 150,
      y: 300,
    });
    const project = createEmptyProject();
    project.name = "ボーンモデル";
    project.layers = [bone];

    const result = await exportForSpine(project, []);

    const jsonFile = result.files.find((f) => f.path.endsWith(".spine.json"));
    expect(jsonFile).toBeDefined();

    const spineJson = JSON.parse(jsonFile!.content as string);

    expect(spineJson.bones).toHaveLength(2);

    const rootBone = spineJson.bones.find((b: { name: string }) => b.name === "root");
    expect(rootBone).toBeDefined();

    const customBone = spineJson.bones.find(
      (b: { name: string }) => b.name === "左腕ボーン",
    );
    expect(customBone).toBeDefined();
    expect(customBone.parent).toBe("root");
    expect(customBone.x).toBe(150);
    expect(customBone.y).toBe(300);
  });
});
