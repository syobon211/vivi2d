import { findLayerById } from "@vivi2d/core/layer-utils";
import { evaluateBindingsAdditive } from "@vivi2d/core/parameter-binding-eval";
import type {
  BoneBindingPropertyType,
  ParameterBinding,
} from "@vivi2d/core/types";
import { useEffect, useRef } from "react";
import { useBoneStore } from "@/stores/boneStore";
import { useEditorStore } from "@/stores/editorStore";
import { useIKControllerStore } from "@/stores/ikControllerStore";
import { useParameterStore } from "@/stores/parameterStore";

function bindingTargetKey(binding: ParameterBinding): string {
  const t = binding.target;
  if (t.type === "bone") return `bone:${t.boneId}:${t.property}`;
  if (t.type === "ikController")
    return `ikController:${t.controllerId}:${t.property}`;
  return "";
}

export function useParameterBinding() {
  const parameterValues = useParameterStore((s) => s.parameterValues);
  const prevValuesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (prevValuesRef.current === parameterValues) return;
    prevValuesRef.current = parameterValues;

    const project = useEditorStore.getState().project;
    if (!project) return;

    const bindings = project.parameterBindings ?? [];
    if (bindings.length === 0) return;

    const groups = new Map<string, ParameterBinding[]>();
    for (const binding of bindings) {
      const key = bindingTargetKey(binding);
      if (key === "") continue;
      const arr = groups.get(key);
      if (arr) {
        arr.push(binding);
      } else {
        groups.set(key, [binding]);
      }
    }

    const boneStore = useBoneStore.getState();
    const ikStore = useIKControllerStore.getState();

    for (const [_key, group] of groups) {
      const first = group[0]!;
      const target = first.target;

      if (target.type === "bone") {
        const defaultValue = getBonePropertyDefault(
          project.layers,
          target.boneId,
          target.property,
        );
        const value = evaluateBindingsAdditive(
          group,
          parameterValues,
          defaultValue,
        );
        applyBoneProperty(
          project.layers,
          boneStore,
          target.boneId,
          target.property,
          value,
        );
      } else if (target.type === "ikController") {
        const defaultValue = getIKPropertyDefault(
          project.ikControllers,
          target.controllerId,
          target.property,
        );
        const value = evaluateBindingsAdditive(
          group,
          parameterValues,
          defaultValue,
        );
        applyIKControllerProperty(
          ikStore,
          target.controllerId,
          target.property,
          value,
        );
      }
    }
  }, [parameterValues]);
}

function getBonePropertyDefault(
  layers: import("@vivi2d/core/types").LayerNode[],
  boneId: string,
  property: BoneBindingPropertyType,
): number {
  const node = findLayerById(layers, boneId);
  switch (property) {
    case "x":
      return node?.kind === "bone" ? node.x : 0;
    case "y":
      return node?.kind === "bone" ? node.y : 0;
    case "angle":
      return 0;
    case "scaleX":
    case "scaleY":
      return 1;
  }
}

function applyBoneProperty(
  layers: import("@vivi2d/core/types").LayerNode[],
  boneStore: ReturnType<typeof useBoneStore.getState>,
  boneId: string,
  property: BoneBindingPropertyType,
  value: number,
): void {
  const node = findLayerById(layers, boneId);
  if (!node || node.kind !== "bone") return;

  switch (property) {
    case "x":
      boneStore.setBonePosition(boneId, value, node.y);
      break;
    case "y":
      boneStore.setBonePosition(boneId, node.x, value);
      break;
    case "angle":
      boneStore.setBoneAngle(boneId, value);
      break;
    case "scaleX":
      boneStore.setBoneScale(boneId, value, node.bone.scaleY);
      break;
    case "scaleY":
      boneStore.setBoneScale(boneId, node.bone.scaleX, value);
      break;
  }
}

function getIKPropertyDefault(
  controllers: import("@vivi2d/core/types").IKController[] | undefined,
  controllerId: string,
  property: import("@vivi2d/core/types").IKControllerBindingPropertyType,
): number {
  const controller = controllers?.find((c) => c.id === controllerId);
  if (!controller) return property === "influence" ? 1 : 0;
  if (property === "targetX") return controller.targetX;
  if (property === "targetY") return controller.targetY;
  if (property === "poleTargetX") return controller.poleTargetX ?? 0;
  if (property === "poleTargetY") return controller.poleTargetY ?? 0;
  return controller.influence;
}

function applyIKControllerProperty(
  ikStore: ReturnType<typeof useIKControllerStore.getState>,
  controllerId: string,
  property: import("@vivi2d/core/types").IKControllerBindingPropertyType,
  value: number,
): void {
  const project = useEditorStore.getState().project;
  const controller = project?.ikControllers?.find((c) => c.id === controllerId);
  if (!controller) return;

  if (property === "targetX") {
    ikStore.setTarget(controllerId, value, controller.targetY);
  } else if (property === "targetY") {
    ikStore.setTarget(controllerId, controller.targetX, value);
  } else if (property === "poleTargetX") {
    ikStore.setPoleTarget(controllerId, value, controller.poleTargetY ?? 0);
  } else if (property === "poleTargetY") {
    ikStore.setPoleTarget(controllerId, controller.poleTargetX ?? 0, value);
  } else {
    ikStore.setInfluence(controllerId, Math.max(0, Math.min(1, value)));
  }
}
