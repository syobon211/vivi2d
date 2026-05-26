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
  const clip = createAnimationClip({
    id: "clip-1",
    name: "Test Clip",
    duration: 90,
    fps: 30,
  });
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        {
          id: "param-blink",
          name: "Blink",
          minValue: 0,
          maxValue: 1,
          defaultValue: 0,
        },
      ],
      clips: [clip],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeSceneId: null,
    activeClipId: clip.id,
    currentFrame: 12,
    isPlaying: false,
    isLooping: false,
    viewMode: "dopeSheet",
    selectedGraphTrackId: null,
  });
}

describe("TimelineHeader motion presets", () => {
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

  it("opens the motion preset dialog and applies a blink preset", async () => {
    const user = userEvent.setup();
    render(<TimelineHeader />);

    await user.click(screen.getByTitle("Open motion presets"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply preset" }));

    await waitFor(() => {
      const clip = useEditorStore.getState().project!.clips[0]!;
      const track = clip.tracks.find((entry) => entry.parameterId === "param-blink");
      expect(track?.keyframes.length).toBeGreaterThan(0);
    });
  });
});
