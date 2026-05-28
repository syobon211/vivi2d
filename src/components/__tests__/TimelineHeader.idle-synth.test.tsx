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
    name: "Target Clip",
    duration: 90,
    fps: 30,
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

describe("TimelineHeader idle synth", () => {
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

  it("opens the idle synth dialog and applies generated blink and breathing keys", async () => {
    const user = userEvent.setup();
    render(<TimelineHeader />);

    await user.click(screen.getByTitle("Open idle synth"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply idle synth" }));

    await waitFor(() => {
      const clip = useEditorStore.getState().project!.clips[0]!;
      expect(
        clip.tracks.find((entry) => entry.parameterId === "blink-left")?.keyframes.length,
      ).toBeGreaterThan(0);
      expect(
        clip.tracks.find((entry) => entry.parameterId === "blink-right")?.keyframes
          .length,
      ).toBeGreaterThan(0);
      expect(
        clip.tracks.find((entry) => entry.parameterId === "param-breath")?.keyframes
          .length,
      ).toBeGreaterThan(0);
    });
  });
});
