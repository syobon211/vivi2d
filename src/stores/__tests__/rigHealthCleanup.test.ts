import { describe, expect, it, beforeEach } from "vitest";
import type { ParameterBinding } from "@vivi2d/core/types";
import {
  getAnimationTrackCleanupPlan,
  getParameterBindingCleanupPlan,
  getSceneBlendCleanupPlan,
  getStateMachineCleanupPlan,
  runAnimationTrackCleanup,
  runParameterBindingCleanup,
  runSceneBlendCleanup,
  runStateMachineCleanup,
} from "@/stores/rigHealthCleanup";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import {
  createAnimationClip,
  createBoneNode,
  createProject,
  createViviMesh,
} from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("rigHealthCleanup store actions", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("returns null plans and performs no side effects without a project", () => {
    expect(getParameterBindingCleanupPlan()).toBeNull();
    expect(getStateMachineCleanupPlan()).toBeNull();
    expect(getSceneBlendCleanupPlan()).toBeNull();
    expect(getAnimationTrackCleanupPlan()).toBeNull();

    runParameterBindingCleanup();
    runStateMachineCleanup();
    runSceneBlendCleanup();
    runAnimationTrackCleanup();

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(useWorkspaceModeStore.getState().mode).toBe("default");
  });

  it("cleans parameter bindings and focuses the affected layer", () => {
    const bone = createBoneNode({ id: "bone-a", name: "Bone A" });
    const badBinding: ParameterBinding = {
      id: "bad-binding",
      parameterId: "missing-parameter",
      target: { type: "bone", boneId: "bone-a", property: "angle" },
      bindingPoints: [{ paramValue: 0, targetValue: 0 }],
    };
    const project = createProject({
      layers: [bone],
      parameterBindings: [badBinding],
    });
    useEditorStore.setState({ project });
    useWorkspaceModeStore.getState().setMode("animation");

    runParameterBindingCleanup();

    expect(useEditorStore.getState().project?.parameterBindings).toEqual([]);
    expect(useWorkspaceModeStore.getState().mode).toBe("default");
    expect(useSelectionStore.getState().selectedLayerId).toBe("bone-a");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("keeps selection unchanged when cleaned parameter bindings have no focusable layer", () => {
    const badBinding: ParameterBinding = {
      id: "bad-binding",
      parameterId: "param-a",
      target: { type: "bone", boneId: "missing-bone", property: "angle" },
      bindingPoints: [{ paramValue: 0, targetValue: 0 }],
    };
    const project = createProject({
      layers: [],
      parameters: [
        { id: "param-a", name: "Param A", minValue: 0, maxValue: 1, defaultValue: 0 },
      ],
      parameterBindings: [badBinding],
    });
    useEditorStore.setState({ project });

    runParameterBindingCleanup();

    expect(useEditorStore.getState().project?.parameterBindings).toEqual([]);
    expect(useSelectionStore.getState().selectedLayerId).toBeNull();
  });

  it("does nothing when a project has no parameter binding cleanup work", () => {
    const project = createProject({ parameterBindings: [] });
    useEditorStore.setState({ project });
    useWorkspaceModeStore.getState().setMode("animation");

    runParameterBindingCleanup();

    expect(useWorkspaceModeStore.getState().mode).toBe("animation");
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("cleans state machines and switches to animation mode", () => {
    const project = createProject({
      parameters: [
        { id: "param-a", name: "Param A", minValue: 0, maxValue: 1, defaultValue: 0 },
      ],
      clips: [createAnimationClip({ id: "clip-a" })],
      stateMachines: [
        {
          id: "machine-a",
          name: "Machine A",
          initialStateId: "missing-state",
          states: [{ id: "state-a", name: "State A", clipId: "missing-clip" }],
          transitions: [
            {
              id: "transition-a",
              fromStateId: "state-a",
              toStateId: "state-a",
              conditions: [
                { parameterId: "param-a", operator: ">", value: 0.5 },
                { parameterId: "missing-param", operator: "<", value: 0.2 },
              ],
            },
          ],
        },
      ] as any,
    });
    useEditorStore.setState({ project });

    runStateMachineCleanup();

    const machine = useEditorStore.getState().project?.stateMachines?.[0]!;
    expect(machine.initialStateId).toBe("state-a");
    expect(machine.states[0]!.clipId).toBeUndefined();
    expect(machine.transitions[0]!.conditions).toEqual([
      { parameterId: "param-a", operator: ">", value: 0.5 },
    ]);
    expect(useWorkspaceModeStore.getState().mode).toBe("animation");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("cleans scene blends and switches back to default mode", () => {
    const project = createProject({
      scenes: [
        { id: "scene-a", name: "Scene A", clips: [] },
        { id: "scene-b", name: "Scene B", clips: [] },
      ],
      sceneBlends: [
        {
          id: "blend-missing",
          name: "Missing",
          sourceSceneId: "missing-scene",
          targetSceneId: "scene-b",
          transitionFrames: 12,
          mode: "crossfade",
        },
        {
          id: "blend-duration",
          name: "Duration",
          sourceSceneId: "scene-a",
          targetSceneId: "scene-b",
          transitionFrames: 0,
          mode: "crossfade",
        },
      ] as any,
    });
    useEditorStore.setState({ project });
    useWorkspaceModeStore.getState().setMode("animation");

    runSceneBlendCleanup();

    expect(useEditorStore.getState().project?.sceneBlends).toMatchObject([
      { id: "blend-duration", transitionFrames: 30 },
    ]);
    expect(useWorkspaceModeStore.getState().mode).toBe("default");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("cleans animation tracks, activates the first affected clip, and switches modes", () => {
    const bone = createBoneNode({ id: "bone-a" });
    const mesh = createViviMesh({ id: "mesh-a" });
    const project = createProject({
      layers: [bone, mesh],
      parameters: [
        { id: "param-a", name: "Param A", minValue: 0, maxValue: 1, defaultValue: 0 },
      ],
      clips: [
        createAnimationClip({
          id: "clip-a",
          tracks: [
            { parameterId: "param-a", keyframes: [] },
            { parameterId: "missing-param", keyframes: [] },
          ],
          boneTracks: [
            { boneId: "bone-a", property: "angle", keyframes: [] },
            { boneId: "missing-bone", property: "x", keyframes: [] },
          ],
          imageSequenceTracks: [
            { id: "image-missing", targetMeshId: "missing-mesh", frames: [] },
          ],
        } as any),
      ],
    });
    useEditorStore.setState({ project });

    runAnimationTrackCleanup();

    const clip = useEditorStore.getState().project?.clips[0]!;
    expect(clip.tracks).toEqual([{ parameterId: "param-a", keyframes: [] }]);
    expect(clip.boneTracks).toEqual([
      { boneId: "bone-a", property: "angle", keyframes: [] },
    ]);
    expect(clip.imageSequenceTracks).toEqual([]);
    expect(useTimelineStore.getState().activeClipId).toBe("clip-a");
    expect(useWorkspaceModeStore.getState().mode).toBe("animation");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });
});
