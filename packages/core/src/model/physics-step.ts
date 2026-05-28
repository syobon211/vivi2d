import {
  computeInputForces,
  computeOutputValues,
  runPhysicsFrame,
} from "../physics-engine";
import type { PendulumState, ProjectData } from "../types";

export interface PhysicsStepContext {
  project: ProjectData;
  parameterValues: Record<string, number>;
  prevParamValues: Record<string, number>;
  physicsStates: Map<string, PendulumState[]>;
  physicsAccumulators: Map<string, number>;
  boneAngles: Record<string, number>;
}

export function runPhysicsStep(ctx: PhysicsStepContext, deltaTime: number): void {
  for (const group of ctx.project.physicsGroups) {
    if (!group.enabled) continue;
    const states = ctx.physicsStates.get(group.id);
    if (!states) continue;

    const forces = computeInputForces(
      group.inputs,
      ctx.parameterValues,
      ctx.prevParamValues,
    );

    const accumulator = ctx.physicsAccumulators.get(group.id) ?? 0;
    const newAccumulator = runPhysicsFrame(group, states, forces, deltaTime, accumulator);
    ctx.physicsAccumulators.set(group.id, newAccumulator);

    const output = computeOutputValues(group.outputs, states, ctx.project.parameters);
    for (const [paramId, value] of Object.entries(output.parameters)) {
      (ctx.parameterValues as Record<string, number>)[paramId] = value;
    }
    for (const [boneId, angle] of Object.entries(output.bones)) {
      ctx.boneAngles[boneId] = (ctx.boneAngles[boneId] ?? 0) + angle;
    }
  }
}
