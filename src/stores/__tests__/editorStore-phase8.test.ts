import { findLayerById } from "@vivi2d/core/layer-utils";
import type { ViviMeshNode, MeshData } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as autoMesh from "@/lib/auto-mesh";
import * as textureStore from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createEmptyProject, createGroup } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";

const MOCK_AUTO_MESH: MeshData = {
  vertices: [0, 0, 50, 0, 50, 50, 0, 50],
  uvs: [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5],
  indices: [0, 1, 2, 0, 2, 3],
  divisionsX: 0,
  divisionsY: 0,
};

function setupProject() {
  const artA = createViviMesh({ name: "ViviMesh A" });
  const artB = createViviMesh({ name: "ViviMesh B" });
  const group = createGroup({ name: "Group" });
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [artA, artB, group],
    },
    projectVersion: 1,
  });
  return { artAId: artA.id, artBId: artB.id, groupId: group.id };
}

function getLayer(id: string) {
  return findLayerById(useEditorStore.getState().project!.layers, id)!;
}

function mockTexture() {
  const canvas = {
    width: 100,
    height: 100,
    getContext: () => ({ getImageData: vi.fn() }),
  } as unknown as HTMLCanvasElement;
  vi.spyOn(textureStore, "getTexture").mockReturnValue(canvas);
  return canvas;
}

describe("setAutoMesh", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("replaces the mesh for a ViviMesh when auto mesh generation succeeds", () => {
    const { artAId } = setupProject();
    mockTexture();
    vi.spyOn(autoMesh, "generateAutoMesh").mockReturnValue(MOCK_AUTO_MESH);

    const oldMesh = (getLayer(artAId) as ViviMeshNode).mesh;
    useEditorStore.getState().setAutoMesh(artAId, "standard");
    const newMesh = (getLayer(artAId) as ViviMeshNode).mesh;

    expect(newMesh).not.toEqual(oldMesh);
    expect(newMesh.divisionsX).toBe(0);
    expect(newMesh.divisionsY).toBe(0);
    expect(newMesh.indices).toEqual(MOCK_AUTO_MESH.indices);
  });

  it("keeps the old mesh when auto mesh generation returns null", () => {
    const { artAId } = setupProject();
    mockTexture();
    vi.spyOn(autoMesh, "generateAutoMesh").mockReturnValue(null);

    const oldMesh = (getLayer(artAId) as ViviMeshNode).mesh;
    useEditorStore.getState().setAutoMesh(artAId, "standard");
    const newMesh = (getLayer(artAId) as ViviMeshNode).mesh;

    expect(newMesh.divisionsX).toBe(oldMesh.divisionsX);
  });

  it("keeps the old mesh when there is no texture", () => {
    const { artAId } = setupProject();
    vi.spyOn(textureStore, "getTexture").mockReturnValue(undefined);

    const oldVerts = (getLayer(artAId) as ViviMeshNode).mesh.vertices;
    useEditorStore.getState().setAutoMesh(artAId, "standard");
    const newVerts = (getLayer(artAId) as ViviMeshNode).mesh.vertices;

    expect(newVerts).toEqual(oldVerts);
  });

  it("does not throw when called on a non-ViviMesh layer", () => {
    const { groupId } = setupProject();
    mockTexture();

    expect(() =>
      useEditorStore.getState().setAutoMesh(groupId, "standard"),
    ).not.toThrow();
  });
});

describe("setAutoMeshBatch", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("applies auto mesh to every selected ViviMesh", () => {
    const { artAId, artBId } = setupProject();
    mockTexture();
    vi.spyOn(autoMesh, "generateAutoMesh").mockReturnValue(MOCK_AUTO_MESH);

    useEditorStore.getState().setAutoMeshBatch([artAId, artBId], "coarse");

    const meshA = (getLayer(artAId) as ViviMeshNode).mesh;
    const meshB = (getLayer(artBId) as ViviMeshNode).mesh;
    expect(meshA.divisionsX).toBe(0);
    expect(meshB.divisionsX).toBe(0);
  });

  it("ignores non-ViviMesh ids in the batch", () => {
    const { artAId, groupId } = setupProject();
    mockTexture();
    vi.spyOn(autoMesh, "generateAutoMesh").mockReturnValue(MOCK_AUTO_MESH);

    expect(() =>
      useEditorStore.getState().setAutoMeshBatch([artAId, groupId], "standard"),
    ).not.toThrow();

    const meshA = (getLayer(artAId) as ViviMeshNode).mesh;
    expect(meshA.divisionsX).toBe(0);
  });

  it("uses per-layer preset overrides when they are provided", () => {
    const { artAId, artBId } = setupProject();
    mockTexture();
    const spy = vi.spyOn(autoMesh, "generateAutoMesh").mockReturnValue(MOCK_AUTO_MESH);

    useEditorStore.getState().setAutoMeshBatch([artAId, artBId], "standard", {
      [artAId]: "fine",
      [artBId]: "coarse",
    });

    expect(spy).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      "fine",
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      "coarse",
    );
  });

  it("does not throw when the batch is empty", () => {
    setupProject();
    expect(() =>
      useEditorStore.getState().setAutoMeshBatch([], "standard"),
    ).not.toThrow();
  });
});
