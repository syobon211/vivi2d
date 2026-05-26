import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  getSeeThroughImportMetadata,
  isViviMesh,
  type LayerImportLrSplit,
  type LayerNode,
  type LayerSemanticRole,
  type ProjectData,
  type SeeThroughImportMetadata,
} from "@vivi2d/core/types";
import { mapSeeThroughLabelToRole } from "@vivi2d/editor-core/see-through-role-map";

export type SeeThroughIssueSeverity = "error" | "warning" | "info";

export interface SeeThroughIssueDescriptor {
  code:
    | "missingHeadOrFace"
    | "missingEyeLeft"
    | "missingEyeRight"
    | "missingMouth"
    | "missingBody"
    | "duplicateCriticalRole"
    | "unknownSemanticRole"
    | "lowConfidenceRole"
    | "leftRightConflict"
    | "frontBackUnknown"
    | "invalidBBox"
    | "invalidDepthStats";
  severity: SeeThroughIssueSeverity;
}

export interface SeeThroughProjectIssue extends SeeThroughIssueDescriptor {
  role?: LayerSemanticRole;
}

export interface SeeThroughLayerIssue extends SeeThroughIssueDescriptor {
  layerId: string;
}

export interface SeeThroughQualityReport {
  isSeeThroughProject: boolean;
  importedViviMeshCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  projectIssues: SeeThroughProjectIssue[];
  layerIssues: Record<string, SeeThroughLayerIssue[]>;
}

const SIDE_ROLE_GROUPS: Record<string, readonly LayerSemanticRole[]> = {
  eye: ["eyeLeft", "eyeRight"],
  eyebrow: ["eyebrowLeft", "eyebrowRight"],
  arm: ["armLeft", "armRight"],
  hand: ["handLeft", "handRight"],
  leg: ["legLeft", "legRight"],
};

const CRITICAL_DUPLICATE_ROLES: readonly LayerSemanticRole[] = [
  "eyeLeft",
  "eyeRight",
  "mouth",
  "body",
];

