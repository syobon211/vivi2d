import { PHYSICS_DEFAULTS } from "@vivi2d/core/constants";
import { computeBoneWorldTransforms, invertAffine } from "@vivi2d/core/bone-utils";
import { findLayerById, removeFromTree } from "@vivi2d/core/layer-utils";
import { createDefaultPendulum } from "@vivi2d/core/physics-engine";
import { normalizeWeights } from "@vivi2d/core/skin-utils";
import type {
  BindingTarget,
  BoneNode,
  LayerNode,
  MeshData,
  ParameterDefinition,
  PhysicsGroup,
  ProjectData,
  SkinData,
  SkinWeight,
} from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";
import {
  createSafeAutoSetupManagedSignature,
  type SafeAutoSetupPlan,
} from "./safe-auto-setup-plan";

export interface AutoSetupManagedMetadata {
  managedTag?: string;
  managedSignature?: string;
  managedSourceFingerprint?: string;
}

export interface AutoSetupMeshApplyInput extends AutoSetupManagedMetadata {
  layerId: string;
  mesh: MeshData;
}

export interface AutoSetupWeightApplyInput {
  layerId: string;
  weights: SkinWeight[][];
  boneIds: string[];
}

export interface AutoSetupSkinMetadataApplyInput extends AutoSetupManagedMetadata {
  layerId: string;
}

export interface AutoSetupPlanApplyOptions {
  createId?: () => string;
}

export interface AutoSetupPlanApplyResult {
  skippedManagedObjects: string[];
  appliedMeshOrWeightChanges: boolean;
}

interface ManagedAutoSetupObject {
  managedTag?: string;
  managedSignature?: string;
  managedSourceFingerprint?: string;
}

const defaultCreateId = () => crypto.randomUUID();

function findManagedNode(
  nodes: readonly LayerNode[],
  managedTag: string | undefined,
  predicate: (node: LayerNode) => boolean,
): LayerNode | null {
  if (!managedTag) return null;
  for (const node of nodes) {
    if (node.managedTag === managedTag && predicate(node)) return node;
    const child = findManagedNode(node.children, managedTag, predicate);
    if (child) return child;
  }
  return null;
}

function isManagedObjectUserModified(
  object: ManagedAutoSetupObject | null | undefined,
  expectedSignature: string | undefined,
  sourceFingerprint: string,
): boolean {
  return (
    !!object &&
    object.managedSourceFingerprint === sourceFingerprint &&
    !!expectedSignature &&
    object.managedSignature !== expectedSignature
  );
}

function hasManagedSourceMismatch(
  object: ManagedAutoSetupObject | null | undefined,
  sourceFingerprint: string,
): boolean {
  return !!object && object.managedSourceFingerprint !== sourceFingerprint;
}

function createBoneManagedSignature(bone: BoneNode): string {
  return createSafeAutoSetupManagedSignature({
    kind: "addBone",
    name: bone.name,
    x: bone.x,
    y: bone.y,
  });
}

function createParameterManagedSignature(
  parameter: ParameterDefinition,
): string {
  return createSafeAutoSetupManagedSignature({
    kind: "createParameter",
    id: parameter.id,
    name: parameter.name,
    minValue: parameter.minValue,
    maxValue: parameter.maxValue,
    defaultValue: parameter.defaultValue,
    group: parameter.group,
  });
}

function createPhysicsGroupManagedSignature(group: PhysicsGroup): string {
  return createSafeAutoSetupManagedSignature({
    kind: "createPhysicsGroup",
    name: group.name,
    gravity: group.gravityStrength,
    damping: group.pendulums[0]?.damping ?? PHYSICS_DEFAULTS.DAMPING,
  });
}

function createMeshManagedSignature(
  layer: Extract<LayerNode, { kind: "viviMesh" }>,
) {
  return createSafeAutoSetupManagedSignature({
    kind: "createMesh",
    layerId: layer.id,
    algorithm: "alphaBoundary",
    mesh: layer.mesh,
  });
}

