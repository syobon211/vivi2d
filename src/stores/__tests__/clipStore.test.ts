import { EASING_PRESETS, TIMELINE_DEFAULTS } from "@vivi2d/core/constants";
import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetTimelineStore,
} from "@/test/store-reset";
import { useClipStore } from "../clipStore";
import { useEditorStore } from "../editorStore";
import { _resetMergeTimer } from "../historyStore";
import { useTimelineStore } from "../timelineStore";

beforeEach(() => {
  resetEditorStore();
  resetHistoryStore();
  resetTimelineStore();
  _resetMergeTimer();
  useEditorStore.setState({ project: createProject() });
});

function getClips() {
  return useEditorStore.getState().project!.clips;
}

function getTracks(clipIndex = 0) {
  return getClips()[clipIndex]!.tracks;
}

function getKeyframes(clipIndex = 0, trackIndex = 0) {
  return getTracks(clipIndex)[trackIndex]!.keyframes;
}

function getBoneTracks(clipIndex = 0) {
  return getClips()[clipIndex]!.boneTracks ?? [];
}

function getImageSequenceTracks(clipIndex = 0) {
  return getClips()[clipIndex]!.imageSequenceTracks ?? [];
}

describe("createClip", () => {
  it("adds a clip with timeline defaults", () => {
    const id = useClipStore.getState().createClip("motion");

    expect(getClips()).toHaveLength(1);
    expect(getClips()[0]).toMatchObject({
      id,
      name: "motion",
      duration: TIMELINE_DEFAULTS.DURATION,
      fps: TIMELINE_DEFAULTS.FPS,
      tracks: [],
    });
  });

  it("adds clips to the active scene when one is selected", () => {
    const project = createProject({
      clips: [],
      scenes: [{ id: "scene-1", name: "Scene 1", clips: [] }],
    });
    useEditorStore.setState({ project });
    useTimelineStore.setState({ activeSceneId: "scene-1" });

    const id = useClipStore.getState().createClip("scene clip");

    const updated = useEditorStore.getState().project!;
    expect(updated.clips).toHaveLength(0);
    expect(updated.scenes[0]!.clips.some((clip) => clip.id === id)).toBe(true);
  });
});

describe("deleteClip", () => {
  it("deletes clips from the fallback clip list", () => {
    const first = useClipStore.getState().createClip("delete me");
    useClipStore.getState().createClip("keep me");

    useClipStore.getState().deleteClip(first);

    expect(getClips()).toHaveLength(1);
    expect(getClips()[0]!.name).toBe("keep me");
  });

  it("deletes clips from scenes before checking fallback clips", () => {
    const project = createProject({
      clips: [{ id: "fallback", name: "fallback", duration: 90, fps: 30, tracks: [] }],
      scenes: [
        {
          id: "scene-1",
          name: "Scene 1",
          clips: [{ id: "scene-clip", name: "scene clip", duration: 90, fps: 30, tracks: [] }],
        },
      ],
    });
    useEditorStore.setState({ project });

    useClipStore.getState().deleteClip("scene-clip");

    const updated = useEditorStore.getState().project!;
    expect(updated.scenes[0]!.clips).toHaveLength(0);
    expect(updated.clips).toHaveLength(1);
  });
});

describe("clip metadata", () => {
  it("renames clips and clamps duration/fps", () => {
    const id = useClipStore.getState().createClip("old");

    useClipStore.getState().renameClip(id, "new");
    useClipStore.getState().setClipDuration(id, -10);
    useClipStore.getState().setClipFps(id, 999);

    expect(getClips()[0]!.name).toBe("new");
    expect(getClips()[0]!.duration).toBe(TIMELINE_DEFAULTS.MIN_DURATION);
    expect(getClips()[0]!.fps).toBe(TIMELINE_DEFAULTS.MAX_FPS);
  });
});

describe("parameter tracks", () => {
  it("adds, deduplicates, and removes parameter tracks", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addTrack(id, "param-1");
    useClipStore.getState().addTrack(id, "param-1");
    useClipStore.getState().addTrack(id, "param-2");
    useClipStore.getState().removeTrack(id, "param-1");

    expect(getTracks()).toEqual([{ parameterId: "param-2", keyframes: [] }]);
  });
});

