import { describe, expect, it } from "vitest";
import type { ProjectData } from "@vivi2d/core/types";
import {
  applyAnimationTrackCleanup,
  applyParameterBindingCleanup,
  applySceneBlendCleanup,
  applyStateMachineCleanup,
  planAnimationTrackCleanup,
  planParameterBindingCleanup,
  planSceneBlendCleanup,
  planStateMachineCleanup,
} from "@vivi2d/editor-core/rig-health-workflow-cleanup";
import {
  createAnimationClip,
  createBoneNode,
  createEmptyProject,
  createIKController,
  createViviMesh,
} from "@/test/fixtures";

function createCleanupProject(): ProjectData {
  const bone = createBoneNode({ id: "bone-1", name: "Root bone" });
  const mesh = createViviMesh({ id: "mesh-1", name: "Body" });
  return {
    ...createEmptyProject(),
    layers: [bone, mesh],
    parameters: [
      { id: "param-1", name: "Param 1", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "param-2", name: "Param 2", minValue: -1, maxValue: 1, defaultValue: 0 },
    ],
    ikControllers: [createIKController({ id: "ik-1", name: "IK" })],
    clips: [
      createAnimationClip({
        id: "clip-1",
        name: "Clip 1",
        tracks: [
          { parameterId: "param-1", keyframes: [] },
          { parameterId: "missing-param", keyframes: [] },
        ],
        boneTracks: [
          { boneId: "bone-1", property: "angle", keyframes: [] },
          { boneId: "missing-bone", property: "x", keyframes: [] },
        ],
        imageSequenceTracks: [
          { id: "image-ok", targetMeshId: "mesh-1", frames: [] },
          { id: "image-missing", targetMeshId: "missing-mesh", frames: [] },
        ],
        ikControllerTracks: [
          { controllerId: "ik-1", property: "targetX", keyframes: [] },
          { controllerId: "missing-ik", property: "targetY", keyframes: [] },
        ],
        audioTracks: [{ id: "audio-1", name: "Voice", startFrame: 0, volume: 1 }],
        lipSyncTracks: [
          {
            id: "lip-ok",
            name: "Lip ok",
            sourceAudioTrackId: "audio-1",
            analysisType: "rms",
            analysisFps: 30,
            samples: [0.5],
            targetParameterId: "param-1",
            sourcePathAtBake: "voice.wav",
            sourceDurationSecondsAtBake: 1,
            gain: 1,
            muted: false,
          },
          {
            id: "lip-missing-audio",
            name: "Lip missing audio",
            sourceAudioTrackId: "missing-audio",
            analysisType: "rms",
            analysisFps: 30,
            samples: [0.5],
            targetParameterId: "param-1",
            sourcePathAtBake: "voice.wav",
            sourceDurationSecondsAtBake: 1,
            gain: 1,
            muted: false,
          },
          {
            id: "lip-missing-param",
            name: "Lip missing param",
            sourceAudioTrackId: "audio-1",
            analysisType: "rms",
            analysisFps: 30,
            samples: [0.5],
            targetParameterId: "missing-param",
            sourcePathAtBake: "voice.wav",
            sourceDurationSecondsAtBake: 1,
            gain: 1,
            muted: false,
          },
        ],
      } as any),
    ],
    scenes: [
      {
        id: "scene-1",
        name: "Scene 1",
        clips: [
          createAnimationClip({
            id: "scene-clip",
            tracks: [{ parameterId: "missing-param", keyframes: [] }],
          }),
        ],
      },
      { id: "scene-2", name: "Scene 2", clips: [] },
    ],
    parameterBindings: [
      {
        id: "binding-ok",
        parameterId: "param-1",
        target: { type: "bone", boneId: "bone-1", property: "angle" },
        bindingPoints: [{ paramValue: 0, targetValue: 0 }],
      },
      {
        id: "binding-missing-param",
        parameterId: "missing-param",
        target: { type: "bone", boneId: "bone-1", property: "angle" },
        bindingPoints: [{ paramValue: 0, targetValue: 0 }],
      },
      {
        id: "binding-missing-target",
        parameterId: "param-1",
        target: { type: "ikController", controllerId: "missing-ik", property: "targetX" },
        bindingPoints: [{ paramValue: 0, targetValue: 0 }],
      },
      {
        id: "binding-empty",
        parameterId: "param-2",
        target: { type: "ikController", controllerId: "ik-1", property: "targetY" },
        bindingPoints: [],
      },
    ] as any,
    stateMachines: [
      {
        id: "machine-1",
        name: "Machine",
        initialStateId: "missing-state",
        states: [
          {
            id: "state-1",
            name: "Idle",
            clipId: "missing-clip",
            blendTree: {
              parameterId: "param-1",
              entries: [
                { clipId: "clip-1", value: 0 },
                { clipId: "missing-clip", value: 1 },
              ],
            },
          },
          {
            id: "state-2",
            name: "Broken blend",
            blendTree: {
              parameterId: "missing-param",
              entries: [{ clipId: "clip-1", value: 0 }],
            },
          },
        ],
        transitions: [
          {
            id: "transition-remove",
            fromStateId: "state-1",
            toStateId: "missing-state",
            conditions: [],
          },
          {
            id: "transition-prune",
            fromStateId: "state-1",
            toStateId: "state-2",
            conditions: [
              { parameterId: "param-1", operator: ">", value: 0.5 },
              { parameterId: "missing-param", operator: "<", value: 0.2 },
            ],
          },
        ],
      },
    ] as any,
    sceneBlends: [
      {
        id: "blend-ok",
        name: "OK",
        sourceSceneId: "scene-1",
        targetSceneId: "scene-2",
        transitionFrames: 12,
        mode: "crossfade",
      },
      {
        id: "blend-missing",
        name: "Missing",
        sourceSceneId: "missing-scene",
        targetSceneId: "scene-2",
        transitionFrames: 12,
        mode: "crossfade",
      },
      {
        id: "blend-self",
        name: "Self",
        sourceSceneId: "scene-1",
        targetSceneId: "scene-1",
        transitionFrames: 12,
        mode: "crossfade",
      },
      {
        id: "blend-duration",
        name: "Duration",
        sourceSceneId: "scene-1",
        targetSceneId: "scene-2",
        transitionFrames: 0,
        mode: "crossfade",
      },
    ] as any,
  };
}

