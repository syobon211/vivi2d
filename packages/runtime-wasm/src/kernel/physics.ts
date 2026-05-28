import type { PendulumState, ProjectData } from "@vivi2d/core";
import {
  computeRuntimeInputForces,
  computeRuntimeOutputValues,
  runRuntimePhysicsFrame,
} from "./physics-engine";

export interface RuntimePhysicsStepContext {
  readonly project: ProjectData;
  readonly parameterValues: Record<string, number>;
  readonly prevParamValues: Record<string, number>;
  readonly physicsStates: Map<string, PendulumState[]>;
  readonly physicsAccumulators: Map<string, number>;
  readonly boneAngles: Record<string, number>;
}

export function runRuntimePhysicsStep(
  ctx: RuntimePhysicsStepContext,
  deltaSeconds: number,
): void {
  for (const group of ctx.project.physicsGroups) {
    if (!group.enabled) continue;
    const states = ctx.physicsStates.get(group.id);
    if (!states) continue;

    const forces = computeRuntimeInputForces(
      group.inputs,
      ctx.parameterValues,
      ctx.prevParamValues,
    );
    const accumulator = ctx.physicsAccumulators.get(group.id) ?? 0;
    const newAccumulator = runRuntimePhysicsFrame(
      group,
      states,
      forces,
      deltaSeconds,
      accumulator,
    );
    ctx.physicsAccumulators.set(group.id, newAccumulator);

    const output = computeRuntimeOutputValues(
      group.outputs,
      states,
      ctx.project.parameters,
    );
    for (const [parameterId, value] of Object.entries(output.parameters)) {
      ctx.parameterValues[parameterId] = value;
    }
    for (const [boneId, angle] of Object.entries(output.bones)) {
      ctx.boneAngles[boneId] = (ctx.boneAngles[boneId] ?? 0) + angle;
    }
  }
}
