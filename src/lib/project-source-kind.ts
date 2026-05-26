import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { ProjectData } from "@vivi2d/core/types";
import {
  getManualPngImportMetadata,
  getSeeThroughImportMetadata,
  isViviMesh,
} from "@vivi2d/core/types";

export type ProjectSourceKind =
  | "none"
  | "psd"
  | "seeThrough"
  | "manualPng"
  | "vivi"
  | "vivid";

export function inferProjectSourceKind(project: ProjectData): ProjectSourceKind {
  if (project.sourceKind) {
    return project.sourceKind;
  }
  const viviMeshes = flattenLayers(project.layers).filter(isViviMesh);
  if (viviMeshes.some((layer) => !!getSeeThroughImportMetadata(layer.importMetadata))) {
    return "seeThrough";
  }
  if (viviMeshes.some((layer) => !!getManualPngImportMetadata(layer.importMetadata))) {
    return "manualPng";
  }
  return "vivi";
}

export function isAutoSetupEligibleProjectSourceKind(kind: ProjectSourceKind): boolean {
  return kind === "psd" || kind === "seeThrough";
}

function listVisibleViviMeshLayers(project: ProjectData) {
  return flattenLayers(project.layers).filter(
    (layer) => isViviMesh(layer) && layer.visible !== false,
  );
}

function countManualPngImportedViviMeshLayers(project: ProjectData): number {
  return listVisibleViviMeshLayers(project).filter((layer) =>
    Boolean(getManualPngImportMetadata(layer.importMetadata)),
  ).length;
}

function countManualPngKnownRoleLayers(project: ProjectData): number {
  return listVisibleViviMeshLayers(project).filter(
    (layer) =>
      Boolean(getManualPngImportMetadata(layer.importMetadata)) &&
      layer.semanticRole != null &&
      layer.semanticRole !== "unknown",
  ).length;
}

export function isAutoSetupEligibleProject(
  project: ProjectData | null | undefined,
  kind: ProjectSourceKind,
): boolean {
  if (!project) return false;
  if (kind === "psd" || kind === "seeThrough") {
    return listVisibleViviMeshLayers(project).length >= 2;
  }
  return (
    kind === "manualPng" &&
    countManualPngImportedViviMeshLayers(project) >= 2 &&
    countManualPngKnownRoleLayers(project) >= 2
  );
}

export function isAutoSetupDiscoverableProjectSourceKind(
  kind: ProjectSourceKind,
): boolean {
  return isAutoSetupEligibleProjectSourceKind(kind) || kind === "manualPng";
}

export function isAutoSetupDiscoverableProject(
  project: ProjectData | null | undefined,
  kind: ProjectSourceKind,
): boolean {
  return !!project && isAutoSetupDiscoverableProjectSourceKind(kind);
}

export function getAutoSetupProjectSourceKindBlockReasonKey(
  kind: ProjectSourceKind,
): "menu.autoSetupManualPngDisabled" | null {
  return kind === "manualPng" ? "menu.autoSetupManualPngDisabled" : null;
}

export type AutoSetupProjectBlockReasonKey =
  | "menu.autoSetupManualPngDisabled"
  | "menu.autoSetupManualPngNeedsSplit"
  | "menu.autoSetupManualPngNeedsRoles"
  | "menu.autoSetupNeedsSeparatedLayers";

export function getAutoSetupProjectBlockReasonKey(
  project: ProjectData | null | undefined,
  kind: ProjectSourceKind,
): AutoSetupProjectBlockReasonKey | null {
  if (!project || isAutoSetupEligibleProject(project, kind)) return null;
  if (kind === "psd" || kind === "seeThrough") {
    return "menu.autoSetupNeedsSeparatedLayers";
  }
  if (kind === "manualPng") {
    if (countManualPngImportedViviMeshLayers(project) < 2) {
      return "menu.autoSetupManualPngDisabled";
    }
    if (countManualPngKnownRoleLayers(project) < 2) {
      return "menu.autoSetupManualPngNeedsRoles";
    }
  }
  return getAutoSetupProjectSourceKindBlockReasonKey(kind);
}