function createSkinManagedSignature(layerId: string, skin: SkinData): string {
  return createSafeAutoSetupManagedSignature({
    kind: "createSkin",
    layerId,
    boneIds: Object.keys(skin.bindPoseInverse).sort(),
    weights: skin.weights,
  });
}

function createWeightResultManagedSignature(
  weightResult: AutoSetupWeightApplyInput,
): string {
  return createSafeAutoSetupManagedSignature({
    kind: "createSkin",
    layerId: weightResult.layerId,
    boneIds: [...weightResult.boneIds].sort(),
    weights: weightResult.weights,
  });
}

function addRootBone(
  project: ProjectData,
  name: string,
  x: number,
  y: number,
  metadata: AutoSetupManagedMetadata,
  createId: () => string,
): string {
  const boneId = createId();
  project.layers.push({
    id: boneId,
    name,
    visible: true,
    opacity: 1,
    x,
    y,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    managedTag: metadata.managedTag,
    managedSignature: metadata.managedSignature,
    managedSourceFingerprint: metadata.managedSourceFingerprint,
  });
  return boneId;
}

function reparentBone(
  project: ProjectData,
  boneId: string,
  newParentBoneId: string,
): void {
  if (boneId === newParentBoneId) return;
  const removed = removeFromTree(project.layers, boneId);
  if (!removed || removed.kind !== "bone") return;
  const newParent = findLayerById(project.layers, newParentBoneId);
  if (!newParent) {
    project.layers.push(removed);
    return;
  }
  removed.parentBoneId = isBone(newParent) ? newParent.id : undefined;
  newParent.children.push(removed);
}

export function applyAutoSetupMeshToLayer(
  project: ProjectData,
  input: AutoSetupMeshApplyInput,
): boolean {
  let applied = false;
  const walk = (nodes: ProjectData["layers"]): void => {
    for (const node of nodes) {
      if (node.kind === "viviMesh" && node.id === input.layerId) {
        node.mesh = input.mesh;
        node.managedTag = input.managedTag;
        node.managedSignature = input.managedSignature;
        node.managedSourceFingerprint = input.managedSourceFingerprint;
        applied = true;
        return;
      }
      if (node.children.length > 0) walk(node.children);
      if (applied) return;
    }
  };
  walk(project.layers);
  return applied;
}

export function remapAutoSetupWeightBoneIds(
  input: AutoSetupWeightApplyInput,
  tempToRealId: ReadonlyMap<string, string>,
): AutoSetupWeightApplyInput | null {
  const remappedBoneIds = input.boneIds
    .map((id) => tempToRealId.get(id))
    .filter((id): id is string => id != null);

  if (remappedBoneIds.length === 0) return null;

  const remappedWeights = input.weights.map((weights) =>
    normalizeWeights(
      weights
        .filter((weight) => tempToRealId.has(weight.boneId))
        .map((weight) => ({ ...weight, boneId: tempToRealId.get(weight.boneId)! })),
    ),
  );

  return {
    layerId: input.layerId,
    weights: remappedWeights,
    boneIds: remappedBoneIds,
  };
}

export function applyAutoSetupSkinMetadata(
  project: ProjectData,
  input: AutoSetupSkinMetadataApplyInput,
): boolean {
  const skin = project.skins[input.layerId] as SkinData | undefined;
  if (!skin) return false;
  skin.managedTag = input.managedTag;
  skin.managedSignature = input.managedSignature;
  skin.managedSourceFingerprint = input.managedSourceFingerprint;
  return true;
}

