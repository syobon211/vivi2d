import type { ViviMeshNode } from "@vivi2d/core/types";

import { decontaminateForegroundEdges } from "./foreground-edge";
import {
  getLayerRole,
  isLowerLayerTarget,
  isOccluderLayer,
  optionsForOccluder,
  shouldSkipPair,
} from "./layer-semantics";
import { cleanupLowerLayerImageDataByForegroundMask } from "./lower-layer-cleanup";
import type {
  LayerOcclusionCleanupOptions,
  LayerOcclusionCleanupResult,
  LayerTextureImageData,
} from "./types";

export interface LayerOcclusionCleanupPlanProvenance {
  commandId: "vivi.layerOcclusionCleanup";
  commandVersion: 1;
  layerCount: number;
  textureLayerIds: string[];
  foregroundLayerCount: number;
  lowerLayerCount: number;
}

export interface LayerOcclusionCleanupRollbackMetadata {
  strategy: "restore-image-data-references";
  snapshotLayerIds: string[];
}

interface ForegroundEdgeStep {
  kind: "foreground-edge";
  targetLayer: ViviMeshNode;
  targetLayerId: string;
  options?: LayerOcclusionCleanupOptions;
  provenance: {
    targetRole: ReturnType<typeof getLayerRole>;
  };
}

interface LowerLayerStep {
  kind: "lower-layer";
  lowerLayer: ViviMeshNode;
  lowerLayerId: string;
  foregroundLayer: ViviMeshNode;
  foregroundLayerId: string;
  options?: LayerOcclusionCleanupOptions;
  provenance: {
    foregroundRole: ReturnType<typeof getLayerRole>;
    lowerRole: ReturnType<typeof getLayerRole>;
  };
}

export type LayerOcclusionCleanupPlanStep = ForegroundEdgeStep | LowerLayerStep;

export interface LayerOcclusionCleanupPlan {
  provenance: LayerOcclusionCleanupPlanProvenance;
  rollback: LayerOcclusionCleanupRollbackMetadata;
  steps: LayerOcclusionCleanupPlanStep[];
}

export interface LayerOcclusionCleanupPlanExecutor {
  /**
   * Executors must return a new ImageData when they change pixels. The rollback
   * strategy restores references and intentionally does not deep-copy pixel buffers.
   */
  decontaminateForegroundEdges?: typeof decontaminateForegroundEdges;
  cleanupLowerLayerImageDataByForegroundMask?: typeof cleanupLowerLayerImageDataByForegroundMask;
}

function cloneOptions(
  options: LayerOcclusionCleanupOptions | undefined,
): LayerOcclusionCleanupOptions | undefined {
  return options ? { ...options } : undefined;
}

function uniqueIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)];
}

function assertExecutorReturnedSnapshotSafeImageData(
  before: ImageData,
  result: { imageData: ImageData; affectedPixels: number },
  stepKind: LayerOcclusionCleanupPlanStep["kind"],
): void {
  if (result.affectedPixels > 0 && result.imageData === before) {
    throw new Error(
      `Layer occlusion cleanup executor for ${stepKind} must return a new ImageData when pixels change.`,
    );
  }
}

