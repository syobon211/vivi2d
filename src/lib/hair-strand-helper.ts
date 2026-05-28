import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { BoneNode, PhysicsGroup, ProjectData } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";

export const HAIR_STRAND_PRESET_IDS = ["front", "back", "side", "generic"] as const;

export type HairStrandHelperPresetId = (typeof HAIR_STRAND_PRESET_IDS)[number];

export type HairStrandHelperRejectReason =
  | "boneNotFound"
  | "nonLeafBone"
  | "brokenParentChain"
  | "cycleDetected"
  | "chainTooShort"
  | "duplicateManagedGroup"
  | "overlappingManagedGroup";

export interface HairStrandHelperApplyResult {
  status: "created" | "updated" | "rebuilt" | "rejected";
  reason?: HairStrandHelperRejectReason;
  groupId?: string;
  managedTag?: string;
  chainBoneIds?: string[];
}

interface HairStrandPresetConfig {
  lengthScale: number;
  damping: number;
  gravityStrength: number;
}

const PRESET_CONFIGS: Record<HairStrandHelperPresetId, HairStrandPresetConfig> = {
  front: { lengthScale: 0.8, damping: 0.12, gravityStrength: 7.5 },
  back: { lengthScale: 1.15, damping: 0.06, gravityStrength: 11 },
  side: { lengthScale: 1.0, damping: 0.09, gravityStrength: 9 },
  generic: { lengthScale: 1.0, damping: 0.08, gravityStrength: 9.8 },
};

const MANAGED_TAG_PREFIX = "hairStrandHelper:v1:tip=";

function createManagedTag(tipBoneId: string): string {
  return `${MANAGED_TAG_PREFIX}${tipBoneId}`;
}

function createManagedSignature(chainBoneIds: string[]): string {
  return chainBoneIds.join(">");
}

function createDefaultGroupName(chain: BoneNode[]): string {
  const root = chain[0]?.name ?? "Root";
  const tip = chain.at(-1)?.name ?? "Tip";
  return `Hair Strand ${root} -> ${tip}`;
}

function buildPendulumLength(bone: BoneNode, preset: HairStrandHelperPresetId): number {
  const baseLength = Math.max(0.1, bone.bone.length / 50);
  const scaled = baseLength * PRESET_CONFIGS[preset].lengthScale;
  return Math.max(0.1, Math.min(8, Number(scaled.toFixed(3))));
}

function buildManagedPendulums(chain: BoneNode[], preset: HairStrandHelperPresetId) {
  const config = PRESET_CONFIGS[preset];
  return chain.map((bone) => ({
    length: buildPendulumLength(bone, preset),
    mass: 1,
    damping: config.damping,
  }));
}

function buildManagedOutputs(chain: BoneNode[]) {
  return chain.map((bone, index) => ({
    type: "boneAngle" as const,
    boneId: bone.id,
    pendulumIndex: index,
    weight: 1,
  }));
}

function getManagedBoneOutputIds(group: PhysicsGroup): string[] {
  return group.outputs
    .filter((output) => output.type === "boneAngle" && Boolean(output.boneId))
    .map((output) => output.boneId as string);
}

function mergeManagedOutputs(group: PhysicsGroup, chain: BoneNode[]): void {
  const preservedOutputs = group.outputs.filter((output) => output.type !== "boneAngle");
  group.outputs = [...preservedOutputs, ...buildManagedOutputs(chain)];
}

function collectBones(project: ProjectData): BoneNode[] {
  return flattenLayers(project.layers).filter(isBone);
}

function reconstructChain(
  allBones: BoneNode[],
  tipBoneId: string,
): { ok: true; chain: BoneNode[] } | { ok: false; reason: HairStrandHelperRejectReason } {
  const boneMap = new Map(allBones.map((bone) => [bone.id, bone] as const));
  const tipBone = boneMap.get(tipBoneId);
  if (!tipBone) {
    return { ok: false, reason: "boneNotFound" };
  }

  if (allBones.some((bone) => bone.parentBoneId === tipBone.id)) {
    return { ok: false, reason: "nonLeafBone" };
  }

  const reversedChain: BoneNode[] = [];
  const visited = new Set<string>();
  let current: BoneNode | undefined = tipBone;

  while (current) {
    if (visited.has(current.id)) {
      return { ok: false, reason: "cycleDetected" };
    }
    visited.add(current.id);
    reversedChain.push(current);
    if (!current.parentBoneId) break;
    current = boneMap.get(current.parentBoneId);
    if (!current) {
      return { ok: false, reason: "brokenParentChain" };
    }
  }

  if (reversedChain.length < 2) {
    return { ok: false, reason: "chainTooShort" };
  }

  return { ok: true, chain: reversedChain.reverse() };
}

