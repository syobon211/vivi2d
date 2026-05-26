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
          id: "param-jaw",
          name: "Jaw Open",
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

describe("TimelineHeader motion assist", () => {
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

  it("opens the motion assist dialog, loads a bundle, and applies imported keys", async () => {
    const user = userEvent.setup();
    render(<TimelineHeader />);

    await user.click(screen.getByTitle("Open motion assist import"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const input = screen.getByLabelText("Choose motion assist bundle");
    await user.upload(
      input,
      new File(
        [
          JSON.stringify({
            schemaVersion: "1.0.0",
            fps: 30,
            durationFrames: 10,
            channels: [
              {
                id: "param-jaw",
                name: "Jaw Open",
                samples: [
                  { frame: 0, value: 0.25 },
                  { frame: 9, value: 0.75 },
                ],
              },
            ],
          }),
        ],
        "jaw-open.json",
        { type: "application/json" },
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("jaw-open.json")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Apply import" }));

    await waitFor(() => {
      const clip = useEditorStore.getState().project!.clips[0]!;
      const track = clip.tracks.find((entry) => entry.parameterId === "param-jaw");
      expect(track?.keyframes.some((keyframe) => keyframe.frame === 12)).toBe(true);
      expect(track?.keyframes.some((keyframe) => keyframe.frame === 21)).toBe(true);
    });
  });
});
