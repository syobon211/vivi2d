import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planMotionAssistImport } from "@/lib/timeline-motion-assist";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";

function setupProject() {
  const clip = createAnimationClip({
    id: "clip-1",
    duration: 40,
    fps: 30,
    tracks: [
      {
        parameterId: "param-jaw",
        keyframes: [
          { frame: 0, value: 0.1, interpolation: "linear" },
          { frame: 5, value: 0.2, interpolation: "linear" },
          { frame: 30, value: 0.8, interpolation: "linear" },
        ],
      },
    ],
  });

  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        {
          id: "param-jaw",
          name: "Jaw Open",
          minValue: 0,
          maxValue: 1,
          defaultValue: 0,
        },
        {
          id: "param-brow",
          name: "Brow Down",
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

describe("clipStore motion assist", () => {
  beforeEach(setupProject);

  afterEach(() => {
    resetEditorStore();
  });

  it("creates missing tracks and overwrites only the projected range", () => {
    const project = useEditorStore.getState().project!;
    const clip = project.clips[0]!;
    const bundle = {
      schemaVersion: "1.0.0" as const,
      fps: 30,
      durationFrames: 10,
      channels: [
        {
          id: "jaw-channel",
          name: "Jaw Open",
          samples: [
            { frame: 0, value: 0.3 },
            { frame: 10 - 1, value: 0.6 },
          ],
        },
        {
          id: "brow-channel",
          name: "Brow Down",
          samples: [{ frame: 0, value: -0.5 }],
        },
      ],
    };

    const plan = planMotionAssistImport(project, clip, bundle, {
      targetStartFrame: 10,
      mappings: [
        {
          channelId: "jaw-channel",
          channelLabel: "Jaw Open",
          enabled: true,
          parameterId: "param-jaw",
          scale: 1,
          offset: 0,
          matchSource: "manual",
        },
        {
          channelId: "brow-channel",
          channelLabel: "Brow Down",
          enabled: true,
          parameterId: "param-brow",
          scale: 1,
          offset: 0,
          matchSource: "manual",
        },
      ],
    });

    useClipStore.getState().applyMotionAssistImportPlan(clip.id, plan);

    const nextClip = useEditorStore.getState().project!.clips[0]!;
    const jawTrack = nextClip.tracks.find((entry) => entry.parameterId === "param-jaw");
    const browTrack = nextClip.tracks.find((entry) => entry.parameterId === "param-brow");

    expect(
      jawTrack?.keyframes.some(
        (keyframe) => keyframe.frame === 0 && keyframe.value === 0.1,
      ),
    ).toBe(true);
    expect(
      jawTrack?.keyframes.some(
        (keyframe) => keyframe.frame === 5 && keyframe.value === 0.2,
      ),
    ).toBe(true);
    expect(
      jawTrack?.keyframes.some(
        (keyframe) => keyframe.frame === 10 && keyframe.value === 0.3,
      ),
    ).toBe(true);
    expect(
      jawTrack?.keyframes.some(
        (keyframe) => keyframe.frame === 19 && keyframe.value === 0.6,
      ),
    ).toBe(true);
    expect(
      jawTrack?.keyframes.some(
        (keyframe) => keyframe.frame === 30 && keyframe.value === 0.8,
      ),
    ).toBe(true);

    expect(browTrack?.keyframes).toEqual([
      { frame: 10, value: -0.5, interpolation: "linear" },
    ]);
  });
});
