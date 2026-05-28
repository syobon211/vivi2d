import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  AnimationClip,
  BlendTree1D,
  BonePropertyType,
  ProjectData,
} from "@vivi2d/core/types";
import { isBone, isViviMesh } from "@vivi2d/core/types";

const DEFAULT_SCENE_BLEND_TRANSITION_FRAMES = 30;

interface ProjectReferenceSets {
  parameterIds: Set<string>;
  boneIds: Set<string>;
  viviMeshIds: Set<string>;
  sceneIds: Set<string>;
  clipIds: Set<string>;
  ikControllerIds: Set<string>;
}

export interface ParameterBindingCleanupPlan {
  bindingIds: string[];
  removedMissingParameterCount: number;
  removedMissingTargetCount: number;
  removedEmptyBindingCount: number;
}

interface BlendTreeReplacement {
  machineId: string;
  stateId: string;
  blendTree: BlendTree1D | null;
  removedEntryCount: number;
}

export interface StateMachineCleanupPlan {
  initialStateFixes: Array<{ machineId: string; nextStateId: string }>;
  clearedStateClipRefs: Array<{ machineId: string; stateId: string }>;
  blendTreeReplacements: BlendTreeReplacement[];
  removedTransitions: Array<{ machineId: string; transitionId: string }>;
  removedConditions: Array<{
    machineId: string;
    transitionId: string;
    indices: number[];
  }>;
  clearedBlendTreeCount: number;
  prunedBlendTreeEntryCount: number;
}

export interface SceneBlendCleanupPlan {
  removedBlendIds: string[];
  normalizedDurationBlendIds: string[];
}

interface TrackCleanupTarget {
  clipId: string;
  parameterIds: string[];
  boneTrackKeys: Array<{ boneId: string; property: BonePropertyType }>;
  imageSequenceTargetIds: string[];
  ikControllerIds: string[];
  lipSyncTrackIds: string[];
  lipSyncParameterTrackIds: string[];
}

export interface AnimationTrackCleanupPlan {
  clipTargets: TrackCleanupTarget[];
  removedParameterTrackCount: number;
  removedBoneTrackCount: number;
  removedImageSequenceTrackCount: number;
  removedIkControllerTrackCount: number;
  removedLipSyncTrackCount: number;
  clearedLipSyncParameterTargetCount: number;
}

function collectProjectReferenceSets(project: ProjectData): ProjectReferenceSets {
  const layers = flattenLayers(project.layers);
  const parameterIds = new Set(
    (project.parameters ?? []).map((parameter) => parameter.id),
  );
  const boneIds = new Set(layers.filter(isBone).map((layer) => layer.id));
  const viviMeshIds = new Set(layers.filter(isViviMesh).map((layer) => layer.id));
  const sceneIds = new Set((project.scenes ?? []).map((scene) => scene.id));
  const clipIds = new Set([
    ...(project.clips ?? []).map((clip) => clip.id),
    ...(project.scenes ?? []).flatMap((scene) => scene.clips.map((clip) => clip.id)),
  ]);
  const ikControllerIds = new Set(
    (project.ikControllers ?? []).map((controller) => controller.id),
  );
  return { parameterIds, boneIds, viviMeshIds, sceneIds, clipIds, ikControllerIds };
}

function iterateAllClips(project: ProjectData): AnimationClip[] {
  return [
    ...(project.clips ?? []),
    ...(project.scenes ?? []).flatMap((scene) => scene.clips),
  ];
}

function hasBindingTarget(
  refs: ProjectReferenceSets,
  target: NonNullable<ProjectData["parameterBindings"]>[number]["target"],
): boolean {
  if (target.type === "bone") {
    return refs.boneIds.has(target.boneId);
  }
  return refs.ikControllerIds.has(target.controllerId);
}

