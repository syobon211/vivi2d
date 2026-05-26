import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { BoneNode, ProjectData } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";

function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase();
}

function isLeafBone(allBones: readonly BoneNode[], boneId: string): boolean {
  return !allBones.some((bone) => bone.parentBoneId === boneId);
}

function scoreBoneName(name: string): number {
  const normalized = normalizeName(name);
  if (
    normalized.includes("hair") ||
    normalized.includes("髪") ||
    normalized.includes("tail") ||
    normalized.includes("尻尾") ||
    normalized.includes("ear") ||
    normalized.includes("耳")
  ) {
    return 2;
  }
  if (
    normalized.includes("front") ||
    normalized.includes("back") ||
    normalized.includes("side")
  ) {
    return 1;
  }
  return 0;
}

export function findSecondaryPhysicsTipBoneId(project: ProjectData): string | null {
  const bones = flattenLayers(project.layers).filter((layer): layer is BoneNode =>
    isBone(layer),
  );
  const leafBones = bones.filter((bone) => isLeafBone(bones, bone.id));
  if (leafBones.length === 0) return null;

  const scoredLeafBones = leafBones
    .map((bone) => ({ bone, score: scoreBoneName(bone.name) }))
    .sort((a, b) => b.score - a.score || a.bone.name.localeCompare(b.bone.name));

  if (scoredLeafBones[0]?.score && scoredLeafBones[0].score > 0) {
    return scoredLeafBones[0].bone.id;
  }
  if (leafBones.length === 1) {
    return leafBones[0]?.id ?? null;
  }
  return null;
}
