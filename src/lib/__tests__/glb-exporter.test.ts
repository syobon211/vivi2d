import { Bone, Mesh, Object3D, Scene } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBoneNode, createProject, createViviMesh } from "@/test/fixtures";

const { parse, getAllTextures } = vi.hoisted(() => ({
  parse: vi.fn(),
  getAllTextures: vi.fn(),
}));

vi.mock("three/examples/jsm/exporters/GLTFExporter.js", () => ({
  GLTFExporter: vi.fn().mockImplementation(function () {
    return { parse };
  }),
}));

vi.mock("@/lib/texture-store", () => ({ getAllTextures }));

import { exportGlb } from "../export/glb-exporter";

describe("exportGlb", () => {
  beforeEach(() => {
    parse.mockReset();
    getAllTextures.mockReset();
    getAllTextures.mockReturnValue(new Map());
  });

  it("実sceneの座標・UV・index・骨親子をbinary exporterへ渡す", async () => {
    const canvas = document.createElement("canvas");
    getAllTextures.mockReturnValue(new Map([["mesh-1", canvas]]));
    const mesh = createViviMesh({
      id: "mesh-1",
      name: "体",
      x: 100,
      y: 200,
      mesh: {
        vertices: [0, 0, 50, 0, 0, 100],
        uvs: [0, 0, 0.5, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    const child = createBoneNode({
      id: "child",
      name: "腕",
      x: 100,
      y: 50,
      parentBoneId: "root",
    });
    const root = createBoneNode({
      id: "root",
      name: "胴",
      x: 300,
      y: 400,
      children: [child],
    });
    const project = createProject({ name: "モデル", layers: [mesh, root] });
    const binary = new Uint8Array([1, 2, 3, 4]).buffer;
    parse.mockImplementation((_scene, onDone) => onDone(binary));

    expect(await exportGlb(project)).toBe(binary);
    expect(parse).toHaveBeenCalledOnce();
    const [scene, onDone, onError, options] = parse.mock.calls[0]!;
    expect(scene).toBeInstanceOf(Scene);
    expect(scene.name).toBe("モデル");
    expect(scene.children).toHaveLength(2);
    expect(onDone).toEqual(expect.any(Function));
    expect(onError).toEqual(expect.any(Function));
    expect(options).toEqual({ binary: true });

    const [actualMesh, armature] = scene.children;
    expect(actualMesh).toBeInstanceOf(Mesh);
    expect(actualMesh.name).toBe("体");
    expect([...actualMesh.geometry.getAttribute("position").array]).toEqual([
      1, -2, 0, 1.5, -2, 0, 1, -3, 0,
    ]);
    expect([...actualMesh.geometry.getAttribute("uv").array]).toEqual([
      0, 0, 0.5, 0, 0, 1,
    ]);
    expect([...actualMesh.geometry.getIndex().array]).toEqual([0, 1, 2]);
    expect(actualMesh.material.map.image).toBe(canvas);
    expect(actualMesh.material.map.flipY).toBe(false);
    expect(armature).toBeInstanceOf(Object3D);
    expect(armature.name).toBe("Armature");
    expect(armature.children).toHaveLength(1);
    const actualRoot = armature.children[0]!;
    expect(actualRoot).toBeInstanceOf(Bone);
    expect(actualRoot.name).toBe("胴");
    expect(actualRoot.position.toArray()).toEqual([3, -4, 0]);
    expect(actualRoot.children).toHaveLength(1);
    expect(actualRoot.children[0]).toBeInstanceOf(Bone);
    expect(actualRoot.children[0].name).toBe("腕");
    expect(actualRoot.children[0].parent).toBe(actualRoot);
    expect(actualRoot.children[0].position.toArray()).toEqual([1, -0.5, 0]);
  });

  it("空sceneのbinary=false結果をJSON bytesへ変換する", async () => {
    const json = { asset: { version: "2.0" }, scenes: [] };
    parse.mockImplementation((_scene, onDone) => onDone(json));
    const result = await exportGlb(createProject({ layers: [] }), { binary: false });

    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0]![0]).toBeInstanceOf(Scene);
    expect(parse.mock.calls[0]![0].children).toEqual([]);
    expect(parse.mock.calls[0]![3]).toEqual({ binary: false });
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(result)).toBe(
      '{"asset":{"version":"2.0"},"scenes":[]}',
    );
  });

  it("exporterの失敗callbackをrejectとして返す", async () => {
    parse.mockImplementation((_scene, _onDone, onError) => onError("synthetic failure"));
    await expect(exportGlb(createProject({ layers: [] }))).rejects.toThrow(
      "GLB export failed: synthetic failure",
    );
    expect(parse).toHaveBeenCalledOnce();
  });
});
