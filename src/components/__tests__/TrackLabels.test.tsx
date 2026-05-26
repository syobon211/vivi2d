import { fireEvent, render, screen } from "@testing-library/react";
import type {
  AnimationTrack,
  AudioTrack,
  BoneTrack,
  ImageSequenceTrack,
  LayerNode,
  LipSyncTrack,
  ParameterDefinition,
} from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createBoneNode, createEmptyProject } from "@/test/fixtures";
import { TEST_AUDIO_PATH } from "@/test/path-fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import {
  AudioTrackLabel,
  BONE_PROPERTY_LABELS,
  BoneTrackLabel,
  ImageSequenceTrackLabel,
  LipSyncTrackLabel,
  TrackLabel,
} from "../timeline/TrackLabels";

const clipId = "clip-1";

const parameters: ParameterDefinition[] = [
  { id: "p1", name: "Angle X", minValue: -30, maxValue: 30, defaultValue: 0 },
  { id: "p2", name: "Opacity", minValue: 0, maxValue: 1, defaultValue: 1 },
];

function setupStores() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters,
      clips: [
        {
          id: clipId,
          name: "Clip",
          duration: 90,
          fps: 30,
          tracks: [
            { parameterId: "p1", keyframes: [] },
            { parameterId: "p2", keyframes: [] },
          ],
        },
      ],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeClipId: clipId,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
    viewMode: "dopeSheet",
    selectedGraphTrackId: null,
  });
}

