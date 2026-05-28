import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";

import {
  applyLayerOcclusionCleanupPlan,
  createLayerOcclusionCleanupPlan,
} from "./plan";
import type {
  LayerOcclusionCleanupOptions,
  LayerOcclusionCleanupResult,
  LayerTextureCanvas,
  LayerTextureImageData,
} from "./types";

export function applyLayerOcclusionCleanupToTextures(
  layers: readonly ViviMeshNode[],
  textures: LayerTextureImageData[],
  options?: LayerOcclusionCleanupOptions,
): LayerOcclusionCleanupResult {
  return applyLayerOcclusionCleanupPlan(
    createLayerOcclusionCleanupPlan(layers, textures, options),
    textures,
  );
}

export function applyProjectLayerOcclusionCleanupToTextures(
  project: ProjectData,
  textures: LayerTextureImageData[],
  options?: LayerOcclusionCleanupOptions,
): LayerOcclusionCleanupResult {
  return applyLayerOcclusionCleanupToTextures(
    flattenLayers(project.layers).filter(isViviMesh),
    textures,
    options,
  );
}

export function applyLayerOcclusionCleanupToCanvases(
  layers: readonly ViviMeshNode[],
  textures: LayerTextureCanvas[],
  options?: LayerOcclusionCleanupOptions,
): LayerOcclusionCleanupResult {
  const imageDataTextures: LayerTextureImageData[] = [];
  const contextByLayerId = new Map<string, CanvasRenderingContext2D>();

  for (const texture of textures) {
    const context = texture.canvas.getContext("2d");
    if (!context) continue;
    contextByLayerId.set(texture.layerId, context);
    imageDataTextures.push({
      layerId: texture.layerId,
      imageData: context.getImageData(0, 0, texture.canvas.width, texture.canvas.height),
    });
  }

  const result = applyLayerOcclusionCleanupToTextures(layers, imageDataTextures, options);
  const dirtyLayerIds = new Set([
    ...result.processedLayerIds,
    ...result.foregroundProcessedLayerIds,
  ]);
  for (const texture of imageDataTextures) {
    if (!dirtyLayerIds.has(texture.layerId)) continue;
    contextByLayerId.get(texture.layerId)?.putImageData(texture.imageData, 0, 0);
  }

  return result;
}
