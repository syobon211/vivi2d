import type { ViviMeshNode, LayerNode } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";

export type ReferenceOverlayBoundsMode = "source" | "currentBounds" | "importedBounds";

export interface ReferenceOverlayComparePreset {
  id: "sourceCurrent" | "sourceImported" | "currentImported";
  label: string;
  primary: ReferenceOverlayBoundsMode;
  secondary: ReferenceOverlayBoundsMode;
  requiresImportedBounds?: boolean;
}

export const REFERENCE_OVERLAY_COMPARE_PRESETS: readonly ReferenceOverlayComparePreset[] =
  [
    {
      id: "sourceCurrent",
      label: "Source vs Current",
      primary: "source",
      secondary: "currentBounds",
    },
    {
      id: "sourceImported",
      label: "Source vs Imported",
      primary: "source",
      secondary: "importedBounds",
      requiresImportedBounds: true,
    },
    {
      id: "currentImported",
      label: "Current vs Imported",
      primary: "currentBounds",
      secondary: "importedBounds",
      requiresImportedBounds: true,
    },
  ] as const;

export interface ReferenceOverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReferenceOverlayCompareSummary {
  offsetX: number;
  offsetY: number;
  widthDelta: number;
  heightDelta: number;
  areaScale: number;
  widthScale: number;
  heightScale: number;
  centerDistance: number;
}

export type ReferenceOverlayCompareStatus =
  | "aligned"
  | "offsetDrift"
  | "scaleDrift"
  | "offsetAndScaleDrift";

export interface ReferenceOverlayCompareAssessment {
  status: ReferenceOverlayCompareStatus;
  label: string;
}

export function getSourceReferenceBounds(
  layer: ViviMeshNode | LayerNode | null | undefined,
): ReferenceOverlayBounds | null {
  if (!layer || !isViviMesh(layer) || layer.width <= 0 || layer.height <= 0) return null;
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  };
}