export function applyAutoSetupWeightsToSkin(
  project: ProjectData,
  weightResult: AutoSetupWeightApplyInput,
  metadata?: AutoSetupManagedMetadata,
): boolean {
  const mesh = findLayerById(project.layers, weightResult.layerId);
  if (!mesh || mesh.kind !== "viviMesh") return false;

  if (!project.skins) project.skins = {};
  const vertexCount = mesh.mesh.vertices.length / 2;
  const worldTransforms = computeBoneWorldTransforms(project.layers);
  const bindPoseInverse: Record<string, [number, number, number, number, number, number]> =
    {};
  for (const boneId of weightResult.boneIds) {
    const world = worldTransforms.get(boneId);
    if (world) bindPoseInverse[boneId] = invertAffine(world);
  }

  const equalWeight =
    weightResult.boneIds.length > 0 ? 1 / weightResult.boneIds.length : 0;
  const weights: SkinWeight[][] = Array.from({ length: vertexCount }, () =>
    weightResult.boneIds.map((boneId) => ({ boneId, weight: equalWeight })),
  );

  for (
    let vertexIndex = 0;
    vertexIndex < Math.min(vertexCount, weightResult.weights.length);
    vertexIndex += 1
  ) {
    const vertexWeights = weightResult.weights[vertexIndex]!;
    if (vertexWeights.length > 0) {
      weights[vertexIndex] = vertexWeights;
    }
  }

  project.skins[weightResult.layerId] = {
    weights,
    bindPoseInverse,
    managedTag: metadata?.managedTag,
    managedSignature: metadata?.managedSignature,
    managedSourceFingerprint: metadata?.managedSourceFingerprint,
  };
  return true;
}

