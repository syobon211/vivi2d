import { evaluateClipAtFrame } from "./timeline-utils";
import type {
  AnimationClip,
  AnimationState,
  AnimationStateMachine,
  BlendTree1D,
  StateTransition,
  TransitionCondition,
} from "./types";

export interface StateMachineRuntime {
  currentStateId: string;

  currentFrame: number;

  activeTransition: ActiveTransition | null;
}

export interface ActiveTransition {
  transitionId: string;

  fromStateId: string;

  toStateId: string;

  toFrame: number;

  elapsed: number;

  duration: number;
}

export function createStateMachineRuntime(
  machine: AnimationStateMachine,
): StateMachineRuntime {
  return {
    currentStateId: machine.initialStateId,
    currentFrame: 0,
    activeTransition: null,
  };
}

export function evaluateConditions(
  conditions: TransitionCondition[],
  parameterValues: Record<string, number>,
): boolean {
  for (const cond of conditions) {
    const value = parameterValues[cond.parameterId] ?? 0;
    if (!evaluateSingleCondition(value, cond.operator, cond.threshold)) {
      return false;
    }
  }
  return true;
}

function evaluateSingleCondition(
  value: number,
  operator: TransitionCondition["operator"],
  threshold: number,
): boolean {
  switch (operator) {
    case ">":
      return value > threshold;
    case "<":
      return value < threshold;
    case ">=":
      return value >= threshold;
    case "<=":
      return value <= threshold;
    case "==":
      return Math.abs(value - threshold) < 1e-6;
    case "!=":
      return Math.abs(value - threshold) >= 1e-6;
    default: {
      const _exhaustive: never = operator;
      return _exhaustive;
    }
  }
}

export function findTriggeredTransition(
  machine: AnimationStateMachine,
  runtime: StateMachineRuntime,
  parameterValues: Record<string, number>,
): StateTransition | null {
  if (runtime.activeTransition) return null;

  const candidates = machine.transitions
    .filter((t) => t.fromStateId === runtime.currentStateId || t.fromStateId === "*")
    .sort((a, b) => b.priority - a.priority);

  for (const transition of candidates) {
    if (transition.toStateId === runtime.currentStateId) continue;
    if (evaluateConditions(transition.conditions, parameterValues)) {
      return transition;
    }
  }
  return null;
}

export function stepStateMachine(
  machine: AnimationStateMachine,
  runtime: StateMachineRuntime,
  parameterValues: Record<string, number>,
  clips: ReadonlyMap<string, AnimationClip>,
  deltaTime: number,
): Record<string, number> {
  if (!machine.enabled) return {};

  const currentState = machine.states.find((s) => s.id === runtime.currentStateId);
  if (!currentState) return {};

  const triggered = findTriggeredTransition(machine, runtime, parameterValues);
  if (triggered) {
    runtime.activeTransition = {
      transitionId: triggered.id,
      fromStateId: runtime.currentStateId,
      toStateId: triggered.toStateId,
      toFrame: 0,
      elapsed: 0,
      duration: triggered.transitionDuration,
    };
  }

  const currentClip = getStateClip(currentState, clips);
  if (currentClip && deltaTime > 0) {
    runtime.currentFrame += deltaTime * currentClip.fps;
    if (currentState.loop && currentClip.duration > 0) {
      runtime.currentFrame = runtime.currentFrame % currentClip.duration;
    } else if (runtime.currentFrame > currentClip.duration) {
      runtime.currentFrame = currentClip.duration;
    }
  }

  const transition = runtime.activeTransition;
  if (transition) {
    transition.elapsed += deltaTime;
    const toState = machine.states.find((s) => s.id === transition.toStateId);
    const toClip = toState ? getStateClip(toState, clips) : undefined;

    if (toClip && deltaTime > 0) {
      transition.toFrame += deltaTime * toClip.fps;
      if (toState?.loop && toClip.duration > 0) {
        transition.toFrame = transition.toFrame % toClip.duration;
      }
    }

    const t =
      transition.duration > 0 ? Math.min(transition.elapsed / transition.duration, 1) : 1;

    const fromParams = evaluateStateOutput(
      currentState,
      clips,
      runtime.currentFrame,
      parameterValues,
    );

    const toParams = toState
      ? evaluateStateOutput(toState, clips, transition.toFrame, parameterValues)
      : {};

    if (t >= 1) {
      runtime.currentStateId = transition.toStateId;
      runtime.currentFrame = transition.toFrame;
      runtime.activeTransition = null;
      return toParams;
    }

    return blendParams(fromParams, toParams, t);
  }

  return evaluateStateOutput(currentState, clips, runtime.currentFrame, parameterValues);
}

export function evaluateBlendTree(
  tree: BlendTree1D,
  parameterValues: Record<string, number>,
  clips: ReadonlyMap<string, AnimationClip>,
  frame: number,
): Record<string, number> {
  if (tree.entries.length === 0) return {};

  const value = parameterValues[tree.parameterId] ?? 0;
  const sorted = [...tree.entries].sort((a, b) => a.threshold - b.threshold);

  if (value <= sorted[0]!.threshold) {
    const clip = clips.get(sorted[0]!.clipId);
    return clip ? evaluateClipAtFrame(clip, frame) : {};
  }
  if (value >= sorted[sorted.length - 1]!.threshold) {
    const clip = clips.get(sorted[sorted.length - 1]!.clipId);
    return clip ? evaluateClipAtFrame(clip, frame) : {};
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    if (value >= lo.threshold && value <= hi.threshold) {
      const range = hi.threshold - lo.threshold;
      const t = range > 0 ? (value - lo.threshold) / range : 0;
      const clipA = clips.get(lo.clipId);
      const clipB = clips.get(hi.clipId);
      const paramsA = clipA ? evaluateClipAtFrame(clipA, frame) : {};
      const paramsB = clipB ? evaluateClipAtFrame(clipB, frame) : {};
      return blendParams(paramsA, paramsB, t);
    }
  }

  return {};
}

function evaluateStateOutput(
  state: AnimationState,
  clips: ReadonlyMap<string, AnimationClip>,
  frame: number,
  parameterValues: Record<string, number>,
): Record<string, number> {
  if (state.blendTree) {
    return evaluateBlendTree(state.blendTree, parameterValues, clips, frame);
  }
  if (state.clipId) {
    const clip = clips.get(state.clipId);
    return clip ? evaluateClipAtFrame(clip, frame) : {};
  }
  return {};
}

function getStateClip(
  state: AnimationState,
  clips: ReadonlyMap<string, AnimationClip>,
): AnimationClip | undefined {
  if (state.blendTree && state.blendTree.entries.length > 0) {
    let best: AnimationClip | undefined;
    for (const entry of state.blendTree.entries) {
      const c = clips.get(entry.clipId);
      if (c && (!best || c.fps > best.fps)) best = c;
    }
    return best;
  }
  return state.clipId ? clips.get(state.clipId) : undefined;
}

function blendParams(
  from: Record<string, number>,
  to: Record<string, number>,
  t: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of allKeys) {
    const a = from[key] ?? 0;
    const b = to[key] ?? 0;
    result[key] = a + (b - a) * t;
  }
  return result;
}
