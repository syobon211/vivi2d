import { findLayerById } from "@vivi2d/core/layer-utils";
import { evaluateBindingsAdditive } from "@vivi2d/core/parameter-binding-eval";
import type {
  BoneBindingPropertyType,
  IKController,
  IKControllerBindingPropertyType,
  LayerNode,
  ParameterBinding,
  ProjectData,
} from "@vivi2d/core/types";

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
  return value;
}

/** Ephemeral display input only: never serialize, adopt or put this projection
 * in history. Geometry, atlas data and all unbound fields remain borrowed. */
export function projectV11DisplayProjection(
  project: ProjectData,
  parameterValues: Record<string, number>,
): ProjectData {
  const groups = new Map<string, ParameterBinding[]>();
  for (const binding of project.parameterBindings ?? []) {
    const target = binding.target;
    const key =
      target.type === "bone"
        ? `bone:${target.boneId}:${target.property}`
        : `ikController:${target.controllerId}:${target.property}`;
    const group = groups.get(key);
    if (group) group.push(binding);
    else groups.set(key, [binding]);
  }
  if (!groups.size) return project;

  const bones = new Map<string, Partial<Record<BoneBindingPropertyType, number>>>();
  const controllers = new Map<
    string,
    Partial<Record<IKControllerBindingPropertyType, number>>
  >();
  // Every default comes from the same authored source. Paired setters must not
  // repeatedly read an old coordinate after the other coordinate was applied.
  for (const group of groups.values()) {
    const target = group[0]!.target;
    let defaultValue: number;
    if (target.type === "bone") {
      const node = findLayerById(project.layers, target.boneId);
      if (node?.kind !== "bone") throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
      defaultValue =
        target.property === "x" || target.property === "y"
          ? node[target.property]
          : target.property === "angle"
            ? 0
            : 1;
    } else {
      const controller = project.ikControllers?.find(
        (entry) => entry.id === target.controllerId,
      );
      if (!controller) throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
      defaultValue = controller[target.property] ?? 0;
    }
    finite(defaultValue);
    for (const binding of group) {
      const value = parameterValues[binding.parameterId];
      finite(value === undefined ? 0 : value);
      for (const point of binding.bindingPoints) {
        finite(point.paramValue);
        finite(point.targetValue);
      }
    }
    const value = finite(evaluateBindingsAdditive(group, parameterValues, defaultValue));
    if (target.type === "bone") {
      const values = bones.get(target.boneId) ?? {};
      values[target.property] = value;
      bones.set(target.boneId, values);
    } else {
      const values = controllers.get(target.controllerId) ?? {};
      values[target.property] =
        target.property === "influence" ? Math.max(0, Math.min(1, value)) : value;
      controllers.set(target.controllerId, values);
    }
  }

  const projectLayer = (node: LayerNode): LayerNode => {
    let next = node;
    if ("children" in node && node.children) {
      const children = node.children.map(projectLayer);
      if (children.some((child, index) => child !== node.children![index]))
        next = { ...node, children };
    }
    const values = bones.get(node.id);
    if (next.kind === "bone" && values) {
      const { x, y, ...boneValues } = values;
      next = {
        ...next,
        ...(x === undefined ? {} : { x }),
        ...(y === undefined ? {} : { y }),
        bone: { ...next.bone, ...boneValues },
      };
    }
    return next;
  };
  const layers = project.layers.map(projectLayer);
  const ikControllers = project.ikControllers?.map((controller): IKController => {
    const values = controllers.get(controller.id);
    return values ? { ...controller, ...values } : controller;
  });
  return {
    ...project,
    layers,
    ...(ikControllers === undefined ? {} : { ikControllers }),
  };
}
