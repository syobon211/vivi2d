import {
  buildMeshes,
  createLayerSyncContext,
  syncMeshProperties,
} from "@vivi2d/renderer-pixi/editor-layer-sync";
import { Container, Graphics } from "pixi.js";
import { afterEach, describe, expect, it } from "vitest";
import { clearTextures, setTexture } from "@/lib/texture-store";
import {
  createViviMesh,
  createArtPathNode,
  createControlPoint,
  createProject,
} from "@/test/fixtures";

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

const screenColorSupport = {
  createFilter: () => ({ destroy: () => undefined, resources: {} }) as any,
  updateFilter: () => undefined,
};

describe("editor-layer-sync feature flags", () => {
  afterEach(() => {
    clearTextures();
  });

  it("skips art path graphics when artPaths=false", () => {
    const artPath = createArtPathNode({
      controlPoints: [
        createControlPoint({ x: 0, y: 0 }),
        createControlPoint({ x: 100, y: 0 }),
      ],
    });
    const project = createProject({ layers: [artPath] });
    const ctx = createLayerSyncContext();

    buildMeshes(
      ctx,
      new Container(),
      new Graphics(),
      project,
      {},
      {
        getTexture: () => null,
        features: { artPaths: false },
      },
    );

    expect(ctx.artPathGraphics.size).toBe(0);
  });

  it("skips clip masks when clipMasks=false", () => {
    const maskMesh = createViviMesh({ name: "Mask" });
    const targetMesh = createViviMesh({
      name: "Target",
      clipMaskIds: [maskMesh.id],
    });
    const project = createProject({ layers: [maskMesh, targetMesh] });
    setTexture(maskMesh.id, makeCanvas(maskMesh.width, maskMesh.height));
    setTexture(targetMesh.id, makeCanvas(targetMesh.width, targetMesh.height));
    const ctx = createLayerSyncContext();

    buildMeshes(
      ctx,
      new Container(),
      new Graphics(),
      project,
      {},
      {
        getTexture: (layerId) =>
          layerId === maskMesh.id || layerId === targetMesh.id ? makeCanvas(1, 1) : null,
        features: { clipMasks: false },
      },
    );

    expect(ctx.maskContainers.size).toBe(0);
  });

  it("skips and clears screen color filters when screenColor=false", () => {
    const mesh = createViviMesh({
      name: "Screen Color Mesh",
      screenColor: { r: 0.4, g: 0.2, b: 0.1 },
    });
    const project = createProject({ layers: [mesh] });
    setTexture(mesh.id, makeCanvas(mesh.width, mesh.height));
    const ctx = createLayerSyncContext();

    buildMeshes(
      ctx,
      new Container(),
      new Graphics(),
      project,
      {},
      {
        getTexture: () => makeCanvas(1, 1),
        features: { screenColor: true },
        screenColorSupport,
      },
    );
    expect(ctx.screenFilters.size).toBe(1);

    syncMeshProperties(ctx, project, {}, [], {
      features: { screenColor: false },
      screenColorSupport,
    });

    expect(ctx.screenFilters.size).toBe(0);
    expect(ctx.meshes.get(mesh.id)?.filters).toEqual([]);
  });
});
