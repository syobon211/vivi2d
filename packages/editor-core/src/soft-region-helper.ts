export const SOFT_REGION_PRESET_IDS = ["cheek", "sleeve", "generic"] as const;

export type SoftRegionPresetId = (typeof SOFT_REGION_PRESET_IDS)[number];
export type SoftRegionPinKind = "handle" | "anchor";
export type SoftRegionFalloffCurve = "linear" | "smoothstep" | "gaussian";

export type SoftRegionHelperRejectReason =
  | "tooFewVertices"
  | "invalidVertexSelection"
  | "selectionTooDegenerate";

export interface SoftRegionPinPlan {
  vertexIndex: number;
  kind: SoftRegionPinKind;
  radius: number;
  strength: number;
  curve: SoftRegionFalloffCurve;
}

export interface SoftRegionHelperPlan {
  managedTag: string;
  managedSignature: string;
  groupName: string;
  presetId: SoftRegionPresetId;
  pins: SoftRegionPinPlan[];
}

export interface BuildSoftRegionHelperPlanResult {
  status: "planned" | "rejected";
  reason?: SoftRegionHelperRejectReason;
  plan?: SoftRegionHelperPlan;
}

const SOFT_REGION_TAG = "softRegionDeformer:v1";
const MIN_SELECTED_VERTICES = 3;

interface VertexPoint {
  index: number;
  x: number;
  y: number;
}

function normalizeVertexIndices(
  vertices: number[],
  selectedVertexIndices: readonly number[],
): number[] | null {
  const vertexCount = Math.floor(vertices.length / 2);
  const unique = Array.from(new Set(selectedVertexIndices)).sort((a, b) => a - b);
  if (unique.length < MIN_SELECTED_VERTICES) return null;
  if (unique.some((index) => index < 0 || index >= vertexCount)) return null;
  return unique;
}

function toPoints(
  vertices: number[],
  selectedVertexIndices: readonly number[],
): VertexPoint[] {
  return selectedVertexIndices.map((index) => ({
    index,
    x: vertices[index * 2] ?? 0,
    y: vertices[index * 2 + 1] ?? 0,
  }));
}

function findHandlePoint(points: readonly VertexPoint[]): VertexPoint {
  const centroidX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centroidY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return [...points].sort((a, b) => {
    const da = (a.x - centroidX) ** 2 + (a.y - centroidY) ** 2;
    const db = (b.x - centroidX) ** 2 + (b.y - centroidY) ** 2;
    if (Math.abs(da - db) > 1e-6) return da - db;
    return a.index - b.index;
  })[0]!;
}

function chooseExtremePoint(
  points: readonly VertexPoint[],
  axis: "left" | "right" | "top" | "bottom",
  centerY: number,
): VertexPoint {
  return [...points].sort((a, b) => {
    if (axis === "left" || axis === "right") {
      const primary = axis === "left" ? a.x - b.x : b.x - a.x;
      if (Math.abs(primary) > 1e-6) return primary;
      const secondary = Math.abs(a.y - centerY) - Math.abs(b.y - centerY);
      if (Math.abs(secondary) > 1e-6) return secondary;
    } else {
      const primary = axis === "top" ? a.y - b.y : b.y - a.y;
      if (Math.abs(primary) > 1e-6) return primary;
      const secondary = Math.abs(a.x) - Math.abs(b.x);
      if (Math.abs(secondary) > 1e-6) return secondary;
    }
    return a.index - b.index;
  })[0]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolvePresetDefaults(
  presetId: SoftRegionPresetId,
  maxDimension: number,
): {
  handleRadius: number;
  anchorRadius: number;
  handleStrength: number;
  curve: SoftRegionFalloffCurve;
  groupName: string;
} {
  const baseRadius = clamp(maxDimension * 0.35, 20, 96);
  switch (presetId) {
    case "cheek":
      return {
        handleRadius: clamp(baseRadius * 0.8, 18, 72),
        anchorRadius: clamp(baseRadius * 0.75, 16, 64),
        handleStrength: 0.85,
        curve: "gaussian",
        groupName: "Soft Region: Cheek",
      };
    case "sleeve":
      return {
        handleRadius: clamp(baseRadius * 1.1, 24, 108),
        anchorRadius: clamp(baseRadius * 0.9, 18, 84),
        handleStrength: 1.1,
        curve: "smoothstep",
        groupName: "Soft Region: Sleeve",
      };
    default:
      return {
        handleRadius: baseRadius,
        anchorRadius: clamp(baseRadius * 0.8, 16, 84),
        handleStrength: 1,
        curve: "smoothstep",
        groupName: "Soft Region",
      };
  }
}

export function buildSoftRegionHelperPlan(
  meshId: string,
  vertices: number[],
  selectedVertexIndices: readonly number[],
  presetId: SoftRegionPresetId,
): BuildSoftRegionHelperPlanResult {
  const normalized = normalizeVertexIndices(vertices, selectedVertexIndices);
  if (!normalized) {
    return {
      status: "rejected",
      reason:
        selectedVertexIndices.length < MIN_SELECTED_VERTICES
          ? "tooFewVertices"
          : "invalidVertexSelection",
    };
  }

  const points = toPoints(vertices, normalized);
  const handlePoint = findHandlePoint(points);
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const left = chooseExtremePoint(points, "left", centerY);
  const right = chooseExtremePoint(points, "right", centerY);
  const top = chooseExtremePoint(points, "top", centerY);
  const bottom = chooseExtremePoint(points, "bottom", centerY);
  const anchorIndices = [left.index, right.index, top.index, bottom.index].filter(
    (vertexIndex, index, array) =>
      vertexIndex !== handlePoint.index && array.indexOf(vertexIndex) === index,
  );

  if (anchorIndices.length < 3) {
    return { status: "rejected", reason: "selectionTooDegenerate" };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const maxDimension = Math.max(maxX - minX, maxY - minY, 1);
  const defaults = resolvePresetDefaults(presetId, maxDimension);
  const pins: SoftRegionPinPlan[] = [
    {
      vertexIndex: handlePoint.index,
      kind: "handle",
      radius: defaults.handleRadius,
      strength: defaults.handleStrength,
      curve: defaults.curve,
    },
    ...anchorIndices.map((vertexIndex) => ({
      vertexIndex,
      kind: "anchor" as const,
      radius: defaults.anchorRadius,
      strength: 1,
      curve: defaults.curve,
    })),
  ];

  return {
    status: "planned",
    plan: {
      managedTag: SOFT_REGION_TAG,
      managedSignature: `${meshId}|${presetId}|${normalized.join(",")}`,
      groupName: defaults.groupName,
      presetId,
      pins,
    },
  };
}
