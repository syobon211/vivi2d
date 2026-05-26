// ParameterDefinition, ParameterBindingPoint, BindingTarget, ParameterBinding,

import type { LayerId, ParameterId } from "./layer";

export type { ParameterId } from "./layer";

export type BonePropertyType = "angle" | "scaleX" | "scaleY";

export type BoneBindingPropertyType = BonePropertyType | "x" | "y";

export type IKControllerBindingPropertyType =
  | "targetX"
  | "targetY"
  | "poleTargetX"
  | "poleTargetY"
  | "influence";

export interface ParameterDefinition {
  id: ParameterId;
  name: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  managedTag?: string;
  managedSignature?: string;
  managedSourceFingerprint?: string;

  pairedParameterId?: ParameterId;

  group?: string;
}

export interface ParameterBindingPoint {
  paramValue: number;

  targetValue: number;
}

export type BindingTarget =
  | { type: "bone"; boneId: LayerId; property: BoneBindingPropertyType }
  | {
      type: "ikController";
      controllerId: string;
      property: IKControllerBindingPropertyType;
    };

export interface ParameterBinding {
  id: string;
  parameterId: ParameterId;
  target: BindingTarget;
  managedTag?: string;
  managedSignature?: string;
  managedSourceFingerprint?: string;

  bindingPoints: ParameterBindingPoint[];
}

export interface ExpressionPreset {
  id: string;
  name: string;

  values: Record<ParameterId, number>;

  color?: string;

  hotkey?: number;
}
