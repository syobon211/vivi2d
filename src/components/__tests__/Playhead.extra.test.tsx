import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createEmptyProject } from "@/test/fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { Playhead } from "../timeline/Playhead";

const syncParametersAtFrameMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useTimelineSync", () => ({
  useTimelineSync: () => ({
    syncParametersAtFrame: syncParametersAtFrameMock,
  }),
}));

function setupStores(clipId: string, currentFrame = 0) {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [],
      clips: [{ id: clipId, name: "Test Clip", duration: 90, fps: 30, tracks: [] }],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeClipId: clipId,
    currentFrame,
    isPlaying: false,
    isLooping: false,
  });
}

describe("Playhead extra coverage", () => {
  const clipId = "clip-1";

  beforeEach(() => {
    syncParametersAtFrameMock.mockReset();
    setupStores(clipId, 10);
  });

  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
  });

  it("seeks one frame with Arrow keys and ten frames with Shift+Arrow", () => {
    render(<Playhead frame={10} duration={90} clipId={clipId} />);

    const playhead = screen.getByRole("slider", { name: /Playhead|再生ヘッド/ });

    fireEvent.keyDown(playhead, { key: "ArrowRight", shiftKey: true });
    expect(useTimelineStore.getState().currentFrame).toBe(20);

    fireEvent.keyDown(playhead, { key: "ArrowLeft" });
    expect(useTimelineStore.getState().currentFrame).toBe(9);

    expect(syncParametersAtFrameMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: clipId }),
      20,
    );
    expect(syncParametersAtFrameMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: clipId }),
      9,
    );
  });

  it("clamps keyboard seeking and supports Home and End", () => {
    const { rerender } = render(<Playhead frame={0} duration={90} clipId={clipId} />);

    const playhead = screen.getByRole("slider", { name: /Playhead|再生ヘッド/ });

    fireEvent.keyDown(playhead, { key: "ArrowLeft" });
    expect(useTimelineStore.getState().currentFrame).toBe(0);

    fireEvent.keyDown(playhead, { key: "End" });
    expect(useTimelineStore.getState().currentFrame).toBe(89);

    rerender(<Playhead frame={89} duration={90} clipId={clipId} />);
    fireEvent.keyDown(playhead, { key: "ArrowRight", shiftKey: true });
    expect(useTimelineStore.getState().currentFrame).toBe(89);

    rerender(<Playhead frame={89} duration={90} clipId={clipId} />);
    fireEvent.keyDown(playhead, { key: "Home" });
    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });

  it("ignores unrelated keys", () => {
    render(<Playhead frame={10} duration={90} clipId={clipId} />);

    const playhead = screen.getByRole("slider", { name: /Playhead|再生ヘッド/ });
    fireEvent.keyDown(playhead, { key: "ArrowUp" });

    expect(useTimelineStore.getState().currentFrame).toBe(10);
    expect(syncParametersAtFrameMock).not.toHaveBeenCalled();
  });
});
