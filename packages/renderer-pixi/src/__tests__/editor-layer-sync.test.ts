import type { ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import { describe, expect, it, vi } from "vitest";
import {
  buildMeshes,
  createLayerSyncContext,
  syncMeshProperties,
} from "../editor-layer-sync";

vi.mock("pixi.js", () => {
  function mockContainer(): any {
    const children: unknown[] = [];
    return {
      children,
      sortableChildren: false,
      addChild: vi.fn((child: unknown) => {
        children.push(child);
        return child;
      }),
      destroy: vi.fn(() => {
        children.length = 0;
      }),
    };
  }

  return {
    Container: vi.fn().mockImplementation(mockContainer),
    Graphics: vi.fn().mockImplementation(function () {
      return {
      clear: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      destroy: vi.fn(),
      };
    }),
    MeshSimple: vi.fn().mockImplementation(function (opts: any) {
      return {
      x: 0,
      y: 0,
      alpha: 1,
      visible: true,
      blendMode: "normal",
      tint: 0xffffff,
      zIndex: 0,
      filters: [],
      vertices: opts?.vertices ?? new Float32Array(),
      destroy: vi.fn(),
      };
    }),
    Texture: {
      WHITE: {},
      from: vi.fn(() => ({ destroy: vi.fn() })),
    },
  };
});

function createMesh(overrides: Partial<ViviMeshNode> = {}): ViviMeshNode {
  return {
    id: "body",
    name: "Body",
    kind: "viviMesh",
    visible: true,
    opacity: 1,
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    blendMode: "normal",
    expanded: true,
    children: [],
    mesh: {
      vertices: [0, 0, 100, 0, 0, 100, 100, 100],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 2, 1, 2, 3],
      divisionsX: 1,
      divisionsY: 1,
    },
    ...overrides,
  };
}

function createProject(layer: ViviMeshNode): ProjectData {
  return {
    name: "Test",
    width: 256,
    height: 256,
    layers: [layer],
    parameters: [],
    clips: [],
    scenes: [],
    physicsGroups: [],
    lipsyncConfig: { enabled: false, input: "microphone", mappings: [] },
    skins: {},
    colliders: [],
    stateMachines: [],
  };
}

describe("editor layer sync", () => {
  it("updates mesh position during property sync", async () => {
    const { Container, Graphics } = await import("pixi.js");
    const ctx = createLayerSyncContext();
    const world = new Container();
    const background = new Graphics();
    const layer = createMesh();
    const project = createProject(layer);

    buildMeshes(ctx, world, background, project, {}, {
      getTexture: () => document.createElement("canvas"),
    });

    const mesh = ctx.meshes.get("body") as { x: number; y: number } | undefined;
    expect(mesh).toMatchObject({ x: 10, y: 20 });

    project.layers = [{ ...layer, x: 42, y: 64 }];
    syncMeshProperties(ctx, project, {}, []);

    expect(mesh).toMatchObject({ x: 42, y: 64 });
  });
});
