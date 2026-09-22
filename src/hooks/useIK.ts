import { computeBoneWorldTransforms } from "@vivi2d/core/bone-utils";
import {
  type IKSolution,
  mapIKToParameters,
  solveIKController,
} from "@vivi2d/core/ik-solver";
import type { ProjectData } from "@vivi2d/core/types";
import { useEffect, useRef } from "react";
import { projectV11DisplayProjection } from "@/lib/project-v11-display-projection";
import { isProjectV11Publishing, publishProjectV11 } from "@/lib/project-v11-publishing";
import { useEditorStore } from "@/stores/editorStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useParameterStore } from "@/stores/parameterStore";

type V11Input = {
  project: ProjectData;
  carrier: NonNullable<
    ReturnType<typeof useEditorStore.getState>["projectV11"]
  >["carrier"];
  parameters: Record<string, number>;
  targets: ReturnType<typeof useIKRuntimeStore.getState>["runtimeTargets"];
};

function currentV11Input(): V11Input | null {
  const editor = useEditorStore.getState();
  return editor.project && editor.projectV11
    ? {
        project: editor.project,
        carrier: editor.projectV11.carrier,
        parameters: useParameterStore.getState().parameterValues,
        targets: useIKRuntimeStore.getState().runtimeTargets,
      }
    : null;
}

function sameV11Input(a: V11Input, b: V11Input | null): boolean {
  return (
    !!b &&
    a.project === b.project &&
    a.carrier === b.carrier &&
    a.parameters === b.parameters &&
    a.targets === b.targets
  );
}

function finite(values: Iterable<number>): void {
  for (const value of values)
    if (!Number.isFinite(value)) throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
}

function prepareV11IK(input: V11Input) {
  const project = projectV11DisplayProjection(input.project, input.parameters);
  const lengths = new Map<string, number>();
  for (const layer of flattenBonesFromLayers(project.layers)) {
    if (layer.kind !== "bone") continue;
    finite([
      layer.x,
      layer.y,
      layer.bone.angle,
      layer.bone.scaleX,
      layer.bone.scaleY,
      layer.bone.length,
    ]);
    lengths.set(layer.id, layer.bone.length);
  }
  const transforms = computeBoneWorldTransforms(project.layers);
  for (const matrix of transforms.values()) finite(matrix);
  const solutions = new Map<string, IKSolution>(),
    mapped: Record<string, number> = Object.create(null);
  for (const controller of project.ikControllers ?? []) {
    finite([controller.influence]);
    if (controller.influence <= 0) continue;
    const target = input.targets.get(controller.id);
    if (target) finite([target.x, target.y]);
    const effective = target
      ? { ...controller, targetX: target.x, targetY: target.y }
      : controller;
    finite([effective.targetX, effective.targetY, effective.maxIterations ?? 10]);
    if (effective.poleTargetX !== undefined) finite([effective.poleTargetX]);
    if (effective.poleTargetY !== undefined) finite([effective.poleTargetY]);
    for (const bone of effective.boneChain) finite([bone.minAngle, bone.maxAngle]);
    for (const mapping of effective.parameterMappings)
      finite([mapping.angleMin, mapping.angleMax, mapping.paramMin, mapping.paramMax]);
    const solution = solveIKController(effective, transforms, lengths);
    finite(solution.solvedAngles.values());
    solutions.set(effective.id, solution);
    const values = mapIKToParameters(effective, solution);
    finite(Object.values(values));
    Object.assign(mapped, values); // Preserve controller/mapping order: last wins.
  }
  const changed = Object.entries(mapped).some(
    ([id, value]) => !Object.is(input.parameters[id], value),
  );
  return {
    solutions,
    parameters: changed ? { ...input.parameters, ...mapped } : input.parameters,
  };
}