describe("rig-health workflow cleanup", () => {
  it("returns no-op cleanup plans for an empty project", () => {
    const project = createEmptyProject();
    expect(planParameterBindingCleanup(project).bindingIds).toEqual([]);
    expect(planStateMachineCleanup(project).initialStateFixes).toEqual([]);
    expect(planSceneBlendCleanup(project).removedBlendIds).toEqual([]);
    expect(planAnimationTrackCleanup(project).clipTargets).toEqual([]);
  });

  it("plans and removes invalid parameter bindings", () => {
    const project = createCleanupProject();
    const plan = planParameterBindingCleanup(project);

    expect(plan).toMatchObject({
      bindingIds: ["binding-missing-param", "binding-missing-target", "binding-empty"],
      removedMissingParameterCount: 1,
      removedMissingTargetCount: 1,
      removedEmptyBindingCount: 1,
    });

    applyParameterBindingCleanup(project, plan);
    expect(project.parameterBindings?.map((binding) => binding.id)).toEqual([
      "binding-ok",
    ]);
  });

  it("repairs state machines with invalid state, clip, blend-tree, and condition references", () => {
    const project = createCleanupProject();
    const plan = planStateMachineCleanup(project);

    expect(plan.initialStateFixes).toEqual([
      { machineId: "machine-1", nextStateId: "state-1" },
    ]);
    expect(plan.clearedStateClipRefs).toEqual([
      { machineId: "machine-1", stateId: "state-1" },
    ]);
    expect(plan.removedTransitions).toEqual([
      { machineId: "machine-1", transitionId: "transition-remove" },
    ]);
    expect(plan.removedConditions).toEqual([
      { machineId: "machine-1", transitionId: "transition-prune", indices: [1] },
    ]);
    expect(plan.clearedBlendTreeCount).toBe(1);
    expect(plan.prunedBlendTreeEntryCount).toBe(1);

    applyStateMachineCleanup(project, plan);
    const machine = project.stateMachines![0]!;
    expect(machine.initialStateId).toBe("state-1");
    expect(machine.states[0]!.clipId).toBeUndefined();
    expect(machine.states[0]!.blendTree?.entries).toEqual([{ clipId: "clip-1", value: 0 }]);
    expect(machine.states[1]!.blendTree).toBeUndefined();
    expect(machine.transitions.map((transition) => transition.id)).toEqual([
      "transition-prune",
    ]);
    expect(machine.transitions[0]!.conditions).toEqual([
      { parameterId: "param-1", operator: ">", value: 0.5 },
    ]);
  });

  it("removes invalid scene blends and normalizes invalid transition durations", () => {
    const project = createCleanupProject();
    const plan = planSceneBlendCleanup(project);

    expect(plan.removedBlendIds).toEqual(["blend-missing", "blend-self"]);
    expect(plan.normalizedDurationBlendIds).toEqual(["blend-duration"]);

    applySceneBlendCleanup(project, plan);
    expect(project.sceneBlends?.map((blend) => [blend.id, blend.transitionFrames])).toEqual([
      ["blend-ok", 12],
      ["blend-duration", 30],
    ]);
  });

  it("removes invalid animation tracks across root clips and scene clips", () => {
    const project = createCleanupProject();
    const plan = planAnimationTrackCleanup(project);

    expect(plan).toMatchObject({
      removedParameterTrackCount: 2,
      removedBoneTrackCount: 1,
      removedImageSequenceTrackCount: 1,
      removedIkControllerTrackCount: 1,
      removedLipSyncTrackCount: 1,
      clearedLipSyncParameterTargetCount: 1,
    });
    expect(plan.clipTargets.map((target) => target.clipId)).toEqual([
      "clip-1",
      "scene-clip",
    ]);

    applyAnimationTrackCleanup(project, plan);
    const clip = project.clips[0]!;
    expect(clip.tracks.map((track) => track.parameterId)).toEqual(["param-1"]);
    expect(clip.boneTracks?.map((track) => track.boneId)).toEqual(["bone-1"]);
    expect(clip.imageSequenceTracks?.map((track) => track.targetMeshId)).toEqual([
      "mesh-1",
    ]);
    expect(clip.ikControllerTracks?.map((track) => track.controllerId)).toEqual([
      "ik-1",
    ]);
    expect(clip.lipSyncTracks?.map((track) => [track.id, track.targetParameterId])).toEqual([
      ["lip-ok", "param-1"],
      ["lip-missing-param", null],
    ]);
    expect(project.scenes[0]!.clips[0]!.tracks).toEqual([]);
  });
});
