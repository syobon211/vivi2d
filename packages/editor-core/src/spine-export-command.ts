import { DRAW_ORDER, SPINE_EXPORT } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  AnimationClip,
  BoneNode,
  LayerNode,
  TimelineKeyframe,
  ViviMeshNode,
} from "@vivi2d/core/types";
import { isBone, isViviMesh, type ProjectData } from "@vivi2d/core/types";

export interface SpineJson {
  skeleton: SpineSkeleton;
  bones: SpineBone[];
  slots: SpineSlot[];
  skins: SpineSkin[];
  animations: Record<string, SpineAnimation>;
}

export interface SpineSkeleton {
  hash: string;
  spine: string;
  x: number;
  y: number;
  width: number;
  height: number;
  images: string;
  audio: string;
}

export interface SpineBone {
  name: string;
  parent?: string;
  length?: number;
  rotation?: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface SpineSlot {
  name: string;
  bone: string;
  attachment?: string;
}

export interface SpineSkin {
  name: string;
  attachments: Record<string, Record<string, SpineAttachment>>;
}

export interface SpineAttachment {
  type: "mesh";
  uvs: number[];
  triangles: number[];
  vertices: number[];
  hull: number;
  width: number;
  height: number;
}

export interface SpineAnimation {
  bones?: Record<string, SpineBoneTimeline>;
}

export interface SpineBoneTimeline {
  rotate?: SpineBoneKeyframe[];
  scale?: SpineBoneKeyframe[];
}

export interface SpineBoneKeyframe {
  time: number;
  value?: number;
  angle?: number;
  x?: number;
  y?: number;
  curve?: "stepped" | number[];
}

export function exportSpineJson(
  project: ProjectData,
  clips: AnimationClip[],
  layerFilter?: ReadonlySet<string>,
): { json: SpineJson; warnings: string[] } {
  const warnings: string[] = [];

  const allNodes = flattenLayers(project.layers);
  const allBoneNodes = allNodes.filter(isBone);
  const allViviMeshNodes = allNodes.filter(isViviMesh);

  const viviMeshNodes = layerFilter
    ? allViviMeshNodes.filter((node) => layerFilter.has(node.id))
    : allViviMeshNodes;

  const boneNodes = layerFilter
    ? filterRelevantBones(allBoneNodes, viviMeshNodes, project.layers)
    : allBoneNodes;

  const json: SpineJson = {
    skeleton: {
      hash: generateHash(project.name),
      spine: SPINE_EXPORT.VERSION,
      x: 0,
      y: 0,
      width: project.width,
      height: project.height,
      images: SPINE_EXPORT.IMAGE_PATH,
      audio: SPINE_EXPORT.AUDIO_PATH,
    },
    bones: buildBoneHierarchy(project.layers, boneNodes),
    slots: buildSlots(viviMeshNodes, project.layers),
    skins: buildSkins(viviMeshNodes),
    animations: buildAnimations(clips, boneNodes, warnings),
  };

  return { json, warnings };
}

function buildAnimations(
  clips: AnimationClip[],
  boneNodes: BoneNode[],
  warnings: string[],
): Record<string, SpineAnimation> {
  const animations: Record<string, SpineAnimation> = {};
  const boneNameMap = new Map(boneNodes.map((bone) => [bone.id, bone.name]));

  for (const clip of clips) {
    const animation: SpineAnimation = {};
    if (clip.boneTracks && clip.boneTracks.length > 0) {
      const boneTimelines: Record<string, SpineBoneTimeline> = {};
      for (const track of clip.boneTracks) {
        const boneName = boneNameMap.get(track.boneId);
        if (!boneName) {
          warnings.push(
            `Bone id "${track.boneId}" was not found for clip "${clip.name}".`,
          );
          continue;
        }
        boneTimelines[boneName] ??= {};
        if (track.property === "angle") {
          boneTimelines[boneName].rotate = convertRotateKeyframes(
            track.keyframes,
            clip.fps,
          );
        } else {
          boneTimelines[boneName].scale = mergeScaleKeyframes(
            boneTimelines[boneName].scale,
            track.keyframes,
            clip.fps,
            track.property === "scaleX" ? "x" : "y",
            warnings,
            clip.name,
            boneName,
          );
        }
      }
      if (Object.keys(boneTimelines).length > 0) {
        animation.bones = boneTimelines;
      }
    }
    animations[clip.name] = animation;
  }

  return animations;
}

function convertRotateKeyframes(
  keyframes: readonly TimelineKeyframe[],
  fps: number,
): SpineBoneKeyframe[] {
  return keyframes.map((keyframe) => {
    const entry: SpineBoneKeyframe = { time: keyframe.frame / fps };
    entry.angle = radToDeg(keyframe.value);
    const curve = convertCurve(keyframe);
    if (curve !== undefined) entry.curve = curve;
    return entry;
  });
}

function mergeScaleKeyframes(
  current: readonly SpineBoneKeyframe[] | undefined,
  keyframes: readonly TimelineKeyframe[],
  fps: number,
  axis: "x" | "y",
  warnings: string[],
  clipName: string,
  boneName: string,
): SpineBoneKeyframe[] {
  const byTime = new Map<number, SpineBoneKeyframe>();
  for (const keyframe of current ?? []) {
    byTime.set(keyframe.time, { ...keyframe });
  }
  for (const keyframe of keyframes) {
    const time = keyframe.frame / fps;
    const entry = byTime.get(time) ?? { time };
    entry[axis] = keyframe.value;
    const curve = convertCurve(keyframe);
    if (curve !== undefined && entry.curve === undefined) {
      entry.curve = curve;
    } else if (
      curve !== undefined &&
      entry.curve !== undefined &&
      !curvesEqual(entry.curve, curve)
    ) {
      warnings.push(
        `Scale curve conflict at frame ${keyframe.frame} for bone "${boneName}" in clip "${clipName}". Keeping the first curve.`,
      );
    }
    byTime.set(time, entry);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function curvesEqual(
  a: SpineBoneKeyframe["curve"],
  b: SpineBoneKeyframe["curve"],
): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function convertCurve(
  keyframe: TimelineKeyframe,
): SpineBoneKeyframe["curve"] | undefined {
  if (keyframe.interpolation === "step") return "stepped";
  if (keyframe.interpolation !== "bezier") return undefined;
  return [
    keyframe.cp1x ?? 0.25,
    keyframe.cp1y ?? 0,
    keyframe.cp2x ?? 0.75,
    keyframe.cp2y ?? 1,
  ];
}

function buildBoneHierarchy(layers: LayerNode[], boneNodes: BoneNode[]): SpineBone[] {
  const bones: SpineBone[] = [{ name: SPINE_EXPORT.ROOT_BONE }];
  const parentMap = new Map<string, string>();
  buildParentBoneMap(layers, null, parentMap);

  for (const node of boneNodes) {
    const parentId = parentMap.get(node.id);
    const parentBone = parentId ? boneNodes.find((bone) => bone.id === parentId) : null;

    const bone: SpineBone = {
      name: node.name,
      parent: parentBone ? parentBone.name : SPINE_EXPORT.ROOT_BONE,
      x: node.x,
      y: node.y,
      rotation: radToDeg(node.bone.angle),
      length: node.bone.length,
    };

    if (node.bone.scaleX !== 1) bone.scaleX = node.bone.scaleX;
    if (node.bone.scaleY !== 1) bone.scaleY = node.bone.scaleY;
    bones.push(bone);
  }

  return bones;
}

function buildParentBoneMap(
  layers: LayerNode[],
  parentBoneId: string | null,
  map: Map<string, string>,
): void {
  for (const layer of layers) {
    const currentBoneId = isBone(layer) ? layer.id : parentBoneId;
    if (isBone(layer) && parentBoneId) {
      map.set(layer.id, parentBoneId);
    }
    buildParentBoneMap(layer.children, currentBoneId, map);
  }
}

function filterRelevantBones(
  allBones: BoneNode[],
  selectedMeshes: ViviMeshNode[],
  layers: LayerNode[],
): BoneNode[] {
  if (selectedMeshes.length === 0) return [];

  const childToParent = new Map<string, string>();
  buildChildParentMap(layers, null, childToParent);

  const relevantBoneIds = new Set<string>();
  const boneIdSet = new Set(allBones.map((bone) => bone.id));

  for (const mesh of selectedMeshes) {
    let parentId = childToParent.get(mesh.id);
    while (parentId) {
      if (boneIdSet.has(parentId)) {
        relevantBoneIds.add(parentId);
      }
      parentId = childToParent.get(parentId);
    }
  }

  let added = true;
  while (added) {
    added = false;
    for (const boneId of relevantBoneIds) {
      const parentId = childToParent.get(boneId);
      if (parentId && boneIdSet.has(parentId) && !relevantBoneIds.has(parentId)) {
        relevantBoneIds.add(parentId);
        added = true;
      }
    }
  }

  return allBones.filter((bone) => relevantBoneIds.has(bone.id));
}

function buildChildParentMap(
  layers: LayerNode[],
  parentId: string | null,
  map: Map<string, string>,
): void {
  for (const layer of layers) {
    if (parentId) {
      map.set(layer.id, parentId);
    }
    buildChildParentMap(layer.children, layer.id, map);
  }
}

function buildSlots(viviMeshNodes: ViviMeshNode[], layers: LayerNode[]): SpineSlot[] {
  const parentBoneMap = new Map<string, string>();
  findParentBones(layers, null, parentBoneMap);

  const sorted = [...viviMeshNodes].sort(
    (a, b) => (a.drawOrder ?? DRAW_ORDER.DEFAULT) - (b.drawOrder ?? DRAW_ORDER.DEFAULT),
  );

  return sorted.map((node) => ({
    name: node.name,
    bone: parentBoneMap.get(node.id) ?? SPINE_EXPORT.ROOT_BONE,
    attachment: node.name,
  }));
}

function findParentBones(
  layers: LayerNode[],
  parentBoneName: string | null,
  map: Map<string, string>,
): void {
  for (const layer of layers) {
    const currentBoneName = isBone(layer) ? layer.name : parentBoneName;
    if (isViviMesh(layer) && currentBoneName) {
      map.set(layer.id, currentBoneName);
    }
    findParentBones(layer.children, currentBoneName, map);
  }
}

function buildSkins(viviMeshNodes: ViviMeshNode[]): SpineSkin[] {
  const attachments: Record<string, Record<string, SpineAttachment>> = {};

  for (const node of viviMeshNodes) {
    const attachment: SpineAttachment = {
      type: "mesh",
      uvs: [...node.mesh.uvs],
      triangles: [...node.mesh.indices],
      vertices: [...node.mesh.vertices],
      hull: Math.floor(node.mesh.vertices.length / 2),
      width: node.width,
      height: node.height,
    };

    attachments[node.name] = { [node.name]: attachment };
  }

  return [{ name: "default", attachments }];
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function generateHash(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
