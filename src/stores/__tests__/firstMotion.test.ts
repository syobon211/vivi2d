import type { ProjectData } from "@vivi2d/core/types";
import { describe, expect, it, beforeEach } from "vitest";
import { createFirstMotionDefaults } from "@vivi2d/editor-core/first-motion-command";
import { useEditorStore } from "@/stores/editorStore";
import { applyFirstMotion } from "@/stores/firstMotion";
import { useHistoryStore } from "@/stores/historyStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

function createProject(): {
  project: ProjectData;
  clip: ReturnType<typeof createAnimationClip>;
} {
  const clip = createAnimationClip({
    id: "clip-1",
    name: "Idle",
    duration: 90,
    fps: 30,
  });
  return {
    clip,
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
        {
          id: "param-sway",
          name: "Idle Sway",
          minValue: -30,
          maxValue: 30,
          defaultValue: 0,
        },
      ],
      clips: [clip],
    },
  };
}

describe("firstMotion store action", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("applies generated first motion tracks to the active clip", () => {
    const { project, clip } = createProject();
    useEditorStore.setState({ project });
    useTimelineStore.setState({
      activeClipId: clip.id,
      currentFrame: 17,
      isPlaying: true,
    });
    const { state } = createFirstMotionDefaults(project, clip);

    const clipId = applyFirstMotion({ activeClipId: clip.id, state });

    const nextClip = useEditorStore.getState().project?.clips[0];
    expect(clipId).toBe(clip.id);
    expect(nextClip?.tracks.length).toBeGreaterThan(0);
    expect(nextClip?.tracks.map((track) => track.parameterId)).toEqual(
      expect.arrayContaining(["blink-left", "blink-right", "param-breath"]),
    );
    expect(useTimelineStore.getState().activeClipId).toBe(clip.id);
    expect(useTimelineStore.getState().currentFrame).toBe(17);
    expect(useTimelineStore.getState().isPlaying).toBe(true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it("creates a new destination clip when requested", () => {
    const { project } = createProject();
    useEditorStore.setState({ project: { ...project, clips: [] } });
    const { state } = createFirstMotionDefaults(project, null);

    const clipId = applyFirstMotion({
      activeClipId: null,
      state: {
        ...state,
        clipMode: "new",
        clipName: "  ",
        durationFrames: 72,
        fps: 24,
      },
    });

    const nextClip = useEditorStore.getState().project?.clips[0];
    expect(clipId).toBe(nextClip?.id);
    expect(nextClip?.name).toBe("First Motion");
    expect(nextClip?.duration).toBe(72);
    expect(nextClip?.fps).toBe(24);
    expect(nextClip?.tracks.length).toBeGreaterThan(0);
    expect(useTimelineStore.getState().activeClipId).toBe(clipId);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it("does nothing when no first motion writes are applicable", () => {
    const { project, clip } = createProject();
    useEditorStore.setState({ project });
    const { state } = createFirstMotionDefaults(project, clip);

    const clipId = applyFirstMotion({
      activeClipId: clip.id,
      state: {
        ...state,
        blinkEnabled: false,
        breathingEnabled: false,
        swayEnabled: false,
      },
    });

    expect(clipId).toBeNull();
    expect(useEditorStore.getState().project?.clips[0]?.tracks).toEqual([]);
    expect(useTimelineStore.getState().activeClipId).toBeNull();
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("does nothing when no project is loaded", () => {
    const { project, clip } = createProject();
    const { state } = createFirstMotionDefaults(project, clip);

    const clipId = applyFirstMotion({ activeClipId: clip.id, state });

    expect(clipId).toBeNull();
    expect(useTimelineStore.getState().activeClipId).toBeNull();
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("does not silently create a clip when active mode points to a missing clip", () => {
    const { project, clip } = createProject();
    useEditorStore.setState({ project });
    const { state } = createFirstMotionDefaults(project, clip);

    const clipId = applyFirstMotion({
      activeClipId: "missing-clip",
      state: { ...state, clipMode: "active" },
    });

    expect(clipId).toBeNull();
    expect(useEditorStore.getState().project?.clips).toHaveLength(1);
    expect(useTimelineStore.getState().activeClipId).toBeNull();
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });
});