function listImportedViviMeshes(project: ProjectData): LayerNode[] {
  return flattenLayers(project.layers).filter(
    (layer) => isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
}

function countSeverities(
  projectIssues: readonly SeeThroughProjectIssue[],
  layerIssues: Record<string, SeeThroughLayerIssue[]>,
): Pick<SeeThroughQualityReport, "errorCount" | "warningCount" | "infoCount"> {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  const bump = (severity: SeeThroughIssueSeverity) => {
    if (severity === "error") errorCount += 1;
    else if (severity === "warning") warningCount += 1;
    else infoCount += 1;
  };

  for (const issue of projectIssues) bump(issue.severity);
  for (const issues of Object.values(layerIssues)) {
    for (const issue of issues) bump(issue.severity);
  }

  return { errorCount, warningCount, infoCount };
}

function pushLayerIssue(
  layerIssues: Record<string, SeeThroughLayerIssue[]>,
  issue: SeeThroughLayerIssue,
): void {
  const bucket = layerIssues[issue.layerId] ?? [];
  bucket.push(issue);
  layerIssues[issue.layerId] = bucket;
}

function isFiniteBBox(bbox: SeeThroughImportMetadata["bbox"]): boolean {
  return bbox.every((value) => Number.isFinite(value));
}

function isValidBBox(bbox: SeeThroughImportMetadata["bbox"]): boolean {
  return isFiniteBBox(bbox) && bbox[2] > 0 && bbox[3] > 0;
}

function isValidDepthStats(metadata: SeeThroughImportMetadata): boolean {
  const stats = metadata.depthStats;
  if (
    !Number.isFinite(stats.min) ||
    !Number.isFinite(stats.max) ||
    !Number.isFinite(stats.mean)
  ) {
    return false;
  }
  if (stats.min > stats.max) return false;
  return stats.mean >= stats.min && stats.mean <= stats.max;
}

function getSideRoleGroup(role: LayerSemanticRole | undefined): string | null {
  if (!role) return null;
  for (const [group, roles] of Object.entries(SIDE_ROLE_GROUPS)) {
    if (roles.includes(role)) return group;
  }
  return null;
}

function hasSideConflict(
  role: LayerSemanticRole | undefined,
  rawRole: LayerSemanticRole,
  leftRightSplit: LayerImportLrSplit,
): boolean {
  if (!role || role === "unknown") return false;
  const roleGroup = getSideRoleGroup(role);
  const rawGroup = getSideRoleGroup(rawRole);
  if (!roleGroup || !rawGroup || roleGroup !== rawGroup) return false;
  if (leftRightSplit === "unknown" || leftRightSplit === "center") return false;
  return role !== rawRole;
}

export function buildSeeThroughQualityReport(
  project: ProjectData,
): SeeThroughQualityReport {
  const importedViviMeshes = listImportedViviMeshes(project);
  if (importedViviMeshes.length === 0) {
    return {
      isSeeThroughProject: false,
      importedViviMeshCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      projectIssues: [],
      layerIssues: {},
    };
  }

  const projectIssues: SeeThroughProjectIssue[] = [];
  const layerIssues: Record<string, SeeThroughLayerIssue[]> = {};
  const roleToLayerIds = new Map<LayerSemanticRole, string[]>();

  for (const layer of importedViviMeshes) {
    if (layer.semanticRole && layer.semanticRole !== "unknown") {
      const ids = roleToLayerIds.get(layer.semanticRole) ?? [];
      ids.push(layer.id);
      roleToLayerIds.set(layer.semanticRole, ids);
    }
  }

  if (!roleToLayerIds.has("face") && !roleToLayerIds.has("head")) {
    projectIssues.push({ code: "missingHeadOrFace", severity: "warning" });
  }
  if (!roleToLayerIds.has("eyeLeft")) {
    projectIssues.push({ code: "missingEyeLeft", severity: "warning" });
  }
  if (!roleToLayerIds.has("eyeRight")) {
    projectIssues.push({ code: "missingEyeRight", severity: "warning" });
  }
  if (!roleToLayerIds.has("mouth")) {
    projectIssues.push({ code: "missingMouth", severity: "warning" });
  }
  if (!roleToLayerIds.has("body")) {
    projectIssues.push({ code: "missingBody", severity: "warning" });
  }
  for (const role of CRITICAL_DUPLICATE_ROLES) {
    const ids = roleToLayerIds.get(role);
    if (ids && ids.length > 1) {
      projectIssues.push({
        code: "duplicateCriticalRole",
        severity: "warning",
        role,
      });
    }
  }

  for (const layer of importedViviMeshes) {
    const metadata = layer.importMetadata;
    if (!metadata || metadata.source !== "seeThrough") continue;
    const seeThrough = getSeeThroughImportMetadata(metadata);
    if (!seeThrough) continue;

    if (layer.semanticRole == null || layer.semanticRole === "unknown") {
      pushLayerIssue(layerIssues, {
        layerId: layer.id,
        code: "unknownSemanticRole",
        severity: "warning",
      });
    }
    if (seeThrough.confidence < 0.5) {
      pushLayerIssue(layerIssues, {
        layerId: layer.id,
        code: "lowConfidenceRole",
        severity: "warning",
      });
    }
    if (!isValidBBox(seeThrough.bbox)) {
      pushLayerIssue(layerIssues, {
        layerId: layer.id,
        code: "invalidBBox",
        severity: "error",
      });
    }
    if (!isValidDepthStats(seeThrough)) {
      pushLayerIssue(layerIssues, {
        layerId: layer.id,
        code: "invalidDepthStats",
        severity: "error",
      });
    }

    const rawRole = mapSeeThroughLabelToRole(seeThrough.label);
    if (
      rawRole !== "unknown" &&
      hasSideConflict(layer.semanticRole, rawRole, seeThrough.leftRightSplit)
    ) {
      pushLayerIssue(layerIssues, {
        layerId: layer.id,
        code: "leftRightConflict",
        severity: "info",
      });
    }

    if (seeThrough.frontBackSplit === "unknown") {
      pushLayerIssue(layerIssues, {
        layerId: layer.id,
        code: "frontBackUnknown",
        severity: "info",
      });
    }
  }

  return {
    isSeeThroughProject: true,
    importedViviMeshCount: importedViviMeshes.length,
    ...countSeverities(projectIssues, layerIssues),
    projectIssues,
    layerIssues,
  };
}
