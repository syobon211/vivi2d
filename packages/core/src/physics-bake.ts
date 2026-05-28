import {
  computeInputForces,
  computeOutputValues,
  createPhysicsRuntimeState,
  type PhysicsOutputResult,
  runPhysicsFrame,
} from "./physics-engine";
import { evaluateClipAtFrame } from "./timeline-utils";
import type {
  AnimationClip,
  ParameterDefinition,
  PendulumState,
  PhysicsGroup,
  TimelineKeyframe,
} from "./types";

export interface BakeOptions {
  startFrame: number;

  endFrame: number;
  /** FPS */
  fps: number;

  sampleInterval: number;

  groupIds?: string[];
}

export interface BakeResult {
  parameterKeyframes: Record<string, TimelineKeyframe[]>;

  boneKeyframes: Record<string, TimelineKeyframe[]>;
}

export function bakePhysics(
  clip: AnimationClip,
  physicsGroups: PhysicsGroup[],
  parameterDefs: ParameterDefinition[],
  options: BakeOptions,
): BakeResult {
  const { startFrame, endFrame, fps, sampleInterval, groupIds } = options;

  const targetGroups =
    groupIds && groupIds.length > 0
      ? physicsGroups.filter((g) => groupIds.includes(g.id))
      : physicsGroups;

  if (targetGroups.length === 0) {
    return { parameterKeyframes: {}, boneKeyframes: {} };
  }

  const runtimeStates = new Map<string, PendulumState[]>();
  const accumulators = new Map<string, number>();
  for (const group of targetGroups) {
    runtimeStates.set(group.id, createPhysicsRuntimeState(group));
    accumulators.set(group.id, 0);
  }

  const dt = 1 / fps;
  let previousValues = evaluateClipAtFrame(clip, Math.max(0, startFrame - 1));

  const result: BakeResult = {
    parameterKeyframes: {},
    boneKeyframes: {},
  };

  for (let frame = startFrame; frame <= endFrame; frame++) {
    const currentValues = evaluateClipAtFrame(clip, frame);

    const mergedOutput: PhysicsOutputResult = { parameters: {}, bones: {} };

    for (const group of targetGroups) {
      const states = runtimeStates.get(group.id)!;
      const acc = accumulators.get(group.id)!;

      const forces = computeInputForces(group.inputs, currentValues, previousValues);
      const newAcc = runPhysicsFrame(group, states, forces, dt, acc);
      accumulators.set(group.id, newAcc);

      const output = computeOutputValues(group.outputs, states, parameterDefs);

      Object.assign(mergedOutput.parameters, output.parameters);
      Object.assign(mergedOutput.bones, output.bones);
    }

    if ((frame - startFrame) % sampleInterval === 0) {
      for (const [paramId, value] of Object.entries(mergedOutput.parameters)) {
        if (!result.parameterKeyframes[paramId]) {
          result.parameterKeyframes[paramId] = [];
        }
        result.parameterKeyframes[paramId].push({
          frame,
          value,
          interpolation: "linear",
        });
      }

      for (const [boneId, value] of Object.entries(mergedOutput.bones)) {
        if (!result.boneKeyframes[boneId]) {
          result.boneKeyframes[boneId] = [];
        }
        result.boneKeyframes[boneId].push({
          frame,
          value,
          interpolation: "linear",
        });
      }
    }

    previousValues = currentValues;
  }

  return result;
}
