import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";

import {
  boundsArea,
  expandLayerBounds,
  intersectBounds,
  uniqueOperations,
} from "./geometry";
import {
  getLayerRole,
  isLowerLayerTarget,
  isOccluderLayer,
  optionsForOccluder,
  shouldSkipPair,
} from "./layer-semantics";
import { clamp01 } from "./math";
import { resolveOptions } from "./options";
import type {
  LayerOcclusionCleanupLayerReport,
  LayerOcclusionCleanupOperation,
  LayerOcclusionCleanupOptions,
  LayerOcclusionCleanupPairReport,
  LayerOcclusionCleanupPreviewReport,
  ResolvedOptions,
} from "./types";

function buildCleanupOperations(
  options: ResolvedOptions,
  overlapArea: number,
  sweptArea: number,
): LayerOcclusionCleanupOperation[] {
  const operations: LayerOcclusionCleanupOperation[] = [];
  if (options.edgeDecontaminationStrength > 0) operations.push("foreground-edge");
  if (overlapArea > 0 && options.holdoutStrength > 0) operations.push("lower-holdout");
  if (
    overlapArea > 0 &&
    (options.underpaintStrength > 0 || options.contextUnderpaintStrength > 0)
  ) {
    operations.push("underpaint");
  }
  if (sweptArea > overlapArea && options.motionSweepStrength > 0) {
    operations.push("motion-sweep");
  }
  if (overlapArea > 0 && options.duplicateContourStrength > 0) {
    operations.push("duplicate-contour");
  }
  return operations;
}

function scoreCleanupPair(
  options: ResolvedOptions,
  overlapRatio: number,
  sweptOverlapRatio: number,
): number {
  const directStrength =
    options.holdoutStrength * 0.34 +
    options.underpaintStrength * 0.24 +
    options.contextUnderpaintStrength * 0.18 +
    options.duplicateContourStrength * 0.34;
  const sweepStrength = options.motionSweepStrength * 0.38;
  const foregroundStrength = options.edgeDecontaminationStrength * 0.12;
  return clamp01(
    overlapRatio * directStrength +
      Math.max(0, sweptOverlapRatio - overlapRatio) * sweepStrength +
      foregroundStrength,
  );
}

function createLayerReportSeed(
  layer: ViviMeshNode,
  kind: LayerOcclusionCleanupLayerReport["kind"],
): LayerOcclusionCleanupLayerReport {
  const role = getLayerRole(layer);
  if (!role) {
    throw new Error("Layer occlusion cleanup reports require semantic roles.");
  }
  return {
    layerId: layer.id,
    layerName: layer.name,
    role,
    kind,
    pairCount: 0,
    estimatedAffectedArea: 0,
    cleanupScore: 0,
    operations: [],
  };
}

export function buildLayerOcclusionCleanupPreviewReport(
  layers: readonly ViviMeshNode[],
  options?: LayerOcclusionCleanupOptions,
): LayerOcclusionCleanupPreviewReport {
  const occluders = layers.filter(isOccluderLayer);
  const lowerLayers = layers.filter(isLowerLayerTarget);
  const pairReports: LayerOcclusionCleanupPairReport[] = [];
  const layerReportById = new Map<string, LayerOcclusionCleanupLayerReport>();

  for (const occluder of occluders) {
    const foregroundRole = getLayerRole(occluder);
    if (!foregroundRole) continue;
    const occluderOptions = resolveOptions(optionsForOccluder(options, occluder));
    const sweptBounds = expandLayerBounds(
      occluder,
      occluderOptions.motionSweepRadiusX,
      occluderOptions.motionSweepRadiusY,
    );
    const foregroundArea = Math.max(1, occluder.width * occluder.height);

    for (const lowerLayer of lowerLayers) {
      if (shouldSkipPair(occluder, lowerLayer)) continue;
      const lowerRole = getLayerRole(lowerLayer);
      if (!lowerRole) continue;

      const overlapArea = boundsArea(intersectBounds(occluder, lowerLayer));
      const sweptArea = boundsArea(intersectBounds(sweptBounds, lowerLayer));
      if (sweptArea <= 0) continue;

      const lowerArea = Math.max(1, lowerLayer.width * lowerLayer.height);
      const sharedReferenceArea = Math.max(1, Math.min(foregroundArea, lowerArea));
      const overlapRatio = clamp01(overlapArea / sharedReferenceArea);
      const sweptOverlapRatio = clamp01(sweptArea / sharedReferenceArea);
      const cleanupScore = scoreCleanupPair(
        occluderOptions,
        overlapRatio,
        sweptOverlapRatio,
      );
      const operations = buildCleanupOperations(
        occluderOptions,
        overlapArea,
        sweptArea,
      );
      const estimatedAffectedArea = Math.round(sweptArea * Math.max(0.18, cleanupScore));

      pairReports.push({
        foregroundLayerId: occluder.id,
        foregroundLayerName: occluder.name,
        foregroundRole,
        lowerLayerId: lowerLayer.id,
        lowerLayerName: lowerLayer.name,
        lowerRole,
        overlapArea: Math.round(overlapArea),
        sweptArea: Math.round(sweptArea),
        overlapRatio,
        sweptOverlapRatio,
        cleanupScore,
        operations,
      });

      const foregroundReport =
        layerReportById.get(occluder.id) ??
        createLayerReportSeed(occluder, "foreground");
      foregroundReport.pairCount += 1;
      foregroundReport.estimatedAffectedArea += estimatedAffectedArea;
      foregroundReport.cleanupScore = Math.max(
        foregroundReport.cleanupScore,
        cleanupScore,
      );
      foregroundReport.operations = uniqueOperations([
        ...foregroundReport.operations,
        ...operations.filter(
          (operation) =>
            operation === "foreground-edge" || operation === "duplicate-contour",
        ),
      ]);
      layerReportById.set(occluder.id, foregroundReport);

      const lowerReport =
        layerReportById.get(lowerLayer.id) ??
        createLayerReportSeed(lowerLayer, "lower");
      lowerReport.pairCount += 1;
      lowerReport.estimatedAffectedArea += estimatedAffectedArea;
      lowerReport.cleanupScore = Math.max(lowerReport.cleanupScore, cleanupScore);
      lowerReport.operations = uniqueOperations([
        ...lowerReport.operations,
        ...operations.filter((operation) => operation !== "foreground-edge"),
      ]);
      layerReportById.set(lowerLayer.id, lowerReport);
    }
  }

  pairReports.sort((a, b) => b.cleanupScore - a.cleanupScore);
  const layerReports = [...layerReportById.values()].sort(
    (a, b) => b.cleanupScore - a.cleanupScore,
  );

  return {
    isEligible: occluders.length > 0 && lowerLayers.length > 0,
    foregroundLayerCount: occluders.length,
    lowerLayerCount: lowerLayers.length,
    pairCount: pairReports.length,
    estimatedAffectedArea: pairReports.reduce(
      (sum, report) =>
        sum + Math.round(report.sweptArea * Math.max(0.18, report.cleanupScore)),
      0,
    ),
    maxCleanupScore:
      pairReports.length > 0
        ? Math.max(...pairReports.map((report) => report.cleanupScore))
        : 0,
    pairReports,
    layerReports,
  };
}

export function buildProjectLayerOcclusionCleanupPreviewReport(
  project: ProjectData,
  options?: LayerOcclusionCleanupOptions,
): LayerOcclusionCleanupPreviewReport {
  return buildLayerOcclusionCleanupPreviewReport(
    flattenLayers(project.layers).filter(isViviMesh),
    options,
  );
}