export function createLayerOcclusionCleanupPlan(
  layers: readonly ViviMeshNode[],
  textures: readonly LayerTextureImageData[],
  options?: LayerOcclusionCleanupOptions,
): LayerOcclusionCleanupPlan {
  const textureLayerIds = uniqueIds(textures.map((texture) => texture.layerId));
  const textureLayerIdSet = new Set(textureLayerIds);
  const occluders = layers.filter(
    (layer) => isOccluderLayer(layer) && textureLayerIdSet.has(layer.id),
  );
  const lowerLayers = layers.filter(
    (layer) => isLowerLayerTarget(layer) && textureLayerIdSet.has(layer.id),
  );
  const steps: LayerOcclusionCleanupPlanStep[] = [];

  for (const occluder of occluders) {
    steps.push({
      kind: "foreground-edge",
      targetLayer: occluder,
      targetLayerId: occluder.id,
      options: cloneOptions(options),
      provenance: {
        targetRole: getLayerRole(occluder),
      },
    });
  }

  for (const lowerLayer of lowerLayers) {
    for (const occluder of occluders) {
      if (shouldSkipPair(occluder, lowerLayer)) continue;
      steps.push({
        kind: "lower-layer",
        lowerLayer,
        lowerLayerId: lowerLayer.id,
        foregroundLayer: occluder,
        foregroundLayerId: occluder.id,
        options: cloneOptions(optionsForOccluder(options, occluder)),
        provenance: {
          foregroundRole: getLayerRole(occluder),
          lowerRole: getLayerRole(lowerLayer),
        },
      });
    }
  }

  return {
    provenance: {
      commandId: "vivi.layerOcclusionCleanup",
      commandVersion: 1,
      layerCount: layers.length,
      textureLayerIds,
      foregroundLayerCount: occluders.length,
      lowerLayerCount: lowerLayers.length,
    },
    rollback: {
      strategy: "restore-image-data-references",
      snapshotLayerIds: uniqueIds(
        steps.flatMap((step) =>
          step.kind === "foreground-edge"
            ? [step.targetLayerId]
            : [step.lowerLayerId, step.foregroundLayerId],
        ),
      ),
    },
    steps,
  };
}

export function applyLayerOcclusionCleanupPlan(
  plan: LayerOcclusionCleanupPlan,
  textures: LayerTextureImageData[],
  executor: LayerOcclusionCleanupPlanExecutor = {},
): LayerOcclusionCleanupResult {
  const decontaminate =
    executor.decontaminateForegroundEdges ?? decontaminateForegroundEdges;
  const cleanupLower =
    executor.cleanupLowerLayerImageDataByForegroundMask ??
    cleanupLowerLayerImageDataByForegroundMask;
  const textureByLayerId = new Map(textures.map((texture) => [texture.layerId, texture]));
  const rollbackSnapshots = new Map<string, ImageData>();
  for (const layerId of plan.rollback.snapshotLayerIds) {
    const texture = textureByLayerId.get(layerId);
    if (texture) rollbackSnapshots.set(layerId, texture.imageData);
  }

  const processedLayerIds = new Set<string>();
  const foregroundProcessedLayerIds = new Set<string>();
  let pairCount = 0;
  let affectedPixels = 0;

  try {
    for (const step of plan.steps) {
      if (step.kind === "foreground-edge") {
        const texture = textureByLayerId.get(step.targetLayerId);
        if (!texture) continue;
        const beforeImageData = texture.imageData;
        const result = decontaminate(beforeImageData, step.options);
        assertExecutorReturnedSnapshotSafeImageData(beforeImageData, result, step.kind);
        if (result.affectedPixels <= 0) continue;
        texture.imageData = result.imageData;
        affectedPixels += result.affectedPixels;
        foregroundProcessedLayerIds.add(step.targetLayerId);
        continue;
      }

      const lowerTexture = textureByLayerId.get(step.lowerLayerId);
      const foregroundTexture = textureByLayerId.get(step.foregroundLayerId);
      if (!lowerTexture || !foregroundTexture) continue;

      const beforeImageData = lowerTexture.imageData;
      const result = cleanupLower(
        step.lowerLayer,
        beforeImageData,
        step.foregroundLayer,
        foregroundTexture.imageData,
        step.options,
      );
      assertExecutorReturnedSnapshotSafeImageData(beforeImageData, result, step.kind);
      if (result.affectedPixels === 0) continue;
      lowerTexture.imageData = result.imageData;
      pairCount += 1;
      affectedPixels += result.affectedPixels;
      processedLayerIds.add(step.lowerLayerId);
    }
  } catch (error) {
    for (const [layerId, imageData] of rollbackSnapshots) {
      const texture = textureByLayerId.get(layerId);
      if (texture) texture.imageData = imageData;
    }
    throw error;
  }

  return {
    processedLayerIds: [...processedLayerIds],
    foregroundProcessedLayerIds: [...foregroundProcessedLayerIds],
    pairCount,
    affectedPixels,
  };
}
