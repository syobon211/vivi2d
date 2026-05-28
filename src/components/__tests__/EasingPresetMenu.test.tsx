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

  it("イージングセレクトが表示される", () => {
    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);

    expect(screen.getByTitle("イージングプリセット")).toBeInTheDocument();
  });

  it("4つのプリセットオプションが存在する", () => {
    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);

    expect(screen.getByText("リニア")).toBeInTheDocument();
    expect(screen.getByText("イーズイン")).toBeInTheDocument();
    expect(screen.getByText("イーズアウト")).toBeInTheDocument();
    expect(screen.getByText("イーズイン・アウト")).toBeInTheDocument();
  });

  it("プリセット選択でストアに反映される", async () => {
    const user = userEvent.setup();

    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);

    const select = screen.getByTitle("イージングプリセット");
    await user.selectOptions(select, "easeIn");

    const clip = useEditorStore.getState().project!.clips[0]!;
    const track = clip.tracks.find((t) => t.parameterId === "p1")!;
    const kf = track.keyframes.find((k) => k.frame === 0)!;
    expect(kf.interpolation).toBe("bezier");
  });

  it("デフォルト選択は空（プレースホルダー）", () => {
    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);

    const select = screen.getByTitle("イージングプリセット") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("easeOut プリセットを適用できる", async () => {
    const user = userEvent.setup();

    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);

    const select = screen.getByTitle("イージングプリセット");
    await user.selectOptions(select, "easeOut");

    const clip = useEditorStore.getState().project!.clips[0]!;
    const track = clip.tracks.find((t) => t.parameterId === "p1")!;
    const kf = track.keyframes.find((k) => k.frame === 0)!;
    expect(kf.interpolation).toBe("bezier");
  });

  it("easeInOut プリセットを適用できる", async () => {
    const user = userEvent.setup();

    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);

    const select = screen.getByTitle("イージングプリセット");
    await user.selectOptions(select, "easeInOut");

    const clip = useEditorStore.getState().project!.clips[0]!;
    const track = clip.tracks.find((t) => t.parameterId === "p1")!;
    const kf = track.keyframes.find((k) => k.frame === 0)!;
    expect(kf.interpolation).toBe("bezier");
  });

  it("linear プリセットを適用できる（bezier として適用される）", async () => {
    const user = userEvent.setup();

    render(<EasingPresetMenu clipId="clip-1" parameterId="p1" frame={0} />);

    const select = screen.getByTitle("イージングプリセット");
    await user.selectOptions(select, "linear");

    const clip = useEditorStore.getState().project!.clips[0]!;
    const track = clip.tracks.find((t) => t.parameterId === "p1")!;
    const kf = track.keyframes.find((k) => k.frame === 0)!;
    expect(kf.interpolation).toBe("bezier");
    expect(kf.cp1x).toBe(0);
    expect(kf.cp1y).toBe(0);
    expect(kf.cp2x).toBe(1);
    expect(kf.cp2y).toBe(1);
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
    expect(kf.interpolation).toBe("bezier");
  });
});
