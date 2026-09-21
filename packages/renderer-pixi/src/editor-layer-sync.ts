import { tessellateArtPath } from "@vivi2d/core/artpath-utils";
import { computeBoneWorldTransforms } from "@vivi2d/core/bone-utils";
import {
  getDrawOrder,
  getMultiplyColor,
  isScreenColorDefault,
  rgbColorToHex,
} from "@vivi2d/core/color-utils";
import { isPolygonFlipped } from "@vivi2d/core/culling-utils";
import {
  flattenLayers,
  isLayerEffectivelyVisible,
  isLayerSoloVisible,
} from "@vivi2d/core/layer-utils";
import { meshDataToTypedArrays } from "@vivi2d/core/mesh-utils";
import { computeSkinnedVertices } from "@vivi2d/core/skin-utils";
import type { ProjectData, RGBColor, ViviMeshNode } from "@vivi2d/core/types";
import {
  AlphaFilter,
  Container,
  type Filter,
  Graphics,
  MaskFilter,
  Matrix,
  MeshSimple,
  type RenderTexture,
  Sprite,
  Texture,
} from "pixi.js";
import { toPixiBlendMode } from "./blend-modes";

type ViviMeshLike = {
  id: string;
  blendMode: string;
  multiplyColor?: RGBColor;
  drawOrder?: number;
};

export interface LayerSyncFeatureFlags {
  artPaths?: boolean;
  clipMasks?: boolean;
  screenColor?: boolean;
  /** Opt-in reviewed v11 alpha-mask composition; legacy masks stay unchanged. */
  v11Masks?: boolean;
}

export interface LayerSyncV11MaskResources {
  /** Actual backend limit and current render-target resolution, not CSS size. */
  maxTextureSize: number;
  resolution: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Host latches after any entered render which did not return normally. */
  isUnavailable: () => boolean;
  /** Complete success transfers this one owned texture; failure transfers none. */
  rasterizeMask: (
    source: Container,
    request: {
      width: number;
      height: number;
      resolution: number;
      transform: Matrix;
    },
  ) => RenderTexture;
  /** Detached GPU preparation for every v11 scene rebuild, masked or unmasked. */
  prepareScene: (scene: Container, transform: Matrix) => void;
}

export const V11_MASK_RENDERER_UNAVAILABLE = "V11_MASK_RENDERER_UNAVAILABLE";

export interface LayerSyncBuildOptions {
  getTexture: (layerId: string) => HTMLCanvasElement | null | undefined;
  notifyWarning?: (message: string) => void;
  parameterValues?: Record<string, number>;
  features?: LayerSyncFeatureFlags;
  screenColorSupport?: LayerSyncScreenColorSupport;
  v11MaskResources?: LayerSyncV11MaskResources;
}

export interface LayerSyncSyncOptions {
  parameterValues?: Record<string, number>;
  features?: LayerSyncFeatureFlags;
  screenColorSupport?: LayerSyncScreenColorSupport;
  v11MaskResources?: LayerSyncV11MaskResources;
  notifyWarning?: (message: string) => void;
}

export interface LayerSyncScreenColorSupport {
  createFilter: (color: RGBColor) => Filter;
  updateFilter: (filter: Filter, color: RGBColor) => void;
}

export interface LayerSyncContext {
  meshes: Map<string, MeshSimple>;
  maskContainers: Map<string, Container>;
  screenFilters: Map<string, Filter>;
  artPathGraphics: Map<string, Graphics>;
  vertexScratchByMesh: Map<string, Float32Array>;
  v11Scene?: Container;
  v11Mode: boolean;
  v11Background?: Graphics;
  v11Composites: Map<string, V11MaskComposite>;
  v11OwnedMeshes: Set<MeshSimple>;
  v11ScreenColors: Map<string, RGBColor>;
  v11Rasters: Map<string, V11MaskRaster>;
}

interface V11MaskComposite {
  outer: Container;
  filter: AlphaFilter;
  stages: { sourceId: string; wrapper: Container; sprite: Sprite; filter: MaskFilter }[];
}

interface V11MaskRaster {
  mesh: MeshSimple;
  root: Container;
  texture: RenderTexture;
  transform: Matrix;
  signature: readonly number[];
  pixels: number;
}

export interface PreparedLayerSyncV11 {
  commit(): void;
  rollback(): void;
  finalize(): void;
}

type ResolvedLayerSyncFeatures = Required<LayerSyncFeatureFlags>;

const DEFAULT_FEATURES: ResolvedLayerSyncFeatures = {
  artPaths: true,
  clipMasks: true,
  screenColor: true,
  v11Masks: false,
};

function resolveLayerSyncFeatures(
  features?: LayerSyncFeatureFlags,
): ResolvedLayerSyncFeatures {
  return {
    artPaths: features?.artPaths ?? DEFAULT_FEATURES.artPaths,
    clipMasks: features?.clipMasks ?? DEFAULT_FEATURES.clipMasks,
    screenColor: features?.screenColor ?? DEFAULT_FEATURES.screenColor,
    v11Masks: features?.v11Masks ?? DEFAULT_FEATURES.v11Masks,
  };
}