describe("parameter keyframes", () => {
  it("creates missing tracks, sorts keyframes, and overwrites duplicate frames", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addKeyframe(id, "param-1", 20, 2);
    useClipStore.getState().addKeyframe(id, "param-1", 0, 0);
    useClipStore.getState().addKeyframe(id, "param-1", 10, 1);
    useClipStore.getState().addKeyframe(id, "param-1", 10, 9, "step");

    expect(getKeyframes()).toEqual([
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 9, interpolation: "step" },
      { frame: 20, value: 2, interpolation: "linear" },
    ]);
  });

  it("updates, eases, and removes parameter keyframes", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addKeyframe(id, "param-1", 0, 0);
    useClipStore.getState().updateKeyframe(id, "param-1", 0, { value: 1 });
    useClipStore.getState().applyEasingPreset(id, "param-1", 0, "easeInOut");

    expect(getKeyframes()[0]).toMatchObject({
      frame: 0,
      value: 1,
      interpolation: "bezier",
      cp1x: EASING_PRESETS.easeInOut.cp1x,
      cp1y: EASING_PRESETS.easeInOut.cp1y,
      cp2x: EASING_PRESETS.easeInOut.cp2x,
      cp2y: EASING_PRESETS.easeInOut.cp2y,
    });

    useClipStore.getState().removeKeyframe(id, "param-1", 0);
    expect(getKeyframes()).toHaveLength(0);
  });
});

describe("bone tracks", () => {
  it("adds, deduplicates, and removes bone tracks", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addBoneTrack(id, "bone-1", "angle");
    useClipStore.getState().addBoneTrack(id, "bone-1", "angle");
    useClipStore.getState().addBoneTrack(id, "bone-1", "scaleX");
    useClipStore.getState().removeBoneTrack(id, "bone-1", "angle");

    expect(getBoneTracks()).toEqual([
      { boneId: "bone-1", property: "scaleX", keyframes: [] },
    ]);
  });

  it("creates, sorts, overwrites, and removes bone keyframes", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addBoneKeyframe(id, "bone-1", "angle", 20, 2);
    useClipStore.getState().addBoneKeyframe(id, "bone-1", "angle", 0, 0);
    useClipStore.getState().addBoneKeyframe(id, "bone-1", "angle", 10, 1);
    useClipStore.getState().addBoneKeyframe(id, "bone-1", "angle", 10, 9, "step");
    useClipStore.getState().removeBoneKeyframe(id, "bone-1", "angle", 0);

    expect(getBoneTracks()[0]!.keyframes).toEqual([
      { frame: 10, value: 9, interpolation: "step" },
      { frame: 20, value: 2, interpolation: "linear" },
    ]);
  });
});

describe("image sequence tracks", () => {
  it("adds, deduplicates, and removes image sequence tracks", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addImageSequenceTrack(id, "mesh-1");
    useClipStore.getState().addImageSequenceTrack(id, "mesh-1");
    useClipStore.getState().addImageSequenceTrack(id, "mesh-2");
    useClipStore.getState().removeImageSequenceTrack(id, "mesh-1");

    expect(getImageSequenceTracks()).toEqual([{ targetMeshId: "mesh-2", entries: [] }]);
  });

  it("creates missing tracks, sorts entries, overwrites duplicate frames, and removes entries", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addImageSequenceEntry(id, "mesh-1", 10, "image-b");
    useClipStore.getState().addImageSequenceEntry(id, "mesh-1", 0, "image-a");
    useClipStore.getState().addImageSequenceEntry(id, "mesh-1", 10, "image-c");
    useClipStore.getState().removeImageSequenceEntry(id, "mesh-1", 0);

    expect(getImageSequenceTracks()).toEqual([
      {
        targetMeshId: "mesh-1",
        entries: [{ startFrame: 10, imageId: "image-c" }],
      },
    ]);
  });
});

