import type { LayerId, PhysicsGroupId } from "./layer";
import type { ParameterId } from "./parameter";

export interface PendulumConfig {
  length: number;

  mass: number;

  damping: number;
}

export interface PendulumState {
  angle: number;

  angularVelocity: number;
}

export interface PhysicsInput {
  parameterId: ParameterId;

  weight: number;

  type: "x" | "y" | "angle";
}

export interface PhysicsOutput {
  parameterId?: ParameterId;

  boneId?: LayerId;

  pendulumIndex: number;

  weight: number;

  type: "angle" | "boneAngle";
}

export interface PhysicsGroup {
  id: PhysicsGroupId;
  name: string;
  enabled: boolean;
  managedTag?: string;
  managedSignature?: string;
  managedSourceFingerprint?: string;
  manualSplitSourceLayerId?: LayerId;
  manualSplitSourceFingerprint?: string;
  manualSplitLayerId?: LayerId;

  pendulums: PendulumConfig[];

  inputs: PhysicsInput[];

  outputs: PhysicsOutput[];

  gravityDirection: number;

  gravityStrength: number;

  wind: number;
}
