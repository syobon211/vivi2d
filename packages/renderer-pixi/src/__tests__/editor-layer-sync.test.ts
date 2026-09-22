import type { ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import { describe, expect, it, vi } from "vitest";
import {
  buildMeshes,
  createLayerSyncContext,
  destroyLayerSyncContext,
  prepareLayerSyncV11,
  syncMeshProperties,
  V11_MASK_RENDERER_UNAVAILABLE,
} from "../editor-layer-sync";

vi.mock("pixi.js", async (importOriginal) => {
  const { Matrix } = await importOriginal<typeof import("pixi.js")>();
  function mockContainer(): any {
    const children: any[] = [];
    const container: any = {
      children,
      parent: null,
      visible: true,
      alpha: 1,
      effects: [],
      filters: [],
      sortableChildren: false,
      addChild: vi.fn((...items: any[]) => {
        for (const child of items) {
          child.removeFromParent?.();
          child.parent = container;
          children.push(child);
        }
        return items[0];
      }),
      addChildAt: vi.fn((child: any, index: number) => {
        child.removeFromParent?.();
        child.parent = container;
        children.splice(index, 0, child);
        return child;
      }),
      getChildIndex: (child: any) => children.indexOf(child),
      removeFromParent: () => {
        if (container.parent) {
          const siblings = container.parent.children;
          siblings.splice(siblings.indexOf(container), 1);
          container.parent = null;
        }
      },
      addEffect: (effect: any) => container.effects.push(effect),
      removeEffect: (effect: any) => {
        container.effects = container.effects.filter((item: any) => item !== effect);
      },
      setMask: vi.fn(),
      setFromMatrix: vi.fn(),
      getGlobalTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
      destroy: vi.fn((options?: { children?: boolean }) => {
        container.removeFromParent();
        if (options?.children) for (const child of [...children]) child.destroy();
        children.length = 0;
        container.destroyed = true;
      }),
    };
    return container;
  }

  return {
    Matrix,
    Sprite: vi.fn().mockImplementation(function (texture: any) {
      return Object.assign(mockContainer(), { texture });
    }),
    Container: vi.fn().mockImplementation(mockContainer),
    Graphics: vi.fn().mockImplementation(function () {
      return Object.assign(mockContainer(), {
        clear: vi.fn(),
        rect: vi.fn(),
        fill: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
      });
    }),
    MeshSimple: vi.fn().mockImplementation(function (opts: any) {
      const indexBuffer = { destroy: vi.fn() };
      const geometry = {
        buffers: [{ destroy: vi.fn() }, { destroy: vi.fn() }, indexBuffer],
        indexBuffer,
        destroy: vi.fn(() => indexBuffer.destroy()),
      };
      return Object.assign(mockContainer(), {
        x: 0,
        y: 0,
        alpha: 1,
        visible: true,
        blendMode: "normal",
        tint: 0xffffff,
        zIndex: 0,
        filters: [],
        vertices: opts?.vertices ?? new Float32Array(),
        texture: opts?.texture,
        geometry,
      });
    }),
    AlphaFilter: vi.fn().mockImplementation(function (options: any) {
      return { ...options, destroy: vi.fn() };
    }),
    MaskFilter: vi.fn().mockImplementation(function (options: any) {
      return {
        ...options,
        resources: { uMaskTexture: options.sprite.texture.source },
        destroy: vi.fn(),
      };
    }),
    Texture: {
      WHITE: {},
      from: vi.fn(() => ({ destroy: vi.fn() })),
    },
  };
});

const v11 = () => ({
  features: { v11Masks: true },
  getTexture: () => document.createElement("canvas"),
  v11MaskResources: {
    maxTextureSize: 8192,
    resolution: 1,
    viewportWidth: 256,
    viewportHeight: 256,
    isUnavailable: () => false,
    rasterizeMask: vi.fn(
      (_root: any, request: any) =>
        ({
          width: request.width,
          height: request.height,
          source: { resolution: request.resolution },
          destroy: vi.fn(),
        }) as any,
    ),
    prepareScene: vi.fn(),
  },
  notifyWarning: vi.fn(),
});

async function scene(project: ProjectData, options = v11()) {
  const { Container, Graphics } = await import("pixi.js");
  const ctx = createLayerSyncContext(),
    world = new Container(),
    background = new Graphics();
  expect(buildMeshes(ctx, world, background, project, {}, options)).toBe(true);
  return { ctx, world, background, options };
}

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
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0,
      smoothing: 0,
      gain: 1,
    },
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

    buildMeshes(
      ctx,
      world,
      background,
      project,
      {},
      {
        getTexture: () => document.createElement("canvas"),
      },
    );

    const mesh = ctx.meshes.get("body") as { x: number; y: number } | undefined;
    expect(mesh).toMatchObject({ x: 10, y: 20 });

    project.layers = [{ ...layer, x: 42, y: 64 }];
    syncMeshProperties(ctx, project, {}, []);

    expect(mesh).toMatchObject({ x: 42, y: 64 });
  });

  it("stages ordered nested alpha occurrences and preserves equal-order scene position", async () => {
    const target = createMesh({
      id: "A",
      clipMaskIds: ["B", "D"],
      opacity: 0.5,
      blendMode: "add",
    });
    const project = createProject(target);
    project.layers.push(
      createMesh({ id: "B", clipMaskIds: ["C"], visible: false, opacity: 0.5 }),
      createMesh({ id: "C", visible: false }),
      createMesh({ id: "D", visible: false }),
    );
    const { ctx, options, background } = await scene(project);
    const composite = ctx.v11Composites.get("A")!;
    expect(composite.stages.map((stage) => stage.sourceId)).toEqual(["C", "B", "D"]);
    expect(composite.filter).toMatchObject({ alpha: 1, blendMode: "add" });
    expect(ctx.meshes.get("A")).toMatchObject({ alpha: 0.5, blendMode: "normal" });
    expect(ctx.meshes.get("B")!.visible).toBe(false);
    for (const stage of composite.stages) {
      expect(stage.sprite).toMatchObject({
        visible: true,
        alpha: 1,
        blendMode: "normal",
        tint: 0xffffff,
        includeInBuild: true,
        renderable: false,
        measurable: false,
      });
      expect(stage.filter).toMatchObject({ channel: "alpha", inverse: false });
      expect(stage.wrapper.filters).toEqual([stage.filter]);
      expect(stage.sprite.texture).toBe(ctx.v11Rasters.get(stage.sourceId)!.texture);
    }
    expect(ctx.v11Rasters.get("B")!.mesh.alpha).toBe(0.5);
    expect(options.v11MaskResources.rasterizeMask).toHaveBeenCalledTimes(3);
    expect(
      ctx
        .v11Scene!.children.filter((child) => child.label !== "v11-background")
        .map((child) => child.label),
    ).toEqual(["D", "C", "B:masked", "A:masked"]);
    expect(options.v11MaskResources.prepareScene).toHaveBeenCalledOnce();
    expect(background.visible).toBe(false);
  });

  it("updates invisible skinned sources and final blend without topology rebuild", async () => {
    const target = createMesh({ id: "target", clipMaskIds: ["mask"] });
    const mask = createMesh({ id: "mask", visible: false, x: 3 });
    const project = createProject(target);
    const { mesh: _mesh, ...base } = createMesh({ id: "bone", x: 0, y: 0 });
    project.layers.push(mask, {
      ...base,
      kind: "bone",
      bone: { angle: 0, length: 2, scaleX: 1, scaleY: 1 },
    });
    project.skins.mask = {
      weights: Array.from({ length: 4 }, () => [{ boneId: "bone", weight: 1 }]),
      bindPoseInverse: { bone: [1, 0, 0, 1, 0, 0] },
    };
    const { ctx, options } = await scene(project);
    const composite = ctx.v11Composites.get("target")!,
      occurrence = composite.stages[0]!.sprite;
    const rasterMesh = ctx.v11Rasters.get("mask")!.mesh,
      geometry = rasterMesh.geometry;
    project.layers[2]!.x = 20;
    mask.x = 7;
    mask.opacity = 0.25;
    for (const blendMode of ["normal", "add", "multiply", "screen"] as const) {
      target.blendMode = blendMode;
      expect(syncMeshProperties(ctx, project, {}, ["target"], options)).toBe(true);
      expect(composite.filter.blendMode).toBe(blendMode);
      expect(ctx.meshes.get("target")!.blendMode).toBe("normal");
    }
    expect(ctx.v11Rasters.get("mask")!.mesh.geometry).toBe(geometry);
    expect(rasterMesh.vertices[0]).toBe(20);
    expect(rasterMesh).toMatchObject({ x: 7, alpha: 0.25, visible: true });
    expect(occurrence.alpha).toBe(1);
    expect(options.v11MaskResources.rasterizeMask).toHaveBeenCalledTimes(2);
    expect(options.v11MaskResources.prepareScene).toHaveBeenCalledOnce();
  });

  it("preserves incumbent on failed GPU staging and destroys only owned resources once", async () => {
    const project = createProject(createMesh({ clipMaskIds: ["mask"] }));
    project.layers.push(createMesh({ id: "mask", visible: false }));
    const { ctx, world, background, options } = await scene(project);
    const incumbent = ctx.v11Scene,
      owned = [...ctx.v11OwnedMeshes];
    options.v11MaskResources.prepareScene.mockImplementation((candidate) => {
      expect(candidate).not.toBe(incumbent);
      throw new Error("GPU canary must not leak");
    });
    expect(buildMeshes(ctx, world, background, project, {}, options)).toBe(false);
    expect(ctx.v11Scene).toBe(incumbent);
    expect(world.children).toEqual([incumbent]);
    expect(options.notifyWarning).toHaveBeenLastCalledWith(V11_MASK_RENDERER_UNAVAILABLE);
    for (const mesh of owned) expect(mesh.destroy).not.toHaveBeenCalled();
    const filter = ctx.v11Composites.get("body")!.filter;
    const effects = ctx.v11Composites.get("body")!.stages.map((stage) => stage.filter);
    const geometry = owned.map((mesh) => mesh.geometry);
    const texture = owned.map((mesh) => mesh.texture);
    destroyLayerSyncContext(ctx);
    destroyLayerSyncContext(ctx);
    for (const mesh of owned) expect(mesh.destroy).toHaveBeenCalledOnce();
    for (const item of geometry) {
      expect(item.destroy).toHaveBeenCalledOnce();
      for (const buffer of item.buffers) expect(buffer.destroy).toHaveBeenCalledOnce();
    }
    for (const item of texture) expect(item.destroy).not.toHaveBeenCalled();
    expect(filter.destroy).toHaveBeenCalledOnce();
    for (const effect of effects) expect(effect.destroy).toHaveBeenCalledOnce();
  });

  it("rejects resource/graph/frame failures before changing any incumbent values", async () => {
    const target = createMesh({ clipMaskIds: ["mask"] });
    const mask = createMesh({ id: "mask", visible: false });
    const project = createProject(target);
    project.layers.push(mask);
    const { ctx, world, background, options } = await scene(project);
    const root = ctx.v11Scene,
      mesh = ctx.meshes.get("body")!;
    target.x = 999;
    mask.mesh = { ...mask.mesh, vertices: mask.mesh.vertices.map((v) => v * 1000) };
    expect(syncMeshProperties(ctx, project, {}, [], options)).toBe(false);
    expect(mesh.x).toBe(10);
    expect(ctx.v11Scene).toBe(root);
    expect(
      buildMeshes(
        ctx,
        world,
        background,
        project,
        {},
        { ...options, v11MaskResources: undefined },
      ),
    ).toBe(false);
    mask.clipMaskIds = ["body"];
    expect(buildMeshes(ctx, world, background, project, {}, options)).toBe(false);
    expect(ctx.v11Scene).toBe(root);
    expect(
      options.notifyWarning.mock.calls.every(
        ([message]) => message === V11_MASK_RENDERER_UNAVAILABLE,
      ),
    ).toBe(true);
  });

  it("removes the last mask and restores it on rebuild without double target blend", async () => {
    const target = createMesh({ clipMaskIds: ["mask"], blendMode: "screen" });
    const project = createProject(target);
    project.layers.push(createMesh({ id: "mask", visible: false }));
    const { ctx, world, background, options } = await scene(project);
    const old = ctx.v11Composites.get("body")!;
    target.clipMaskIds = [];
    expect(buildMeshes(ctx, world, background, project, {}, options)).toBe(true);
    expect(ctx.v11Composites.size).toBe(0);
    expect(ctx.meshes.get("body")!.blendMode).toBe("screen");
    expect(old.filter.destroy).toHaveBeenCalledOnce();
    target.clipMaskIds = ["mask"];
    expect(buildMeshes(ctx, world, background, project, {}, options)).toBe(true);
    expect(ctx.v11Composites.get("body")!.filter.blendMode).toBe("screen");
    expect(ctx.meshes.get("body")!.blendMode).toBe("normal");
  });

  it("retains old owners through the CPU participant and rolls back a committed frame or scene", async () => {
    const target = createMesh({ clipMaskIds: ["mask"] });
    const mask = createMesh({ id: "mask", visible: false });
    const project = createProject(target);
    project.layers.push(mask);
    const { ctx, world, background, options } = await scene(project);
    const oldScene = ctx.v11Scene,
      oldTexture = ctx.v11Rasters.get("mask")!.texture;
    mask.x += 1;
    target.opacity = 0.5;
    const frame = prepareLayerSyncV11(ctx, world, background, project, options);
    expect(ctx.meshes.get("body")!.alpha).toBe(1);
    expect(ctx.v11Rasters.get("mask")!.texture).toBe(oldTexture);
    frame.commit();
    const pending = ctx.v11Rasters.get("mask")!.texture;
    expect(pending).not.toBe(oldTexture);
    expect(oldTexture.destroy).not.toHaveBeenCalled();
    frame.rollback();
    expect(ctx.meshes.get("body")!.alpha).toBe(1);
    expect(ctx.v11Rasters.get("mask")!.texture).toBe(oldTexture);
    expect(pending.destroy).toHaveBeenCalledOnce();
    const replacement = prepareLayerSyncV11(ctx, world, background, project, {
      ...options,
      rebuild: true,
    });
    replacement.commit();
    expect(ctx.v11Scene).not.toBe(oldScene);
    expect(oldTexture.destroy).not.toHaveBeenCalled();
    replacement.rollback();
    expect(ctx.v11Scene).toBe(oldScene);
    expect(world.children).toEqual([oldScene]);
    const accepted = prepareLayerSyncV11(ctx, world, background, project, options);
    accepted.commit();
    accepted.finalize();
    accepted.finalize();
    expect(oldTexture.destroy).toHaveBeenCalledOnce();
  });

  it("prepares close and legacy transition through the same reversible owner swap", async () => {
    const project = createProject(createMesh({ clipMaskIds: ["mask"] }));
    project.layers.push(createMesh({ id: "mask", visible: false }));
    const { ctx, world, background, options } = await scene(project);
    const original = ctx.v11Scene,
      texture = ctx.v11Rasters.get("mask")!.texture;
    const close = prepareLayerSyncV11(ctx, world, background, null, options);
    expect(ctx.v11Scene).toBe(original);
    close.commit();
    expect(ctx.meshes.size).toBe(0);
    close.rollback();
    expect(ctx.v11Scene).toBe(original);
    expect(texture.destroy).not.toHaveBeenCalled();
    const legacy = createProject(createMesh());
    const transition = prepareLayerSyncV11(ctx, world, background, legacy, {
      ...options,
      features: { v11Masks: false },
    });
    transition.commit();
    transition.finalize();
    expect(ctx.v11Mode).toBe(false);
    expect(ctx.v11Composites.size).toBe(0);
    expect(texture.destroy).toHaveBeenCalledOnce();
    legacy.layers[0]!.x = 123;
    expect(syncMeshProperties(ctx, legacy, {}, [])).toBe(true);
    expect(ctx.meshes.get("body")!.x).toBe(123);
  });

  it("requires valid resources and checks every unmasked atlas alias before GPU preparation", async () => {
    const project = createProject(createMesh());
    project.layers.push(createMesh({ id: "hidden", visible: false }));
    const { ctx, world, background, options } = await scene(project);
    const incumbent = ctx.v11Scene;
    expect(options.v11MaskResources.prepareScene).toHaveBeenCalledOnce();
    expect(options.v11MaskResources.rasterizeMask).not.toHaveBeenCalled();
    const resources = options.v11MaskResources;
    for (const invalid of [
      undefined,
      { ...resources, resolution: 0 },
      { ...resources, maxTextureSize: 0 },
      { ...resources, viewportWidth: resources.maxTextureSize + 1 },
      { ...resources, viewportHeight: 0 },
    ]) {
      expect(() =>
        prepareLayerSyncV11(ctx, world, background, project, {
          ...options,
          rebuild: true,
          v11MaskResources: invalid,
        }),
      ).toThrow(V11_MASK_RENDERER_UNAVAILABLE);
    }
    const oversized = document.createElement("canvas");
    oversized.width = resources.maxTextureSize + 1;
    oversized.height = 1;
    const { Texture } = await import("pixi.js");
    const textureCalls = vi.mocked(Texture.from).mock.calls.length;
    expect(() =>
      prepareLayerSyncV11(ctx, world, background, project, {
        ...options,
        rebuild: true,
        getTexture: (id) => (id === "hidden" ? oversized : options.getTexture()),
      }),
    ).toThrow(V11_MASK_RENDERER_UNAVAILABLE);
    expect(vi.mocked(Texture.from).mock.calls.length).toBe(textureCalls);
    expect(resources.prepareScene).toHaveBeenCalledOnce();
    expect(ctx.v11Scene).toBe(incumbent);
    expect(world.children).toEqual([incumbent]);
  });

  it("prepares unmasked scenes before commit and keeps their owners reversible", async () => {
    const project = createProject(createMesh());
    const { ctx, world, background, options } = await scene(project);
    const incumbent = ctx.v11Scene,
      mesh = ctx.meshes.get("body")!;
    const candidate = structuredClone(project);
    candidate.layers[0]!.x = 99;
    const staged = prepareLayerSyncV11(ctx, world, background, candidate, {
      ...options,
      rebuild: true,
    });
    expect(options.v11MaskResources.prepareScene).toHaveBeenCalledTimes(2);
    expect(ctx.v11Scene).toBe(incumbent);
    expect(mesh.destroy).not.toHaveBeenCalled();
    staged.commit();
    expect(ctx.meshes.get("body")!.x).toBe(99);
    expect(mesh.destroy).not.toHaveBeenCalled();
    staged.rollback();
    expect(ctx.v11Scene).toBe(incumbent);
    expect(ctx.meshes.get("body")).toBe(mesh);
    expect(mesh.destroy).not.toHaveBeenCalled();
    options.v11MaskResources.prepareScene.mockImplementation(() => {
      throw new Error("fixed preflight rejection");
    });
    expect(() =>
      prepareLayerSyncV11(ctx, world, background, candidate, {
        ...options,
        rebuild: true,
      }),
    ).toThrow(V11_MASK_RENDERER_UNAVAILABLE);
    expect(ctx.v11Scene).toBe(incumbent);
    // No new textures or GPU preflight are needed for an unmasked property frame.
    expect(syncMeshProperties(ctx, project, {}, [])).toBe(true);
    const beforeClose = options.v11MaskResources.prepareScene.mock.calls.length;
    const close = prepareLayerSyncV11(ctx, world, background, null, options);
    close.rollback();
    expect(options.v11MaskResources.prepareScene).toHaveBeenCalledTimes(beforeClose);
    expect(ctx.v11Scene).toBe(incumbent);
  });

  it("restores structural owners despite real Pixi removed events throwing or reentering", async () => {
    const mockedPixi = await import("pixi.js");
    vi.doUnmock("pixi.js");
    vi.resetModules();
    const real = await import("pixi.js");
    const sync = await import("../editor-layer-sync");
    const world = new real.Container(),
      background = new real.Graphics();
    const incumbent = new real.Container(),
      oldBackground = new real.Graphics();
    incumbent.addChild(oldBackground);
    world.addChild(background, incumbent);
    const ctx = sync.createLayerSyncContext();
    ctx.v11Scene = incumbent;
    ctx.v11Background = oldBackground;
    ctx.v11Mode = true;
    const oldMeshes = ctx.meshes;
    try {
      const close = sync.prepareLayerSyncV11(ctx, world, background, null, {
        getTexture: () => undefined,
      });
      close.commit();
      const candidate = ctx.v11Scene!,
        candidateBackground = ctx.v11Background!;
      let events = 0;
      candidate.on("removed", () => {
        events++;
        expect(candidate.parent).toBeNull();
        close.rollback(); // Terminal state must be set before this public callback.
        throw new Error("fixed public removed failure");
      });
      expect(() => close.rollback()).not.toThrow();
      close.rollback();
      expect(events).toBe(1);
      expect(ctx.v11Scene).toBe(incumbent);
      expect(ctx.meshes).toBe(oldMeshes);
      expect(world.children).toEqual([background, incumbent]);
      expect(background.visible).toBe(true);
      expect(candidate.destroyed && candidateBackground.destroyed).toBe(true);

      // addChild installs the child before notifying. Its throw enters commit's
      // rollback, whose candidate removal notification also throws.
      let failedCandidate: InstanceType<typeof real.Container> | undefined;
      world.on("childAdded", (child) => {
        if (child === incumbent || child === background) return;
        failedCandidate = child;
        child.on("removed", () => {
          throw new Error("fixed second removal failure");
        });
        throw new Error("fixed public childAdded failure");
      });
      const failed = sync.prepareLayerSyncV11(ctx, world, background, null, {
        getTexture: () => undefined,
      });
      expect(() => failed.commit()).toThrow(V11_MASK_RENDERER_UNAVAILABLE);
      failed.rollback();
      expect(ctx.v11Scene).toBe(incumbent);
      expect(world.children).toEqual([background, incumbent]);
      expect(failedCandidate?.destroyed).toBe(true);
      world.removeAllListeners();

      // Proven cleanup boundary: a first owned mesh's public removal exception
      // must not abandon the other owned geometry/background.
      const make = () =>
        new real.MeshSimple({
          texture: real.Texture.EMPTY,
          vertices: new Float32Array([0, 0, 1, 0, 0, 1]),
          uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
          indices: new Uint32Array([0, 1, 2]),
        });
      const first = make(),
        second = make();
      incumbent.addChild(first, second);
      ctx.v11OwnedMeshes.add(first);
      ctx.v11OwnedMeshes.add(second);
      first.on("removed", () => {
        throw new Error("fixed owned removal failure");
      });
      expect(() => sync.destroyLayerSyncContext(ctx)).not.toThrow();
      expect(first.destroyed && second.destroyed && oldBackground.destroyed).toBe(true);
      expect(real.Texture.EMPTY.destroyed).toBe(false);
      expect(ctx.v11OwnedMeshes.size).toBe(0);
    } finally {
      world.removeAllListeners();
      sync.destroyLayerSyncContext(ctx);
      world.destroy({ children: true });
      vi.doMock("pixi.js", () => mockedPixi);
      vi.resetModules();
    }
  });
});