function syncDrawingProperties(mesh: MeshSimple, layer: ViviMeshLike): void {
  mesh.blendMode = toPixiBlendMode(layer.blendMode);
  mesh.tint = rgbColorToHex(getMultiplyColor(layer.multiplyColor));
  mesh.zIndex = getDrawOrder(layer.drawOrder);
}

function computeFinalVertices(
  layer: ViviMeshNode,
  project: ProjectData,
  worldTransforms: ReturnType<typeof computeBoneWorldTransforms>,
): Float32Array {
  let result: Float32Array;

  const skin = project.skins[layer.id];
  if (skin) {
    const verts = computeSkinnedVertices(layer.mesh.vertices, skin, worldTransforms);
    result = new Float32Array(verts);
  } else {
    result = new Float32Array(layer.mesh.vertices);
  }

  return result;
}

function syncMeshScreenColor(
  ctx: LayerSyncContext,
  layer: ViviMeshNode,
  mesh: MeshSimple,
  screenColorEnabled: boolean,
  support?: LayerSyncScreenColorSupport,
): void {
  const existingFilter = ctx.screenFilters.get(layer.id);
  if (!screenColorEnabled || isScreenColorDefault(layer.screenColor)) {
    if (existingFilter) {
      mesh.filters = [];
      existingFilter.destroy();
      ctx.screenFilters.delete(layer.id);
    }
    return;
  }

  if (!support) {
    return;
  }

  if (existingFilter) {
    support.updateFilter(existingFilter, layer.screenColor!);
    return;
  }

  const scFilter = support.createFilter(layer.screenColor!);
  mesh.filters = [scFilter];
  ctx.screenFilters.set(layer.id, scFilter);
}

export function createLayerSyncContext(): LayerSyncContext {
  return {
    meshes: new Map(),
    maskContainers: new Map(),
    screenFilters: new Map(),
    artPathGraphics: new Map(),
    vertexScratchByMesh: new Map(),
    v11Composites: new Map(),
    v11OwnedMeshes: new Set(),
    v11ScreenColors: new Map(),
    v11Rasters: new Map(),
    v11Mode: false,
  };
}

export function destroyLayerSyncContext(ctx: LayerSyncContext): void {
  // Manually attached effects are not destroyed by Container.destroy. Detach all
  // meshes first; each locally owned geometry/buffer is released exactly once.
  for (const mesh of ctx.v11OwnedMeshes) disposeQuietly(() => mesh.removeFromParent());
  for (const composite of ctx.v11Composites.values()) {
    composite.outer.filters = [];
    composite.filter.destroy(); // Do not destroy shared shader programs.
    for (const stage of composite.stages) {
      stage.sprite.removeFromParent();
      stage.wrapper.filters = [];
      stage.filter.destroy(false);
      stage.sprite.destroy({ texture: false, textureSource: false });
    }
    composite.outer.destroy({ children: true });
  }
  ctx.v11Composites.clear();
  for (const raster of ctx.v11Rasters.values()) {
    raster.texture.destroy(true);
    raster.root.destroy();
  }
  ctx.v11Rasters.clear();
  for (const mesh of ctx.v11OwnedMeshes) {
    const geometry = mesh.geometry;
    mesh.destroy(); // Shared Texture/TextureSource remain owned by the caller.
    // Pixi 8.18.1 puts indexBuffer in buffers, but destroy(true) also destroys
    // indexBuffer a second time. Release attributes explicitly, then the owner.
    for (const buffer of new Set(geometry.buffers)) {
      if (buffer !== geometry.indexBuffer) buffer.destroy();
    }
    geometry.destroy();
  }
  if (ctx.v11OwnedMeshes.size) ctx.meshes.clear();
  ctx.v11OwnedMeshes.clear();
  ctx.v11ScreenColors.clear();
  ctx.v11Background?.destroy();
  ctx.v11Background = undefined;
  ctx.v11Scene?.destroy();
  ctx.v11Scene = undefined;
  ctx.v11Mode = false;
  for (const mc of ctx.maskContainers.values()) mc.destroy({ children: true });
  ctx.maskContainers.clear();
  for (const f of ctx.screenFilters.values()) f.destroy();
  ctx.screenFilters.clear();
  for (const g of ctx.artPathGraphics.values()) g.destroy({ children: true });
  ctx.artPathGraphics.clear();
  for (const mesh of ctx.meshes.values()) mesh.destroy({ children: true });
  ctx.meshes.clear();
  ctx.vertexScratchByMesh.clear();
}

