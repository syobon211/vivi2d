import type {
  AnimationClip,
  AnimationStateMachine,
  BoneNode,
  ProjectData,
  SceneBlend,
} from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  applyAnimationTrackCleanup,
  applyParameterBindingCleanup,
  applySceneBlendCleanup,
  applyStateMachineCleanup,
  planAnimationTrackCleanup,
  planParameterBindingCleanup,
  planSceneBlendCleanup,
  planStateMachineCleanup,
} from "../rig-health-workflow-cleanup";
import { createProject, createViviMesh } from "./fixtures";

function createBone(id: string): BoneNode {
  return {
    id,
    name: id,
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    bone: { angle: 0, length: 10, scaleX: 1, scaleY: 1 },
  };
}

function createClip(id: string, overrides: Partial<AnimationClip> = {}): AnimationClip {
  return {
    id,
    name: id,
    duration: 60,
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

describe("rig health workflow cleanup", () => {
  it("plans and applies parameter binding cleanup without touching valid bindings", () => {
    const project = createProject({
      layers: [createBone("bone-valid")],
      parameters: [
        { id: "param-valid", name: "Valid", minValue: -1, maxValue: 1, defaultValue: 0 },
      ],
      ikControllers: [
        {
          id: "ik-valid",
          name: "IK",
          solverType: "ccd",
          boneChain: [{ boneId: "bone-valid", minAngle: -1, maxAngle: 1 }],
          targetX: 0,
          targetY: 0,
          influence: 1,
          parameterMappings: [],
        },
      ],
      parameterBindings: [
        {
          id: "valid-bone",
          parameterId: "param-valid",
          target: { type: "bone", boneId: "bone-valid", property: "angle" },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
        {
          id: "missing-param",
          parameterId: "param-missing",
          target: { type: "bone", boneId: "bone-valid", property: "angle" },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
        {
          id: "missing-bone",
          parameterId: "param-valid",
          target: { type: "bone", boneId: "bone-missing", property: "angle" },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
        {
          id: "missing-ik",
          parameterId: "param-valid",
          target: { type: "ikController", controllerId: "ik-missing", property: "targetX" },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
        {
          id: "empty",
          parameterId: "param-valid",
          target: { type: "bone", boneId: "bone-valid", property: "angle" },
          bindingPoints: [],
        },
      ],
    });

    const plan = planParameterBindingCleanup(project);

    expect(plan).toMatchObject({
      bindingIds: ["missing-param", "missing-bone", "missing-ik", "empty"],
      removedMissingParameterCount: 1,
      removedMissingTargetCount: 2,
      removedEmptyBindingCount: 1,
    });

    applyParameterBindingCleanup(project, plan);

    expect(project.parameterBindings?.map((binding) => binding.id)).toEqual([
      "valid-bone",
    ]);
  });

  it("preserves wildcard transitions while cleaning broken state machine refs", () => {
    const machine: AnimationStateMachine = {
      id: "machine",
      name: "Machine",
      enabled: true,
      initialStateId: "missing-initial",
      states: [
        { id: "idle", name: "Idle", clipId: "missing-clip", loop: true },
        {
          id: "blend",
          name: "Blend",
          loop: true,
          blendTree: {
            parameterId: "speed",
            entries: [
              { threshold: 0, clipId: "walk" },
              { threshold: 1, clipId: "missing-clip" },
            ],
          },
        },
        {
          id: "bad-blend",
          name: "Bad blend",
          loop: true,
          blendTree: {
            parameterId: "missing-param",
            entries: [{ threshold: 0, clipId: "walk" }],
          },
        },
      ],
      transitions: [
        {
          id: "wildcard-valid",
          fromStateId: "*",
          toStateId: "blend",
          conditions: [{ parameterId: "speed", operator: ">", threshold: 0.2 }],
          transitionDuration: 0.2,
          priority: 1,
        },
        {
          id: "bad-state",
          fromStateId: "missing-state",
          toStateId: "idle",
          conditions: [],
          transitionDuration: 0.2,
          priority: 0,
        },
        {
          id: "bad-condition",
          fromStateId: "idle",
          toStateId: "blend",
          conditions: [
            { parameterId: "speed", operator: ">", threshold: 0.1 },
            { parameterId: "missing-param", operator: "<", threshold: 0.5 },
          ],
          transitionDuration: 0.2,
          priority: 0,
        },
      ],
    };
    const project = createProject({
      parameters: [
        { id: "speed", name: "Speed", minValue: 0, maxValue: 1, defaultValue: 0 },
      ],
      clips: [createClip("walk")],
      stateMachines: [machine],
    });

    const plan = planStateMachineCleanup(project);

    expect(plan.initialStateFixes).toEqual([
      { machineId: "machine", nextStateId: "idle" },
    ]);
    expect(plan.clearedStateClipRefs).toEqual([
      { machineId: "machine", stateId: "idle" },
    ]);
    expect(plan.blendTreeReplacements).toEqual([
      {
        machineId: "machine",
        stateId: "blend",
        blendTree: {
          parameterId: "speed",
          entries: [{ threshold: 0, clipId: "walk" }],
        },
        removedEntryCount: 1,
      },
      {
        machineId: "machine",
        stateId: "bad-blend",
        blendTree: null,
        removedEntryCount: 0,
      },
    ]);
    expect(plan.removedTransitions).toEqual([
      { machineId: "machine", transitionId: "bad-state" },
    ]);
    expect(plan.removedConditions).toEqual([
      { machineId: "machine", transitionId: "bad-condition", indices: [1] },
    ]);

    applyStateMachineCleanup(project, plan);

    expect(project.stateMachines[0]?.initialStateId).toBe("idle");
    expect(project.stateMachines[0]?.states[0]?.clipId).toBeUndefined();
    expect(project.stateMachines[0]?.states[1]?.blendTree?.entries).toEqual([
      { threshold: 0, clipId: "walk" },
    ]);
    expect(project.stateMachines[0]?.states[2]?.blendTree).toBeUndefined();
    expect(project.stateMachines[0]?.transitions.map((transition) => transition.id)).toEqual([
      "wildcard-valid",
      "bad-condition",
    ]);
    expect(project.stateMachines[0]?.transitions[1]?.conditions).toEqual([
      { parameterId: "speed", operator: ">", threshold: 0.1 },
    ]);
  });

  it("removes invalid animation tracks and clears stale lipsync parameter targets", () => {
    const project = createProject({
      layers: [createBone("bone-valid"), createViviMesh({ id: "mesh-valid" })],
      parameters: [
        { id: "param-valid", name: "Valid", minValue: -1, maxValue: 1, defaultValue: 0 },
      ],
      ikControllers: [
        {
          id: "ik-valid",
          name: "IK",
          solverType: "ccd",
          boneChain: [{ boneId: "bone-valid", minAngle: -1, maxAngle: 1 }],
          targetX: 0,
          targetY: 0,
          influence: 1,
          parameterMappings: [],
        },
      ],
      clips: [
        createClip("main", {
          tracks: [
            { parameterId: "param-valid", keyframes: [] },
            { parameterId: "param-missing", keyframes: [] },
          ],
          boneTracks: [
            { boneId: "bone-valid", property: "angle", keyframes: [] },
            { boneId: "bone-missing", property: "angle", keyframes: [] },
          ],
          imageSequenceTracks: [
            { targetMeshId: "mesh-valid", entries: [] },
            { targetMeshId: "mesh-missing", entries: [] },
          ],
          ikControllerTracks: [
            { controllerId: "ik-valid", targetXKeyframes: [], targetYKeyframes: [] },
            { controllerId: "ik-missing", targetXKeyframes: [], targetYKeyframes: [] },
          ],
          audioTracks: [
            {
              id: "audio-valid",
              name: "Audio",
              sourcePath: "voice.wav",
              startFrame: 0,
              sourceDurationSeconds: 1,
              gain: 1,
              muted: false,
            },
          ],
          lipSyncTracks: [
            {
              id: "lip-valid",
              name: "Lip valid",
              sourceAudioTrackId: "audio-valid",
              analysisType: "rms",
              analysisFps: 30,
              samples: [],
              targetParameterId: "param-valid",
              sourcePathAtBake: "voice.wav",
              sourceDurationSecondsAtBake: 1,
              gain: 1,
              muted: false,
            },
            {
              id: "lip-missing-audio",
              name: "Lip missing audio",
              sourceAudioTrackId: "audio-missing",
              analysisType: "rms",
              analysisFps: 30,
              samples: [],
              targetParameterId: "param-valid",
              sourcePathAtBake: "missing.wav",
              sourceDurationSecondsAtBake: 1,
              gain: 1,
              muted: false,
            },
            {
              id: "lip-missing-param",
              name: "Lip missing param",
              sourceAudioTrackId: "audio-valid",
              analysisType: "rms",
              analysisFps: 30,
              samples: [],
              targetParameterId: "param-missing",
              sourcePathAtBake: "voice.wav",
              sourceDurationSecondsAtBake: 1,
              gain: 1,
              muted: false,
            },
          ],
        }),
      ],
      scenes: [
        {
          id: "scene",
          name: "Scene",
          clips: [createClip("scene-clip", { tracks: [{ parameterId: "param-missing", keyframes: [] }] })],
        },
      ],
    });

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
      "main",
      "scene-clip",
    ]);

    applyAnimationTrackCleanup(project, plan);

    const clip = project.clips[0]!;
    expect(clip.tracks.map((track) => track.parameterId)).toEqual(["param-valid"]);
    expect(clip.boneTracks?.map((track) => track.boneId)).toEqual(["bone-valid"]);
    expect(clip.imageSequenceTracks?.map((track) => track.targetMeshId)).toEqual([
      "mesh-valid",
    ]);
    expect(clip.ikControllerTracks?.map((track) => track.controllerId)).toEqual([
      "ik-valid",
    ]);
    expect(clip.lipSyncTracks?.map((track) => [track.id, track.targetParameterId])).toEqual([
      ["lip-valid", "param-valid"],
      ["lip-missing-param", null],
    ]);
    expect(project.scenes[0]?.clips[0]?.tracks).toEqual([]);
  });

  it("removes invalid scene blends and normalizes non-positive durations", () => {
    const blends: SceneBlend[] = [
      {
        id: "valid",
        sourceSceneId: "scene-a",
        targetSceneId: "scene-b",
        mode: "crossfade",
        transitionFrames: 12,
        easing: "linear",
      },
      {
        id: "self",
        sourceSceneId: "scene-a",
        targetSceneId: "scene-a",
        mode: "crossfade",
        transitionFrames: 12,
        easing: "linear",
      },
      {
        id: "missing",
        sourceSceneId: "scene-a",
        targetSceneId: "scene-missing",
        mode: "crossfade",
        transitionFrames: 12,
        easing: "linear",
      },
      {
        id: "bad-duration",
        sourceSceneId: "scene-b",
        targetSceneId: "scene-a",
        mode: "crossfade",
        transitionFrames: Number.NaN,
        easing: "linear",
      },
    ];
    const project: ProjectData = createProject({
      scenes: [
        { id: "scene-a", name: "A", clips: [] },
        { id: "scene-b", name: "B", clips: [] },
      ],
      sceneBlends: blends,
    });

    const plan = planSceneBlendCleanup(project);

    expect(plan).toEqual({
      removedBlendIds: ["self", "missing"],
      normalizedDurationBlendIds: ["bad-duration"],
    });

    applySceneBlendCleanup(project, plan);

    expect(project.sceneBlends?.map((blend) => [blend.id, blend.transitionFrames])).toEqual([
      ["valid", 12],
      ["bad-duration", 30],
    ]);
  });
});
