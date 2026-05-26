import type {
  ParameterDefinition,
  PendulumConfig,
  PendulumState,
  PhysicsGroup,
  PhysicsInput,
  PhysicsOutput,
} from "@vivi2d/core";
import { PHYSICS_DEFAULTS } from "@vivi2d/core";

export interface RuntimePhysicsOutputResult {
  readonly parameters: Record<string, number>;
  readonly bones: Record<string, number>;
}

export function createRuntimePhysicsState(group: PhysicsGroup): PendulumState[] {
  return group.pendulums.map(() => ({ angle: 0, angularVelocity: 0 }));
}

export function computeRuntimeInputForces(
  inputs: readonly PhysicsInput[],
  currentValues: Record<string, number>,
  previousValues: Record<string, number>,
): { x: number; y: number } {
  let x = 0;
  let y = 0;

  for (const input of inputs) {
    const current = currentValues[input.parameterId] ?? 0;
    const previous = previousValues[input.parameterId] ?? 0;
    const delta = (current - previous) * input.weight;

    if (input.type === "x") x += delta;
    else if (input.type === "y") y += delta;
    else if (input.type === "angle") x += delta;
  }

  return { x, y };
}

export function stepRuntimePhysicsGroup(
  group: PhysicsGroup,
  states: PendulumState[],
  inputForces: { x: number; y: number },
  deltaSeconds: number,
): void {
  const gravityRadians = (group.gravityDirection * Math.PI) / 180;
  const gravityX = Math.sin(gravityRadians) * group.gravityStrength;
  const gravityY = Math.cos(gravityRadians) * group.gravityStrength;

  for (let index = 0; index < group.pendulums.length; index += 1) {
    const config = group.pendulums[index];
    const state = states[index];
    if (!config || !state) continue;

    const armX = Math.sin(state.angle);
    const armY = Math.cos(state.angle);
    let forceX = gravityX + group.wind;
    let forceY = gravityY;

    if (index === 0) {
      forceX += inputForces.x;
      forceY += inputForces.y;
    } else {
      const parentState = states[index - 1];
      if (parentState) {
        forceX +=
          parentState.angularVelocity *
          config.length *
          PHYSICS_DEFAULTS.FORCE_PROPAGATION;
      }
    }

    const torque = forceX * armY - forceY * armX;
    const massLength = config.mass * config.length;
    const angularAcceleration = massLength > 0 ? torque / massLength : 0;
    state.angularVelocity += angularAcceleration * deltaSeconds;
    state.angularVelocity *= 1 - config.damping;
    state.angle += state.angularVelocity * deltaSeconds;

    if (state.angle > PHYSICS_DEFAULTS.MAX_ANGLE) {
      state.angle = PHYSICS_DEFAULTS.MAX_ANGLE;
      state.angularVelocity = 0;
    } else if (state.angle < -PHYSICS_DEFAULTS.MAX_ANGLE) {
      state.angle = -PHYSICS_DEFAULTS.MAX_ANGLE;
      state.angularVelocity = 0;
    }
  }
}

export function computeRuntimeOutputValues(
  outputs: readonly PhysicsOutput[],
  states: readonly PendulumState[],
  parameterDefinitions: readonly ParameterDefinition[],
): RuntimePhysicsOutputResult {
  const parameters: Record<string, number> = {};
  const bones: Record<string, number> = {};
  const parameterMap = new Map(parameterDefinitions.map((parameter) => [
    parameter.id,
    parameter,
  ]));

  for (const output of outputs) {
    if (output.pendulumIndex < 0 || output.pendulumIndex >= states.length) {
      continue;
    }
    const state = states[output.pendulumIndex];
    if (!state) continue;
    const rawValue = state.angle * output.weight;

    if (output.type === "boneAngle" && output.boneId) {
      bones[output.boneId] = rawValue;
    } else if (output.parameterId) {
      let value = rawValue;
      const definition = parameterMap.get(output.parameterId);
      if (definition) {
        value += definition.defaultValue;
        value = Math.max(definition.minValue, Math.min(definition.maxValue, value));
      }
      parameters[output.parameterId] = value;
    }
  }

  return { parameters, bones };
}

export function runRuntimePhysicsFrame(
  group: PhysicsGroup,
  states: PendulumState[],
  inputForces: { x: number; y: number },
  deltaSeconds: number,
  accumulator: number,
): number {
  accumulator += deltaSeconds;

  let substeps = 0;
  while (
    accumulator >= PHYSICS_DEFAULTS.TIMESTEP &&
    substeps < PHYSICS_DEFAULTS.MAX_SUBSTEPS
  ) {
    stepRuntimePhysicsGroup(
      group,
      states,
      inputForces,
      PHYSICS_DEFAULTS.TIMESTEP,
    );
    accumulator -= PHYSICS_DEFAULTS.TIMESTEP;
    substeps += 1;
  }

  if (accumulator > PHYSICS_DEFAULTS.TIMESTEP * PHYSICS_DEFAULTS.MAX_SUBSTEPS) {
    accumulator = 0;
  }

  return accumulator;
}

export function createDefaultRuntimePendulum(): PendulumConfig {
  return {
    length: PHYSICS_DEFAULTS.PENDULUM_LENGTH,
    mass: PHYSICS_DEFAULTS.PENDULUM_MASS,
    damping: PHYSICS_DEFAULTS.DAMPING,
  };
}