export function buildMeshes(
  ctx: LayerSyncContext,
  world: Container,
  background: Graphics,
  project: ProjectData,
  _unusedRigWeights: Record<string, number>,
  options: LayerSyncBuildOptions,
): boolean {
  if (options.features?.v11Masks) {
    return buildV11Meshes(ctx, world, background, project, options);
  }
  const wasV11 = Boolean(ctx.v11Scene);
  destroyLayerSyncContext(ctx);
  if (wasV11) background.visible = true;
  background.clear();
  background.rect(0, 0, project.width, project.height);
  background.fill({ color: 0xffffff });
  world.sortableChildren = true;

  const features = resolveLayerSyncFeatures(options.features);

  const allLayers = flattenLayers(project.layers);
  const worldTransforms = computeBoneWorldTransforms(project.layers);

  for (let i = allLayers.length - 1; i >= 0; i--) {
    const layer = allLayers[i];
    if (!layer || layer.kind !== "viviMesh") continue;

    const canvas = options.getTexture(layer.id);
    if (!canvas) continue;

    let pendingMesh: MeshSimple | undefined;
    try {
      const texture = Texture.from(canvas);
      const meshData = layer.mesh;
      const typed = meshDataToTypedArrays(meshData);

      const mesh = new MeshSimple({
        texture,
        vertices: typed.vertices,
        uvs: typed.uvs,
        indices: typed.indices,
      });
      pendingMesh = mesh;
      mesh.label = layer.id;
      mesh.x = layer.x;
      mesh.y = layer.y;
      mesh.alpha = layer.opacity;
      mesh.visible = layer.visible;
      syncDrawingProperties(mesh, layer);

      let scratch = ctx.vertexScratchByMesh.get(layer.id);
      if (!scratch || scratch.length !== layer.mesh.vertices.length) {
        scratch = new Float32Array(layer.mesh.vertices.length);
        ctx.vertexScratchByMesh.set(layer.id, scratch);
      }
      const computed = computeFinalVertices(layer, project, worldTransforms);
      scratch.set(computed);

      mesh.vertices = scratch;
      syncMeshScreenColor(
        ctx,
        layer,
        mesh,
        features.screenColor,
        options.screenColorSupport,
      );

      world.addChild(mesh);
      ctx.meshes.set(layer.id, mesh);
      pendingMesh = undefined;
    } catch (error) {
      if (pendingMesh) {
        const geometry = pendingMesh.geometry;
        pendingMesh.destroy();
        for (const buffer of new Set(geometry.buffers)) {
          if (buffer !== geometry.indexBuffer) buffer.destroy();
        }
        geometry.destroy();
      }
      const msg = error instanceof Error ? error.message : String(error);
      options.notifyWarning?.(`Failed to build mesh for "${layer.name}": ${msg}`);
    }
  }

  if (features.artPaths) {
    for (const layer of allLayers) {
      if (layer.kind !== "artPath" || layer.controlPoints.length < 2) continue;
      const points = tessellateArtPath(layer.controlPoints, layer.closed);
      if (points.length < 2) continue;

      const g = new Graphics();
      g.label = layer.id;
      g.x = layer.x;
      g.y = layer.y;
      g.alpha = layer.opacity;
      g.visible = layer.visible;
      g.zIndex = getDrawOrder(layer.drawOrder);

      g.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        g.lineTo(points[i]!.x, points[i]!.y);
      }
      if (layer.closed) g.closePath();
      g.stroke({
        color: layer.style.color,
        width: layer.style.baseWidth,
        cap: layer.style.lineCap as CanvasLineCap,
        join: layer.style.lineJoin as CanvasLineJoin,
      });
      world.addChild(g);
      ctx.artPathGraphics.set(layer.id, g);
    }
  }

  if (features.clipMasks) {
    for (const layer of allLayers) {
      if (layer.kind !== "viviMesh" || !layer.clipMaskIds?.length) continue;
      const targetMesh = ctx.meshes.get(layer.id);
      if (!targetMesh) continue;

      const maskContainer = new Container();
      for (const maskId of layer.clipMaskIds) {
        const maskLayer = allLayers.find((node) => node.id === maskId);
        if (!maskLayer || maskLayer.kind !== "viviMesh") continue;
        const maskCanvas = options.getTexture(maskId);
        if (!maskCanvas) continue;

        const maskTyped = meshDataToTypedArrays(maskLayer.mesh);
        const clone = new MeshSimple({
          texture: Texture.from(maskCanvas),
          vertices: new Float32Array(maskTyped.vertices),
          uvs: new Float32Array(maskTyped.uvs),
          indices: new Uint32Array(maskTyped.indices),
        });
        clone.x = maskLayer.x;
        clone.y = maskLayer.y;
        maskContainer.addChild(clone);
      }
      if (maskContainer.children.length > 0) {
        world.addChild(maskContainer);
        targetMesh.mask = maskContainer;
        ctx.maskContainers.set(layer.id, maskContainer);
      } else {
        maskContainer.destroy();
      }
    }
  }
  return true;
}

export function syncMeshProperties(
  ctx: LayerSyncContext,
  project: ProjectData,
  _unusedRigWeights: Record<string, number>,
  soloLayerIds: string[],
  options?: LayerSyncSyncOptions,
): boolean {
  if (ctx.v11Scene && ctx.v11Mode)
    return syncV11Meshes(ctx, project, soloLayerIds, options);
  const features = resolveLayerSyncFeatures(options?.features);

  const allLayers = flattenLayers(project.layers);

  const worldTransforms = computeBoneWorldTransforms(project.layers);
  for (const layer of allLayers) {
    const mesh = ctx.meshes.get(layer.id);
    if (!mesh) continue;

    mesh.x = layer.x;
    mesh.y = layer.y;
    mesh.visible =
      isLayerEffectivelyVisible(layer, project.layers) &&
      isLayerSoloVisible(layer.id, soloLayerIds, project.layers);
    mesh.alpha = layer.opacity;

    if (layer.kind !== "viviMesh") continue;

    let scratch = ctx.vertexScratchByMesh.get(layer.id);
    if (!scratch || scratch.length !== layer.mesh.vertices.length) {
      scratch = new Float32Array(layer.mesh.vertices.length);
      ctx.vertexScratchByMesh.set(layer.id, scratch);
    }
    const computed = computeFinalVertices(layer, project, worldTransforms);
    scratch.set(computed);

    mesh.vertices = scratch;

    syncDrawingProperties(mesh, layer);
    syncMeshScreenColor(
      ctx,
      layer,
      mesh,
      features.screenColor,
      options?.screenColorSupport,
    );

    if (layer.culling && mesh.visible) {
      mesh.visible = !isPolygonFlipped(mesh.vertices);
    }
  }
  return true;
}

