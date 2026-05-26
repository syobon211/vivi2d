import { PHYSICS_DEFAULTS } from "@vivi2d/core/constants";
import { createDefaultPendulum } from "@vivi2d/core/physics-engine";
import type {
  LipSyncConfig,
  PendulumConfig,
  PhysicsGroup,
  PhysicsInput,
  PhysicsOutput,
  ProjectData,
  VisemeMapping,
} from "@vivi2d/core/types";

export type PhysicsGroupMetadata = Pick<
  PhysicsGroup,
  "managedTag" | "managedSignature" | "managedSourceFingerprint"
>;

const defaultCreateId = () => crypto.randomUUID();

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function getGroup(project: ProjectData, groupId: string): PhysicsGroup | undefined {
  return project.physicsGroups.find((group) => group.id === groupId);
}

function cloneInput(input: PhysicsInput): PhysicsInput {
  return {
    type: input.type,
    parameterId: input.parameterId,
    weight: finiteOr(input.weight, 1),
  };
}

function cloneOutput(output: PhysicsOutput): PhysicsOutput {
  const next: PhysicsOutput = {
    type: output.type,
    pendulumIndex: finiteOr(output.pendulumIndex, 0),
    weight: finiteOr(output.weight, 1),
  };
  if (output.parameterId !== undefined) next.parameterId = output.parameterId;
  if (output.boneId !== undefined) next.boneId = output.boneId;
  return next;
}

function cloneVisemeMappings(
  mappings: readonly VisemeMapping[] | undefined,
): VisemeMapping[] | undefined {
  return mappings?.map((mapping) => ({
    viseme: mapping.viseme,
    target: {
      ...mapping.target,
      parameterId: mapping.target.parameterId,
      value: finiteOr(mapping.target.value, 0),
    },
  }));
}

export function addPhysicsGroup(
  project: ProjectData,
  name: string,
  metadata?: PhysicsGroupMetadata,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  project.physicsGroups.push({
    id,
    name,
    enabled: true,
    pendulums: [createDefaultPendulum()],
    inputs: [],
    outputs: [],
    gravityDirection: PHYSICS_DEFAULTS.GRAVITY_DIRECTION,
    gravityStrength: PHYSICS_DEFAULTS.GRAVITY_STRENGTH,
    wind: PHYSICS_DEFAULTS.WIND,
    managedTag: metadata?.managedTag,
    managedSignature: metadata?.managedSignature,
    managedSourceFingerprint: metadata?.managedSourceFingerprint,
  });
  return id;
}

export function removePhysicsGroup(project: ProjectData, groupId: string): boolean {
  const beforeCount = project.physicsGroups.length;
  project.physicsGroups = project.physicsGroups.filter((group) => group.id !== groupId);
  return project.physicsGroups.length !== beforeCount;
}

export function updatePhysicsGroup(
  project: ProjectData,
  groupId: string,
  updates: Partial<
    Pick<
      PhysicsGroup,
      "name" | "enabled" | "gravityDirection" | "gravityStrength" | "wind"
    >
  >,
): boolean {
  const group = getGroup(project, groupId);
  if (!group) return false;
  if (updates.name !== undefined) group.name = updates.name;
  if (updates.enabled !== undefined) group.enabled = updates.enabled;
  if (updates.gravityDirection !== undefined) {
    group.gravityDirection = finiteOr(updates.gravityDirection, group.gravityDirection);
  }
  if (updates.gravityStrength !== undefined) {
    group.gravityStrength = finiteOr(updates.gravityStrength, group.gravityStrength);
  }
  if (updates.wind !== undefined) group.wind = finiteOr(updates.wind, group.wind);
  return true;
}

export function addPendulum(project: ProjectData, groupId: string): boolean {
  const group = getGroup(project, groupId);
  if (!group) return false;
  group.pendulums.push(createDefaultPendulum());
  return true;
}

export function removePendulum(
  project: ProjectData,
  groupId: string,
  index: number,
): boolean {
  const group = getGroup(project, groupId);
  if (!group || index < 0 || index >= group.pendulums.length) return false;
  group.pendulums.splice(index, 1);
  return true;
}

export function updatePendulum(
  project: ProjectData,
  groupId: string,
  index: number,
  updates: Partial<PendulumConfig>,
): boolean {
  const group = getGroup(project, groupId);
  const pendulum = group?.pendulums[index];
  if (!group || !pendulum || index < 0 || index >= group.pendulums.length) {
    return false;
  }
  if (updates.length !== undefined) {
    pendulum.length = finiteOr(updates.length, pendulum.length);
  }
  if (updates.mass !== undefined) pendulum.mass = finiteOr(updates.mass, pendulum.mass);
  if (updates.damping !== undefined) {
    pendulum.damping = finiteOr(updates.damping, pendulum.damping);
  }
  return true;
}

export function addPhysicsInput(
  project: ProjectData,
  groupId: string,
  input: PhysicsInput,
): boolean {
  const group = getGroup(project, groupId);
  if (!group) return false;
  group.inputs.push(cloneInput(input));
  return true;
}

export function removePhysicsInput(
  project: ProjectData,
  groupId: string,
  index: number,
): boolean {
  const group = getGroup(project, groupId);
  if (!group || index < 0 || index >= group.inputs.length) return false;
  group.inputs.splice(index, 1);
  return true;
}

export function addPhysicsOutput(
  project: ProjectData,
  groupId: string,
  output: PhysicsOutput,
): boolean {
  const group = getGroup(project, groupId);
  if (!group) return false;
  group.outputs.push(cloneOutput(output));
  return true;
}

export function removePhysicsOutput(
  project: ProjectData,
  groupId: string,
  index: number,
): boolean {
  const group = getGroup(project, groupId);
  if (!group || index < 0 || index >= group.outputs.length) return false;
  group.outputs.splice(index, 1);
  return true;
}

export function setLipSyncConfig(
  project: ProjectData,
  updates: Partial<LipSyncConfig>,
): boolean {
  const config = project.lipsyncConfig;
  if (updates.enabled !== undefined) config.enabled = updates.enabled;
  if (updates.mode !== undefined) config.mode = updates.mode;
  if (updates.targetParameterId !== undefined) {
    config.targetParameterId = updates.targetParameterId;
  }
  if (updates.source !== undefined) config.source = updates.source;
  if (updates.threshold !== undefined) {
    config.threshold = finiteOr(updates.threshold, config.threshold);
  }
  if (updates.smoothing !== undefined) {
    config.smoothing = finiteOr(updates.smoothing, config.smoothing);
  }
  if (updates.gain !== undefined) config.gain = finiteOr(updates.gain, config.gain);
  if ("visemeMappings" in updates) {
    config.visemeMappings = cloneVisemeMappings(updates.visemeMappings);
  }
  if (updates.visemeSmoothing !== undefined) {
    config.visemeSmoothing = finiteOr(
      updates.visemeSmoothing,
      config.visemeSmoothing ?? config.smoothing,
    );
  }
  return true;
}
