import { findLayerById } from "@vivi2d/core/layer-utils";
import {
  getManualPngImportMetadata,
  isViviMesh,
  type ManualPngLayerImportMetadata,
  type ManualPngImportMetadata,
  type ProjectData,
  type ViviMeshNode,
} from "@vivi2d/core/types";

export interface ManualPngReimportPreparedBounds {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface ManualPngReimportLayerGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualPngReimportApplyInput {
  layerId: string;
  geometry: ManualPngReimportLayerGeometry;
  importMetadata: ManualPngLayerImportMetadata;
}

export function getManualPngReimportTargetLayer(
  project: ProjectData,
  layerId: string,
): { layer: ViviMeshNode; metadata: ManualPngImportMetadata } | null {
  const layer = findLayerById(project.layers, layerId);
  if (!layer || !isViviMesh(layer)) return null;
  const metadata = getManualPngImportMetadata(layer.importMetadata);
  if (!metadata) return null;
  return { layer, metadata };
}

export function assertManualPngReimportMatchesLayer(
  layer: ViviMeshNode,
  prepared: ManualPngReimportPreparedBounds,
  position: { x: number; y: number },
  metadata: ManualPngImportMetadata,
  mismatchMessage: string,
): void {
  const trimmedBoundsMatch =
    prepared.offsetX === metadata.trimmedBounds[0] &&
    prepared.offsetY === metadata.trimmedBounds[1] &&
    prepared.width === metadata.trimmedBounds[2] &&
    prepared.height === metadata.trimmedBounds[3];
  const geometryMatch =
    prepared.width === layer.width &&
    prepared.height === layer.height &&
    position.x === layer.x &&
    position.y === layer.y;
  const placementMatch =
    position.x === metadata.finalOrigin[0] && position.y === metadata.finalOrigin[1];

  if (!trimmedBoundsMatch || !geometryMatch || !placementMatch) {
    throw new Error(mismatchMessage);
  }
}

/**
 * Applies a manual PNG reimport to the supplied project or draft.
 * Callers should run assertManualPngReimportMatchesLayer before entering their
 * history transaction; this function re-resolves the layer in the mutable draft.
 */
export function applyManualPngReimportToLayer(
  project: ProjectData,
  input: ManualPngReimportApplyInput,
): boolean {
  const target = getManualPngReimportTargetLayer(project, input.layerId);
  if (!target) return false;
  target.layer.width = input.geometry.width;
  target.layer.height = input.geometry.height;
  target.layer.x = input.geometry.x;
  target.layer.y = input.geometry.y;
  target.layer.importMetadata = input.importMetadata;
  return true;
}
