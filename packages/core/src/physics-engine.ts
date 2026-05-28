import { PHYSICS_DEFAULTS } from "./constants";
import type {
  ParameterDefinition,
  PendulumConfig,
  PendulumState,
  PhysicsGroup,
  PhysicsInput,
  PhysicsOutput,
} from "./types";

export function createPhysicsRuntimeState(group: PhysicsGroup): PendulumState[] {
  return group.pendulums.map(() => ({ angle: 0, angularVelocity: 0 }));
}

export function computeInputForces(
  inputs: PhysicsInput[],
  currentValues: Record<string, number>,
  previousValues: Record<string, number>,
): { x: number; y: number } {
  let x = 0;
  let y = 0;

  for (const input of inputs) {
    const current = currentValues[input.parameterId] ?? 0;
    const previous = previousValues[input.parameterId] ?? 0;
    const delta = (current - previous) * input.weight;

    switch (input.type) {
      case "x":
        x += delta;
        break;
      case "y":
        y += delta;
        break;
      case "angle":
        x += delta;
        break;
    }
  }

  return { x, y };
}

export function stepPhysicsGroup(
  group: PhysicsGroup,
  states: PendulumState[],
  inputForces: { x: number; y: number },
  dt: number,
): void {
  const gravRad = (group.gravityDirection * Math.PI) / 180;
  const gravX = Math.sin(gravRad) * group.gravityStrength;
  const gravY = Math.cos(gravRad) * group.gravityStrength;

  for (let i = 0; i < group.pendulums.length; i++) {
    const config = group.pendulums[i];
    const state = states[i];
    if (!config || !state) continue;

    const armX = Math.sin(state.angle);
    const armY = Math.cos(state.angle);

    let forceX = gravX + group.wind;
    let forceY = gravY;

    if (i === 0) {
      forceX += inputForces.x;
      forceY += inputForces.y;
    } else {
      const parentState = states[i - 1];
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

    state.angularVelocity += angularAcceleration * dt;

    state.angularVelocity *= 1 - config.damping;

    state.angle += state.angularVelocity * dt;

    if (state.angle > PHYSICS_DEFAULTS.MAX_ANGLE) {
      state.angle = PHYSICS_DEFAULTS.MAX_ANGLE;
      state.angularVelocity = 0;
    } else if (state.angle < -PHYSICS_DEFAULTS.MAX_ANGLE) {
      state.angle = -PHYSICS_DEFAULTS.MAX_ANGLE;
      state.angularVelocity = 0;
    }
  }
}

export interface PhysicsOutputResult {
  parameters: Record<string, number>;
  bones: Record<string, number>;
}

export function computeOutputValues(
  outputs: PhysicsOutput[],
  states: PendulumState[],
  parameterDefs: ParameterDefinition[],
): PhysicsOutputResult {
  const parameters: Record<string, number> = {};
  const bones: Record<string, number> = {};
  const paramMap = new Map(parameterDefs.map((p) => [p.id, p]));

  for (const output of outputs) {
    if (output.pendulumIndex < 0 || output.pendulumIndex >= states.length) continue;

    const state = states[output.pendulumIndex];
    if (!state) continue;
    const rawValue = state.angle * output.weight;

    if (output.type === "boneAngle" && output.boneId) {
      bones[output.boneId] = rawValue;
    } else if (output.parameterId) {
      let value = rawValue;
      const def = paramMap.get(output.parameterId);
      if (def) {
        value += def.defaultValue;
        value = Math.max(def.minValue, Math.min(def.maxValue, value));
      }
      parameters[output.parameterId] = value;
    }
  }

  return { parameters, bones };
}

export function runPhysicsFrame(
  group: PhysicsGroup,
  states: PendulumState[],
  inputForces: { x: number; y: number },
  deltaTime: number,
  accumulator: number,
): number {
  accumulator += deltaTime;

  let substeps = 0;
  while (
    accumulator >= PHYSICS_DEFAULTS.TIMESTEP &&
    substeps < PHYSICS_DEFAULTS.MAX_SUBSTEPS
  ) {
    stepPhysicsGroup(group, states, inputForces, PHYSICS_DEFAULTS.TIMESTEP);
    accumulator -= PHYSICS_DEFAULTS.TIMESTEP;
    substeps++;
  }

  if (accumulator > PHYSICS_DEFAULTS.TIMESTEP * PHYSICS_DEFAULTS.MAX_SUBSTEPS) {
    accumulator = 0;
  }

  return accumulator;
}

export function resetPendulumStates(states: PendulumState[]): void {
  for (const state of states) {
    state.angle = 0;
    state.angularVelocity = 0;
  }
}

export function createDefaultPendulum(): PendulumConfig {
  return {
    length: PHYSICS_DEFAULTS.PENDULUM_LENGTH,
    mass: PHYSICS_DEFAULTS.PENDULUM_MASS,
    damping: PHYSICS_DEFAULTS.DAMPING,
  };
}
