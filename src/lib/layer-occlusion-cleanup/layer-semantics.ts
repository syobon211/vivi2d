import type { LayerSemanticRole, ViviMeshNode } from "@vivi2d/core/types";
import { getSeeThroughImportMetadata } from "@vivi2d/core/types";

import { clamp } from "./math";
import type { LayerOcclusionCleanupOptions } from "./types";

const OCCLUDER_ROLES = new Set<LayerSemanticRole>([
  "hair",
  "hairFront",
  "hairBack",
  "hairSide",
  "tail",
  "ear",
]);

const LOWER_LAYER_ROLES = new Set<LayerSemanticRole>([
  "head",
  "face",
  "body",
  "armLeft",
  "armRight",
  "handLeft",
  "handRight",
  "legLeft",
  "legRight",
]);

export function getLayerRole(layer: ViviMeshNode): LayerSemanticRole | undefined {
  return layer.semanticRole;
}

export function isOccluderLayer(layer: ViviMeshNode): boolean {
  const role = getLayerRole(layer);
  return role != null && OCCLUDER_ROLES.has(role);
}

export function isLowerLayerTarget(layer: ViviMeshNode): boolean {
  const role = getLayerRole(layer);
  return role != null && LOWER_LAYER_ROLES.has(role);
}

export function shouldSkipPair(occluder: ViviMeshNode, lower: ViviMeshNode): boolean {
  if (occluder.id === lower.id) return true;

  const occluderRole = getLayerRole(occluder);
  const lowerRole = getLayerRole(lower);
  const metadata = getSeeThroughImportMetadata(occluder.importMetadata);

  return (
    occluderRole === "hairBack" &&
    metadata?.frontBackSplit === "back" &&
    (lowerRole === "face" || lowerRole === "head")
  );
}

function inferMotionSweepRadii(layer: ViviMeshNode): { x: number; y: number } {
  const role = getLayerRole(layer);
  if (role === "tail") {
    return {
      x: Math.round(clamp(layer.width * 0.035, 8, 56)),
      y: Math.round(clamp(layer.height * 0.08, 6, 32)),
    };
  }
  if (role === "ear") {
    return {
      x: Math.round(clamp(layer.width * 0.08, 6, 24)),
      y: Math.round(clamp(layer.height * 0.04, 4, 18)),
    };
  }
  return {
    x: Math.round(clamp(layer.width * 0.035, 8, 48)),
    y: Math.round(clamp(layer.height * 0.012, 3, 18)),
  };
}

export function optionsForOccluder(
  options: LayerOcclusionCleanupOptions | undefined,
  occluder: ViviMeshNode,
): LayerOcclusionCleanupOptions {
  const inferred = inferMotionSweepRadii(occluder);
  return {
    ...options,
    motionSweepRadiusX: options?.motionSweepRadiusX ?? inferred.x,
    motionSweepRadiusY: options?.motionSweepRadiusY ?? inferred.y,
  };
}
