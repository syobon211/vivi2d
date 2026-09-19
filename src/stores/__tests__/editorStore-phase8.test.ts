import { findLayerById } from "@vivi2d/core/layer-utils";
import type { ViviMeshNode, MeshData } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as autoMesh from "@/lib/auto-mesh";
import * as textureStore from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";
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
    const invalidate = vi.spyOn(usePuppetWarpStore.getState(), "invalidateMesh");
    const oldMesh = structuredClone((getLayer(artAId) as ViviMeshNode).mesh);
    useEditorStore.getState().setAutoMesh(artAId, "standard");
    expect((getLayer(artAId) as ViviMeshNode).mesh).toEqual(oldMesh);
    expect(invalidate).not.toHaveBeenCalled();
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

  it("batches exact per-mesh inputs and results while leaving non-mesh nodes untouched", () => {
    const artA = createViviMesh({ width: 80, height: 120 });
    const artB = createViviMesh({ width: 160, height: 90 });
    const group = createGroup({ name: "Unchanged group" });
    useEditorStore.setState({
      project: { ...createEmptyProject(), layers: [artA, group, artB] },
    });
    const canvasA = mockTexture();
    const canvasB = { ...canvasA, width: 200 } as HTMLCanvasElement;
    const texture = vi.spyOn(textureStore, "getTexture").mockImplementation(
      (id) => id === artA.id ? canvasA : id === artB.id ? canvasB : undefined,
    );
    const meshB: MeshData = { ...MOCK_AUTO_MESH, vertices: [0, 0, 60, 0, 60, 40, 0, 40] };
    const generate = vi.spyOn(autoMesh, "generateAutoMesh")
      .mockReturnValueOnce(MOCK_AUTO_MESH).mockReturnValueOnce(meshB);

    useEditorStore.getState().setAutoMeshBatch([artA.id, group.id, artB.id], "standard", {
      [artA.id]: "fine",
      [artB.id]: "coarse",
    });

    expect(texture.mock.calls).toEqual([[artA.id], [artB.id]]);
    expect(generate.mock.calls).toEqual([
      [canvasA, 80, 120, "fine"],
      [canvasB, 160, 90, "coarse"],
    ]);
    expect((getLayer(artA.id) as ViviMeshNode).mesh).toEqual(MOCK_AUTO_MESH);
    expect((getLayer(artB.id) as ViviMeshNode).mesh).toEqual(meshB);
    expect(getLayer(group.id)).toEqual(group);
  });



  it("does not throw when the batch is empty", () => {
    setupProject();
    expect(() =>
      useEditorStore.getState().setAutoMeshBatch([], "standard"),
    ).not.toThrow();
  });
});
