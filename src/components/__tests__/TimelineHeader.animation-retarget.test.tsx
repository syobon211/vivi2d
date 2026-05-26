import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { TimelineHeader } from "../timeline/TimelineHeader";

function setupStores() {
  const sourceClip = createAnimationClip({
    id: "clip-source",
    name: "Source Clip",
    duration: 60,
    fps: 30,
    tracks: [
      {
        parameterId: "param-a",
        keyframes: [{ frame: 0, value: 1, interpolation: "linear" }],
      },
    ],
  });
  const targetClip = createAnimationClip({
    id: "clip-target",
    name: "Target Clip",
    duration: 60,
    fps: 30,
  });
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        { id: "param-a", name: "Angle X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      clips: [sourceClip, targetClip],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeSceneId: null,
    activeClipId: "clip-target",
    currentFrame: 10,
    isPlaying: false,
    isLooping: false,
    viewMode: "dopeSheet",
    selectedGraphTrackId: null,
  });
}

describe("TimelineHeader animation retarget", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
    setupStores();
  });

  afterEach(() => {
    cleanup();
    resetEditorStore();
    useI18nStore.getState().setLocale("ja");
    resetTimelineStore();
  });

  it("opens the retarget dialog and copies source parameter keys into the active clip", async () => {
    const user = userEvent.setup();
    render(<TimelineHeader />);

    await user.click(screen.getByTitle("Open clip retargeting"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply retarget" }));

    await waitFor(() => {
      const targetClip = useEditorStore
        .getState()
        .project!.clips.find((clip) => clip.id === "clip-target")!;
      const track = targetClip.tracks.find((entry) => entry.parameterId === "param-a");
      expect(track?.keyframes.some((keyframe) => keyframe.frame === 10)).toBe(true);
    });
  });
});