function unavailable(notify?: (message: string) => void): false {
  // A notification must not turn a retained incumbent into an uncaught failure.
  try {
    notify?.(V11_MASK_RENDERER_UNAVAILABLE);
  } catch {
    /* display only */
  }
  return false;
}

/** Same expanded-application limit as Project's mask graph, including repeats. */
function v11MaskChains(project: ProjectData): Map<string, string[]> {
  const layers = flattenLayers(project.layers);
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  if (byId.size !== layers.length) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  const chains = new Map<string, string[]>();
  const visit = (id: string, active: Set<string>): string[] => {
    if (active.has(id)) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    const cached = chains.get(id);
    if (cached) return cached;
    const layer = byId.get(id);
    if (!layer || layer.kind !== "viviMesh")
      throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    // Normalized/inverted edges must be projected by the v11 admission adapter.
    if ("clipMasks" in layer) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    const ids = layer.clipMaskIds ?? [];
    if (new Set(ids).size !== ids.length) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    const next = new Set(active).add(id);
    const chain: string[] = [];
    for (const sourceId of ids) {
      chain.push(...visit(sourceId, next), sourceId);
      if (chain.length > 8) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    }
    chains.set(id, chain);
    return chain;
  };
  for (const layer of layers) {
    if (layer.kind === "viviMesh") visit(layer.id, new Set());
    else if ("clipMaskIds" in layer || "clipMasks" in layer) {
      throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    }
  }
  return chains;
}

function v11Vertices(project: ProjectData): Map<string, Float32Array> {
  const transforms = computeBoneWorldTransforms(project.layers);
  const result = new Map<string, Float32Array>();
  for (const layer of flattenLayers(project.layers)) {
    if (layer.kind !== "viviMesh") continue;
    const vertices = computeFinalVertices(layer, project, transforms);
    if (!vertices.every(Number.isFinite)) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    result.set(layer.id, vertices);
  }
  return result;
}

interface V11RasterPlan {
  width: number;
  height: number;
  pixels: number;
  renderTransform: Matrix;
  spriteTransform: Matrix;
  signature: number[];
}

function v11Plan(
  ctx: LayerSyncContext,
  project: ProjectData,
  world: Container,
  chains: Map<string, string[]>,
  vertices: Map<string, Float32Array>,
  resources: LayerSyncV11MaskResources | undefined,
  rebuild: boolean,
): { matrix: Matrix; rasters: Map<string, V11RasterPlan> } {
  const raw = world.getGlobalTransform();
  const matrix = new Matrix(raw.a, raw.b, raw.c, raw.d, raw.tx, raw.ty);
  const rasters = new Map<string, V11RasterPlan>();
  const sources = new Set([...chains.values()].flat());
  if (resources?.isUnavailable()) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  // Same-topology unmasked frames reuse accepted texture owners. New scenes must
  // still validate the viewport and enter detached GPU preparation before commit.
  if (!sources.size && !rebuild) return { matrix, rasters };
  const numbers = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty];
  if (
    !resources ||
    !numbers.every(Number.isFinite) ||
    !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c) ||
    matrix.a * matrix.d - matrix.b * matrix.c === 0 ||
    !Number.isFinite(resources.resolution) ||
    resources.resolution <= 0 ||
    !Number.isSafeInteger(resources.maxTextureSize) ||
    resources.maxTextureSize < 1 ||
    typeof resources.rasterizeMask !== "function" ||
    typeof resources.prepareScene !== "function" ||
    typeof resources.isUnavailable !== "function"
  )
    throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  const physical = (width: number, height: number): number => {
    const sizes = [width, height].map((size) => {
      if (!Number.isSafeInteger(size) || size < 1)
        throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
      return 2 ** Math.ceil(Math.log2(Math.ceil(size * resources.resolution)));
    });
    const pixels = sizes[0]! * sizes[1]!;
    if (
      sizes.some(
        (size) => !Number.isSafeInteger(size) || size > resources.maxTextureSize,
      ) ||
      !Number.isSafeInteger(pixels)
    )
      throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    return pixels;
  };
  let total = physical(resources.viewportWidth, resources.viewportHeight);
  for (const old of ctx.v11Rasters.values()) total += old.pixels;
  const sizes = new Map<string, number>();
  for (const layer of flattenLayers(project.layers)) {
    if (
      layer.kind !== "viviMesh" ||
      (!sources.has(layer.id) && !chains.get(layer.id)?.length)
    )
      continue;
    const points = vertices.get(layer.id)!;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i]! + layer.x,
        y = points[i + 1]! + layer.y;
      const sx = matrix.a * x + matrix.c * y + matrix.tx;
      const sy = matrix.b * x + matrix.d * y + matrix.ty;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
    const x = Math.floor(minX),
      y = Math.floor(minY);
    const width = Math.max(1, Math.ceil(maxX) - x),
      height = Math.max(1, Math.ceil(maxY) - y);
    const pixels = physical(width, height);
    sizes.set(layer.id, pixels);
    if (!sources.has(layer.id)) continue;
    const signature = [
      ...points,
      layer.x,
      layer.y,
      layer.opacity,
      ...numbers,
      resources.resolution,
    ];
    const inverse = matrix.clone().invert();
    const spriteTransform = new Matrix(
      inverse.a,
      inverse.b,
      inverse.c,
      inverse.d,
      inverse.a * x + inverse.c * y + inverse.tx,
      inverse.b * x + inverse.d * y + inverse.ty,
    );
    const plan = {
      width,
      height,
      pixels,
      signature,
      spriteTransform,
      renderTransform: new Matrix(
        matrix.a,
        matrix.b,
        matrix.c,
        matrix.d,
        matrix.tx - x,
        matrix.ty - y,
      ),
    };
    rasters.set(layer.id, plan);
    if (rebuild || !sameNumbers(ctx.v11Rasters.get(layer.id)?.signature, signature))
      total += pixels;
  }
  for (const [id, chain] of chains)
    if (chain.length) total += sizes.get(id)! * (2 + chain.length * 2);
  if (!Number.isSafeInteger(total) || total > 67_108_864)
    throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  return { matrix, rasters };
}

