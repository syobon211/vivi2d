import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetSelectionStore,
  resetTimelineStore,
} from "@/test/store-reset";
import { TimelineHeader } from "../timeline/TimelineHeader";

function setupStores(options: { withActiveClip?: boolean } = {}) {
  const clip = createAnimationClip({
    id: "clip-1",
    name: "Base Clip",
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
        {
          id: "param-sway",
          name: "Idle Sway",
          minValue: -30,
          maxValue: 30,
          defaultValue: 0,
        },
      ],
      clips: options.withActiveClip ? [clip] : [],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeSceneId: null,
    activeClipId: options.withActiveClip ? clip.id : null,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
    viewMode: "dopeSheet",
    selectedGraphTrackId: null,
  });
}

describe("TimelineHeader first motion", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
    resetHistoryStore();
    setupStores({ withActiveClip: true });
  });

  afterEach(() => {
    cleanup();
    resetEditorStore();
    resetHistoryStore();
    useI18nStore.getState().setLocale("ja");
    resetSelectionStore();
    resetTimelineStore();
  });

  it("opens the first motion dialog and applies generated idle tracks to the active clip", async () => {
    const user = userEvent.setup();
    render(<TimelineHeader />);

    await user.click(screen.getByTitle("Create a first motion clip"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create first motion" }));

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

  it("can create a new clip and undo the whole operation in one step", async () => {
    setupStores({ withActiveClip: false });
    const user = userEvent.setup();
    render(<TimelineHeader />);

    await user.click(screen.getByTitle("Create a first motion clip"));
    await user.clear(screen.getByLabelText("Clip name"));
    await user.type(screen.getByLabelText("Clip name"), "Quick Idle");
    await user.click(screen.getByRole("button", { name: "Create first motion" }));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.clips).toHaveLength(1);
    });

    const createdClipId = useEditorStore.getState().project!.clips[0]!.id;
    expect(useTimelineStore.getState().activeClipId).toBe(createdClipId);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    useHistoryStore.getState().undo();

    expect(useEditorStore.getState().project!.clips).toHaveLength(0);
  });
});
