import { EASING_PRESETS, TIMELINE_DEFAULTS } from "@vivi2d/core/constants";
import type { AnimationClip, PhysicsGroup } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  addAudioTrack,
  addBoneKeyframe,
  addBoneTrack,
  addImageSequenceEntry,
  addImageSequenceTrack,
  addKeyframe,
  addLipSyncTrack,
  addTrack,
  applyAnimationRetargetPlan,
  applyEasingPreset,
  applyIdleSynthPlan,
  applyMotionAssistImportPlan,
  applyMotionPreset,
  bakePhysicsToClip,
  createClip,
  deleteClip,
  removeBoneKeyframe,
  removeBoneTrack,
  removeImageSequenceEntry,
  removeImageSequenceTrack,
  removeKeyframe,
  removeTrack,
  renameClip,
  setClipDuration,
  setClipFps,
  updateAudioTrack,
  updateKeyframe,
  updateLipSyncTrack,
} from "../clip-command";
import { createProject } from "./fixtures";

function clip(overrides: Partial<AnimationClip> = {}): AnimationClip {
  return {
    id: "clip",
    name: "Clip",
    duration: 30,
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

describe("clip commands", () => {
  it("creates, updates, and deletes fallback and scene clips", () => {
    const project = createProject({
      scenes: [{ id: "scene", name: "Scene", clips: [] }],
    });

    expect(createClip(project, "fallback", null, () => "fallback")).toBe("fallback");
    expect(createClip(project, "scene clip", "scene", () => "scene-clip")).toBe(
      "scene-clip",
    );
    expect(createClip(project, "missing", "missing", () => "missing")).toBe("");
    expect(renameClip(project, "fallback", "renamed")).toBe(true);
    expect(setClipDuration(project, "fallback", Number.POSITIVE_INFINITY)).toBe(true);
    expect(setClipFps(project, "fallback", 999)).toBe(true);
    expect(deleteClip(project, "scene-clip")).toBe(true);

    expect(project.clips[0]).toMatchObject({
      id: "fallback",
      name: "renamed",
      duration: TIMELINE_DEFAULTS.DURATION,
      fps: TIMELINE_DEFAULTS.MAX_FPS,
    });
    expect(project.scenes[0]?.clips).toEqual([]);
  });

  it("adds and removes parameter, bone, image, audio, and lip sync tracks safely", () => {
    const project = createProject({ clips: [clip()] });

    expect(addTrack(project, "clip", "param")).toBe(true);
    expect(addTrack(project, "clip", "param")).toBe(false);
    expect(addBoneTrack(project, "clip", "bone", "angle")).toBe(true);
    expect(addImageSequenceTrack(project, "clip", "mesh")).toBe(true);
    expect(addAudioTrack(project, "clip", {
      id: "audio",
      name: "Voice",
      sourcePath: "voice.wav",
      startFrame: 999,
      sourceDurationSeconds: -1,
      gain: 2,
      muted: false,
    })).toBe(true);
    expect(addLipSyncTrack(project, "clip", {
      id: "lip",
      name: "Mouth",
      sourceAudioTrackId: "audio",
      analysisType: "rms",
      analysisFps: 0,
      samples: [-1, 0.5, 2],
      targetParameterId: null,
      sourcePathAtBake: "",
      sourceDurationSecondsAtBake: null,
      gain: 2,
      muted: false,
    })).toBe(true);

    const updated = project.clips[0]!;
    expect(updated.audioTracks?.[0]).toMatchObject({
      startFrame: 29,
      sourceDurationSeconds: null,
      gain: 1,
    });
    expect(updated.lipSyncTracks?.[0]).toMatchObject({
      analysisFps: 1,
      samples: [0, 0.5, 1],
      gain: 1,
    });

    expect(updateAudioTrack(project, "clip", "audio", { startFrame: -10, gain: -1 }))
      .toBe(true);
    expect(updateLipSyncTrack(project, "clip", "lip", {
      targetParameterId: "mouth",
      gain: Number.NaN,
      muted: true,
    })).toBe(true);
    expect(updated.audioTracks?.[0]?.startFrame).toBe(0);
    expect(updated.audioTracks?.[0]?.gain).toBe(0);
    expect(updated.lipSyncTracks?.[0]?.targetParameterId).toBe("mouth");
    expect(updated.lipSyncTracks?.[0]?.gain).toBe(1);
    expect(updated.lipSyncTracks?.[0]?.muted).toBe(true);

    expect(removeTrack(project, "clip", "param")).toBe(true);
    expect(removeBoneTrack(project, "clip", "bone", "angle")).toBe(true);
    expect(removeImageSequenceTrack(project, "clip", "mesh")).toBe(true);
  });

  it("edits parameter, bone, and image sequence keyframes", () => {
    const project = createProject({ clips: [clip()] });

    expect(addKeyframe(project, "clip", "param", 10.4, Number.NaN)).toBe(true);
    expect(addKeyframe(project, "clip", "param", 0, 1, "step")).toBe(true);
    expect(updateKeyframe(project, "clip", "param", 10, {
      value: 2,
      interpolation: "bezier",
      cp1x: Number.NaN,
      cp1y: 0.2,
      cp2x: 0.8,
      cp2y: 1,
    })).toBe(true);
    expect(applyEasingPreset(project, "clip", "param", 10, "easeInOut")).toBe(true);
    expect(addBoneKeyframe(project, "clip", "bone", "angle", 5, 3)).toBe(true);
    expect(addImageSequenceEntry(project, "clip", "mesh", 5, "image-a")).toBe(true);
    expect(addImageSequenceEntry(project, "clip", "mesh", 5, "image-b")).toBe(true);

    const updated = project.clips[0]!;
    expect(updated.tracks[0]?.keyframes).toEqual([
      { frame: 0, value: 1, interpolation: "step" },
      {
        frame: 10,
        value: 2,
        interpolation: "bezier",
        cp1x: EASING_PRESETS.easeInOut.cp1x,
        cp1y: EASING_PRESETS.easeInOut.cp1y,
        cp2x: EASING_PRESETS.easeInOut.cp2x,
        cp2y: EASING_PRESETS.easeInOut.cp2y,
      },
    ]);
    expect(updated.boneTracks?.[0]?.keyframes).toEqual([
      { frame: 5, value: 3, interpolation: "linear" },
    ]);
    expect(updated.imageSequenceTracks?.[0]?.entries).toEqual([
      { startFrame: 5, imageId: "image-b" },
    ]);

    expect(removeKeyframe(project, "clip", "param", 0)).toBe(true);
    expect(removeBoneKeyframe(project, "clip", "bone", "angle", 5)).toBe(true);
    expect(removeImageSequenceEntry(project, "clip", "mesh", 5)).toBe(true);
  });

  it("applies generated keyframe plans without retaining caller-owned keyframes", () => {
    const project = createProject({ clips: [clip()] });
    const keyframe = { frame: 5, value: 1, interpolation: "linear" as const };

    expect(applyMotionPreset(project, "clip", {
      startFrame: 0,
      endFrame: 10,
      writes: [{ track: { type: "parameter", parameterId: "p" }, keyframes: [keyframe] }],
    })).toBe(true);
    expect(applyAnimationRetargetPlan(project, "clip", {
      targetStartFrame: 0,
      targetEndFrame: 10,
      writes: [
        {
          track: { type: "bone", boneId: "bone", property: "angle" },
          keyframes: [{ frame: 2, value: 4, interpolation: "linear" }],
        },
      ],
    })).toBe(true);
    expect(applyMotionAssistImportPlan(project, "clip", {
      writes: [
        {
          parameterId: "assist",
          rangeStart: 0,
          rangeEnd: 10,
          keyframes: [{ frame: 3, value: 6, interpolation: "step" }],
        },
      ],
    })).toBe(true);
    expect(applyIdleSynthPlan(project, "clip", {
      writes: [
        {
          track: { type: "parameter", parameterId: "idle" },
          rangeStart: 0,
          rangeEnd: 10,
          keyframes: [{ frame: 4, value: 8, interpolation: "linear" }],
        },
      ],
    })).toBe(true);
    keyframe.value = 99;

    expect(project.clips[0]?.tracks.find((track) => track.parameterId === "p"))
      .toMatchObject({
        keyframes: [{ frame: 5, value: 1, interpolation: "linear" }],
      });
    expect(project.clips[0]?.boneTracks?.[0]).toMatchObject({
      boneId: "bone",
      keyframes: [{ frame: 2, value: 4, interpolation: "linear" }],
    });
  });

  it("bakes physics output into tracks while preserving keys outside the bake range", () => {
    const targetClip = clip({
      tracks: [
        {
          parameterId: "input",
          keyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 29, value: 10, interpolation: "linear" },
          ],
        },
      ],
      boneTracks: [
        {
          boneId: "bone",
          property: "angle",
          keyframes: [{ frame: 50, value: 3, interpolation: "linear" }],
        },
      ],
    });
    const physicsGroups: PhysicsGroup[] = [
      {
        id: "pg",
        name: "Physics",
        enabled: true,
        pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
        inputs: [{ type: "x", parameterId: "input", weight: 1 }],
        outputs: [
          { type: "boneAngle", boneId: "bone", pendulumIndex: 0, weight: 1 },
        ],
        gravityDirection: 0,
        gravityStrength: 9.8,
        wind: 0,
      },
    ];

    expect(bakePhysicsToClip(
      targetClip,
      physicsGroups,
      [{ id: "input", name: "Input", minValue: -30, maxValue: 30, defaultValue: 0 }],
      { startFrame: 0, endFrame: 29, fps: 30, sampleInterval: 2 },
    )).toBe(true);

    const boneTrack = targetClip.boneTracks?.find(
      (track) => track.boneId === "bone" && track.property === "angle",
    );
    expect(boneTrack?.keyframes.some((entry) => entry.frame === 50)).toBe(true);
    expect((boneTrack?.keyframes.length ?? 0)).toBeGreaterThan(1);
  });
});