describe("audio and lip sync tracks", () => {
  it("clamps audio track timing and gain", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addAudioTrack(id, {
      id: "audio-1",
      name: "voice",
      sourcePath: "voice.wav",
      startFrame: 999,
      sourceDurationSeconds: -1,
      gain: 2,
      muted: false,
    });

    const audioTrack = getClips()[0]!.audioTracks![0]!;
    expect(audioTrack.startFrame).toBe(TIMELINE_DEFAULTS.DURATION - 1);
    expect(audioTrack.sourceDurationSeconds).toBeNull();
    expect(audioTrack.gain).toBe(1);
  });

  it("normalizes lip sync tracks and updates public target fields", () => {
    const id = useClipStore.getState().createClip("clip");

    useClipStore.getState().addLipSyncTrack(id, {
      id: "lip-1",
      name: "mouth",
      sourceAudioTrackId: "audio-1",
      sourcePathAtBake: "",
      sourceDurationSecondsAtBake: null,
      analysisType: "rms",
      analysisFps: 0,
      samples: [-1, 0.5, 2],
      gain: 2,
      muted: false,
      targetParameterId: null,
    });
    useClipStore.getState().updateLipSyncTrack(id, "lip-1", {
      targetParameterId: "param-mouth",
      gain: -1,
      muted: true,
    });

    expect(getClips()[0]!.lipSyncTracks![0]).toMatchObject({
      analysisType: "rms",
      analysisFps: 1,
      samples: [0, 0.5, 1],
      gain: 0,
      muted: true,
      targetParameterId: "param-mouth",
    });
  });
});

describe("bakePhysicsToClip", () => {
  it("does not throw when there are no physics groups", () => {
    const id = useClipStore.getState().createClip("clip");
    useClipStore.getState().addKeyframe(id, "param-1", 0, 0);

    expect(() =>
      useClipStore.getState().bakePhysicsToClip(id, {
        startFrame: 0,
        endFrame: 10,
        fps: 30,
        sampleInterval: 1,
      }),
    ).not.toThrow();
  });

  it("bakes parameter output into parameter tracks", () => {
    const project = createProject({
      parameters: [
        { id: "input", name: "Input", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: "output", name: "Output", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      physicsGroups: [
        {
          id: "pg1",
          name: "Physics",
          enabled: true,
          pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
          inputs: [{ type: "x", parameterId: "input", weight: 1 }],
          outputs: [{ type: "angle", parameterId: "output", pendulumIndex: 0, weight: 1 }],
          gravityDirection: 0,
          gravityStrength: 9.8,
          wind: 0,
        },
      ],
    });
    useEditorStore.setState({ project });

    const id = useClipStore.getState().createClip("clip");
    useClipStore.getState().addKeyframe(id, "input", 0, 0);
    useClipStore.getState().addKeyframe(id, "input", 29, 10);

    useClipStore.getState().bakePhysicsToClip(id, {
      startFrame: 0,
      endFrame: 29,
      fps: 30,
      sampleInterval: 2,
    });

    const outputTrack = getClips()[0]!.tracks.find(
      (track) => track.parameterId === "output",
    );
    expect(outputTrack?.keyframes.length).toBeGreaterThan(0);
  });

  it("bakes bone output without deleting keyframes outside the bake range", () => {
    const project = createProject({
      parameters: [
        { id: "input", name: "Input", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      physicsGroups: [
        {
          id: "pg1",
          name: "Physics",
          enabled: true,
          pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
          inputs: [{ type: "x", parameterId: "input", weight: 1 }],
          outputs: [
            { type: "boneAngle", boneId: "bone-1", pendulumIndex: 0, weight: 1 },
          ],
          gravityDirection: 0,
          gravityStrength: 9.8,
          wind: 0,
        },
      ],
    });
    useEditorStore.setState({ project });

    const id = useClipStore.getState().createClip("clip");
    useClipStore.getState().addKeyframe(id, "input", 0, 0);
    useClipStore.getState().addKeyframe(id, "input", 29, 10);
    useClipStore.getState().addBoneKeyframe(id, "bone-1", "angle", 50, 1);

    useClipStore.getState().bakePhysicsToClip(id, {
      startFrame: 0,
      endFrame: 29,
      fps: 30,
      sampleInterval: 2,
    });

    const boneTrack = getClips()[0]!.boneTracks!.find(
      (track) => track.boneId === "bone-1" && track.property === "angle",
    )!;
    expect(boneTrack.keyframes.some((keyframe) => keyframe.frame === 50)).toBe(true);
  });
});