export function planParameterBindingCleanup(
  project: ProjectData,
): ParameterBindingCleanupPlan {
  const bindings = project.parameterBindings ?? [];
  if (bindings.length === 0) {
    return {
      bindingIds: [],
      removedMissingParameterCount: 0,
      removedMissingTargetCount: 0,
      removedEmptyBindingCount: 0,
    };
  }
  const refs = collectProjectReferenceSets(project);
  const bindingIds: string[] = [];
  let removedMissingParameterCount = 0;
  let removedMissingTargetCount = 0;
  let removedEmptyBindingCount = 0;
  for (const binding of bindings) {
    const missingParameter = !refs.parameterIds.has(binding.parameterId);
    const missingTarget = !hasBindingTarget(refs, binding.target);
    const emptyBinding = binding.bindingPoints.length === 0;
    if (!missingParameter && !missingTarget && !emptyBinding) continue;
    bindingIds.push(binding.id);
    if (missingParameter) removedMissingParameterCount += 1;
    if (missingTarget) removedMissingTargetCount += 1;
    if (emptyBinding) removedEmptyBindingCount += 1;
  }
  return {
    bindingIds,
    removedMissingParameterCount,
    removedMissingTargetCount,
    removedEmptyBindingCount,
  };
}

export function applyParameterBindingCleanup(
  project: ProjectData,
  plan = planParameterBindingCleanup(project),
): ParameterBindingCleanupPlan {
  if (plan.bindingIds.length === 0 || !project.parameterBindings) return plan;
  const ids = new Set(plan.bindingIds);
  project.parameterBindings = project.parameterBindings.filter(
    (binding) => !ids.has(binding.id),
  );
  return plan;
}

export function planStateMachineCleanup(project: ProjectData): StateMachineCleanupPlan {
  const machines = project.stateMachines ?? [];
  if (machines.length === 0) {
    return {
      initialStateFixes: [],
      clearedStateClipRefs: [],
      blendTreeReplacements: [],
      removedTransitions: [],
      removedConditions: [],
      clearedBlendTreeCount: 0,
      prunedBlendTreeEntryCount: 0,
    };
  }

  const refs = collectProjectReferenceSets(project);
  const initialStateFixes: StateMachineCleanupPlan["initialStateFixes"] = [];
  const clearedStateClipRefs: StateMachineCleanupPlan["clearedStateClipRefs"] = [];
  const blendTreeReplacements: BlendTreeReplacement[] = [];
  const removedTransitions: StateMachineCleanupPlan["removedTransitions"] = [];
  const removedConditions: StateMachineCleanupPlan["removedConditions"] = [];
  let clearedBlendTreeCount = 0;
  let prunedBlendTreeEntryCount = 0;

  for (const machine of machines) {
    const stateIds = new Set(machine.states.map((state) => state.id));
    if (!stateIds.has(machine.initialStateId) && machine.states[0]) {
      initialStateFixes.push({
        machineId: machine.id,
        nextStateId: machine.states[0].id,
      });
    }

    for (const state of machine.states) {
      if (state.clipId && !refs.clipIds.has(state.clipId)) {
        clearedStateClipRefs.push({ machineId: machine.id, stateId: state.id });
      }
      if (!state.blendTree) continue;
      const validEntries = state.blendTree.entries.filter((entry) =>
        refs.clipIds.has(entry.clipId),
      );
      const removedEntryCount = state.blendTree.entries.length - validEntries.length;
      const missingParameter = !refs.parameterIds.has(state.blendTree.parameterId);
      if (missingParameter || validEntries.length === 0 || removedEntryCount > 0) {
        const nextBlendTree =
          missingParameter || validEntries.length === 0
            ? null
            : { ...state.blendTree, entries: validEntries };
        blendTreeReplacements.push({
          machineId: machine.id,
          stateId: state.id,
          blendTree: nextBlendTree,
          removedEntryCount,
        });
        if (nextBlendTree === null) clearedBlendTreeCount += 1;
        prunedBlendTreeEntryCount += removedEntryCount;
      }
    }

    for (const transition of machine.transitions) {
      const hasValidSource =
        transition.fromStateId === "*" || stateIds.has(transition.fromStateId);
      if (!hasValidSource || !stateIds.has(transition.toStateId)) {
        removedTransitions.push({ machineId: machine.id, transitionId: transition.id });
        continue;
      }
      const indices: number[] = [];
      transition.conditions.forEach((condition, index) => {
        if (!refs.parameterIds.has(condition.parameterId)) indices.push(index);
      });
      if (indices.length > 0) {
        removedConditions.push({ machineId: machine.id, transitionId: transition.id, indices });
      }
    }
  }

  return {
    initialStateFixes,
    clearedStateClipRefs,
    blendTreeReplacements,
    removedTransitions,
    removedConditions,
    clearedBlendTreeCount,
    prunedBlendTreeEntryCount,
  };
}

