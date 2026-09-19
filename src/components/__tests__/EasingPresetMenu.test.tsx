import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createEmptyProject } from "@/test/fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { EasingPresetMenu } from "../timeline/EasingPresetMenu";

function setupStores() {
  const project = {
    ...createEmptyProject(),
    parameters: [
      { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
    ],
    clips: [
      {
        id: "clip-1",
        name: "テスト",
        duration: 90,
        fps: 30,
        tracks: [
          {
            parameterId: "p1",
            keyframes: [
              { frame: 0, value: 0, interpolation: "linear" as const },
              { frame: 45, value: 15, interpolation: "linear" as const },
            ],
          },
        ],
      },
    ],
  };

  useEditorStore.setState({ project, projectVersion: 1 });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({ activeClipId: "clip-1", currentFrame: 0 });
}

describe("EasingPresetMenu", () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as any);
    setupStores();
  });
  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
  });

  it("各プリセットの制御点を対象フレームだけに適用する", async () => {
    const user = userEvent.setup();
    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);
    const select = screen.getByTitle("イージングプリセット");
    expect(select).toHaveValue("");
    for (const label of ["リニア", "イーズイン", "イーズアウト", "イーズイン・アウト"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    const presets = [
      ["easeIn", [0.42, 0, 1, 1]],
      ["easeOut", [0, 0, 0.58, 1]],
      ["easeInOut", [0.42, 0, 0.58, 1]],
      ["linear", [0, 0, 1, 1]],
    ] as const;
    for (const [preset, controls] of presets) {
      await user.selectOptions(select, preset);
      const track = useEditorStore
        .getState()
        .project!.clips[0]!.tracks.find((t) => t.parameterId === "p1")!;
      const keyframe = track.keyframes.find((k) => k.frame === 0)!;
      expect(keyframe.interpolation, preset).toBe("bezier");
      expect(
        [keyframe.cp1x, keyframe.cp1y, keyframe.cp2x, keyframe.cp2y],
        preset,
      ).toEqual(controls);
      expect(track.keyframes.find((k) => k.frame === 45)).toEqual({
        frame: 45,
        value: 15,
        interpolation: "linear",
      });
    }
  });

  it("空文字の change イベントでは applyEasingPreset が呼ばれない", () => {
    const applyEasingSpy = vi.spyOn(useClipStore.getState(), "applyEasingPreset");

    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);

    const select = screen.getByTitle("イージングプリセット") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "" } });

    expect(applyEasingSpy).not.toHaveBeenCalled();
    applyEasingSpy.mockRestore();
  });

  it("異なるフレームのキーフレームにプリセットを適用できる", async () => {
    const user = userEvent.setup();

    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={45} />);

    const select = screen.getByTitle("イージングプリセット");
    await user.selectOptions(select, "easeIn");

    const clip = useEditorStore.getState().project!.clips[0]!;
    const track = clip.tracks.find((t) => t.parameterId === "p1")!;
    const kf = track.keyframes.find((k) => k.frame === 45)!;
    expect(kf).toMatchObject({
      interpolation: "bezier",
      cp1x: 0.42,
      cp1y: 0,
      cp2x: 1,
      cp2y: 1,
    });
    expect(track.keyframes.find((k) => k.frame === 0)).toEqual({
      frame: 0,
      value: 0,
      interpolation: "linear",
    });
  });
});
