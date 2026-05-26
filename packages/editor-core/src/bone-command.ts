import { findLayerById, removeFromTree } from "@vivi2d/core/layer-utils";
import type { BoneNode, LayerNode, ProjectData } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";
import { removeManagedAccessoryFollowSkinsForBone } from "./accessory-follow-rig";

export type BoneMetadata = Pick<
  BoneNode,
  "managedTag" | "managedSignature" | "managedSourceFingerprint"
>;

const defaultCreateId = () => crypto.randomUUID();

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function createBoneNode(
  id: string,
  name: string,
  x: number,
  y: number,
  parentBoneId?: string,
  metadata?: BoneMetadata,
): BoneNode {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    x: finiteOr(x, 0),
    y: finiteOr(y, 0),
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    parentBoneId,
    managedTag: metadata?.managedTag,
    managedSignature: metadata?.managedSignature,
    managedSourceFingerprint: metadata?.managedSourceFingerprint,
  };
}

function findBone(project: ProjectData, boneId: string): BoneNode | null {
  const node = findLayerById(project.layers, boneId);
  return node && isBone(node) ? node : null;
}

function hasDescendant(node: LayerNode, descendantId: string): boolean {
  return findLayerById(node.children, descendantId) !== null;
}

interface RemovalContext {
  node: LayerNode;
  siblings: LayerNode[];
  index: number;
  parent: LayerNode | null;
}

function removeFromTreeWithContext(
  layers: LayerNode[],
  id: string,
  parent: LayerNode | null = null,
): RemovalContext | null {
  for (let index = 0; index < layers.length; index++) {
    const node = layers[index]!;
    if (node.id === id) {
      layers.splice(index, 1);
      return { node, siblings: layers, index, parent };
    }
    const found = removeFromTreeWithContext(node.children, id, node);
    if (found) return found;
  }
  return null;
}

function updateParentReferenceForPromotedChildren(
  children: LayerNode[],
  parent: LayerNode | null,
): void {
  const parentBoneId = parent && isBone(parent) ? parent.id : undefined;
  for (const child of children) {
    if (isBone(child)) child.parentBoneId = parentBoneId;
  }
}

export function addBone(
  project: ProjectData,
  parentId: string,
  name: string,
  x: number,
  y: number,
  createId: () => string = defaultCreateId,
): string {
  const parent = findLayerById(project.layers, parentId);
  if (!parent) return "";
  const id = createId();
  parent.children.push(
    createBoneNode(id, name, x, y, isBone(parent) ? parent.id : undefined),
  );
  return id;
}

export function addRootBone(
  project: ProjectData,
  name: string,
  x: number,
  y: number,
  metadata?: BoneMetadata,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  project.layers.push(createBoneNode(id, name, x, y, undefined, metadata));
  return id;
}

export function setBonePosition(
  project: ProjectData,
  boneId: string,
  x: number,
  y: number,
): boolean {
  const bone = findBone(project, boneId);
  if (!bone) return false;
  bone.x = finiteOr(x, bone.x);
  bone.y = finiteOr(y, bone.y);
  return true;
}

export function setBoneAngle(
  project: ProjectData,
  boneId: string,
  angle: number,
): boolean {
  const bone = findBone(project, boneId);
  if (!bone) return false;
  bone.bone.angle = finiteOr(angle, bone.bone.angle);
  return true;
}

export function setBoneScale(
  project: ProjectData,
  boneId: string,
  scaleX: number,
  scaleY: number,
): boolean {
  const bone = findBone(project, boneId);
  if (!bone) return false;
  bone.bone.scaleX = finiteOr(scaleX, bone.bone.scaleX);
  bone.bone.scaleY = finiteOr(scaleY, bone.bone.scaleY);
  return true;
}

export function setBoneLength(
  project: ProjectData,
  boneId: string,
  length: number,
): boolean {
  const bone = findBone(project, boneId);
  if (!bone) return false;
  bone.bone.length = Math.max(0, finiteOr(length, bone.bone.length));
  return true;
}

export function reparentBone(
  project: ProjectData,
  boneId: string,
  newParentBoneId: string | null,
): boolean {
  if (boneId === newParentBoneId) return false;
  const bone = findBone(project, boneId);
  if (!bone) return false;
  const newParent = newParentBoneId
    ? findLayerById(project.layers, newParentBoneId)
    : null;
  if (newParentBoneId && !newParent) return false;
  if (newParent && hasDescendant(bone, newParent.id)) return false;

  const removed = removeFromTree(project.layers, boneId);
  if (!removed || !isBone(removed)) return false;
  if (newParent) {
    removed.parentBoneId = isBone(newParent) ? newParent.id : undefined;
    newParent.children.push(removed);
  } else {
    removed.parentBoneId = undefined;
    project.layers.push(removed);
  }
  return true;
}

export function removeBone(project: ProjectData, boneId: string): boolean {
  const node = findBone(project, boneId);
  if (!node) return false;
  const removal = removeFromTreeWithContext(project.layers, boneId);
  if (!removal || !isBone(removal.node)) return false;
  removeManagedAccessoryFollowSkinsForBone(project, removal.node.id);
  updateParentReferenceForPromotedChildren(removal.node.children, removal.parent);
  removal.siblings.splice(removal.index, 0, ...removal.node.children);
  return true;
}