export function applyStateMachineCleanup(
  project: ProjectData,
  plan = planStateMachineCleanup(project),
): StateMachineCleanupPlan {
  if ((project.stateMachines ?? []).length === 0) return plan;

  for (const fix of plan.initialStateFixes) {
    const machine = project.stateMachines.find((entry) => entry.id === fix.machineId);
    if (machine) machine.initialStateId = fix.nextStateId;
  }
  for (const fix of plan.clearedStateClipRefs) {
    const machine = project.stateMachines.find((entry) => entry.id === fix.machineId);
    const state = machine?.states.find((entry) => entry.id === fix.stateId);
    if (state?.clipId) delete state.clipId;
  }
  for (const fix of plan.blendTreeReplacements) {
    const machine = project.stateMachines.find((entry) => entry.id === fix.machineId);
    const state = machine?.states.find((entry) => entry.id === fix.stateId);
    if (!state) continue;
    if (fix.blendTree) state.blendTree = fix.blendTree;
    else delete state.blendTree;
  }
  for (const fix of plan.removedTransitions) {
    const machine = project.stateMachines.find((entry) => entry.id === fix.machineId);
    if (!machine) continue;
    machine.transitions = machine.transitions.filter(
      (transition) => transition.id !== fix.transitionId,
    );
  }
  for (const fix of plan.removedConditions) {
    const machine = project.stateMachines.find((entry) => entry.id === fix.machineId);
    const transition = machine?.transitions.find(
      (entry) => entry.id === fix.transitionId,
    );
    if (!transition) continue;
    const indices = new Set(fix.indices);
    transition.conditions = transition.conditions.filter(
      (_, index) => !indices.has(index),
    );
  }
  return plan;
}

export function planSceneBlendCleanup(project: ProjectData): SceneBlendCleanupPlan {
  const blends = project.sceneBlends ?? [];
  if (blends.length === 0) {
    return { removedBlendIds: [], normalizedDurationBlendIds: [] };
  }
  const refs = collectProjectReferenceSets(project);
  const removedBlendIds: string[] = [];
  const normalizedDurationBlendIds: string[] = [];
  for (const blend of blends) {
    const missingScene =
      !refs.sceneIds.has(blend.sourceSceneId) || !refs.sceneIds.has(blend.targetSceneId);
    const selfReference = blend.sourceSceneId === blend.targetSceneId;
    if (missingScene || selfReference) {
      removedBlendIds.push(blend.id);
      continue;
    }
    if (!Number.isFinite(blend.transitionFrames) || blend.transitionFrames <= 0) {
      normalizedDurationBlendIds.push(blend.id);
    }
  }
  return { removedBlendIds, normalizedDurationBlendIds };
}

export function applySceneBlendCleanup(
  project: ProjectData,
  plan = planSceneBlendCleanup(project),
): SceneBlendCleanupPlan {
  if (!project.sceneBlends || project.sceneBlends.length === 0) return plan;
  const removedIds = new Set(plan.removedBlendIds);
  project.sceneBlends = project.sceneBlends.filter((blend) => !removedIds.has(blend.id));
  if (plan.normalizedDurationBlendIds.length > 0) {
    const normalizedIds = new Set(plan.normalizedDurationBlendIds);
    for (const blend of project.sceneBlends) {
      if (normalizedIds.has(blend.id)) {
        blend.transitionFrames = DEFAULT_SCENE_BLEND_TRANSITION_FRAMES;
      }
    }
  }
  return plan;
}

