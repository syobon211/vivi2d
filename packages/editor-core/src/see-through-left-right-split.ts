import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  isViviMesh,
  type LayerNode,
  type LayerSemanticRole,
  type LayerSemanticRoleSource,
  type ProjectData,
} from "@vivi2d/core/types";
import { mapSeeThroughLabelToRole } from "./see-through-role-map";

const FILL_CONFIDENCE_THRESHOLD = 0.5;
const REPAIR_CONFIDENCE_THRESHOLD = 0.8;

type SideRoleFamily = "eye" | "eyebrow" | "arm" | "hand" | "leg";
type SideRole = Extract<
  LayerSemanticRole,
  | "eyeLeft"
  | "eyeRight"
  | "eyebrowLeft"
  | "eyebrowRight"
  | "armLeft"
  | "armRight"
  | "handLeft"
  | "handRight"
  | "legLeft"
  | "legRight"
>;

export interface SeeThroughLeftRightSplitSummary {
  applied: boolean;
  repairedLayerIds: string[];
  assignedLayerIds: string[];
  unresolvedFamilyWarnings: string[];
  warnings: string[];
}

interface SideRoleInfo {
  family: SideRoleFamily;
  side: "left" | "right";
}

const SIDE_ROLE_INFO: Record<SideRole, SideRoleInfo> = {
  eyeLeft: { family: "eye", side: "left" },
  eyeRight: { family: "eye", side: "right" },
  eyebrowLeft: { family: "eyebrow", side: "left" },
  eyebrowRight: { family: "eyebrow", side: "right" },
  armLeft: { family: "arm", side: "left" },
  armRight: { family: "arm", side: "right" },
  handLeft: { family: "hand", side: "left" },
  handRight: { family: "hand", side: "right" },
  legLeft: { family: "leg", side: "left" },
  legRight: { family: "leg", side: "right" },
};

const FAMILY_LABELS: Record<SideRoleFamily, string> = {
  eye: "Eye",
  eyebrow: "Eyebrow",
  arm: "Arm",
  hand: "Hand",
  leg: "Leg",
};

function listImportedViviMeshes(project: ProjectData): LayerNode[] {
  return flattenLayers(project.layers).filter(
    (layer) => isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
}

function getSideRoleInfo(role: LayerSemanticRole | undefined): SideRoleInfo | null {
  if (!role) return null;
  return SIDE_ROLE_INFO[role as SideRole] ?? null;
}

function describeRole(role: LayerSemanticRole | undefined): string {
  return role ?? "unassigned";
}

function isProtectedSource(source: LayerSemanticRoleSource | undefined): boolean {
  return source == null || source === "manual" || source === "seeThroughImport";
}

function getTargetRoleFromImport(layer: LayerNode): SideRole | null {
  const metadata = layer.importMetadata;
  if (!metadata || metadata.source !== "seeThrough") return null;
  const mappedRole = mapSeeThroughLabelToRole(metadata.seeThrough.label);
  const info = getSideRoleInfo(mappedRole);
  if (!info) return null;
  if (metadata.seeThrough.leftRightSplit !== info.side) return null;
  return mappedRole as SideRole;
}

function pushLowConfidenceWarning(
  warnings: string[],
  layer: LayerNode,
  threshold: number,
): void {
  warnings.push(
    `Skipped left/right repair for "${layer.name}" because import confidence is below ${threshold.toFixed(
      1,
    )}.`,
  );
}

function collectUnresolvedFamilyWarnings(layers: LayerNode[]): string[] {
  const warnings: string[] = [];

  for (const family of Object.keys(FAMILY_LABELS) as SideRoleFamily[]) {
    const familyRoles = Object.entries(SIDE_ROLE_INFO).filter(
      ([, info]) => info.family === family,
    ) as [SideRole, SideRoleInfo][];
    const leftRole = familyRoles.find(([, info]) => info.side === "left")?.[0];
    const rightRole = familyRoles.find(([, info]) => info.side === "right")?.[0];
    if (!leftRole || !rightRole) continue;

    const leftCount = layers.filter((layer) => layer.semanticRole === leftRole).length;
    const rightCount = layers.filter((layer) => layer.semanticRole === rightRole).length;
    const familyLabel = FAMILY_LABELS[family];

    if (leftCount > 1) {
      warnings.push(`${familyLabel} Left still appears multiple times.`);
    }
    if (rightCount > 1) {
      warnings.push(`${familyLabel} Right still appears multiple times.`);
    }
    if ((leftCount > 0 && rightCount === 0) || (rightCount > 0 && leftCount === 0)) {
      warnings.push(`${familyLabel} roles still cover only one side.`);
    }
  }

  return warnings;
}

export function applySeeThroughLeftRightSplitAssistant(
  project: ProjectData,
): SeeThroughLeftRightSplitSummary {
  const importedViviMeshes = listImportedViviMeshes(project);
  const warnings: string[] = [];
  const repairedLayerIds: string[] = [];
  const assignedLayerIds: string[] = [];

  for (const layer of importedViviMeshes) {
    const metadata = layer.importMetadata;
    if (!metadata || metadata.source !== "seeThrough") continue;

    const targetRole = getTargetRoleFromImport(layer);
    if (!targetRole) {
      const mappedRole = mapSeeThroughLabelToRole(metadata.seeThrough.label);
      const mappedInfo = getSideRoleInfo(mappedRole);
      if (mappedInfo && metadata.seeThrough.leftRightSplit !== mappedInfo.side) {
        warnings.push(
          `Skipped left/right repair for "${layer.name}" because import side metadata conflicts with the raw label.`,
        );
      }
      continue;
    }

    const currentRole = layer.semanticRole;
    const currentInfo = getSideRoleInfo(currentRole);

    if (currentRole == null || currentRole === "unknown") {
      if (metadata.seeThrough.confidence < FILL_CONFIDENCE_THRESHOLD) {
        pushLowConfidenceWarning(warnings, layer, FILL_CONFIDENCE_THRESHOLD);
        continue;
      }
      layer.semanticRole = targetRole;
      layer.semanticRoleSource = "assistant";
      assignedLayerIds.push(layer.id);
      continue;
    }

    if (!currentInfo) {
      warnings.push(
        `Preserved "${layer.name}" because its current role ${describeRole(currentRole)} is outside the supported left/right families.`,
      );
      continue;
    }

    const targetInfo = getSideRoleInfo(targetRole)!;
    if (currentInfo.family !== targetInfo.family) {
      warnings.push(
        `Preserved "${layer.name}" because its current role ${describeRole(currentRole)} belongs to a different semantic family.`,
      );
      continue;
    }

    if (currentRole === targetRole) continue;

    if (isProtectedSource(layer.semanticRoleSource)) {
      warnings.push(
        `Preserved "${layer.name}" because its current ${describeRole(currentRole)} role is protected from automatic left/right override.`,
      );
      continue;
    }

    if (metadata.seeThrough.confidence < REPAIR_CONFIDENCE_THRESHOLD) {
      pushLowConfidenceWarning(warnings, layer, REPAIR_CONFIDENCE_THRESHOLD);
      continue;
    }

    layer.semanticRole = targetRole;
    layer.semanticRoleSource = "assistant";
    repairedLayerIds.push(layer.id);
  }

  const unresolvedFamilyWarnings = collectUnresolvedFamilyWarnings(importedViviMeshes);

  return {
    applied: repairedLayerIds.length > 0 || assignedLayerIds.length > 0,
    repairedLayerIds,
    assignedLayerIds,
    unresolvedFamilyWarnings,
    warnings,
  };
}
