import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as timelineAudio from "@/lib/timeline-audio";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createEmptyProject } from "@/test/fixtures";
import { TEST_AUDIO_PATH } from "@/test/path-fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { usePlayback } from "../usePlayback";

describe("usePlayback audio preview integration", () => {
  beforeEach(() => {
    resetEditorStore();
    resetTimelineStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
    vi.restoreAllMocks();
  });

  it("syncs audio preview when the active frame changes", () => {
    const syncSpy = vi.spyOn(
      timelineAudio.TimelineAudioPreviewController.prototype,
      "sync",
    );
    const resetSpy = vi.spyOn(
      timelineAudio.TimelineAudioPreviewController.prototype,
      "reset",
    );

    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        clips: [
          {
            id: "clip-1",
            name: "Clip",
            duration: 90,
            fps: 30,
            tracks: [],
            audioTracks: [
              {
                id: "audio-1",
                name: "voice.wav",
                sourcePath: TEST_AUDIO_PATH,
                startFrame: 0,
                sourceDurationSeconds: 2,
                gain: 1,
                muted: false,
              },
            ],
          },
        ],
      },
      projectVersion: 1,
    });
    useTimelineStore.setState({
      activeClipId: "clip-1",
      activeSceneId: null,
      currentFrame: 0,
      isPlaying: false,
    });

    const { unmount } = renderHook(() => usePlayback());

    expect(syncSpy).toHaveBeenCalled();

    useTimelineStore.setState({ currentFrame: 12 });

    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "clip-1" }),
      12,
      false,
    );

    unmount();
    expect(resetSpy).toHaveBeenCalled();
  });

  it("resets and resyncs audio preview when the project version changes", () => {
    const syncSpy = vi.spyOn(
      timelineAudio.TimelineAudioPreviewController.prototype,
      "sync",
    );
    const resetSpy = vi.spyOn(
      timelineAudio.TimelineAudioPreviewController.prototype,
      "reset",
    );

    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        clips: [
          {
            id: "clip-1",
            name: "Clip",
            duration: 90,
            fps: 30,
            tracks: [],
            audioTracks: [
              {
                id: "audio-1",
                name: "voice.wav",
                sourcePath: TEST_AUDIO_PATH,
                startFrame: 0,
                sourceDurationSeconds: 2,
                gain: 1,
                muted: false,
              },
            ],
          },
        ],
      },
      projectVersion: 1,
    });
    useTimelineStore.setState({
      activeClipId: "clip-1",
      activeSceneId: null,
      currentFrame: 0,
      isPlaying: false,
    });

    renderHook(() => usePlayback());
    syncSpy.mockClear();
    resetSpy.mockClear();

    useEditorStore.setState((state) => ({
      project: state.project,
      projectVersion: state.projectVersion + 1,
    }));

    expect(resetSpy).toHaveBeenCalled();
    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "clip-1" }),
      0,
      false,
    );
  });
});
