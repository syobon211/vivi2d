import {
  type Affine2D,
  computeBoneWorldTransforms,
  invertAffine,
} from "@vivi2d/core/bone-utils";
import { findLayerById } from "@vivi2d/core/layer-utils";
import type { ProjectData, SkinData, ViviMeshNode } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";

export type AccessoryFollowRigRejectReason =
  | "meshNotFound"
  | "meshHasNoVertices"
  | "boneNotFound"
  | "unmanagedSkinExists"
  | "skinOwnedByOtherSystem";

export interface AccessoryFollowRigApplyResult {
  status: "created" | "updated" | "replaced" | "rejected";
  reason?: AccessoryFollowRigRejectReason;
  managedTag?: string;
  managedSignature?: string;
}

export const ACCESSORY_FOLLOW_TAG_PREFIX = "accessoryFollowRig:v1:mesh=";

function createManagedTag(meshId: string): string {
  return `${ACCESSORY_FOLLOW_TAG_PREFIX}${meshId}`;
}

function createManagedSignature(
  meshId: string,
  boneId: string,
  vertexCount: number,
): string {
  return `${meshId}|${boneId}|${vertexCount}`;
}

function buildRigidSkin(
  project: ProjectData,
  mesh: ViviMeshNode,
  boneId: string,
  managedTag: string,
  managedSignature: string,
): SkinData {
  const vertexCount = mesh.mesh.vertices.length / 2;
  const weights = Array.from({ length: vertexCount }, () => [{ boneId, weight: 1 }]);
  const world =
    computeBoneWorldTransforms(project.layers).get(boneId) ??
    ([1, 0, 0, 1, 0, 0] as Affine2D);
  return {
    managedTag,
    managedSignature,
    weights,
    bindPoseInverse: {
      [boneId]: invertAffine(world),
    },
  };
}

function isManagedAccessoryFollowSkin(skin: SkinData | undefined): skin is SkinData {
  return Boolean(skin?.managedTag?.startsWith(ACCESSORY_FOLLOW_TAG_PREFIX));
}

function skinReferencesBone(skin: SkinData, boneId: string): boolean {
  if (boneId in skin.bindPoseInverse) return true;
  return skin.weights.some((vertexWeights) =>
    vertexWeights.some((weight) => weight.boneId === boneId),
  );
}

export function applyAccessoryFollowRig(
  project: ProjectData,
  meshId: string,
  boneId: string,
): AccessoryFollowRigApplyResult {
  const mesh = findLayerById(project.layers, meshId);
  if (!mesh || mesh.kind !== "viviMesh") {
    return { status: "rejected", reason: "meshNotFound" };
  }

  if (mesh.mesh.vertices.length === 0) {
    return { status: "rejected", reason: "meshHasNoVertices" };
  }

  const bone = findLayerById(project.layers, boneId);
  if (!bone || !isBone(bone)) {
    return { status: "rejected", reason: "boneNotFound" };
  }

  if (!project.skins) {
    project.skins = {};
  }

  const managedTag = createManagedTag(meshId);
  const managedSignature = createManagedSignature(
    meshId,
    boneId,
    mesh.mesh.vertices.length / 2,
  );
  const existingSkin = project.skins[meshId];

  if (!existingSkin) {
    project.skins[meshId] = buildRigidSkin(
      project,
      mesh,
      boneId,
      managedTag,
      managedSignature,
    );
    return { status: "created", managedTag, managedSignature };
  }

  if (!existingSkin.managedTag) {
    return {
      status: "rejected",
      reason: "unmanagedSkinExists",
      managedTag,
      managedSignature,
    };
  }

  if (existingSkin.managedTag !== managedTag) {
    return {
      status: "rejected",
      reason: "skinOwnedByOtherSystem",
      managedTag,
      managedSignature,
    };
  }

  project.skins[meshId] = buildRigidSkin(
    project,
    mesh,
    boneId,
    managedTag,
    managedSignature,
  );
  if (existingSkin.managedSignature === managedSignature) {
    return { status: "updated", managedTag, managedSignature };
  }

  return { status: "replaced", managedTag, managedSignature };
}

export function removeManagedAccessoryFollowSkinsForBone(
  project: ProjectData,
  boneId: string,
): string[] {
  if (!project.skins) return [];
  const removedMeshIds: string[] = [];
  for (const [meshId, skin] of Object.entries(project.skins)) {
    if (!isManagedAccessoryFollowSkin(skin)) continue;
    if (!skinReferencesBone(skin, boneId)) continue;
    delete project.skins[meshId];
    removedMeshIds.push(meshId);
  }
  return removedMeshIds;
}
