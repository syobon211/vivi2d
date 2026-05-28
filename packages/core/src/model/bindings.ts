import { findLayerById } from "../layer-utils";
import { evaluateBindingsAdditive } from "../parameter-binding-eval";
import type {
  BoneBindingPropertyType,
  IKController,
  IKControllerBindingPropertyType,
  LayerNode,
  ParameterBinding,
  ProjectData,
} from "../types";

export interface BindingsResult {
  boneX: Record<string, number>;
  boneY: Record<string, number>;
  boneAngles: Record<string, number>;
  boneScaleX: Record<string, number>;
  boneScaleY: Record<string, number>;
  ikTargetX: Record<string, number>;
  ikTargetY: Record<string, number>;
  ikPoleTargetX: Record<string, number>;
  ikPoleTargetY: Record<string, number>;
  ikInfluence: Record<string, number>;

  unchanged: boolean;
}

export interface BindingsPrev {
  boneX: Record<string, number>;
  boneY: Record<string, number>;
  boneAngles: Record<string, number>;
  boneScaleX: Record<string, number>;
  boneScaleY: Record<string, number>;
  ikTargetX: Record<string, number>;
  ikTargetY: Record<string, number>;
  ikPoleTargetX: Record<string, number>;
  ikPoleTargetY: Record<string, number>;
  ikInfluence: Record<string, number>;
}

export interface BindingBaseValues {
  boneX?: Record<string, number>;
  boneY?: Record<string, number>;
}

export function bindingTargetKey(binding: ParameterBinding): string {
  const t = binding.target;
  if (t.type === "bone") return `bone:${t.boneId}:${t.property}`;
  if (t.type === "ikController")
    return `ikController:${t.controllerId}:${t.property}`;
  return "";
}

export function evaluateBindings(
  parameterBindings: ParameterBinding[] | undefined,
  parameterValues: Record<string, number>,
  project: ProjectData,
  prev: BindingsPrev,
  baseValues: BindingBaseValues = {},
): BindingsResult {
  if (!parameterBindings || parameterBindings.length === 0) {
    return {
      boneX: prev.boneX,
      boneY: prev.boneY,
      boneAngles: prev.boneAngles,
      boneScaleX: prev.boneScaleX,
      boneScaleY: prev.boneScaleY,
      ikTargetX: prev.ikTargetX,
      ikTargetY: prev.ikTargetY,
      ikPoleTargetX: prev.ikPoleTargetX,
      ikPoleTargetY: prev.ikPoleTargetY,
      ikInfluence: prev.ikInfluence,
      unchanged: true,
    };
  }

  const boneX = { ...prev.boneX };
  const boneY = { ...prev.boneY };
  const boneAngles = { ...prev.boneAngles };
  const boneScaleX = { ...prev.boneScaleX };
  const boneScaleY = { ...prev.boneScaleY };
  const ikTargetX = { ...prev.ikTargetX };
  const ikTargetY = { ...prev.ikTargetY };
  const ikPoleTargetX = { ...prev.ikPoleTargetX };
  const ikPoleTargetY = { ...prev.ikPoleTargetY };
  const ikInfluence = { ...prev.ikInfluence };

  const groups = new Map<string, ParameterBinding[]>();
  for (const binding of parameterBindings) {
    const key = bindingTargetKey(binding);
    if (key === "") continue;
    const arr = groups.get(key);
    if (arr) {
      arr.push(binding);
    } else {
      groups.set(key, [binding]);
    }
  }

  for (const [, group] of groups) {
    const target = group[0]!.target;
    if (target.type === "bone") {
      if (target.property === "x") {
        delete boneX[target.boneId];
      } else if (target.property === "y") {
        delete boneY[target.boneId];
      } else if (target.property === "angle") {
        delete boneAngles[target.boneId];
      } else if (target.property === "scaleX") {
        delete boneScaleX[target.boneId];
      } else {
        delete boneScaleY[target.boneId];
      }
    } else if (target.type === "ikController") {
      if (target.property === "targetX") {
        delete ikTargetX[target.controllerId];
      } else if (target.property === "targetY") {
        delete ikTargetY[target.controllerId];
      } else if (target.property === "poleTargetX") {
        delete ikPoleTargetX[target.controllerId];
      } else if (target.property === "poleTargetY") {
        delete ikPoleTargetY[target.controllerId];
      } else {
        delete ikInfluence[target.controllerId];
      }
    }
  }

  for (const [, group] of groups) {
    const target = group[0]!.target;

    if (target.type === "bone") {
      const defaultValue = getBoneBindingDefaultValue(
        target.boneId,
        target.property,
        project.layers,
        baseValues,
      );
      const value = evaluateBindingsAdditive(
        group,
        parameterValues,
        defaultValue,
      );
      if (target.property === "x") {
        boneX[target.boneId] = value;
      } else if (target.property === "y") {
        boneY[target.boneId] = value;
      } else if (target.property === "angle") {
        boneAngles[target.boneId] = value;
      } else if (target.property === "scaleX") {
        boneScaleX[target.boneId] = value;
      } else {
        boneScaleY[target.boneId] = value;
      }
    } else if (target.type === "ikController") {
      const defaultValue = getIKBindingDefaultValue(
        project.ikControllers,
        target.controllerId,
        target.property,
      );
      const value = evaluateBindingsAdditive(
        group,
        parameterValues,
        defaultValue,
      );
      if (target.property === "targetX") {
        ikTargetX[target.controllerId] = value;
      } else if (target.property === "targetY") {
        ikTargetY[target.controllerId] = value;
      } else if (target.property === "poleTargetX") {
        ikPoleTargetX[target.controllerId] = value;
      } else if (target.property === "poleTargetY") {
        ikPoleTargetY[target.controllerId] = value;
      } else {
        ikInfluence[target.controllerId] = Math.max(0, Math.min(1, value));
      }
    }
  }

  return {
    boneX,
    boneY,
    boneAngles,
    boneScaleX,
    boneScaleY,
    ikTargetX,
    ikTargetY,
    ikPoleTargetX,
    ikPoleTargetY,
    ikInfluence,
    unchanged: false,
  };
}