export function planAnimationTrackCleanup(
  project: ProjectData,
): AnimationTrackCleanupPlan {
  const clips = iterateAllClips(project);
  if (clips.length === 0) {
    return {
      clipTargets: [],
      removedParameterTrackCount: 0,
      removedBoneTrackCount: 0,
      removedImageSequenceTrackCount: 0,
      removedIkControllerTrackCount: 0,
      removedLipSyncTrackCount: 0,
      clearedLipSyncParameterTargetCount: 0,
    };
  }
  const refs = collectProjectReferenceSets(project);
  const clipTargets: TrackCleanupTarget[] = [];
  let removedParameterTrackCount = 0;
  let removedBoneTrackCount = 0;
  let removedImageSequenceTrackCount = 0;
  let removedIkControllerTrackCount = 0;
  let removedLipSyncTrackCount = 0;
  let clearedLipSyncParameterTargetCount = 0;

  for (const clip of clips) {
    const target: TrackCleanupTarget = {
      clipId: clip.id,
      parameterIds: [],
      boneTrackKeys: [],
      imageSequenceTargetIds: [],
      ikControllerIds: [],
      lipSyncTrackIds: [],
      lipSyncParameterTrackIds: [],
    };
    for (const track of clip.tracks) {
      if (!refs.parameterIds.has(track.parameterId)) {
        target.parameterIds.push(track.parameterId);
        removedParameterTrackCount += 1;
      }
    }
    for (const track of clip.boneTracks ?? []) {
      if (!refs.boneIds.has(track.boneId)) {
        target.boneTrackKeys.push({ boneId: track.boneId, property: track.property });
        removedBoneTrackCount += 1;
      }
    }
    for (const track of clip.imageSequenceTracks ?? []) {
      if (!refs.viviMeshIds.has(track.targetMeshId)) {
        target.imageSequenceTargetIds.push(track.targetMeshId);
        removedImageSequenceTrackCount += 1;
      }
    }
    for (const track of clip.ikControllerTracks ?? []) {
      if (!refs.ikControllerIds.has(track.controllerId)) {
        target.ikControllerIds.push(track.controllerId);
        removedIkControllerTrackCount += 1;
      }
    }
    const audioTrackIds = new Set((clip.audioTracks ?? []).map((track) => track.id));
    for (const track of clip.lipSyncTracks ?? []) {
      if (!audioTrackIds.has(track.sourceAudioTrackId)) {
        target.lipSyncTrackIds.push(track.id);
        removedLipSyncTrackCount += 1;
        continue;
      }
      if (track.targetParameterId && !refs.parameterIds.has(track.targetParameterId)) {
        target.lipSyncParameterTrackIds.push(track.id);
        clearedLipSyncParameterTargetCount += 1;
      }
    }
    if (
      target.parameterIds.length > 0 ||
      target.boneTrackKeys.length > 0 ||
      target.imageSequenceTargetIds.length > 0 ||
      target.ikControllerIds.length > 0 ||
      target.lipSyncTrackIds.length > 0 ||
      target.lipSyncParameterTrackIds.length > 0
    ) {
      clipTargets.push(target);
    }
  }

  return {
    clipTargets,
    removedParameterTrackCount,
    removedBoneTrackCount,
    removedImageSequenceTrackCount,
    removedIkControllerTrackCount,
    removedLipSyncTrackCount,
    clearedLipSyncParameterTargetCount,
  };
}

function matchesBoneTrackKey(
  keys: Array<{ boneId: string; property: BonePropertyType }>,
  boneId: string,
  property: BonePropertyType,
): boolean {
  return keys.some((key) => key.boneId === boneId && key.property === property);
}

export function applyAnimationTrackCleanup(
  project: ProjectData,
  plan = planAnimationTrackCleanup(project),
): AnimationTrackCleanupPlan {
  if (plan.clipTargets.length === 0) return plan;
  for (const clip of iterateAllClips(project)) {
    const target = plan.clipTargets.find((entry) => entry.clipId === clip.id);
    if (!target) continue;

    const parameterIds = new Set(target.parameterIds);
    clip.tracks = clip.tracks.filter((track) => !parameterIds.has(track.parameterId));

    if (clip.boneTracks) {
      clip.boneTracks = clip.boneTracks.filter(
        (track) =>
          !matchesBoneTrackKey(target.boneTrackKeys, track.boneId, track.property),
      );
    }
    if (clip.imageSequenceTracks) {
      const targetIds = new Set(target.imageSequenceTargetIds);
      clip.imageSequenceTracks = clip.imageSequenceTracks.filter(
        (track) => !targetIds.has(track.targetMeshId),
      );
    }
    if (clip.ikControllerTracks) {
      const controllerIds = new Set(target.ikControllerIds);
      clip.ikControllerTracks = clip.ikControllerTracks.filter(
        (track) => !controllerIds.has(track.controllerId),
      );
    }
    if (clip.lipSyncTracks) {
      const removeIds = new Set(target.lipSyncTrackIds);
      const clearParameterIds = new Set(target.lipSyncParameterTrackIds);
      clip.lipSyncTracks = clip.lipSyncTracks
        .filter((track) => !removeIds.has(track.id))
        .map((track) => {
          if (clearParameterIds.has(track.id)) track.targetParameterId = null;
          return track;
        });
    }
  }
  return plan;
}
