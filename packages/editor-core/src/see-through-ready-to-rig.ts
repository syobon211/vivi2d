import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  isViviMesh,
  type LayerNode,
  type LayerSemanticRole,
  type ProjectData,
} from "@vivi2d/core/types";
import {
  hasSeeThroughTechnicalNamePrefix,
  stripSeeThroughTechnicalName,
} from "./see-through-technical-name";
import { mapSeeThroughLabelToRole } from "./see-through-role-map";

const MIN_READY_TO_RIG_CONFIDENCE = 0.3;
const SINGLETON_ROLES = new Set<LayerSemanticRole>([
  "eyeLeft",
  "eyeRight",
  "mouth",
  "body",
]);

type KnownLayerSemanticRole = Exclude<LayerSemanticRole, "unknown">;

export interface SeeThroughReadyToRigCleanupSummary {
  applied: boolean;
  renamedLayerIds: string[];
  assignedRoleLayerIds: string[];
  warnings: string[];
}

interface RoleCandidate {
  layer: LayerNode;
  role: KnownLayerSemanticRole;
}

function isKnownRole(
  role: LayerSemanticRole | undefined,
): role is KnownLayerSemanticRole {
  return role != null && role !== "unknown";
}

function isSeeThroughImportedViviMesh(layer: LayerNode) {
  return isViviMesh(layer) && layer.importMetadata?.source === "seeThrough";
}

function buildNameCounts(layers: LayerNode[]) {
  const counts = new Map<string, number>();
  for (const layer of layers) {
    counts.set(layer.name, (counts.get(layer.name) ?? 0) + 1);
  }
  return counts;
}

function buildStripTargetCounts(layers: LayerNode[]) {
  const counts = new Map<string, number>();
  for (const layer of layers) {
    if (
      !isSeeThroughImportedViviMesh(layer) ||
      !hasSeeThroughTechnicalNamePrefix(layer.name)
    )
      continue;
    const strippedName = stripSeeThroughTechnicalName(layer.name);
    if (strippedName === layer.name) continue;
    counts.set(strippedName, (counts.get(strippedName) ?? 0) + 1);
  }
  return counts;
}

function normalizeImportedNames(layers: LayerNode[], warnings: string[]): string[] {
  const renamedLayerIds: string[] = [];
  const nameCounts = buildNameCounts(layers);
  const stripTargetCounts = buildStripTargetCounts(layers);

  for (const layer of layers) {
    if (
      !isSeeThroughImportedViviMesh(layer) ||
      !hasSeeThroughTechnicalNamePrefix(layer.name)
    )
      continue;

    const originalName = layer.name;
    const strippedName = stripSeeThroughTechnicalName(layer.name);
    if (strippedName === layer.name) {
      warnings.push(
        `Skipped imported name cleanup for "${layer.name}" because the stripped name would be empty.`,
      );
      continue;
    }

    const currentNameCount = nameCounts.get(layer.name) ?? 0;
    if (
      (nameCounts.get(strippedName) ?? 0) > 0 ||
      (stripTargetCounts.get(strippedName) ?? 0) > 1
    ) {
      warnings.push(
        `Skipped imported name cleanup for "${layer.name}" because "${strippedName}" would collide with another layer name.`,
      );
      continue;
    }

    layer.name = strippedName;
    renamedLayerIds.push(layer.id);

    nameCounts.set(strippedName, (nameCounts.get(strippedName) ?? 0) + 1);
    if (currentNameCount <= 1) nameCounts.delete(originalName);
    else nameCounts.set(originalName, currentNameCount - 1);
  }

  return renamedLayerIds;
}

function collectRoleCandidates(layers: LayerNode[]) {
  const candidates: RoleCandidate[] = [];
  for (const layer of layers) {
    if (!isSeeThroughImportedViviMesh(layer)) continue;
    if (isKnownRole(layer.semanticRole)) continue;
    const seeThrough = layer.importMetadata?.seeThrough;
    if (!seeThrough) continue;
    if (seeThrough.confidence < MIN_READY_TO_RIG_CONFIDENCE) continue;
    const mappedRole = mapSeeThroughLabelToRole(seeThrough.label);
    if (!isKnownRole(mappedRole)) continue;
    candidates.push({ layer, role: mappedRole });
  }
  return candidates;
}

function assignUnknownRoles(layers: LayerNode[], warnings: string[]): string[] {
  const assignedRoleLayerIds: string[] = [];
  const existingKnownRoles = new Set(
    layers.map((layer) => layer.semanticRole).filter(isKnownRole),
  );
  const candidates = collectRoleCandidates(layers);
  const candidatesByRole = new Map<KnownLayerSemanticRole, RoleCandidate[]>();

  for (const candidate of candidates) {
    const list = candidatesByRole.get(candidate.role) ?? [];
    list.push(candidate);
    candidatesByRole.set(candidate.role, list);
  }

  for (const [role, roleCandidates] of candidatesByRole) {
    if (SINGLETON_ROLES.has(role)) {
      if (existingKnownRoles.has(role)) continue;
      if (roleCandidates.length !== 1) {
        warnings.push(
          `Skipped automatic assignment for ${role} because ${roleCandidates.length} imported layers match that singleton role.`,
        );
        continue;
      }
      roleCandidates[0]!.layer.semanticRole = role;
      roleCandidates[0]!.layer.semanticRoleSource = "assistant";
      assignedRoleLayerIds.push(roleCandidates[0]!.layer.id);
      existingKnownRoles.add(role);
      continue;
    }

    for (const candidate of roleCandidates) {
      candidate.layer.semanticRole = role;
      candidate.layer.semanticRoleSource = "assistant";
      assignedRoleLayerIds.push(candidate.layer.id);
    }
  }

  return assignedRoleLayerIds;
}

export function applySeeThroughReadyToRigCleanup(
  project: ProjectData,
): SeeThroughReadyToRigCleanupSummary {
  const layers = flattenLayers(project.layers);
  const warnings: string[] = [];
  const renamedLayerIds = normalizeImportedNames(layers, warnings);
  const assignedRoleLayerIds = assignUnknownRoles(layers, warnings);

  return {
    applied: renamedLayerIds.length > 0 || assignedRoleLayerIds.length > 0,
    renamedLayerIds,
    assignedRoleLayerIds,
    warnings,
  };
}
