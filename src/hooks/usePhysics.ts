import {
  computeInputForces,
  computeOutputValues,
  type PhysicsOutputResult,
  runPhysicsFrame,
} from "@vivi2d/core/physics-engine";
import { useEffect, useRef } from "react";
import { useBoneStore } from "@/stores/boneStore";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { useTimelineStore } from "@/stores/timelineStore";

export function usePhysics() {
  const isActive = usePhysicsStore((s) => s.isActive);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const project = useEditorStore((s) => s.project);
  const _projectVersion = useEditorStore((s) => s.projectVersion);
  const rafId = useRef(0);
  const lastTime = useRef(0);

  useEffect(() => {
    if (!project) return;
    usePhysicsStore.getState().initialize(project.physicsGroups);
  }, [project]);

  useEffect(() => {
    if (!isActive || isPlaying || !project) return;

    lastTime.current = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime.current) / 1000, 0.1);
      lastTime.current = now;

      stepAllPhysics(dt);

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [isActive, isPlaying, project]);
}

export function stepAllPhysics(deltaTime: number): PhysicsOutputResult {
  const empty: PhysicsOutputResult = { parameters: {}, bones: {} };
  const project = useEditorStore.getState().project;
  if (!project || project.physicsGroups.length === 0) return empty;

  const physicsState = usePhysicsStore.getState();
  if (!physicsState.isActive) return empty;

  const currentParamValues = useParameterStore.getState().parameterValues;
  const allParamOutputs: Record<string, number> = {};
  const allBoneOutputs: Record<string, number> = {};

  for (const group of project.physicsGroups) {
    if (!group.enabled) continue;

    const states = physicsState.runtimeStates[group.id];
    if (!states) continue;

    const forces = computeInputForces(
      group.inputs,
      currentParamValues,
      physicsState.previousParamValues,
    );

    const acc = physicsState.accumulators[group.id] ?? 0;
    const newAcc = runPhysicsFrame(group, states, forces, deltaTime, acc);
    physicsState.accumulators[group.id] = newAcc;

    const result = computeOutputValues(group.outputs, states, project.parameters);
    Object.assign(allParamOutputs, result.parameters);
    Object.assign(allBoneOutputs, result.bones);
  }

  physicsState.snapshotParamValues(currentParamValues);

  const isPlaying = useTimelineStore.getState().isPlaying;
  if (!isPlaying) {
    if (Object.keys(allParamOutputs).length > 0) {
      const merged = { ...currentParamValues, ...allParamOutputs };
      useParameterStore.getState().setAllValues(merged);
    }
    if (Object.keys(allBoneOutputs).length > 0) {
      const boneStore = useBoneStore.getState();
      for (const [boneId, angle] of Object.entries(allBoneOutputs)) {
        boneStore.setBoneAngle(boneId, angle);
      }
    }
  }

  return { parameters: allParamOutputs, bones: allBoneOutputs };
}