function sameNumbers(a: readonly number[] | undefined, b: readonly number[]): boolean {
  return a?.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

function disposeQuietly(run: () => void): void {
  try {
    run();
  } catch {
    /* Retired owners cannot reverse a committed CPU outcome. */
  }
}

function makeRaster(
  ctx: LayerSyncContext,
  layer: ViviMeshNode,
  vertices: Float32Array,
  plan: V11RasterPlan,
  resources: LayerSyncV11MaskResources,
  old?: V11MaskRaster,
): V11MaskRaster {
  let mesh = old?.mesh;
  const root = old?.root ?? new Container();
  if (!mesh) {
    const typed = meshDataToTypedArrays(layer.mesh);
    mesh = new MeshSimple({
      texture: ctx.meshes.get(layer.id)!.texture,
      vertices,
      uvs: typed.uvs,
      indices: typed.indices,
    });
    ctx.v11OwnedMeshes.add(mesh);
    root.addChild(mesh);
  }
  // Private mesh is never sampled by the incumbent. Only immutable current RTs are.
  mesh.vertices = vertices;
  mesh.x = layer.x;
  mesh.y = layer.y;
  mesh.alpha = layer.opacity;
  mesh.tint = 0xffffff;
  mesh.blendMode = "normal";
  mesh.visible = true;
  mesh.filters = [];
  if (resources.isUnavailable()) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  const texture = resources.rasterizeMask(root, {
    width: plan.width,
    height: plan.height,
    resolution: resources.resolution,
    transform: plan.renderTransform,
  });
  try {
    if (
      resources.isUnavailable() ||
      texture.destroyed ||
      texture.width !== plan.width ||
      texture.height !== plan.height ||
      texture.source.resolution !== resources.resolution
    )
      throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    return {
      mesh,
      root,
      texture,
      transform: plan.spriteTransform,
      signature: plan.signature,
      pixels: plan.pixels,
    };
  } catch {
    disposeQuietly(() => texture.destroy(true));
    throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  }
}

function v11Frames(
  ctx: LayerSyncContext,
  project: ProjectData,
  solo: string[],
  vertices: Map<string, Float32Array>,
) {
  if (vertices.size !== ctx.meshes.size) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  return flattenLayers(project.layers)
    .filter((layer): layer is ViviMeshNode => layer.kind === "viviMesh")
    .map((layer) => {
      const mesh = ctx.meshes.get(layer.id);
      if (
        !mesh ||
        mesh.vertices.length !== vertices.get(layer.id)!.length ||
        ![layer.x, layer.y, layer.opacity].every(Number.isFinite) ||
        !["normal", "add", "multiply", "screen"].includes(layer.blendMode)
      )
        throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
      return {
        layer,
        mesh,
        vertices: vertices.get(layer.id)!,
        visible:
          isLayerEffectivelyVisible(layer, project.layers) &&
          isLayerSoloVisible(layer.id, solo, project.layers) &&
          (!layer.culling || !isPolygonFlipped(vertices.get(layer.id)!)),
        tint: rgbColorToHex(getMultiplyColor(layer.multiplyColor)),
        order: getDrawOrder(layer.drawOrder),
      };
    });
}

function prepareV11Frame(
  ctx: LayerSyncContext,
  world: Container,
  project: ProjectData,
  options: LayerSyncBuildOptions & { soloLayerIds?: string[] },
): PreparedLayerSyncV11 {
  const pending = new Map<string, V11MaskRaster>();
  const filters = new Map<string, Filter | undefined>();
  try {
    const chains = v11MaskChains(project),
      vertices = v11Vertices(project);
    const frames = v11Frames(ctx, project, options.soloLayerIds ?? [], vertices);
    for (const [id, chain] of chains) {
      const stages = ctx.v11Composites.get(id)?.stages ?? [];
      if (
        chain.length !== stages.length ||
        chain.some((source, index) => source !== stages[index]?.sourceId)
      )
        throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    }
    const plan = v11Plan(
      ctx,
      project,
      world,
      chains,
      vertices,
      options.v11MaskResources,
      false,
    );
    for (const frame of frames) {
      const color =
        options.features?.screenColor !== false &&
        !isScreenColorDefault(frame.layer.screenColor)
          ? frame.layer.screenColor
          : undefined;
      const previous = ctx.v11ScreenColors.get(frame.layer.id);
      if (
        color
          ? !previous ||
            color.r !== previous.r ||
            color.g !== previous.g ||
            color.b !== previous.b
          : previous
      ) {
        if (color && !options.screenColorSupport)
          throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
        filters.set(
          frame.layer.id,
          color ? options.screenColorSupport!.createFilter(color) : undefined,
        );
      }
    }
    // Stable first-use dependency order; no masks are baked into source rasters.
    for (const id of new Set([...chains.values()].flat())) {
      const item = plan.rasters.get(id)!,
        old = ctx.v11Rasters.get(id)!;
      if (!old) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
      if (!sameNumbers(old.signature, item.signature))
        pending.set(
          id,
          makeRaster(
            ctx,
            frames.find((frame) => frame.layer.id === id)!.layer,
            vertices.get(id)!,
            item,
            options.v11MaskResources!,
            old,
          ),
        );
    }
    const oldRasters = new Map(ctx.v11Rasters),
      oldFilters = new Map(ctx.screenFilters);
    const oldColors = new Map(ctx.v11ScreenColors);
    const snapshots = frames.map(({ mesh, layer }) => ({
      mesh,
      id: layer.id,
      vertices: ctx.vertexScratchByMesh.get(layer.id)!,
      x: mesh.x,
      y: mesh.y,
      alpha: mesh.alpha,
      visible: mesh.visible,
      blendMode: mesh.blendMode,
      tint: mesh.tint,
      zIndex: mesh.zIndex,
      filters: mesh.filters,
      composite: ctx.v11Composites.get(layer.id),
      outerVisible: ctx.v11Composites.get(layer.id)?.outer.visible,
      outerOrder: ctx.v11Composites.get(layer.id)?.outer.zIndex,
      outerBlend: ctx.v11Composites.get(layer.id)?.filter.blendMode,
    }));
    let state: "prepared" | "committed" | "done" = "prepared";
    const setSprites = (rasters: Map<string, V11MaskRaster>) => {
      for (const composite of ctx.v11Composites.values())
        for (const stage of composite.stages) {
          const raster = rasters.get(stage.sourceId)!;
          stage.sprite.texture = raster.texture;
          // Retarget the owned shader binding BEFORE retiring the old source,
          // including rollback with no intervening draw. Sprite alone is not enough.
          stage.filter.resources.uMaskTexture = raster.texture.source;
          stage.sprite.setFromMatrix(raster.transform);
        }
    };
    const rollback = () => {
      if (state === "done") return;
      if (state === "committed") {
        for (const before of snapshots)
          disposeQuietly(() => {
            const { mesh } = before;
            mesh.vertices = before.vertices;
            ctx.vertexScratchByMesh.set(before.id, before.vertices);
            mesh.x = before.x;
            mesh.y = before.y;
            mesh.alpha = before.alpha;
            mesh.visible = before.visible;
            mesh.blendMode = before.blendMode;
            mesh.tint = before.tint;
            mesh.zIndex = before.zIndex;
            mesh.filters = before.filters ? [...before.filters] : [];
            if (before.composite) {
              before.composite.outer.visible = before.outerVisible!;
              before.composite.outer.zIndex = before.outerOrder!;
              before.composite.filter.blendMode = before.outerBlend!;
            }
          });
        ctx.v11Rasters = oldRasters;
        ctx.screenFilters = oldFilters;
        ctx.v11ScreenColors = oldColors;
        disposeQuietly(() => setSprites(oldRasters));
      }
      for (const raster of pending.values())
        disposeQuietly(() => raster.texture.destroy(true));
      for (const filter of filters.values()) disposeQuietly(() => filter?.destroy());
      state = "done";
    };
    return {
      commit() {
        if (state !== "prepared" || options.v11MaskResources?.isUnavailable())
          throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
        state = "committed"; // Set before the first setter, which may throw.
        try {
          for (const { layer, mesh, vertices: points, visible, tint, order } of frames) {
            mesh.vertices = points;
            ctx.vertexScratchByMesh.set(layer.id, points);
            mesh.x = layer.x;
            mesh.y = layer.y;
            mesh.alpha = layer.opacity;
            mesh.visible = visible;
            mesh.tint = tint;
            mesh.zIndex = order;
            const composite = ctx.v11Composites.get(layer.id);
            mesh.blendMode = composite ? "normal" : toPixiBlendMode(layer.blendMode);
            if (composite) {
              composite.outer.visible = visible;
              composite.outer.zIndex = order;
              composite.filter.blendMode = toPixiBlendMode(layer.blendMode);
            }
            if (filters.has(layer.id)) {
              const filter = filters.get(layer.id);
              mesh.filters = filter ? [filter] : [];
              if (filter) {
                ctx.screenFilters.set(layer.id, filter);
                ctx.v11ScreenColors.set(layer.id, { ...layer.screenColor! });
              } else {
                ctx.screenFilters.delete(layer.id);
                ctx.v11ScreenColors.delete(layer.id);
              }
            }
          }
          for (const [id, raster] of pending) ctx.v11Rasters.set(id, raster);
          setSprites(ctx.v11Rasters);
        } catch {
          rollback();
          throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
        }
      },
      rollback,
      finalize() {
        if (state !== "committed") return;
        state = "done";
        for (const id of pending.keys())
          disposeQuietly(() => oldRasters.get(id)!.texture.destroy(true));
        for (const id of filters.keys())
          disposeQuietly(() => oldFilters.get(id)?.destroy());
      },
    };
  } catch {
    for (const raster of pending.values())
      disposeQuietly(() => raster.texture.destroy(true));
    for (const filter of filters.values()) disposeQuietly(() => filter?.destroy());
    throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  }
}

/** Fixed synchronous participant. Parent publishes CPU/history only after prepare;
 * finalize runs only after all participants commit. No callback or await in commit. */
export function prepareLayerSyncV11(
  ctx: LayerSyncContext,
  world: Container,
  incumbentBackground: Graphics,
  project: ProjectData | null,
  options: LayerSyncBuildOptions & { rebuild?: boolean; soloLayerIds?: string[] },
): PreparedLayerSyncV11 {
  if (
    project &&
    options.features?.v11Masks &&
    ctx.v11Mode &&
    ctx.v11Scene &&
    !options.rebuild
  )
    return prepareV11Frame(ctx, world, project, options);
  const staged = createLayerSyncContext(),
    scene = new Container(),
    background = new Graphics();
  scene.sortableChildren = true;
  background.label = "v11-background";
  background.zIndex = -Infinity;
  try {
    if (!project || !options.features?.v11Masks) {
      if (options.v11MaskResources?.isUnavailable())
        throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
      if (project)
        buildMeshes(
          staged,
          scene,
          background,
          project,
          {},
          {
            ...options,
            features: { ...options.features, v11Masks: false },
            notifyWarning: () => {
              throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
            },
          },
        );
      staged.v11Scene = scene;
      staged.v11Background = background;
      scene.addChild(background);
      for (const mesh of staged.meshes.values()) staged.v11OwnedMeshes.add(mesh);
      // Existing legacy construction semantics, with explicit pre-publication GPU preparation.
      if (project && options.v11MaskResources)
        options.v11MaskResources.prepareScene(scene, world.getGlobalTransform());
    } else {
      const chains = v11MaskChains(project),
        vertices = v11Vertices(project);
      const plan = v11Plan(
        ctx,
        project,
        world,
        chains,
        vertices,
        options.v11MaskResources,
        true,
      );
      const layers = flattenLayers(project.layers);
      const byId = new Map(layers.map((layer) => [layer.id, layer]));
      const canvases = new Map<string, HTMLCanvasElement>();
      for (const layer of layers)
        if (layer.kind === "viviMesh") {
          const canvas = options.getTexture(layer.id);
          if (
            !canvas ||
            ![canvas.width, canvas.height].every(
              (size) =>
                Number.isSafeInteger(size) &&
                size > 0 &&
                size <= options.v11MaskResources!.maxTextureSize,
            )
          )
            throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
          // Whole-atlas dimensions, including invisible/non-mask aliases. A tiny
          // entry or invisible mesh does not make an oversized source upload safe.
          canvases.set(layer.id, canvas);
        }
      buildMeshes(
        staged,
        scene,
        background,
        project,
        {},
        {
          ...options,
          getTexture: (id) => canvases.get(id),
          features: { ...options.features, v11Masks: false, clipMasks: false },
          notifyWarning: () => {
            throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
          },
        },
      );
      staged.v11Scene = scene;
      staged.v11Background = background;
      staged.v11Mode = true;
      scene.addChild(background);
      for (const mesh of staged.meshes.values()) staged.v11OwnedMeshes.add(mesh);
      const frames = v11Frames(staged, project, options.soloLayerIds ?? [], vertices);
      for (const frame of frames) {
        frame.mesh.vertices = frame.vertices;
        staged.vertexScratchByMesh.set(frame.layer.id, frame.vertices);
        frame.mesh.visible = frame.visible;
        if (staged.screenFilters.has(frame.layer.id))
          staged.v11ScreenColors.set(frame.layer.id, { ...frame.layer.screenColor! });
      }
      for (const id of new Set([...chains.values()].flat()))
        staged.v11Rasters.set(
          id,
          makeRaster(
            staged,
            byId.get(id) as ViviMeshNode,
            vertices.get(id)!,
            plan.rasters.get(id)!,
            options.v11MaskResources!,
          ),
        );
      for (const [id, chain] of chains) {
        if (!chain.length) continue;
        const target = staged.meshes.get(id)!,
          layer = byId.get(id)!;
        const outer = new Container();
        const filter = new AlphaFilter({
          alpha: 1,
          blendMode: toPixiBlendMode(layer.blendMode),
          resolution: "inherit",
        });
        const composite: V11MaskComposite = { outer, filter, stages: [] };
        staged.v11Composites.set(id, composite);
        outer.label = id + ":masked";
        outer.zIndex = target.zIndex;
        outer.visible = target.visible;
        outer.filters = [filter];
        scene.addChildAt(outer, scene.getChildIndex(target));
        target.removeFromParent();
        target.blendMode = "normal";
        let child: Container = target;
        for (let index = chain.length - 1; index >= 0; index--) {
          const sourceId = chain[index]!,
            raster = staged.v11Rasters.get(sourceId)!;
          const sprite = new Sprite(raster.texture);
          sprite.label = id + ":mask:" + sourceId + ":" + index;
          sprite.alpha = 1;
          sprite.tint = 0xffffff;
          sprite.blendMode = "normal";
          sprite.renderable = false;
          sprite.includeInBuild = true;
          sprite.measurable = false;
          sprite.setFromMatrix(raster.transform);
          // Root-exported but declared @internal by pinned Pixi: bounded D6
          // adoption, not a stable-public API claim or a copied mask shader.
          const wrapper = new Container();
          const maskFilter = new MaskFilter({
            sprite,
            channel: "alpha",
            inverse: false,
            resolution: "inherit",
            antialias: false,
          });
          composite.stages.unshift({ sourceId, wrapper, sprite, filter: maskFilter });
          wrapper.addChild(sprite, child);
          wrapper.filters = [maskFilter];
          child = wrapper;
        }
        outer.addChild(child);
      }
      options.v11MaskResources!.prepareScene(scene, plan.matrix);
    }
    if (options.v11MaskResources?.isUnavailable())
      throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  } catch {
    staged.v11Scene = scene;
    staged.v11Background = background;
    for (const mesh of staged.meshes.values()) staged.v11OwnedMeshes.add(mesh);
    disposeQuietly(() => destroyLayerSyncContext(staged));
    throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
  }
  const before = { ...ctx },
    backgroundVisible = incumbentBackground.visible;
  const oldRoots = [
    ...new Set([
      ctx.v11Scene,
      ...ctx.meshes.values(),
      ...ctx.maskContainers.values(),
      ...ctx.artPathGraphics.values(),
    ]),
  ]
    .filter((item): item is Container => Boolean(item && item.parent === world))
    .map((item) => ({ item, index: world.getChildIndex(item) }));
  let state: "prepared" | "committed" | "done" = "prepared";
  const rollback = () => {
    if (state === "done") return;
    const committed = state === "committed";
    state = "done"; // Public Pixi events may throw or reenter rollback.
    if (committed) {
      disposeQuietly(() => scene.removeFromParent());
      disposeQuietly(() => Object.assign(ctx, before));
      for (const { item, index } of oldRoots.sort((a, b) => a.index - b.index))
        disposeQuietly(() =>
          world.addChildAt(item, Math.min(index, world.children.length)),
        );
      disposeQuietly(() => {
        incumbentBackground.visible = backgroundVisible;
      });
    }
    disposeQuietly(() => destroyLayerSyncContext(staged));
  };
  return {
    commit() {
      if (
        state !== "prepared" ||
        ctx.meshes !== before.meshes ||
        options.v11MaskResources?.isUnavailable()
      )
        throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
      state = "committed";
      try {
        for (const { item } of oldRoots) item.removeFromParent();
        world.addChild(scene);
        world.sortableChildren = true;
        Object.assign(ctx, staged);
        incumbentBackground.visible = false;
      } catch {
        rollback();
        throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
      }
    },
    rollback,
    finalize() {
      if (state !== "committed") return;
      state = "done";
      disposeQuietly(() => destroyLayerSyncContext(before));
    },
  };
}

function buildV11Meshes(
  ctx: LayerSyncContext,
  world: Container,
  background: Graphics,
  project: ProjectData,
  options: LayerSyncBuildOptions,
): boolean {
  try {
    const participant = prepareLayerSyncV11(ctx, world, background, project, {
      ...options,
      rebuild: true,
    });
    try {
      participant.commit();
      participant.finalize();
    } catch {
      participant.rollback();
      throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    }
    return true;
  } catch {
    return unavailable(options.notifyWarning);
  }
}

function syncV11Meshes(
  ctx: LayerSyncContext,
  project: ProjectData,
  soloLayerIds: string[],
  options?: LayerSyncSyncOptions,
): boolean {
  try {
    const world = ctx.v11Scene?.parent;
    if (!world) throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    const participant = prepareV11Frame(ctx, world, project, {
      ...options,
      getTexture: () => undefined,
      soloLayerIds,
    });
    try {
      participant.commit();
      participant.finalize();
    } catch {
      participant.rollback();
      throw new Error(V11_MASK_RENDERER_UNAVAILABLE);
    }
    return true;
  } catch {
    return unavailable(options?.notifyWarning);
  }
}
