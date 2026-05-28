import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import * as timelineAudio from "@/lib/timeline-audio";
import * as timelineLipSync from "@/lib/timeline-lipsync";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createViviMesh, createBoneNode, createEmptyProject } from "@/test/fixtures";
import { TEST_AUDIO_BROKEN_PATH, TEST_AUDIO_PATH } from "@/test/path-fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { AddTrackButton } from "../timeline/AddTrackButton";

const clipId = "clip-1";

function createBasicClip() {
  return {
    id: clipId,
    name: "Clip",
    duration: 90,
    fps: 30,
    tracks: [],
  };
}

describe("AddTrackButton", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
    resetEditorStore();
    resetTimelineStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
    vi.restoreAllMocks();
  });

  it("renders available track groups for the active clip", () => {
    const bone = createBoneNode({ id: "bone-1", name: "Arm" });
    const mesh = createViviMesh({ id: "mesh-1", name: "Face" });
    const clip = createBasicClip();
    const project = {
      ...createEmptyProject(),
      clips: [
        {
          ...clip,
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
      layers: [bone, mesh],
      parameters: [
        { id: "p1", name: "Angle X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      lipsyncConfig: {
        ...createEmptyProject().lipsyncConfig,
        targetParameterId: "p1",
      },
    };
    useEditorStore.setState({ project, projectVersion: 1 });

    render(
      <AddTrackButton
        clipId={clipId}
        clip={project.clips[0]!}
        parameters={project.parameters}
      />,
    );

    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Angle X");
    expect(options).toContain("Arm:Angle");
    expect(options).toContain("Face");
    expect(options).toContain("Add audio track...");
    expect(options).toContain("Bake from voice.wav");
  });

  it("adds a parameter track", async () => {
    const user = userEvent.setup();
    const addTrackSpy = vi.spyOn(useClipStore.getState(), "addTrack");
    const clip = createBasicClip();
    const project = {
      ...createEmptyProject(),
      clips: [clip],
      parameters: [
        { id: "p1", name: "Angle X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    };
    useEditorStore.setState({ project, projectVersion: 1 });

    render(
      <AddTrackButton clipId={clipId} clip={clip} parameters={project.parameters} />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "p1");

    expect(addTrackSpy).toHaveBeenCalledWith(clipId, "p1");
  });

  it("adds a bone track", async () => {
    const user = userEvent.setup();
    const addBoneTrackSpy = vi.spyOn(useClipStore.getState(), "addBoneTrack");
    const bone = createBoneNode({ id: "bone-1", name: "Arm" });
    const clip = createBasicClip();
    const project = {
      ...createEmptyProject(),
      clips: [clip],
      layers: [bone],
    };
    useEditorStore.setState({ project, projectVersion: 1 });

    render(<AddTrackButton clipId={clipId} clip={clip} parameters={[]} />);

    await user.selectOptions(screen.getByRole("combobox"), `bone:${bone.id}:angle`);

    expect(addBoneTrackSpy).toHaveBeenCalledWith(clipId, bone.id, "angle");
  });

  it("adds an image sequence track", async () => {
    const user = userEvent.setup();
    const addImageSequenceTrackSpy = vi.spyOn(
      useClipStore.getState(),
      "addImageSequenceTrack",
    );
    const mesh = createViviMesh({ id: "mesh-1", name: "Face" });
    const clip = createBasicClip();
    const project = {
      ...createEmptyProject(),
      clips: [clip],
      layers: [mesh],
    };
    useEditorStore.setState({ project, projectVersion: 1 });

    render(<AddTrackButton clipId={clipId} clip={clip} parameters={[]} />);

    await user.selectOptions(screen.getByRole("combobox"), `imgseq:${mesh.id}`);

    expect(addImageSequenceTrackSpy).toHaveBeenCalledWith(clipId, mesh.id);
  });

  it("keeps the audio option available even when the project is unavailable", () => {
    useEditorStore.setState({ project: null });
    const clip = createBasicClip();

    render(<AddTrackButton clipId={clipId} clip={clip} parameters={[]} />);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Add audio track..." }),
    ).toBeInTheDocument();
  });

  it("adds a clip-local audio track from file metadata", async () => {
    const user = userEvent.setup();
    const addAudioTrackSpy = vi.spyOn(useClipStore.getState(), "addAudioTrack");
    vi.spyOn(timelineAudio, "loadAudioTrackMetadata").mockResolvedValue({
      name: "voice.wav",
      durationSeconds: 2.5,
    });
    vi.mocked(window.electronAPI.openAudioFile).mockResolvedValue(TEST_AUDIO_PATH);
    useTimelineStore.setState({ currentFrame: 12 });

    const clip = createBasicClip();
    render(<AddTrackButton clipId={clipId} clip={clip} parameters={[]} />);

    await user.selectOptions(screen.getByRole("combobox"), "audio:new");

    expect(window.electronAPI.openAudioFile).toHaveBeenCalledTimes(1);
    expect(addAudioTrackSpy).toHaveBeenCalledTimes(1);
    expect(addAudioTrackSpy.mock.calls[0]![0]).toBe(clipId);
    expect(addAudioTrackSpy.mock.calls[0]![1]).toMatchObject({
      name: "voice.wav",
      sourcePath: TEST_AUDIO_PATH,
      startFrame: 12,
      sourceDurationSeconds: 2.5,
      gain: 1,
      muted: false,
    });
  });

  it("warns when audio metadata cannot be resolved", async () => {
    const user = userEvent.setup();
    const notificationSpy = vi.spyOn(useNotificationStore.getState(), "addNotification");
    vi.spyOn(timelineAudio, "loadAudioTrackMetadata").mockResolvedValue({
      name: "broken.wav",
      durationSeconds: null,
    });
    vi.mocked(window.electronAPI.openAudioFile).mockResolvedValue(TEST_AUDIO_BROKEN_PATH);

    const clip = createBasicClip();
    render(<AddTrackButton clipId={clipId} clip={clip} parameters={[]} />);

    await user.selectOptions(screen.getByRole("combobox"), "audio:new");

    expect(notificationSpy).toHaveBeenCalledWith(
      "warning",
      "Audio metadata could not be resolved.",
    );
  });

  it("bakes a lip sync track from an existing audio track", async () => {
    const user = userEvent.setup();
    const addLipSyncTrackSpy = vi.spyOn(useClipStore.getState(), "addLipSyncTrack");
    const project = {
      ...createEmptyProject(),
      clips: [
        {
          ...createBasicClip(),
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
      lipsyncConfig: {
        ...createEmptyProject().lipsyncConfig,
        targetParameterId: "param-mouth",
      },
    };
    useEditorStore.setState({ project, projectVersion: 1 });
    vi.mocked(window.electronAPI.readAudioFile).mockResolvedValue({
      buffer: new ArrayBuffer(16),
      filename: "voice.wav",
      sizeBytes: 16,
      modifiedTimeMs: 123,
    });
    vi.spyOn(timelineLipSync, "bakeRmsLipSyncTrackFromAudioBuffer").mockResolvedValue({
      decodedDurationSeconds: 2,
      track: {
        id: "lipsync-1",
        name: "Lip Sync: voice.wav",
        sourceAudioTrackId: "audio-1",
        analysisType: "rms",
        analysisFps: 30,
        samples: [0, 0.2, 0.4],
        targetParameterId: "param-mouth",
        sourcePathAtBake: TEST_AUDIO_PATH,
        sourceDurationSecondsAtBake: 2,
        gain: 1,
        muted: false,
      },
    });

    render(
      <AddTrackButton
        clipId={clipId}
        clip={project.clips[0]!}
        parameters={project.parameters}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "lipsync:audio-1");

    expect(window.electronAPI.readAudioFile).toHaveBeenCalledWith({
      audioPath: TEST_AUDIO_PATH,
    });
    expect(addLipSyncTrackSpy).toHaveBeenCalledWith(
      clipId,
      expect.objectContaining({
        id: "lipsync-1",
        sourceAudioTrackId: "audio-1",
      }),
    );
  });
});