export function applySafeAutoSetupPlanToProject(
  project: ProjectData,
  plan: SafeAutoSetupPlan,
  options: AutoSetupPlanApplyOptions = {},
): AutoSetupPlanApplyResult {
  const createId = options.createId ?? defaultCreateId;
  const tempToRealId = new Map<string, string>();
  const skippedManagedObjects: string[] = [];
  let appliedMeshOrWeightChanges = false;
  const recordManagedSkip = (
    reason: "userModified" | "sourceMismatch",
    tag?: string,
  ) => {
    skippedManagedObjects.push(`${reason}:${tag ?? "unknown"}`);
  };

  for (const operation of plan.operations) {
    switch (operation.kind) {
      case "addBone": {
        const existing = findManagedNode(
          project.layers,
          operation.managedTag,
          (node) => node.kind === "bone",
        ) as BoneNode | null;
        if (existing) {
          const liveSignature = createBoneManagedSignature(existing);
          const sourceMismatch = hasManagedSourceMismatch(
            existing,
            plan.sourceFingerprint,
          );
          const userModified = isManagedObjectUserModified(
            { ...existing, managedSignature: liveSignature },
            operation.managedSignature,
            plan.sourceFingerprint,
          );
          if (sourceMismatch || userModified) {
            recordManagedSkip(
              sourceMismatch ? "sourceMismatch" : "userModified",
              operation.managedTag,
            );
            if (userModified) tempToRealId.set(operation.tempId, existing.id);
            break;
          }
          tempToRealId.set(operation.tempId, existing.id);
          break;
        }
        const realId = addRootBone(
          project,
          operation.name,
          operation.x,
          operation.y,
          {
            managedTag: operation.managedTag,
            managedSignature: operation.managedSignature,
            managedSourceFingerprint: plan.sourceFingerprint,
          },
          createId,
        );
        tempToRealId.set(operation.tempId, realId);
        break;
      }
      case "parentBone": {
        const childRealId = tempToRealId.get(operation.childTempId);
        const parentRealId = tempToRealId.get(operation.parentTempId);
        if (childRealId && parentRealId) {
          reparentBone(project, childRealId, parentRealId);
        }
        break;
      }
      case "createParameter": {
        const existingManaged = operation.parameter.managedTag
          ? project.parameters.find(
              (parameter) =>
                parameter.managedTag === operation.parameter.managedTag,
            )
          : undefined;
        if (existingManaged) {
          const liveSignature = createParameterManagedSignature(existingManaged);
          const sourceMismatch = hasManagedSourceMismatch(
            existingManaged,
            plan.sourceFingerprint,
          );
          const userModified = isManagedObjectUserModified(
            { ...existingManaged, managedSignature: liveSignature },
            operation.parameter.managedSignature,
            plan.sourceFingerprint,
          );
          if (sourceMismatch || userModified) {
            recordManagedSkip(
              sourceMismatch ? "sourceMismatch" : "userModified",
              operation.parameter.managedTag,
            );
            break;
          }
          existingManaged.name = operation.parameter.name;
          existingManaged.minValue = operation.parameter.minValue;
          existingManaged.maxValue = operation.parameter.maxValue;
          existingManaged.defaultValue = operation.parameter.defaultValue;
          existingManaged.group = operation.parameter.group;
          existingManaged.managedSignature = operation.parameter.managedSignature;
          existingManaged.managedSourceFingerprint = plan.sourceFingerprint;
          break;
        }
        if (project.parameters.some((p) => p.name === operation.parameter.name)) {
          break;
        }
        project.parameters.push({
          id: operation.parameter.id ?? createId(),
          name: operation.parameter.name,
          minValue: operation.parameter.minValue,
          maxValue: operation.parameter.maxValue,
          defaultValue: operation.parameter.defaultValue,
          group: operation.parameter.group,
          managedTag: operation.parameter.managedTag,
          managedSignature: operation.parameter.managedSignature,
          managedSourceFingerprint: plan.sourceFingerprint,
        });
        break;
      }
      case "createPhysicsGroup": {
        const existingManaged = operation.group.managedTag
          ? project.physicsGroups.find(
              (group) => group.managedTag === operation.group.managedTag,
            )
          : undefined;
        if (existingManaged) {
          const liveSignature =
            createPhysicsGroupManagedSignature(existingManaged);
          const sourceMismatch = hasManagedSourceMismatch(
            existingManaged,
            plan.sourceFingerprint,
          );
          const userModified = isManagedObjectUserModified(
            { ...existingManaged, managedSignature: liveSignature },
            operation.group.managedSignature,
            plan.sourceFingerprint,
          );
          if (sourceMismatch || userModified) {
            recordManagedSkip(
              sourceMismatch ? "sourceMismatch" : "userModified",
              operation.group.managedTag,
            );
            break;
          }
          existingManaged.name = operation.group.name;
          if (existingManaged.pendulums[0]) {
            existingManaged.pendulums[0].damping = operation.group.damping;
          } else {
            existingManaged.pendulums = [
              { ...createDefaultPendulum(), damping: operation.group.damping },
            ];
          }
          existingManaged.gravityStrength = operation.group.gravity;
          existingManaged.managedSignature = operation.group.managedSignature;
          existingManaged.managedSourceFingerprint = plan.sourceFingerprint;
          break;
        }
        project.physicsGroups.push({
          id: createId(),
          name: operation.group.name,
          enabled: true,
          pendulums: [
            { ...createDefaultPendulum(), damping: operation.group.damping },
          ],
          inputs: [],
          outputs: [],
          gravityDirection: PHYSICS_DEFAULTS.GRAVITY_DIRECTION,
          gravityStrength: operation.group.gravity,
          wind: PHYSICS_DEFAULTS.WIND,
          managedTag: operation.group.managedTag,
          managedSignature: operation.group.managedSignature,
          managedSourceFingerprint: plan.sourceFingerprint,
        });
        break;
      }
      case "createMesh": {
        const existingManaged = operation.managedTag
          ? (findManagedNode(
              project.layers,
              operation.managedTag,
              (node) => node.kind === "viviMesh",
            ) as Extract<LayerNode, { kind: "viviMesh" }> | null)
          : null;
        if (existingManaged) {
          const liveSignature = createMeshManagedSignature(existingManaged);
          const sourceMismatch = hasManagedSourceMismatch(
            existingManaged,
            plan.sourceFingerprint,
          );
          const userModified = isManagedObjectUserModified(
            { ...existingManaged, managedSignature: liveSignature },
            operation.managedSignature,
            plan.sourceFingerprint,
          );
          if (sourceMismatch || userModified) {
            recordManagedSkip(
              sourceMismatch ? "sourceMismatch" : "userModified",
              operation.managedTag,
            );
            break;
          }
        }
        if (applyAutoSetupMeshToLayer(project, {
          ...operation,
          managedSignature: operation.managedSignature,
          managedSourceFingerprint: plan.sourceFingerprint,
        })) {
          appliedMeshOrWeightChanges = true;
        }
        break;
      }
      case "createSkin": {
        const remapped = remapAutoSetupWeightBoneIds(operation, tempToRealId);
        if (!remapped) break;
        const skin = project.skins[remapped.layerId];
        const expectedSignature = createWeightResultManagedSignature(remapped);
        if (skin?.managedTag && skin.managedTag === operation.managedTag) {
          const liveSignature = createSkinManagedSignature(remapped.layerId, skin);
          const sourceMismatch = hasManagedSourceMismatch(
            skin,
            plan.sourceFingerprint,
          );
          const userModified = isManagedObjectUserModified(
            { ...skin, managedSignature: liveSignature },
            expectedSignature,
            plan.sourceFingerprint,
          );
          if (sourceMismatch || userModified) {
            recordManagedSkip(
              sourceMismatch ? "sourceMismatch" : "userModified",
              operation.managedTag,
            );
            break;
          }
        }
        if (
          applyAutoSetupWeightsToSkin(project, remapped, {
            managedTag: operation.managedTag,
            managedSignature: expectedSignature,
            managedSourceFingerprint: plan.sourceFingerprint,
          })
        ) {
          appliedMeshOrWeightChanges = true;
        }
        break;
      }
      case "createBinding": {
        let target: BindingTarget;
        if (operation.target.type === "bone") {
          const boneId =
            operation.target.boneId ??
            tempToRealId.get(operation.target.tempBoneId ?? "");
          if (!boneId) break;
          target = {
            type: "bone",
            boneId,
            property: operation.target.property,
          };
        } else {
          target = operation.target;
        }
        const bindingPoints = operation.bindingPoints.map((point) => ({
          ...point,
        }));
        if (!project.parameters.some((p) => p.id === operation.parameterId)) {
          break;
        }
        const expectedSignature = createSafeAutoSetupManagedSignature({
          kind: operation.kind,
          parameterId: operation.parameterId,
          target,
          bindingPoints,
        });
        const existingManaged = operation.managedTag
          ? (project.parameterBindings ?? []).find(
              (binding) => binding.managedTag === operation.managedTag,
            )
          : undefined;
        if (existingManaged) {
          const liveSignature = createSafeAutoSetupManagedSignature({
            kind: operation.kind,
            parameterId: existingManaged.parameterId,
            target: existingManaged.target,
            bindingPoints: existingManaged.bindingPoints,
          });
          const sourceMismatch = hasManagedSourceMismatch(
            existingManaged,
            plan.sourceFingerprint,
          );
          const userModified = isManagedObjectUserModified(
            { ...existingManaged, managedSignature: liveSignature },
            expectedSignature,
            plan.sourceFingerprint,
          );
          if (sourceMismatch || userModified) {
            recordManagedSkip(
              sourceMismatch ? "sourceMismatch" : "userModified",
              operation.managedTag,
            );
            break;
          }
          existingManaged.parameterId = operation.parameterId;
          existingManaged.target = target;
          existingManaged.bindingPoints = bindingPoints;
          existingManaged.managedSignature = expectedSignature;
          existingManaged.managedSourceFingerprint = plan.sourceFingerprint;
          break;
        }
        if (!project.parameterBindings) project.parameterBindings = [];
        project.parameterBindings.push({
          id: createId(),
          parameterId: operation.parameterId,
          target,
          bindingPoints,
          managedTag: operation.managedTag,
          managedSignature: expectedSignature,
          managedSourceFingerprint: plan.sourceFingerprint,
        });
        break;
      }
    }
  }

  return { skippedManagedObjects, appliedMeshOrWeightChanges };
}
