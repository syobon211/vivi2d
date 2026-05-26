import { getDrawOrder } from "@vivi2d/core/color-utils";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  getSeeThroughImportMetadata,
  isViviMesh,
  type LayerImportFbSplit,
  type LayerSemanticRole,
  type ProjectData,
} from "@vivi2d/core/types";

export type SeeThroughDepthInspectorSortMode =
  | "importedDepth"
  | "currentDrawOrder"
  | "name";

export type SeeThroughDepthInspectorRowWarningCode =
  | "missingImportedOrder"
  | "frontBackUnknown";

export type SeeThroughDepthInspectorProjectWarningCode =
  | "duplicateImportedOrder"
  | "duplicateExternalDrawOrder"
  | "rendererTieDepthOrder"
  | "frontBackAdjacency";

export interface SeeThroughDepthInspectorRow {
  layerId: string;
  name: string;
  semanticRole?: LayerSemanticRole;
  importedLabel: string;
  importedOrder: number | null;
  frontBackSplit: LayerImportFbSplit;
  currentDrawOrder: number;
  treeOrder: number;
  labelBase: string;
  warnings: SeeThroughDepthInspectorRowWarningCode[];
}

export interface SeeThroughDepthInspectorProjectWarning {
  code: SeeThroughDepthInspectorProjectWarningCode;
  layerIds: string[];
  order?: number;
  drawOrder?: number;
  labelBase?: string;
}

export interface SeeThroughDepthInspectorNormalizationAssignment {
  layerId: string;
  fromDrawOrder: number;
  toDrawOrder: number;
}

export interface SeeThroughDepthInspectorNormalizationPlan {
  assignments: SeeThroughDepthInspectorNormalizationAssignment[];
  warnings: SeeThroughDepthInspectorProjectWarning[];
}

const FRONT_BACK_SUFFIX_RE = /(?:^|_)(front|back|middle)$/;

function normalizeLabelBase(label: string): string {
  return label.toLowerCase().replace(FRONT_BACK_SUFFIX_RE, "");
}

function isFiniteImportedOrder(order: unknown): order is number {
  return typeof order === "number" && Number.isFinite(order);
}

function compareImportedDepth(
  a: SeeThroughDepthInspectorRow,
  b: SeeThroughDepthInspectorRow,
): number {
  if (a.importedOrder == null && b.importedOrder == null)
    return a.treeOrder - b.treeOrder;
  if (a.importedOrder == null) return 1;
  if (b.importedOrder == null) return -1;
  if (a.importedOrder !== b.importedOrder) return a.importedOrder - b.importedOrder;
  return a.treeOrder - b.treeOrder;
}

function compareCurrentDrawOrder(
  a: SeeThroughDepthInspectorRow,
  b: SeeThroughDepthInspectorRow,
): number {
  if (a.currentDrawOrder !== b.currentDrawOrder) {
    return a.currentDrawOrder - b.currentDrawOrder;
  }
  return a.treeOrder - b.treeOrder;
}

function compareName(
  a: SeeThroughDepthInspectorRow,
  b: SeeThroughDepthInspectorRow,
): number {
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
    a.treeOrder - b.treeOrder
  );
}

function buildStaticWarnings(
  rows: readonly SeeThroughDepthInspectorRow[],
): SeeThroughDepthInspectorProjectWarning[] {
  const warnings: SeeThroughDepthInspectorProjectWarning[] = [];
  const rowsByImportedOrder = new Map<number, string[]>();
  for (const row of rows) {
    if (row.importedOrder == null) continue;
    const ids = rowsByImportedOrder.get(row.importedOrder) ?? [];
    ids.push(row.layerId);
    rowsByImportedOrder.set(row.importedOrder, ids);
  }
  for (const [order, layerIds] of rowsByImportedOrder) {
    if (layerIds.length > 1) {
      warnings.push({ code: "duplicateImportedOrder", order, layerIds });
      warnings.push({ code: "rendererTieDepthOrder", order, layerIds });
    }
  }
  return warnings;
}

