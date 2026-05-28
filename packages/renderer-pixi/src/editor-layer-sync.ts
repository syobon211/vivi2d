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
import type { ViviMeshNode, ProjectData, RGBColor } from "@vivi2d/core/types";
import { Container, type Filter, Graphics, MeshSimple, Texture } from "pixi.js";
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
}

export interface LayerSyncBuildOptions {
  getTexture: (layerId: string) => HTMLCanvasElement | null | undefined;
  notifyWarning?: (message: string) => void;
  parameterValues?: Record<string, number>;
  features?: LayerSyncFeatureFlags;
  screenColorSupport?: LayerSyncScreenColorSupport;
}

export interface LayerSyncSyncOptions {
  parameterValues?: Record<string, number>;
  features?: LayerSyncFeatureFlags;
  screenColorSupport?: LayerSyncScreenColorSupport;
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
}

type ResolvedLayerSyncFeatures = Required<LayerSyncFeatureFlags>;

const DEFAULT_FEATURES: ResolvedLayerSyncFeatures = {
  artPaths: true,
  clipMasks: true,
  screenColor: true,
};

function resolveLayerSyncFeatures(
  features?: LayerSyncFeatureFlags,
): ResolvedLayerSyncFeatures {
  return {
    artPaths: features?.artPaths ?? DEFAULT_FEATURES.artPaths,
    clipMasks: features?.clipMasks ?? DEFAULT_FEATURES.clipMasks,
    screenColor: features?.screenColor ?? DEFAULT_FEATURES.screenColor,
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
    const verts = computeSkinnedVertices(
      layer.mesh.vertices,
      skin,
      worldTransforms,
    );
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
  };
}

export function destroyLayerSyncContext(ctx: LayerSyncContext): void {
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
): void {
  destroyLayerSyncContext(ctx);
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      options.notifyWarning?.(
        `Failed to build mesh for "${layer.name}": ${msg}`,
      );
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
}

export function syncMeshProperties(
  ctx: LayerSyncContext,
  project: ProjectData,
  _unusedRigWeights: Record<string, number>,
  soloLayerIds: string[],
  options?: LayerSyncSyncOptions,
): void {
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
}
