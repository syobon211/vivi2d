import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  getSeeThroughImportMetadata,
  isViviMesh,
  type LayerNode,
  type ProjectData,
} from "@vivi2d/core/types";

type EyeSide = "left" | "right";

const IRIS_LABEL_BY_SIDE: Record<EyeSide, string> = {
  left: "iris_left",
  right: "iris_right",
};

const EYE_WHITE_LABEL_BY_SIDE: Record<EyeSide, string> = {
  left: "eye_white_left",
  right: "eye_white_right",
};

export interface SeeThroughEyeClippingPlan {
  applied: boolean;
  updatedLayerIds: string[];
  warnings: string[];
}

function normalizeLabel(label: string | undefined): string {
  return (label ?? "").trim().toLowerCase();
}

function isSeeThroughImportedViviMesh(layer: LayerNode) {
  return isViviMesh(layer) && layer.importMetadata?.source === "seeThrough";
}

function listSeeThroughImportedViviMeshes(project: ProjectData) {
  return flattenLayers(project.layers).filter(isSeeThroughImportedViviMesh);
}

function arraysEqual(left: ReadonlyArray<string>, right: ReadonlyArray<string>) {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

export function applySeeThroughEyeClipping(
  project: ProjectData,
): SeeThroughEyeClippingPlan {
  const importedViviMeshes = listSeeThroughImportedViviMeshes(project);
  const warnings: string[] = [];
  const updatedLayerIds: string[] = [];

  for (const side of ["left", "right"] as const) {
    const irisCandidates = importedViviMeshes.filter(
      (layer) =>
        normalizeLabel(getSeeThroughImportMetadata(layer.importMetadata)?.label) ===
        IRIS_LABEL_BY_SIDE[side],
    );
    const eyeWhiteCandidates = importedViviMeshes.filter(
      (layer) =>
        normalizeLabel(getSeeThroughImportMetadata(layer.importMetadata)?.label) ===
        EYE_WHITE_LABEL_BY_SIDE[side],
    );

    if (irisCandidates.length === 0 && eyeWhiteCandidates.length === 0) continue;

    if (irisCandidates.length !== 1) {
      warnings.push(
        irisCandidates.length === 0
          ? `Skipped ${side} eye clipping because no imported iris layer was found.`
          : `Skipped ${side} eye clipping because ${irisCandidates.length} imported iris layers were found.`,
      );
      continue;
    }

    if (eyeWhiteCandidates.length !== 1) {
      warnings.push(
        eyeWhiteCandidates.length === 0
          ? `Skipped ${side} eye clipping because no imported eye-white layer was found.`
          : `Skipped ${side} eye clipping because ${eyeWhiteCandidates.length} imported eye-white layers were found.`,
      );
      continue;
    }

    const irisLayer = irisCandidates[0]!;
    const eyeWhiteLayer = eyeWhiteCandidates[0]!;
    const desiredMaskIds = [eyeWhiteLayer.id];
    const currentMaskIds = irisLayer.clipMaskIds ?? [];

    if (arraysEqual(currentMaskIds, desiredMaskIds)) continue;
    if (currentMaskIds.length > 0) {
      warnings.push(
        `Skipped ${side} eye clipping because ${irisLayer.name} already has clip masks.`,
      );
      continue;
    }

    irisLayer.clipMaskIds = desiredMaskIds;
    updatedLayerIds.push(irisLayer.id);
  }

  return {
    applied: updatedLayerIds.length > 0,
    updatedLayerIds,
    warnings,
  };
}
