import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QuickActionsDialog } from "@/components/QuickActionsDialog";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { TimelineHeader } from "../timeline/TimelineHeader";

function setupTimeline() {
  const clip = createAnimationClip({
    id: "clip-1",
    name: "Base Clip",
    duration: 90,
    fps: 30,
  });
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      clips: [clip],
    },
    projectVersion: 1,
  });
  useTimelineStore.setState({
    activeSceneId: null,
    activeClipId: clip.id,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
    viewMode: "dopeSheet",
    selectedGraphTrackId: null,
  });
}

describe("TimelineHeader quick actions bridge", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
    setupTimeline();
  });

  it("opens Motion Presets from the quick actions palette", async () => {
    const user = userEvent.setup();
    render(
      <>
        <TimelineHeader />
        <QuickActionsDialog />
      </>,
    );

    act(() => {
      useQuickActionsStore.getState().openPalette();
    });
    const palette = await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "preset");
    await user.click(within(palette).getByRole("button", { name: /preset/i }));

    expect(
      await screen.findByRole("dialog", { name: /motion presets/i }),
    ).toBeInTheDocument();
  });
});