describe("TrackLabels", () => {
  beforeEach(() => {
    resetEditorStore();
    resetTimelineStore();
    vi.restoreAllMocks();
    setupStores();
  });

  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
    vi.restoreAllMocks();
  });

  it("maps bone property labels to readable English names", () => {
    expect(BONE_PROPERTY_LABELS.angle).toBe("Angle");
    expect(BONE_PROPERTY_LABELS.scaleX).toBe("Scale X");
    expect(BONE_PROPERTY_LABELS.scaleY).toBe("Scale Y");
  });

  it("renders and removes a parameter track label", () => {
    const removeTrackSpy = vi.spyOn(useClipStore.getState(), "removeTrack");
    const track: AnimationTrack = { parameterId: "p1", keyframes: [] };

    render(
      <TrackLabel
        track={track}
        clipId={clipId}
        parameters={parameters}
        isGraphMode={false}
        isSelected={false}
      />,
    );

    expect(screen.getByText("Angle X")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(removeTrackSpy).toHaveBeenCalledWith(clipId, "p1");
  });

  it("toggles graph selection when the parameter label is clicked in graph mode", () => {
    const track: AnimationTrack = { parameterId: "p1", keyframes: [] };

    render(
      <TrackLabel
        track={track}
        clipId={clipId}
        parameters={parameters}
        isGraphMode={true}
        isSelected={false}
      />,
    );

    fireEvent.click(screen.getByText("Angle X").closest(".tl-track-label")!);
    expect(useTimelineStore.getState().selectedGraphTrackId).toBe("p1");
  });

  it("renders and removes a bone track label", () => {
    const bone = createBoneNode({ id: "bone-1", name: "Arm" });
    const removeBoneTrackSpy = vi.spyOn(
      useClipStore.getState(),
      "removeBoneTrack",
    );
    const track: BoneTrack = {
      boneId: bone.id,
      property: "angle",
      keyframes: [],
    };

    render(<BoneTrackLabel track={track} clipId={clipId} layers={[bone]} />);

    expect(screen.getByText("Arm:角度")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(removeBoneTrackSpy).toHaveBeenCalledWith(clipId, bone.id, "angle");
  });

  it("renders and removes an image sequence track label", () => {
    const removeImageSequenceTrackSpy = vi.spyOn(
      useClipStore.getState(),
      "removeImageSequenceTrack",
    );
    const layers: LayerNode[] = [
      {
        id: "mesh-1",
        name: "Face",
        kind: "viviMesh",
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [],
        blendMode: "normal",
        expanded: true,
        mesh: {
          vertices: [],
          indices: [],
          uvs: [],
          divisionsX: 1,
          divisionsY: 1,
        },
      },
    ];
    const track: ImageSequenceTrack = { targetMeshId: "mesh-1", entries: [] };

    render(
      <ImageSequenceTrackLabel track={track} clipId={clipId} layers={layers} />,
    );

    expect(screen.getByText("画像シーケンス: Face")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(removeImageSequenceTrackSpy).toHaveBeenCalledWith(clipId, "mesh-1");
  });

  it("renders and updates an audio track label", () => {
    const updateAudioTrackSpy = vi.spyOn(
      useClipStore.getState(),
      "updateAudioTrack",
    );
    const removeAudioTrackSpy = vi.spyOn(
      useClipStore.getState(),
      "removeAudioTrack",
    );
    const track: AudioTrack = {
      id: "audio-1",
      name: "voice.wav",
      sourcePath: TEST_AUDIO_PATH,
      startFrame: 8,
      sourceDurationSeconds: 2.5,
      gain: 0.6,
      muted: false,
    };

    render(<AudioTrackLabel track={track} clipId={clipId} />);

    expect(screen.getByText("voice.wav")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("ミュート voice.wav"));
    expect(updateAudioTrackSpy).toHaveBeenCalledWith(clipId, "audio-1", {
      muted: true,
    });

    fireEvent.change(screen.getByLabelText("ゲイン voice.wav"), {
      target: { value: "0.9" },
    });
    expect(updateAudioTrackSpy).toHaveBeenCalledWith(clipId, "audio-1", {
      gain: 0.9,
    });

    fireEvent.change(screen.getByLabelText("開始フレーム voice.wav"), {
      target: { value: "12" },
    });
    expect(updateAudioTrackSpy).toHaveBeenCalledWith(clipId, "audio-1", {
      startFrame: 12,
    });

    fireEvent.click(screen.getByRole("button"));
    expect(removeAudioTrackSpy).toHaveBeenCalledWith(clipId, "audio-1");
  });

  it("renders and updates a lip sync track label", () => {
    const updateLipSyncTrackSpy = vi.spyOn(
      useClipStore.getState(),
      "updateLipSyncTrack",
    );
    const removeLipSyncTrackSpy = vi.spyOn(
      useClipStore.getState(),
      "removeLipSyncTrack",
    );
    const clipAudioTracks: AudioTrack[] = [
      {
        id: "audio-1",
        name: "voice.wav",
        sourcePath: TEST_AUDIO_PATH,
        startFrame: 0,
        sourceDurationSeconds: 2,
        gain: 1,
        muted: false,
      },
    ];
    const track: LipSyncTrack = {
      id: "lipsync-1",
      name: "Lip Sync: voice.wav",
      sourceAudioTrackId: "audio-1",
      analysisType: "rms",
      analysisFps: 30,
      samples: [0, 0.2, 0.4],
      targetParameterId: "p1",
      sourcePathAtBake: TEST_AUDIO_PATH,
      sourceDurationSecondsAtBake: 2,
      gain: 0.6,
      muted: false,
    };

    render(
      <LipSyncTrackLabel
        track={track}
        clipId={clipId}
        clipAudioTracks={clipAudioTracks}
        parameters={parameters}
      />,
    );

    expect(screen.getByText("Lip Sync: voice.wav")).toBeInTheDocument();
    expect(screen.getByText("準備完了")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("ミュート Lip Sync: voice.wav"));
    expect(updateLipSyncTrackSpy).toHaveBeenCalledWith(clipId, "lipsync-1", {
      muted: true,
    });

    fireEvent.change(screen.getByLabelText("ゲイン Lip Sync: voice.wav"), {
      target: { value: "0.9" },
    });
    expect(updateLipSyncTrackSpy).toHaveBeenCalledWith(clipId, "lipsync-1", {
      gain: 0.9,
    });

    fireEvent.change(
      screen.getByLabelText("対象パラメータ Lip Sync: voice.wav"),
      {
        target: { value: "p2" },
      },
    );
    expect(updateLipSyncTrackSpy).toHaveBeenCalledWith(clipId, "lipsync-1", {
      targetParameterId: "p2",
    });

    fireEvent.click(screen.getByRole("button"));
    expect(removeLipSyncTrackSpy).toHaveBeenCalledWith(clipId, "lipsync-1");
  });
});
