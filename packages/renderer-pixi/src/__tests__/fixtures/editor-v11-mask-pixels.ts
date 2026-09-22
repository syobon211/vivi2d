import type { ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import {
  Application,
  Container,
  Graphics,
  MaskFilter,
  Rectangle,
  type RenderOptions,
  RenderTexture,
  Texture,
  type WebGLRenderer,
} from "pixi.js";
import {
  buildMeshes,
  createLayerSyncContext,
  destroyLayerSyncContext,
  type LayerSyncBuildOptions,
  prepareLayerSyncV11,
  syncMeshProperties,
  V11_MASK_RENDERER_UNAVAILABLE,
} from "../../editor-layer-sync";

const SIZE = 64;
const BG = [0.1, 0.2, 0.6] as const;
const TOLERANCE = 3; // RGBA8 framebuffer/intermediate quantization, in byte values.

function require(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function mesh(id: string, overrides: Partial<ViviMeshNode> = {}): ViviMeshNode {
  return {
    id,
    name: id,
    kind: "viviMesh",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: SIZE,
    height: SIZE,
    blendMode: "normal",
    expanded: true,
    children: [],
    mesh: {
      vertices: [0, 0, SIZE, 0, 0, SIZE, SIZE, SIZE],
      uvs: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      indices: [0, 1, 2, 2, 1, 3],
      divisionsX: 1,
      divisionsY: 1,
    },
    ...overrides,
  };
}

function project(layers: ProjectData["layers"]): ProjectData {
  return {
    name: "Fixed mask pixel witnesses",
    width: SIZE,
    height: SIZE,
    layers,
    parameters: [],
    clips: [],
    scenes: [],
    physicsGroups: [],
    skins: {},
    colliders: [],
    stateMachines: [],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0,
      smoothing: 0,
      gain: 1,
    },
  };
}

export async function runEditorV11MaskPixels() {
  let app = new Application();
  await app.init({
    preference: "webgl",
    width: SIZE,
    height: SIZE,
    resolution: 1,
    antialias: false,
    autoStart: false,
    backgroundAlpha: 1,
  });
  let renderer = app.renderer as WebGLRenderer;
  require(renderer.gl, "Real WebGL is required; no canvas/mock fallback");
  let world = new Container(),
    background = new Graphics();
  app.stage.addChild(background, world);
  let ctx = createLayerSyncContext();
  const textures = new Set<Texture>();
  const canvas = (...pixels: readonly number[][]) => {
    const result = document.createElement("canvas");
    result.width = pixels.length;
    result.height = 1;
    const context = result.getContext("2d");
    require(context, "Canvas fixture unavailable");
    context.putImageData(
      new ImageData(Uint8ClampedArray.from(pixels.flat()), pixels.length, 1),
      0,
      0,
    );
    const texture = Texture.from(result);
    texture.source.scaleMode = "nearest";
    textures.add(texture);
    return result;
  };
  const white = canvas([255, 255, 255, 255]),
    redGreen = canvas([255, 0, 0, 255], [0, 255, 0, 255]);
  const backdrop = canvas([26, 51, 153, 255]),
    opaque = canvas([102, 51, 26, 255]);
  const partial = canvas([255, 0, 0, 128]),
    transparent = canvas([255, 0, 0, 0]);
  const maskAtlas = canvas([255, 0, 0, 0], [0, 255, 0, 255]);
  let surfaces = new Map<string, HTMLCanvasElement>();
  let prepares = 0;
  let installations = 0;
  let adapterFailure = "";
  let unavailable = false;
  let ordinaryReady = true;
  let renderEntries = 0,
    rasterEntries = 0;
  let nativeRender = renderer.render.bind(renderer);
  const render = (args: RenderOptions | Container) => {
    require(!unavailable, "Renderer is retired until lifecycle recovery");
    renderEntries++;
    try {
      nativeRender(args);
    } catch (error) {
      unavailable = true;
      ordinaryReady = false;
      app.stop();
      throw error;
    }
    if (renderer.gl.isContextLost() || renderer.gl.getError() !== renderer.gl.NO_ERROR) {
      unavailable = true;
      throw new Error("Renderer device unavailable");
    }
  };
  // Test the same closed host-adapter rule even for extract's internal render.
  renderer.render = render;
  const owned = new Map<
    RenderTexture,
    { source: RenderTexture["source"]; destroys: number }
  >();
  const allocate = (width: number, height: number, resolution: number) => {
    const texture = RenderTexture.create({ width, height, resolution, antialias: false });
    const record = { source: texture.source, destroys: 0 };
    owned.set(texture, record);
    const destroy = texture.destroy.bind(texture);
    texture.destroy = (destroySource) => {
      record.destroys++;
      destroy(destroySource);
    };
    return texture;
  };
  const options: LayerSyncBuildOptions = {
    features: { v11Masks: true },
    getTexture: (id) => surfaces.get(id),
    v11MaskResources: {
      maxTextureSize: renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE) as number,
      resolution: renderer.resolution,
      viewportWidth: SIZE,
      viewportHeight: SIZE,
      isUnavailable: () => unavailable,
      rasterizeMask(root, request) {
        rasterEntries++;
        const target = allocate(request.width, request.height, request.resolution);
        try {
          render({ container: root, target, transform: request.transform, clear: true });
          return target;
        } catch (error) {
          adapterFailure =
            error instanceof Error ? (error.stack ?? error.message) : "raster failure";
          target.destroy(true);
          throw error;
        }
      },
      prepareScene(scene, transform) {
        const target = allocate(SIZE, SIZE, renderer.resolution);
        try {
          render({ container: scene, target, transform, clear: true });
          require(!renderer.gl.isContextLost() &&
            renderer.gl.getError() ===
              renderer.gl.NO_ERROR, "Detached mask GPU preparation failed");
          prepares++;
        } catch (error) {
          adapterFailure =
            error instanceof Error ? (error.stack ?? error.message) : "preflight failure";
          throw error;
        } finally {
          target.destroy(true);
        }
      },
    },
  };
  const observations: { name: string; actual: number[] }[] = [];
  const check = (name: string, expected: readonly number[], x = 16, y = 20) => {
    require(ordinaryReady &&
      !unavailable, "Ordinary draw blocked pending lifecycle recovery");
    render({ container: app.stage });
    const output = renderer.extract.pixels({
      target: app.stage,
      frame: new Rectangle(0, 0, SIZE, SIZE),
      resolution: 1,
      antialias: false,
    });
    const actual = Array.from(
      output.pixels.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4),
    );
    const golden = [...expected, 1].map((value) => Math.round(value * 255));
    require(actual.every(
      (value, index) => Math.abs(value - golden[index]!) <= TOLERANCE,
    ), `${name}: actual ${actual.join(",")} expected ${golden.join(",")} tolerance ${TOLERANCE}`);
    require(renderer.gl.getError() === renderer.gl.NO_ERROR, `${name}: WebGL error`);
    observations.push({ name, actual });
  };
  const install = (value: ProjectData, images: Record<string, HTMLCanvasElement>) => {
    surfaces = new Map(Object.entries({ bg: backdrop, ...images }));
    installations++;
    require(buildMeshes(
      ctx,
      world,
      background,
      value,
      {},
      options,
    ), `Actual v11 scene unavailable ${installations}: ${adapterFailure}`);
  };
  try {
    // Fixed golden colors are hand-authored in the approved round-3 contract,
    // NOT rendered baselines or results recomputed from production blend code.
    const target = mesh("target", {
      opacity: 0.5,
      blendMode: "add",
      clipMaskIds: ["mask"],
      mesh: {
        vertices: [4, 4, 60, 4, 4, 60, 4, 4, 60, 4, 4, 60],
        uvs: [0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5],
        indices: [0, 1, 2, 3, 4, 5],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    const source = mesh("mask", { visible: false });
    const overlap = project([target, source, mesh("bg")]);
    install(overlap, { target: redGreen, mask: white });
    check("self-overlap-initial-add", [0.35, 0.7, 0.6]);
    const geometry = ctx.meshes.get("target")!.geometry;
    for (const [mode, expected] of [
      ["normal", [0.275, 0.55, 0.15]],
      ["add", [0.35, 0.7, 0.6]],
      ["multiply", [0.05, 0.15, 0.15]],
      ["screen", [0.325, 0.6, 0.6]],
    ] as const) {
      target.blendMode = mode;
      require(syncMeshProperties(
        ctx,
        overlap,
        {},
        [],
        options,
      ), "Live blend sync failed");
      require(ctx.v11Composites.get("target")!.filter.blendMode ===
        mode, "Final filter mode did not update");
      require(ctx.meshes.get("target")!.geometry ===
        geometry, "Live blend rebuilt topology");
      check(`self-overlap-${mode}`, expected);
    }

    const flat = mesh("target", { clipMaskIds: ["mask"], blendMode: "add" });
    const flatProject = project([flat, source, mesh("bg")]);
    install(flatProject, { target: opaque, mask: white });
    check("opaque-final-add", [0.5, 0.4, 0.7]);
    const oldFilter = ctx.v11Composites.get("target")!.filter;
    flat.clipMaskIds = [];
    install(flatProject, { target: opaque, mask: white });
    require(ctx.v11Composites.size === 0 &&
      oldFilter.gpuProgram === null, "Last-mask teardown failed");
    check("last-mask-removed", [0.5, 0.4, 0.7]);
    flat.clipMaskIds = ["mask"];
    install(flatProject, { target: opaque, mask: white });
    check("mask-restored-undo-state", [0.5, 0.4, 0.7]);

    const clipped = mesh("target", { clipMaskIds: ["B", "D"] });
    const B = mesh("B", {
      visible: false,
      clipMaskIds: ["C"],
      mesh: { ...mesh("shape").mesh, vertices: [0, 0, 40, 0, 0, 64, 40, 64] },
    });
    const C = mesh("C", { visible: false, x: 16 });
    const D = mesh("D", {
      visible: false,
      mesh: { ...mesh("shape").mesh, vertices: [0, 0, 64, 0, 0, 40, 64, 40] },
    });
    install(project([clipped, B, C, D, mesh("bg")]), {
      target: white,
      B: white,
      C: white,
      D: white,
    });
    check("nested-two-mask-intersection", [1, 1, 1], 24, 20);
    check("nested-dependency-exclusion", BG, 8, 20);
    check("first-mask-exclusion", BG, 48, 20);
    check("second-mask-exclusion", BG, 24, 48);

    const alphaTarget = mesh("target", { clipMaskIds: ["mask"], opacity: 0.5 });
    const alphaMask = mesh("mask", {
      visible: false,
      multiplyColor: { r: 0, g: 0, b: 0 },
    });
    const alphaProject = project([alphaTarget, alphaMask, mesh("bg")]);
    install(alphaProject, { target: white, mask: partial });
    for (const [opacity, expected] of [
      [0, BG],
      [0.5, [0.2125, 0.3, 0.65]],
      [1, [0.325, 0.4, 0.7]],
    ] as const) {
      alphaMask.opacity = opacity;
      require(syncMeshProperties(
        ctx,
        alphaProject,
        {},
        ["target", "bg"],
        options,
      ), "Source opacity sync failed");
      check(`source-texture-half-alpha-opacity-${opacity}`, expected);
    }
    install(alphaProject, { target: white, mask: transparent });
    check("zero-alpha-ignores-rgb", BG);

    const atlasSource = mesh("mask", {
      visible: false,
      mesh: { ...mesh("shape").mesh, uvs: [0.75, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5] },
    });
    const atlasProject = project([
      mesh("target", { clipMaskIds: ["mask"] }),
      atlasSource,
      mesh("bg"),
    ]);
    install(atlasProject, { target: white, mask: maskAtlas });
    check("whole-atlas-uv-opaque-half", [1, 1, 1]);
    atlasSource.mesh.uvs = [0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.25, 0.5];
    install(atlasProject, { target: white, mask: maskAtlas });
    check("whole-atlas-uv-transparent-half", BG);

    const moving = mesh("mask", {
      visible: false,
      x: 4,
      mesh: { ...mesh("shape").mesh, vertices: [0, 0, 16, 0, 0, 64, 16, 64] },
    });
    const { mesh: _unused, ...boneBase } = mesh("bone");
    const bone = {
      ...boneBase,
      kind: "bone" as const,
      bone: { angle: 0, length: 2, scaleX: 1, scaleY: 1 },
    };
    const movingProject = project([
      mesh("target", { clipMaskIds: ["mask"] }),
      moving,
      bone,
      mesh("bg"),
    ]);
    movingProject.skins.mask = {
      weights: Array.from({ length: 4 }, () => [{ boneId: "bone", weight: 1 }]),
      bindPoseInverse: { bone: [1, 0, 0, 1, 0, 0] },
    };
    install(movingProject, { target: white, mask: white });
    check("skinned-mask-before", [1, 1, 1], 8, 20);
    const occurrence = ctx.v11Rasters.get("mask")!.mesh;
    const occurrenceGeometry = occurrence.geometry,
      oldPrepares = prepares;
    bone.x = 24;
    require(syncMeshProperties(
      ctx,
      movingProject,
      {},
      [],
      options,
    ), "Skinned mask sync failed");
    require(occurrence.geometry === occurrenceGeometry &&
      prepares === oldPrepares, "Source deformation rebuilt scene");
    check("skinned-mask-old-position", BG, 8, 20);
    check("skinned-mask-new-position", [1, 1, 1], 32, 20);

    // Reuse source geometry across actual world transforms and target resolution.
    world.position.set(8, 0);
    world.scale.set(0.5);
    require(syncMeshProperties(
      ctx,
      movingProject,
      {},
      [],
      options,
    ), "Camera scale/translate sync failed");
    check("camera-scale-translate-mask", [1, 1, 1], 24, 10);
    check("camera-scale-translate-exclusion", BG, 16, 10);
    world.position.set(64, 0);
    world.scale.set(1);
    world.rotation = Math.PI / 2;
    renderer.resize(SIZE, SIZE, 2);
    options.v11MaskResources!.resolution = 2;
    require(syncMeshProperties(
      ctx,
      movingProject,
      {},
      [],
      options,
    ), "Camera rotation/resolution sync failed");
    require(ctx.v11Rasters.get("mask")!.mesh.geometry ===
      occurrenceGeometry, "Camera rebuilt source geometry");
    require(ctx.v11Rasters.get("mask")!.texture.source.resolution ===
      2, "Raster resolution was stale");
    check("camera-rotation-resolution-mask", [1, 1, 1], 20, 32);
    check("camera-rotation-resolution-exclusion", BG, 20, 8);
    world.position.set(0, 0);
    world.rotation = 0;
    renderer.resize(SIZE, SIZE, 1);
    options.v11MaskResources!.resolution = 1;

    const repeatedC = mesh("C", { visible: true, opacity: 0.5 });
    const { mesh: _groupMesh, ...groupBase } = mesh("hidden-parent", {
      visible: false,
      opacity: 0,
    });
    const hiddenGroup = { ...groupBase, kind: "group" as const, children: [repeatedC] };
    const repeated = project([
      mesh("target", { clipMaskIds: ["B", "D"] }),
      mesh("B", { visible: false, clipMaskIds: ["C"] }),
      mesh("D", { visible: false, clipMaskIds: ["C"] }),
      hiddenGroup,
      mesh("bg"),
    ]);
    install(repeated, { target: white, B: white, C: white, D: white });
    check("repeated-factor-hidden-ancestor", [0.325, 0.4, 0.7]);
    const repeatedStages = ctx.v11Composites
      .get("target")!
      .stages.filter((stage) => stage.sourceId === "C");
    require(repeatedStages.length === 2, "Repeated source factor was collapsed");
    const sharedTexture = ctx.v11Rasters.get("C")!.texture;
    require(repeatedStages.every(
      (stage) =>
        stage.sprite.texture === sharedTexture &&
        stage.filter.resources.uMaskTexture === sharedTexture.source,
    ), "Repeated source did not share one current texture with two owned bindings");

    repeatedC.opacity = 0.25;
    const pendingFrame = prepareLayerSyncV11(ctx, world, background, repeated, options);
    require(ctx.v11Rasters.get("C")!.texture ===
      sharedTexture, "Preparation published a pending raster");
    pendingFrame.commit();
    const pendingTexture = ctx.v11Rasters.get("C")!.texture;
    require(pendingTexture !== sharedTexture &&
      !sharedTexture.destroyed, "Commit released rollback owner too early");
    require(repeatedStages.every(
      (stage) =>
        stage.sprite.texture === pendingTexture &&
        stage.filter.resources.uMaskTexture === pendingTexture.source,
    ), "Commit did not update both shared-source bindings before next draw");
    pendingFrame.rollback(); // Deliberately NO render between commit and rollback.
    require(pendingTexture.destroyed &&
      !sharedTexture.destroyed &&
      repeatedStages.every(
        (stage) =>
          stage.sprite.texture === sharedTexture &&
          stage.filter.resources.uMaskTexture === sharedTexture.source,
      ), "No-draw rollback lost a source owner or shader binding");
    repeatedC.opacity = 0.5;
    check("shared-source-no-draw-rollback", [0.325, 0.4, 0.7]);
    for (const [opacity, expected] of [
      [0.25, [0.15625, 0.25, 0.625]],
      [0.75, [0.60625, 0.65, 0.825]],
      [0.5, [0.325, 0.4, 0.7]],
    ] as const) {
      const old = ctx.v11Rasters.get("C")!.texture;
      repeatedC.opacity = opacity;
      require(syncMeshProperties(
        ctx,
        repeated,
        {},
        [],
        options,
      ), "Repeated source replacement failed");
      require(old.destroyed &&
        owned.get(old)!.destroys === 1, "Retired source was not destroyed once");
      check(`shared-source-replacement-${opacity}`, expected);
    }

    // One successful render then an independent failure BEFORE the second render
    // is healthy rollback, not an interrupted-render latch.
    const rasterize = options.v11MaskResources!.rasterizeMask;
    const beforeLate = ctx.v11Rasters.get("C")!.texture;
    let preparedCount = 0;
    options.v11MaskResources!.rasterizeMask = (root, request) => {
      if (++preparedCount === 2) throw new Error("fixed independent preparation failure");
      return rasterize(root, request);
    };
    repeatedC.opacity = 0.25;
    (repeated.layers[1] as ViviMeshNode).opacity = 0.5;
    try {
      let failed = false;
      try {
        prepareLayerSyncV11(ctx, world, background, repeated, options);
      } catch {
        failed = true;
      }
      require(failed &&
        preparedCount === 2 &&
        !unavailable &&
        ctx.v11Rasters.get("C")!.texture ===
          beforeLate, "Healthy late preparation failure changed incumbent or retired renderer");
    } finally {
      options.v11MaskResources!.rasterizeMask = rasterize;
    }
    repeatedC.opacity = 0.5;
    (repeated.layers[1] as ViviMeshNode).opacity = 1;
    check("successful-render-then-independent-failure", [0.325, 0.4, 0.7]);

    const rejected = structuredClone(repeated);
    const rejectedSource = rejected.layers[3]!.children[0] as ViviMeshNode;
    rejectedSource.mesh.vertices[2] = options.v11MaskResources!.maxTextureSize + 1;
    const entriesBeforeReject = rasterEntries;
    let resourceRejected = false;
    try {
      prepareLayerSyncV11(ctx, world, background, rejected, options);
    } catch {
      resourceRejected = true;
    }
    require(resourceRejected &&
      rasterEntries === entriesBeforeReject &&
      !unavailable &&
      ctx.v11Rasters.get("C")!.texture ===
        beforeLate, "Actual backend-size rejection entered GPU or changed incumbent");
    check("actual-backend-limit-rejection", [0.325, 0.4, 0.7]);

    // A whole-atlas upload is a candidate resource even without any mask. Keep
    // the existing opaque-add golden; no masked/unmasked equivalence is inferred.
    const unmasked = project([
      mesh("target", { blendMode: "add" }),
      mesh("hidden", { visible: false }),
      mesh("bg"),
    ]);
    const beforeUnmasked = { prepares, rasterEntries };
    install(unmasked, { target: opaque, hidden: white });
    require(prepares === beforeUnmasked.prepares + 1 &&
      rasterEntries ===
        beforeUnmasked.rasterEntries, "Unmasked candidate skipped actual detached GPU preparation");
    check("unmasked-gpu-preparation", [0.5, 0.4, 0.7]);
    const unmaskedScene = ctx.v11Scene,
      unmaskedMesh = ctx.meshes.get("target")!;
    const oversizedAlias = document.createElement("canvas");
    oversizedAlias.width = options.v11MaskResources!.maxTextureSize + 1;
    oversizedAlias.height = 1;
    const beforeUnmaskedReject = { prepares, renderEntries, owners: owned.size };
    let unmaskedRejected = false;
    try {
      prepareLayerSyncV11(ctx, world, background, unmasked, {
        ...options,
        rebuild: true,
        getTexture: (id) => (id === "hidden" ? oversizedAlias : surfaces.get(id)),
      });
    } catch {
      unmaskedRejected = true;
    }
    require(unmaskedRejected &&
      prepares === beforeUnmaskedReject.prepares &&
      renderEntries === beforeUnmaskedReject.renderEntries &&
      owned.size === beforeUnmaskedReject.owners &&
      ctx.v11Scene === unmaskedScene &&
      !unavailable, "Invisible oversized unmasked atlas reached GPU or changed incumbent");
    check("unmasked-oversized-alias-rejection", [0.5, 0.4, 0.7]);
    const unmaskedCandidate = structuredClone(unmasked);
    unmaskedCandidate.layers[0]!.x = SIZE;
    const unmaskedPrepared = prepareLayerSyncV11(
      ctx,
      world,
      background,
      unmaskedCandidate,
      { ...options, rebuild: true },
    );
    require(ctx.v11Scene === unmaskedScene &&
      !unmaskedMesh.destroyed, "Unmasked preparation published or disposed incumbent");
    unmaskedPrepared.rollback();
    check("unmasked-prepared-rollback", [0.5, 0.4, 0.7]);
    const unmaskedCommitted = prepareLayerSyncV11(
      ctx,
      world,
      background,
      unmaskedCandidate,
      { ...options, rebuild: true },
    );
    unmaskedCommitted.commit();
    require(ctx.v11Scene !== unmaskedScene &&
      !unmaskedMesh.destroyed, "Unmasked commit released its rollback owner");
    unmaskedCommitted.rollback(); // No draw between publication and rollback.
    require(ctx.v11Scene === unmaskedScene &&
      ctx.meshes.get("target") ===
        unmaskedMesh, "Unmasked committed rollback lost incumbent ownership");
    check("unmasked-committed-rollback", [0.5, 0.4, 0.7]);
    const prepareUnmaskedScene = options.v11MaskResources!.prepareScene;
    let unmaskedLateRejected = false;
    options.v11MaskResources!.prepareScene = (scene, transform) => {
      prepareUnmaskedScene(scene, transform);
      throw new Error("fixed failure after successful unmasked preflight");
    };
    try {
      prepareLayerSyncV11(ctx, world, background, unmaskedCandidate, {
        ...options,
        rebuild: true,
      });
    } catch {
      unmaskedLateRejected = true;
    } finally {
      options.v11MaskResources!.prepareScene = prepareUnmaskedScene;
    }
    require(unmaskedLateRejected &&
      !unavailable &&
      ctx.v11Scene === unmaskedScene &&
      !unmaskedMesh.destroyed, "Successful unmasked render/later failure broke rollback");
    check("unmasked-successful-preflight-later-failure", [0.5, 0.4, 0.7]);

    // Exact maximum expanded mask application count, with no graph framework.
    const chain = Array.from({ length: 8 }, (_, i) =>
      mesh(`M${i}`, { visible: false, clipMaskIds: i === 7 ? [] : [`M${i + 1}`] }),
    );
    const maximum = project([
      mesh("target", { clipMaskIds: ["M0"] }),
      ...chain,
      mesh("bg"),
    ]);
    install(maximum, {
      target: white,
      ...Object.fromEntries(chain.map((layer) => [layer.id, white])),
    });
    check("eight-expanded-mask-applications", [1, 1, 1]);
    const incumbent = ctx.v11Scene;
    chain[7]!.clipMaskIds = ["too-deep"];
    maximum.layers.push(mesh("too-deep", { visible: false }));
    let warning = "";
    require(!buildMeshes(
      ctx,
      world,
      background,
      maximum,
      {},
      {
        ...options,
        notifyWarning: (value) => {
          warning = value;
        },
      },
    ), "Ninth mask application incorrectly accepted");
    require(ctx.v11Scene === incumbent &&
      warning === V11_MASK_RENDERER_UNAVAILABLE, "Failed stage replaced incumbent");
    check("failed-stage-retains-pixels", [1, 1, 1]);

    // Throw after an actual mask filter apply, not at callback entry. The CPU
    // participant has not committed; old CPU identity is retained, NOT old GPU continuation.
    const cpu = {
      project: maximum,
      carrier: Object.freeze({ id: "fixture-carrier" }),
      history: ["kept"],
    };
    const cpuBefore = { ...cpu },
      failedRenderer = renderer;
    const apply = MaskFilter.prototype.apply;
    let maskApplies = 0;
    MaskFilter.prototype.apply = function (...args) {
      apply.apply(this, args);
      maskApplies++;
      throw new Error("fixed abort after real mask apply");
    };
    // Use the earlier valid graph: the ninth application above was intentionally invalid.
    chain[7]!.clipMaskIds = [];
    maximum.layers.pop();
    try {
      require(!buildMeshes(
        ctx,
        world,
        background,
        maximum,
        {},
        options,
      ), "Interrupted mask render accepted candidate");
      require(maskApplies === 1 &&
        unavailable &&
        !ordinaryReady, "Actual mask/filter abort was not latched");
    } finally {
      MaskFilter.prototype.apply = apply;
    }
    require(cpu.project === cpuBefore.project &&
      cpu.carrier === cpuBefore.carrier &&
      cpu.history === cpuBefore.history, "Render abort changed retained CPU identities");
    const entriesAtAbort = renderEntries;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        if (ordinaryReady) render({ container: app.stage });
        resolve();
      }),
    );
    try {
      render({ container: app.stage });
    } catch {
      /* closed adapter blocks before native entry */
    }
    require(!buildMeshes(
      ctx,
      world,
      background,
      maximum,
      {},
      options,
    ), "Retired renderer accepted another preparation");
    require(renderEntries ===
      entriesAtAbort, "Failed renderer was entered again before recovery");

    // Same ownership slot, sequential existing Application lifecycle, no second
    // live renderer and no private stack/pool reset. Ordinary draw remains stopped.
    destroyLayerSyncContext(ctx);
    app.destroy(true, { children: true, texture: false, textureSource: false });
    app = new Application();
    await app.init({
      preference: "webgl",
      width: SIZE,
      height: SIZE,
      resolution: 1,
      antialias: false,
      autoStart: false,
      backgroundAlpha: 1,
    });
    renderer = app.renderer as WebGLRenderer;
    require(renderer !== failedRenderer, "Recovery reused the interrupted renderer");
    nativeRender = renderer.render.bind(renderer);
    renderer.render = render;
    world = new Container();
    background = new Graphics();
    ctx = createLayerSyncContext();
    app.stage.addChild(background, world);
    options.v11MaskResources!.maxTextureSize = renderer.gl.getParameter(
      renderer.gl.MAX_TEXTURE_SIZE,
    ) as number;
    options.v11MaskResources!.resolution = renderer.resolution;
    unavailable = false; // New instance may prepare; ordinaryReady is still false.
    require(buildMeshes(
      ctx,
      world,
      background,
      maximum,
      {},
      options,
    ), "Lifecycle rebuild failed");
    ordinaryReady = true;
    check("interrupted-render-lifecycle-recovery", [1, 1, 1]);

    destroyLayerSyncContext(ctx);
    for (const texture of textures)
      require(!texture.destroyed, "Layer teardown destroyed a shared texture");
    for (const [texture, record] of owned)
      require(texture.destroyed &&
        record.source.destroyed &&
        record.destroys ===
          1, "Owned render target/source lifetime did not close exactly once");
    return {
      backend: "webgl",
      toleranceBytes: TOLERANCE,
      cases: observations.length,
      observations,
      ownedTargetsDestroyedOnce: owned.size,
      actualMaskAbortApplies: maskApplies,
      failedInstanceSubsequentEntries: 0,
    };
  } finally {
    destroyLayerSyncContext(ctx);
    app.destroy(true, { children: true, texture: false, textureSource: false });
    for (const texture of textures) texture.destroy(true);
  }
}