export function getCurrentReferenceBounds(
  layer: ViviMeshNode | LayerNode | null | undefined,
): ReferenceOverlayBounds | null {
  if (!layer || !isViviMesh(layer) || layer.mesh.vertices.length < 2) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < layer.mesh.vertices.length; index += 2) {
    const x = layer.mesh.vertices[index];
    const y = layer.mesh.vertices[index + 1];
    if (x == null || y == null) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }
  return {
    x: layer.x + minX,
    y: layer.y + minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function getImportedReferenceBounds(
  layer: ViviMeshNode | LayerNode | null | undefined,
): ReferenceOverlayBounds | null {
  if (!layer || !isViviMesh(layer)) return null;
  const metadata = layer.importMetadata;
  if (!metadata || metadata.source !== "seeThrough") return null;
  const [x, y, width, height] = metadata.seeThrough.bbox;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { x, y, width, height };
}

export function hasImportedReferenceBounds(layer: LayerNode | null | undefined): boolean {
  return getImportedReferenceBounds(layer) != null;
}

export function resolveReferenceOverlayBounds(
  layer: ViviMeshNode | LayerNode | null | undefined,
  mode: ReferenceOverlayBoundsMode,
): ReferenceOverlayBounds | null {
  if (mode === "source") return getSourceReferenceBounds(layer);
  if (mode === "currentBounds") return getCurrentReferenceBounds(layer);
  return getImportedReferenceBounds(layer);
}

export function getReferenceOverlayCompareSummary(
  layer: ViviMeshNode | LayerNode | null | undefined,
  primaryMode: ReferenceOverlayBoundsMode = "currentBounds",
  secondaryMode: ReferenceOverlayBoundsMode = "importedBounds",
): ReferenceOverlayCompareSummary | null {
  const primary = resolveReferenceOverlayBounds(layer, primaryMode);
  const secondary = resolveReferenceOverlayBounds(layer, secondaryMode);
  if (!primary || !secondary || secondary.width <= 0 || secondary.height <= 0)
    return null;
  const secondaryArea = secondary.width * secondary.height;
  if (!Number.isFinite(secondaryArea) || secondaryArea <= 0) return null;
  const primaryCenterX = primary.x + primary.width / 2;
  const primaryCenterY = primary.y + primary.height / 2;
  const secondaryCenterX = secondary.x + secondary.width / 2;
  const secondaryCenterY = secondary.y + secondary.height / 2;
  return {
    offsetX: primary.x - secondary.x,
    offsetY: primary.y - secondary.y,
    widthDelta: primary.width - secondary.width,
    heightDelta: primary.height - secondary.height,
    areaScale: (primary.width * primary.height) / secondaryArea,
    widthScale: primary.width / secondary.width,
    heightScale: primary.height / secondary.height,
    centerDistance: Math.hypot(
      primaryCenterX - secondaryCenterX,
      primaryCenterY - secondaryCenterY,
    ),
  };
}

export function assessReferenceOverlayCompareSummary(
  summary: ReferenceOverlayCompareSummary | null | undefined,
): ReferenceOverlayCompareAssessment | null {
  if (!summary) return null;
  const offsetDrift =
    Math.abs(summary.offsetX) > 1 ||
    Math.abs(summary.offsetY) > 1 ||
    summary.centerDistance > 2;
  const scaleDrift =
    Math.abs(summary.widthScale - 1) > 0.05 || Math.abs(summary.heightScale - 1) > 0.05;
  if (offsetDrift && scaleDrift) {
    return { status: "offsetAndScaleDrift", label: "Offset + scale drift" };
  }
  if (offsetDrift) {
    return { status: "offsetDrift", label: "Offset drift" };
  }
  if (scaleDrift) {
    return { status: "scaleDrift", label: "Scale drift" };
  }
  return { status: "aligned", label: "Aligned" };
}

export function getReferenceOverlayModeLabel(mode: ReferenceOverlayBoundsMode): string {
  switch (mode) {
    case "source":
      return "Source";
    case "currentBounds":
      return "Current bounds";
    case "importedBounds":
      return "Imported bounds";
  }
}

function intersectBounds(
  left: ReferenceOverlayBounds,
  right: ReferenceOverlayBounds,
): ReferenceOverlayBounds | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  const width = rightEdge - x;
  const height = bottomEdge - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function subtractIntersection(
  bounds: ReferenceOverlayBounds,
  intersection: ReferenceOverlayBounds | null,
): ReferenceOverlayBounds[] {
  if (!intersection) return [bounds];
  const result: ReferenceOverlayBounds[] = [];
  const boundsRight = bounds.x + bounds.width;
  const boundsBottom = bounds.y + bounds.height;
  const intersectionRight = intersection.x + intersection.width;
  const intersectionBottom = intersection.y + intersection.height;

  if (intersection.x > bounds.x) {
    result.push({
      x: bounds.x,
      y: bounds.y,
      width: intersection.x - bounds.x,
      height: bounds.height,
    });
  }
  if (intersectionRight < boundsRight) {
    result.push({
      x: intersectionRight,
      y: bounds.y,
      width: boundsRight - intersectionRight,
      height: bounds.height,
    });
  }
  if (intersection.y > bounds.y) {
    result.push({
      x: intersection.x,
      y: bounds.y,
      width: intersection.width,
      height: intersection.y - bounds.y,
    });
  }
  if (intersectionBottom < boundsBottom) {
    result.push({
      x: intersection.x,
      y: intersectionBottom,
      width: intersection.width,
      height: boundsBottom - intersectionBottom,
    });
  }
  return result.filter((item) => item.width > 0 && item.height > 0);
}

export function getReferenceOverlayDifferenceRects(
  primary: ReferenceOverlayBounds,
  secondary: ReferenceOverlayBounds,
) {
  const intersection = intersectBounds(primary, secondary);
  return {
    primaryOnly: subtractIntersection(primary, intersection),
    secondaryOnly: subtractIntersection(secondary, intersection),
  };
}