/** Exactly two ephemeral fields, using the same fixed guard as project commits. */
function publishV11IK(
  input: V11Input,
  oldSolutions: Map<string, IKSolution>,
  next: ReturnType<typeof prepareV11IK>,
  rememberOwn: (parameters: Record<string, number>) => void,
): void {
  publishProjectV11(() => {
    if (
      !sameV11Input(input, currentV11Input()) ||
      useIKRuntimeStore.getState().solutions !== oldSolutions
    )
      return;
    let ikStarted = false,
      parametersStarted = false;
    const check = (parameters: Record<string, number>) => {
      if (
        !sameV11Input({ ...input, parameters }, currentV11Input()) ||
        useIKRuntimeStore.getState().solutions !== next.solutions
      )
        throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
    };
    try {
      ikStarted = true;
      useIKRuntimeStore.setState({ solutions: next.solutions });
      check(input.parameters);
      if (next.parameters !== input.parameters) {
        parametersStarted = true;
        useParameterStore.setState({ parameterValues: next.parameters });
        check(next.parameters);
        rememberOwn(useParameterStore.getState().parameterValues);
      }
    } catch {
      // The setter may already have installed its field when a subscriber throws.
      // Never overwrite a genuinely newer trusted raw replacement.
      try {
        if (
          parametersStarted &&
          useParameterStore.getState().parameterValues === next.parameters
        )
          useParameterStore.setState({ parameterValues: input.parameters });
      } catch {
        /* Continue independent IK restoration. */
      }
      try {
        if (ikStarted && useIKRuntimeStore.getState().solutions === next.solutions)
          useIKRuntimeStore.setState({ solutions: oldSolutions });
      } catch {
        /* Installed references, not subscriber side effects, are restored. */
      }
      throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
    }
  });
}

export function useIK() {
  const rafId = useRef(0);
  const pending = useRef<"legacy" | "v11" | null>(null);
  const observed = useRef<V11Input | null>(null);
  const ownParameters = useRef<Record<string, number> | null>(null);
  const project = useEditorStore((state) => state.project);
  const carrier = useEditorStore((state) => state.projectV11?.carrier);
  const parameters = useParameterStore((state) => state.parameterValues);
  const targets = useIKRuntimeStore((state) => state.runtimeTargets);

  useEffect(() => {
    if (isProjectV11Publishing()) return;
    const input = currentV11Input(),
      before = observed.current;
    if (!input) {
      observed.current = null;
      ownParameters.current = null;
      if (pending.current === "v11") cancelAnimationFrame(rafId.current);
      return;
    }
    if (!before || before.carrier !== input.carrier) ownParameters.current = null;
    const parameterChanged = !before || before.parameters !== input.parameters;
    const parameterTrigger =
      parameterChanged && input.parameters !== ownParameters.current;
    if (parameterTrigger) ownParameters.current = null;
    observed.current = input;
    if (
      before &&
      before.project === input.project &&
      before.carrier === input.carrier &&
      before.targets === input.targets &&
      !parameterTrigger
    )
      return;
    cancelAnimationFrame(rafId.current);
    pending.current = "v11";
    rafId.current = requestAnimationFrame(() => {
      pending.current = null;
      if (isProjectV11Publishing() || !sameV11Input(input, currentV11Input())) return;
      const oldSolutions = useIKRuntimeStore.getState().solutions;
      try {
        const next = prepareV11IK(input);
        publishV11IK(input, oldSolutions, next, (value) => {
          ownParameters.current = value;
        });
      } catch {
        try {
          useNotificationStore
            .getState()
            .addNotification("warning", "Project display is unavailable.");
        } catch {
          /* Only the fixed failure message is exposed. */
        }
      }
    });
  }, [project, carrier, parameters, targets]);

  useEffect(() => {
    const unsubscribe = useIKRuntimeStore.subscribe((state) => {
      // Legacy keeps its existing notification-driven path; solutions-only v11
      // notifications must not cancel or schedule the post-publication RAF.
      if (useEditorStore.getState().projectV11) return;
      cancelAnimationFrame(rafId.current);
      if (isProjectV11Publishing()) return;
      const captured = useEditorStore.getState();
      const targets = state.runtimeTargets;
      pending.current = "legacy";
      rafId.current = requestAnimationFrame(() => {
        pending.current = null;
        if (isProjectV11Publishing()) return;
        const current = useEditorStore.getState();
        if (
          current.project !== captured.project ||
          current.projectV11?.carrier !== captured.projectV11?.carrier ||
          useIKRuntimeStore.getState().runtimeTargets !== targets
        )
          return;
        const project = useEditorStore.getState().project;
        if (!project?.ikControllers?.length) return;

        const worldTransforms = computeBoneWorldTransforms(project.layers);
        const boneLengths = new Map<string, number>();
        for (const layer of flattenBonesFromLayers(project.layers)) {
          if (layer.kind === "bone") {
            boneLengths.set(layer.id, layer.bone.length);
          }
        }

        const paramUpdates: Record<string, number> = Object.create(null);

        for (const controller of project.ikControllers) {
          if (controller.influence <= 0) continue;

          const rt = useIKRuntimeStore.getState().runtimeTargets.get(controller.id);
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
