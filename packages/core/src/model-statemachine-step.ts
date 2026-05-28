import { type StateMachineRuntime, stepStateMachine } from "./state-machine";
import type { AnimationClip, AnimationStateMachine, ParameterDefinition } from "./types";

export interface StateMachineStepUpdate {
  paramValues: Record<string, number>;
}

function stepOverrideMachine(
  machine: AnimationStateMachine,
  runtime: StateMachineRuntime,
  parameterValues: Record<string, number>,
  clipMap: Map<string, AnimationClip>,
  deltaTime: number,
): Map<string, number> {
  const output = stepStateMachine(machine, runtime, parameterValues, clipMap, deltaTime);
  const weight = machine.weight ?? 1;
  const result = new Map<string, number>();
  for (const [paramId, value] of Object.entries(output)) {
    if (weight >= 1) {
      result.set(paramId, value);
    } else {
      const current = parameterValues[paramId] ?? 0;
      result.set(paramId, current + (value - current) * weight);
    }
  }
  return result;
}

function stepAdditiveMachine(
  machine: AnimationStateMachine,
  runtime: StateMachineRuntime,
  parameterValues: Record<string, number>,
  clipMap: Map<string, AnimationClip>,
  deltaTime: number,
  getParamDefault: (id: string) => number,
): Map<string, number> {
  const output = stepStateMachine(machine, runtime, parameterValues, clipMap, deltaTime);
  const weight = machine.weight ?? 1;
  const result = new Map<string, number>();
  for (const [paramId, value] of Object.entries(output)) {
    const defaultVal = getParamDefault(paramId);
    const delta = (value - defaultVal) * weight;
    const current = parameterValues[paramId] ?? 0;
    result.set(paramId, current + delta);
  }
  return result;
}

export function computeStateMachineUpdates(
  machines: readonly AnimationStateMachine[],
  runtimes: Map<string, StateMachineRuntime>,
  clipMap: Map<string, AnimationClip>,
  deltaTime: number,
  getCurrentParams: () => Record<string, number>,
  getParamDefault: (id: string) => number,
  applyUpdates: (updates: Map<string, number>) => void,
): void {
  if (machines.length === 0) return;

  for (const machine of machines) {
    if (!machine.enabled || machine.blendMode === "additive") continue;
    const runtime = runtimes.get(machine.id);
    if (!runtime) continue;
    const updates = stepOverrideMachine(
      machine,
      runtime,
      getCurrentParams(),
      clipMap,
      deltaTime,
    );
    applyUpdates(updates);
  }

  for (const machine of machines) {
    if (!machine.enabled || machine.blendMode !== "additive") continue;
    const runtime = runtimes.get(machine.id);
    if (!runtime) continue;
    const updates = stepAdditiveMachine(
      machine,
      runtime,
      getCurrentParams(),
      clipMap,
      deltaTime,
      getParamDefault,
    );
    applyUpdates(updates);
  }
}

export function createParamDefaultResolver(
  parameters: readonly ParameterDefinition[],
): (id: string) => number {
  const cache = new Map<string, number>();
  for (const p of parameters) cache.set(p.id, p.defaultValue);
  return (id: string) => cache.get(id) ?? 0;
}
