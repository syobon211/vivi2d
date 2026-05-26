import { computeBoneWorldTransforms } from "@vivi2d/core/bone-utils";
import { mapIKToParameters, solveIKController } from "@vivi2d/core/ik-solver";
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useParameterStore } from "@/stores/parameterStore";

export function useIK() {
  const rafId = useRef(0);

  useEffect(() => {
    const unsubscribe = useIKRuntimeStore.subscribe((state) => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const project = useEditorStore.getState().project;
        if (!project?.ikControllers?.length) return;

        const worldTransforms = computeBoneWorldTransforms(project.layers);
        const boneLengths = new Map<string, number>();
        for (const layer of flattenBonesFromLayers(project.layers)) {
          if (layer.kind === "bone") {
            boneLengths.set(layer.id, layer.bone.length);
          }
        }

        const paramUpdates: Record<string, number> = {};

        for (const controller of project.ikControllers) {
          if (controller.influence <= 0) continue;

          const rt = state.runtimeTargets.get(controller.id);
          const effectiveController = rt
            ? { ...controller, targetX: rt.x, targetY: rt.y }
            : controller;

          const solution = solveIKController(
            effectiveController,
            worldTransforms,
            boneLengths,
          );

          useIKRuntimeStore.getState().setSolution(controller.id, solution);

          const mapped = mapIKToParameters(effectiveController, solution);
          Object.assign(paramUpdates, mapped);
        }

        if (Object.keys(paramUpdates).length > 0) {
          const store = useParameterStore.getState();
          const merged = { ...store.parameterValues, ...paramUpdates };
          store.setAllValues(merged);
        }
      });
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(rafId.current);
    };
  }, []);
}

export function flattenBonesFromLayers(
  layers: import("@vivi2d/core/types").LayerNode[],
): import("@vivi2d/core/types").LayerNode[] {
  const result: import("@vivi2d/core/types").LayerNode[] = [];
  for (const layer of layers) {
    if (layer.kind === "bone") result.push(layer);
    if ("children" in layer && layer.children) {
      result.push(...flattenBonesFromLayers(layer.children));
    }
  }
  return result;
}
