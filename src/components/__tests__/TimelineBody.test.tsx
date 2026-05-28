import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import {
  createAnimationClip,
  createBoneNode,
  createEmptyProject,
} from "@/test/fixtures";
import { TEST_AUDIO_PATH } from "@/test/path-fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { TimelineBody } from "../timeline/TimelineBody";

const boneNode = createBoneNode({ id: "bone-1", name: "Arm" });

function setupStoresNoClip() {
  useEditorStore.setState({
    project: createEmptyProject(),
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeClipId: null,
    activeSceneId: null,
    currentFrame: 0,
    viewMode: "dopeSheet",
  });
}

function setupStoresWithClip() {
  const clip = createAnimationClip({
    id: "clip-1",
    name: "Clip",
    duration: 90,
    fps: 30,
    tracks: [
      {
        parameterId: "p1",
        keyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 89, value: 30, interpolation: "linear" },
        ],
      },
    ],
    boneTracks: [
      {
        boneId: "bone-1",
        property: "angle",
        keyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
      },
    ],
    imageSequenceTracks: [
      {
        targetMeshId: "mesh-imgseq",
        entries: [{ startFrame: 0, imageId: "img-1" }],
      },
    ],
    audioTracks: [
      {
        id: "audio-1",
        name: "voice.wav",
        sourcePath: TEST_AUDIO_PATH,
        startFrame: 4,
        sourceDurationSeconds: 2,
        gain: 1,
        muted: false,
      },
    ],
    lipSyncTracks: [
      {
        id: "lipsync-1",
        name: "Lip Sync: voice.wav",
        sourceAudioTrackId: "audio-1",
        analysisType: "rms",
        analysisFps: 30,
        samples: [0, 0.2, 0.4],
        targetParameterId: "p1",
        sourcePathAtBake: TEST_AUDIO_PATH,
        sourceDurationSecondsAtBake: 2,
        gain: 1,
        muted: false,
      },
    ],
  });

  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        {
          id: "p1",
          name: "Angle X",
          minValue: -30,
          maxValue: 30,
          defaultValue: 0,
        },
      ],
      layers: [boneNode],
      clips: [clip],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeClipId: "clip-1",
    activeSceneId: null,
    currentFrame: 0,
    viewMode: "dopeSheet",
    selectedGraphTrackId: null,
  });
}

describe("TimelineBody", () => {
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

  it("shows the empty state when there is no active clip", () => {
    setupStoresNoClip();

    const { container } = render(<TimelineBody />);

    expect(container.querySelector(".timeline-empty")).toBeInTheDocument();
  });

  it("renders all supported track labels in dope sheet mode", () => {
    setupStoresWithClip();

    const { container } = render(<TimelineBody />);

    expect(
      screen.getByText("Angle X", { selector: ".tl-track-name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Arm:Angle", { selector: ".tl-track-name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Image Sequence: Unknown", {
        selector: ".tl-track-name",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("voice.wav", { selector: ".tl-track-name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Lip Sync: voice.wav", { selector: ".tl-track-name" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".tl-add-track-select")).toBeInTheDocument();
  });

  it("renders audio blocks in the dope sheet rows", () => {
    setupStoresWithClip();

    const { container } = render(<TimelineBody />);

    expect(container.querySelector(".tl-ruler")).toBeInTheDocument();
    expect(container.querySelector(".tl-playhead")).toBeInTheDocument();
    expect(container.querySelector(".tl-audio-block")).toBeInTheDocument();
    expect(container.querySelector(".tl-lipsync-block")).toBeInTheDocument();
  });

  it("shows the graph editor instead of rows in graph mode", () => {
    setupStoresWithClip();
    useTimelineStore.setState({
      viewMode: "graphEditor",
      selectedGraphTrackId: "p1",
    });

    const { container } = render(<TimelineBody />);

    expect(
      container.querySelector(".graph-editor-container"),
    ).toBeInTheDocument();
    expect(container.querySelector(".tl-ruler")).not.toBeInTheDocument();
    expect(
      container.querySelector(".tl-track-label-selected"),
    ).toBeInTheDocument();
  });

  it("reads clips from the active scene when a scene is selected", () => {
    const clip = createAnimationClip({
      id: "scene-clip-1",
      name: "Scene Clip",
      duration: 60,
      fps: 30,
      tracks: [
        {
          parameterId: "p1",
          keyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
        },
      ],
    });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        parameters: [
          {
            id: "p1",
            name: "Scene Parameter",
            minValue: 0,
            maxValue: 1,
            defaultValue: 0,
          },
        ],
        clips: [],
        scenes: [{ id: "scene-1", name: "Scene", clips: [clip] }],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
    useTimelineStore.setState({
      activeSceneId: "scene-1",
      activeClipId: "scene-clip-1",
      currentFrame: 0,
      viewMode: "dopeSheet",
      selectedGraphTrackId: null,
    });

    render(<TimelineBody />);

    expect(screen.getByText("Scene Parameter")).toBeInTheDocument();
  });
});
