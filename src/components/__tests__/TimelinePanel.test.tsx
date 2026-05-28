import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createEmptyProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetParameterStore,
  resetTimelineStore,
} from "@/test/store-reset";
import { TimelinePanel } from "../TimelinePanel";

function setupStores() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        { id: "p1", name: "Angle X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useParameterStore.setState({ parameterValues: { p1: 0 } });
  resetTimelineStore();
}

describe("TimelinePanel", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
  });

  beforeEach(setupStores);

  afterEach(() => {
    cleanup();
    resetEditorStore();
    resetParameterStore();
    resetTimelineStore();
  });

  it("renders nothing when the project is unavailable", () => {
    useEditorStore.setState({ project: null });
    const { container } = render(<TimelinePanel />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the empty state when no clip is selected", () => {
    const { container } = render(<TimelinePanel />);
    expect(container.querySelector(".timeline-empty")).toBeInTheDocument();
  });

  it("creates and activates a new clip from the header button", () => {
    render(<TimelinePanel />);

    fireEvent.click(screen.getByTitle("New clip"));

    const clips = useEditorStore.getState().project!.clips;
    expect(clips).toHaveLength(1);
    expect(useTimelineStore.getState().activeClipId).toBe(clips[0]!.id);
  });

  it("shows the track add select after a clip is created", async () => {
    const { container } = render(<TimelinePanel />);
    fireEvent.click(screen.getByTitle("New clip"));

    await waitFor(() => {
      expect(container.querySelector(".tl-add-track-select")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "+ Add track" })).toBeInTheDocument();
    });
  });

  it("starts playback from the play button", async () => {
    render(<TimelinePanel />);
    fireEvent.click(screen.getByTitle("New clip"));

    fireEvent.click(await screen.findByTitle("Play"));

    await waitFor(() => {
      expect(useTimelineStore.getState().isPlaying).toBe(true);
    });
  });

  it("stops playback and rewinds to frame zero", async () => {
    render(<TimelinePanel />);
    fireEvent.click(screen.getByTitle("New clip"));
    useTimelineStore.getState().seekTo(30);

    fireEvent.click(await screen.findByTitle("Stop"));

    await waitFor(() => {
      expect(useTimelineStore.getState().currentFrame).toBe(0);
      expect(useTimelineStore.getState().isPlaying).toBe(false);
    });
  });

  it("toggles looping from the loop button", async () => {
    render(<TimelinePanel />);
    fireEvent.click(screen.getByTitle("New clip"));

    const loopButton = await screen.findByTitle("Loop");
    fireEvent.click(loopButton);
    await waitFor(() => expect(useTimelineStore.getState().isLooping).toBe(true));

    fireEvent.click(loopButton);
    await waitFor(() => expect(useTimelineStore.getState().isLooping).toBe(false));
  });

  it("deletes the active clip from the header button", async () => {
    render(<TimelinePanel />);
    fireEvent.click(screen.getByTitle("New clip"));

    fireEvent.click(await screen.findByTitle("Delete clip"));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.clips).toHaveLength(0);
      expect(useTimelineStore.getState().activeClipId).toBeNull();
    });
  });
});