function buildNormalizedWarnings(
  project: ProjectData,
  rows: readonly SeeThroughDepthInspectorRow[],
  assignments: readonly SeeThroughDepthInspectorNormalizationAssignment[],
): SeeThroughDepthInspectorProjectWarning[] {
  const warnings: SeeThroughDepthInspectorProjectWarning[] = [];
  const importedIds = new Set(rows.map((row) => row.layerId));
  const nonImportedDrawOrders = new Map<number, string[]>();

  for (const layer of flattenLayers(project.layers)) {
    if (importedIds.has(layer.id)) continue;
    const ids = nonImportedDrawOrders.get(getDrawOrder(layer.drawOrder)) ?? [];
    ids.push(layer.id);
    nonImportedDrawOrders.set(getDrawOrder(layer.drawOrder), ids);
  }

  const assignmentMap = new Map(
    assignments.map((assignment) => [assignment.layerId, assignment]),
  );
  const normalizedRows = rows
    .map((row) => ({
      ...row,
      normalizedDrawOrder:
        assignmentMap.get(row.layerId)?.toDrawOrder ?? row.currentDrawOrder,
    }))
    .sort(
      (a, b) =>
        a.normalizedDrawOrder - b.normalizedDrawOrder || a.treeOrder - b.treeOrder,
    );

  for (const row of normalizedRows) {
    const collisions = nonImportedDrawOrders.get(row.normalizedDrawOrder);
    if (!collisions || collisions.length === 0) continue;
    warnings.push({
      code: "duplicateExternalDrawOrder",
      drawOrder: row.normalizedDrawOrder,
      layerIds: [row.layerId, ...collisions],
    });
  }

  const groupedByBase = new Map<string, typeof normalizedRows>();
  for (const row of normalizedRows) {
    const group = groupedByBase.get(row.labelBase) ?? [];
    group.push(row);
    groupedByBase.set(row.labelBase, group);
  }

  for (const [labelBase, group] of groupedByBase) {
    const front = group.filter((row) => row.frontBackSplit === "front");
    const back = group.filter((row) => row.frontBackSplit === "back");
    if (front.length === 0 || back.length === 0) continue;
    const firstFrontIndex = normalizedRows.findIndex(
      (row) => row.layerId === front[0]!.layerId,
    );
    const lastBackIndex = normalizedRows.findIndex(
      (row) => row.layerId === back[back.length - 1]!.layerId,
    );
    if (firstFrontIndex < 0 || lastBackIndex < 0) continue;
    if (Math.abs(firstFrontIndex - lastBackIndex) !== 1) {
      warnings.push({
        code: "frontBackAdjacency",
        labelBase,
        layerIds: [...back.map((row) => row.layerId), ...front.map((row) => row.layerId)],
      });
    }
  }

  return warnings;
}

export function collectSeeThroughDepthInspectorRows(
  project: ProjectData,
): SeeThroughDepthInspectorRow[] {
  return flattenLayers(project.layers)
    .map((layer, treeOrder) => ({ layer, treeOrder }))
    .filter(
      ({ layer }) => isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
    )
    .map(({ layer, treeOrder }) => {
      const metadata = getSeeThroughImportMetadata(layer.importMetadata);
      if (!metadata) {
        throw new Error("Expected see-through import metadata for depth inspector.");
      }
      const importedOrder = isFiniteImportedOrder((metadata as { order?: unknown }).order)
        ? metadata.order
        : null;
      const warnings: SeeThroughDepthInspectorRowWarningCode[] = [];
      if (importedOrder == null) warnings.push("missingImportedOrder");
      if (metadata.frontBackSplit === "unknown") warnings.push("frontBackUnknown");
      return {
        layerId: layer.id,
        name: layer.name,
        semanticRole: layer.semanticRole,
        importedLabel: metadata.label,
        importedOrder,
        frontBackSplit: metadata.frontBackSplit,
        currentDrawOrder: getDrawOrder(layer.drawOrder),
        treeOrder,
        labelBase: normalizeLabelBase(metadata.label),
        warnings,
      };
    });
}

export function sortSeeThroughDepthInspectorRows(
  rows: readonly SeeThroughDepthInspectorRow[],
  mode: SeeThroughDepthInspectorSortMode,
): SeeThroughDepthInspectorRow[] {
  const next = [...rows];
  if (mode === "currentDrawOrder") next.sort(compareCurrentDrawOrder);
  else if (mode === "name") next.sort(compareName);
  else next.sort(compareImportedDepth);
  return next;
}

export function buildSeeThroughDepthNormalizationPlan(
  project: ProjectData,
): SeeThroughDepthInspectorNormalizationPlan {
  const rows = collectSeeThroughDepthInspectorRows(project);
  const sourceRows = sortSeeThroughDepthInspectorRows(rows, "importedDepth");
  const availableDrawOrders = [...rows]
    .sort(compareCurrentDrawOrder)
    .map((row) => row.currentDrawOrder);

  const assignments = sourceRows
    .map((row, index) => ({
      layerId: row.layerId,
      fromDrawOrder: row.currentDrawOrder,
      toDrawOrder: availableDrawOrders[index] ?? row.currentDrawOrder,
    }))
    .filter((assignment) => assignment.fromDrawOrder !== assignment.toDrawOrder);

  return {
    assignments,
    warnings: buildStaticWarnings(rows).concat(
      buildNormalizedWarnings(project, rows, assignments),
    ),
  };
}

export function buildSeeThroughDepthInspectorWarnings(
  project: ProjectData,
  rows: readonly SeeThroughDepthInspectorRow[],
): SeeThroughDepthInspectorProjectWarning[] {
  return buildStaticWarnings(rows).concat(
    buildNormalizedWarnings(
      project,
      rows,
      buildSeeThroughDepthNormalizationPlan(project).assignments,
    ),
  );
}
