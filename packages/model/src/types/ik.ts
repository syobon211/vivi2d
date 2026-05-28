import type { LayerId } from "./layer";
import type { ParameterId } from "./parameter";

export interface IKBoneConstraint {
  boneId: LayerId;

  /** Minimum allowed local joint angle in radians. */
  minAngle: number;

  /** Maximum allowed local joint angle in radians. */
  maxAngle: number;
}

export interface IKParameterMapping {
  boneId: LayerId;

  parameterId: ParameterId;

  angleMin: number;
  angleMax: number;

  paramMin: number;
  paramMax: number;
}

export interface IKController {
  id: string;
  name: string;
  managedTag?: string;
  managedSignature?: string;
  managedSourceFingerprint?: string;
  manualSplitSourceLayerId?: LayerId;
  manualSplitSourceFingerprint?: string;
  manualSplitLayerId?: LayerId;

  solverType: "twoBone" | "ccd";

  boneChain: IKBoneConstraint[];

  targetX: number;

  targetY: number;

  influence: number;

  poleTargetX?: number;

  poleTargetY?: number;

  maxIterations?: number;

  parameterMappings: IKParameterMapping[];
}
