// TransitionCondition, BlendTree1D, AnimationState, StateTransition,

import type { ClipId } from "./layer";
import type { ParameterId } from "./parameter";

export interface TransitionCondition {
  parameterId: ParameterId;

  operator: ">" | "<" | ">=" | "<=" | "==" | "!=";

  threshold: number;
}

export interface BlendTreeEntry {
  threshold: number;

  clipId: ClipId;
}

export interface BlendTree1D {
  parameterId: ParameterId;

  entries: BlendTreeEntry[];
}

export interface AnimationState {
  id: string;

  name: string;

  clipId?: ClipId;

  blendTree?: BlendTree1D;

  loop: boolean;
}

export interface StateTransition {
  id: string;

  fromStateId: string;

  toStateId: string;

  conditions: TransitionCondition[];

  transitionDuration: number;

  priority: number;
}

export interface AnimationStateMachine {
  id: string;
  name: string;

  states: AnimationState[];

  transitions: StateTransition[];

  initialStateId: string;

  enabled: boolean;

  blendMode?: "override" | "additive";

  weight?: number;
}