function updateManagedPhysicsParameters(
  group: PhysicsGroup,
  chain: BoneNode[],
  preset: HairStrandHelperPresetId,
): void {
  const config = PRESET_CONFIGS[preset];
  const nextPendulums = buildManagedPendulums(chain, preset);
  for (let index = 0; index < nextPendulums.length; index += 1) {
    const currentPendulum = group.pendulums[index];
    const nextPendulum = nextPendulums[index];
    if (!currentPendulum || !nextPendulum) continue;
    currentPendulum.length = nextPendulum.length;
    currentPendulum.mass = nextPendulum.mass;
    currentPendulum.damping = nextPendulum.damping;
  }
  group.gravityStrength = config.gravityStrength;
}

function rebuildManagedGroup(
  group: PhysicsGroup,
  chain: BoneNode[],
  preset: HairStrandHelperPresetId,
  managedTag: string,
  managedSignature: string,
): void {
  const config = PRESET_CONFIGS[preset];
  group.managedTag = managedTag;
  group.managedSignature = managedSignature;
  group.pendulums = buildManagedPendulums(chain, preset);
  mergeManagedOutputs(group, chain);
  group.gravityStrength = config.gravityStrength;
}

export function applyHairStrandHelper(
  project: ProjectData,
  tipBoneId: string,
  preset: HairStrandHelperPresetId,
): HairStrandHelperApplyResult {
  const allBones = collectBones(project);
  const chainResult = reconstructChain(allBones, tipBoneId);
  if (!chainResult.ok) {
    return { status: "rejected", reason: chainResult.reason };
  }

  const chain = chainResult.chain;
  const chainBoneIds = chain.map((bone) => bone.id);
  const managedTag = createManagedTag(tipBoneId);
  const managedSignature = createManagedSignature(chainBoneIds);

  const managedGroups = project.physicsGroups.filter(
    (group) => group.managedTag === managedTag,
  );
  if (managedGroups.length > 1) {
    return {
      status: "rejected",
      reason: "duplicateManagedGroup",
      managedTag,
      chainBoneIds,
    };
  }

  const existingGroup = managedGroups[0];
  const overlappingManagedGroup = project.physicsGroups.find(
    (group) =>
      group !== existingGroup &&
      group.managedTag?.startsWith(MANAGED_TAG_PREFIX) &&
      getManagedBoneOutputIds(group).some((boneId) => chainBoneIds.includes(boneId)),
  );
  if (overlappingManagedGroup) {
    return {
      status: "rejected",
      reason: "overlappingManagedGroup",
      managedTag,
      chainBoneIds,
    };
  }

  if (!existingGroup) {
    const config = PRESET_CONFIGS[preset];
    const groupId = crypto.randomUUID();
    project.physicsGroups.push({
      id: groupId,
      name: createDefaultGroupName(chain),
      enabled: true,
      managedTag,
      managedSignature,
      pendulums: buildManagedPendulums(chain, preset),
      inputs: [],
      outputs: buildManagedOutputs(chain),
      gravityDirection: 0,
      gravityStrength: config.gravityStrength,
      wind: 0,
    });
    return { status: "created", groupId, managedTag, chainBoneIds };
  }

  const sameTopology =
    existingGroup.managedSignature === managedSignature &&
    existingGroup.pendulums.length === chain.length;

  if (sameTopology) {
    updateManagedPhysicsParameters(existingGroup, chain, preset);
    mergeManagedOutputs(existingGroup, chain);
    return {
      status: "updated",
      groupId: existingGroup.id,
      managedTag,
      chainBoneIds,
    };
  }

  rebuildManagedGroup(existingGroup, chain, preset, managedTag, managedSignature);
  return {
    status: "rebuilt",
    groupId: existingGroup.id,
    managedTag,
    chainBoneIds,
  };
}
