import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectIdleSynthTargets,
  planIdleSynth,
} from "@vivi2d/editor-core/timeline-idle-synth";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";

function setupProject() {
  const clip = createAnimationClip({
    id: "clip-1",
    duration: 80,
    fps: 30,
    tracks: [
      {
        parameterId: "param-breath",
        keyframes: [
          { frame: 0, value: 0.1, interpolation: "linear" },
          { frame: 50, value: 0.8, interpolation: "linear" },
        ],
      },
    ],
  });
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        {
          id: "blink-left",
          name: "Eye Blink Left",
          minValue: 0,
          maxValue: 1,
          defaultValue: 0,
          managedTag: "seeThroughEyeRig:left:parameter",
        },
        {
          id: "blink-right",
          name: "Eye Blink Right",
          minValue: 0,
          maxValue: 1,
          defaultValue: 0,
          managedTag: "seeThroughEyeRig:right:parameter",
        },
        {
          id: "param-breath",
          name: "Breath",
          minValue: -1,
          maxValue: 1,
          defaultValue: 0,
        },
      ],
      clips: [clip],
    },
    projectVersion: 1,
  });
}

describe("clipStore idle synth", () => {
  beforeEach(setupProject);

  afterEach(() => {
    resetEditorStore();
  });

  it("creates missing blink tracks and overwrites only the selected range", () => {
    const project = useEditorStore.getState().project!;
    const clip = project.clips[0]!;
    const detection = detectIdleSynthTargets(project);
    const blinkTarget = detection.blinkOptions.find(
      (option) => option.id === detection.defaultBlinkTargetId,
    )!.target;
    const breathingTarget = detection.breathingOptions.find(
      (option) => option.id === detection.defaultBreathingTargetId,
    )!.target;

    const plan = planIdleSynth(project, clip, {
      startFrame: 10,
      durationFrames: 20,
      seed: 7,
      blink: {
        enabled: true,
        target: blinkTarget,
        openValue: 0,
        closedValue: 1,
        minIntervalFrames: 10,
        maxIntervalFrames: 10,
        closeDurationFrames: 2,
        holdDurationFrames: 1,
        openDurationFrames: 2,
      },
      breathing: {
        enabled: true,
        target: breathingTarget,
        centerValue: 0,
        minAmplitude: 0.1,
        maxAmplitude: 0.1,
        minCycleLengthFrames: 10,
        maxCycleLengthFrames: 10,
      },
    });

    useClipStore.getState().applyIdleSynthPlan(clip.id, plan);

    const nextClip = useEditorStore.getState().project!.clips[0]!;
    expect(
      nextClip.tracks.find((entry) => entry.parameterId === "blink-left")?.keyframes
        .length,
    ).toBeGreaterThan(0);
    expect(
      nextClip.tracks.find((entry) => entry.parameterId === "blink-right")?.keyframes
        .length,
    ).toBeGreaterThan(0);

    const breathTrack = nextClip.tracks.find(
      (entry) => entry.parameterId === "param-breath",
    )!;
    expect(
      breathTrack.keyframes.some(
        (keyframe) => keyframe.frame === 0 && keyframe.value === 0.1,
      ),
    ).toBe(true);
    expect(
      breathTrack.keyframes.some(
        (keyframe) => keyframe.frame >= 10 && keyframe.frame <= 29,
      ),
    ).toBe(true);
    expect(
      breathTrack.keyframes.some(
        (keyframe) => keyframe.frame === 50 && keyframe.value === 0.8,
      ),
    ).toBe(true);
  });
});
