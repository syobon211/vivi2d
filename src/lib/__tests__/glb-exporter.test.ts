import { describe, expect, it, vi } from "vitest";

vi.mock("three", () => ({
  Scene: vi.fn().mockImplementation(function () {
    return { name: "", add: vi.fn(), children: [] };
  }),
  Object3D: vi.fn().mockImplementation(function () {
    return { name: "", add: vi.fn(), children: [] };
  }),
  BufferGeometry: vi.fn().mockImplementation(function () {
    return { setAttribute: vi.fn(), setIndex: vi.fn() } as any;
  }),
  BufferAttribute: vi.fn().mockImplementation(function (arr: any, size: number) {
    return { array: arr, itemSize: size };
  }),
  CanvasTexture: vi.fn().mockImplementation(function () {
    return { flipY: true } as any;
  }),
  MeshBasicMaterial: vi.fn().mockImplementation(function () {
    return {};
  }),
  Mesh: vi.fn().mockImplementation(function () {
    return { name: "" } as any;
  }),
  Bone: vi.fn().mockImplementation(function () {
    return { name: "", position: { set: vi.fn() }, add: vi.fn() };
  }),
}));

vi.mock("three/examples/jsm/exporters/GLTFExporter.js", () => ({
  GLTFExporter: vi.fn().mockImplementation(function () {
    return {
      parse: vi.fn(
        (
          _scene: any,
          onDone: (result: ArrayBuffer) => void,
          _onError: any,
          _options: any,
        ) => {
          onDone(new ArrayBuffer(100));
        },
      ),
    };
  }),
}));

vi.mock("@/lib/texture-store", () => ({
  getAllTextures: vi
    .fn()
    .mockReturnValue(new Map([["mesh-1", document.createElement("canvas")]])),
}));

import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import { exportGlb } from "../export/glb-exporter";

describe("exportGlb", () => {
  it("空プロジェクトでもエラーにならない", async () => {
    const project = createProject({ layers: [] });
    const result = await exportGlb(project);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("メッシュレイヤーを含むプロジェクトをエクスポートできる", async () => {
    const mesh = createViviMesh({ id: "mesh-1", name: "テスト" });
    const project = createProject({ layers: [mesh] });
    const result = await exportGlb(project);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("ボーンを含むプロジェクトをエクスポートできる", async () => {
    const bone = createBoneNode({ name: "腕ボーン" });
    const mesh = createViviMesh({ id: "mesh-1", name: "体" });
    const project = createProject({ layers: [mesh, bone] });
    const result = await exportGlb(project);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("binary=falseでも動作する", async () => {
    const project = createProject({ layers: [] });
    const result = await exportGlb(project, { binary: false });
    expect(result).toBeInstanceOf(ArrayBuffer);
  });
});