function getBoneBindingDefaultValue(
  boneId: string,
  property: BoneBindingPropertyType,
  projectLayers: LayerNode[],
  baseValues: BindingBaseValues,
): number {
  if (property === "x") {
    return (
      baseValues.boneX?.[boneId] ??
      getBoneLayerValue(projectLayers, boneId, "x", 0)
    );
  }
  if (property === "y") {
    return (
      baseValues.boneY?.[boneId] ??
      getBoneLayerValue(projectLayers, boneId, "y", 0)
    );
  }
  if (property === "angle") return 0;
  return 1;
}

function getBoneLayerValue(
  projectLayers: LayerNode[],
  boneId: string,
  property: "x" | "y",
  fallback: number,
): number {
  const node = findLayerById(projectLayers, boneId);
  if (!node || node.kind !== "bone") return fallback;
  return node[property];
}

function getIKBindingDefaultValue(
  controllers: IKController[] | undefined,
  controllerId: string,
  property: IKControllerBindingPropertyType,
): number {
  const controller = controllers?.find((c) => c.id === controllerId);
  if (!controller) return property === "influence" ? 1 : 0;
  if (property === "targetX") return controller.targetX;
  if (property === "targetY") return controller.targetY;
  if (property === "poleTargetX") return controller.poleTargetX ?? 0;
  if (property === "poleTargetY") return controller.poleTargetY ?? 0;
  return controller.influence;
}

export function applyBoneOverridesToLayers(
  allLayers: LayerNode[],
  boneX: Record<string, number>,
  boneY: Record<string, number>,
  boneAngles: Record<string, number>,
  boneScaleX: Record<string, number>,
  boneScaleY: Record<string, number>,
): void {
  for (const layer of allLayers) {
    if (layer.kind !== "bone") continue;
    const x = boneX[layer.id];
    if (x !== undefined) {
      layer.x = x;
    }
    const y = boneY[layer.id];
    if (y !== undefined) {
      layer.y = y;
    }
    const angle = boneAngles[layer.id];
    if (angle !== undefined) {
      layer.bone.angle = angle;
    }
    const sx = boneScaleX[layer.id];
    if (sx !== undefined) {
      layer.bone.scaleX = sx;
    }
    const sy = boneScaleY[layer.id];
    if (sy !== undefined) {
      layer.bone.scaleY = sy;
    }
  }
}
