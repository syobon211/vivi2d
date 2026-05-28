import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnimationTrack } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { TrackRow } from "../timeline/TrackRow";


function setupStores(clipId: string) {
  const project = {
    ...createEmptyProject(),
    parameters: [
      { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
    ],
    clips: [
      {
        id: clipId,
        name: "テスト",
        duration: 90,
        fps: 30,
        tracks: [
          {
            parameterId: "p1",
            keyframes: [
              { frame: 0, value: -30, interpolation: "linear" as const },
              { frame: 45, value: 0, interpolation: "linear" as const },
              { frame: 89, value: 30, interpolation: "linear" as const },
            ],
          },
        ],
      },
    ],
  };

  useEditorStore.setState({ project, projectVersion: 1 });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeClipId: clipId,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
  });
  useParameterStore.setState({ parameterValues: { p1: 0 } });
}

function createTestTrack(): AnimationTrack {
  return {
    parameterId: "p1",
    keyframes: [
      { frame: 0, value: -30, interpolation: "linear" as const },
      { frame: 45, value: 0, interpolation: "linear" as const },
      { frame: 89, value: 30, interpolation: "linear" as const },
    ],
  };
}


describe("TrackRow", () => {
  const clipId = "clip-1";

  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as any);
    setupStores(clipId);
  });
  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
    resetParameterStore();
  });

  it("キーフレームマーカーを表示する", () => {
    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const markers = document.querySelectorAll(".tl-keyframe");
    expect(markers).toHaveLength(3);
  });

  it("キーフレーム追加ボタンが表示される", () => {
    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    expect(screen.getByTitle("現在のフレームにキーフレーム追加")).toBeInTheDocument();
  });

  it("キーフレーム追加ボタンでクリップにキーフレームが追加される", async () => {
    const user = userEvent.setup();
    useTimelineStore.setState({ currentFrame: 10 });
    useParameterStore.setState({ parameterValues: { p1: 5 } });

    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const track = clip.tracks.find((t) => t.parameterId === "p1")!;
    const kf = track.keyframes.find((k) => k.frame === 10);
    expect(kf).toBeDefined();
    expect(kf!.value).toBe(5);
  });

  it("現在のフレームにキーフレームがある場合、削除ボタンが表示される", () => {
    useTimelineStore.setState({ currentFrame: 0 });

    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    expect(screen.getByTitle("現在のフレームのキーフレーム削除")).toBeInTheDocument();
  });

  it("現在のフレームにキーフレームがない場合、削除ボタンは表示されない", () => {
    useTimelineStore.setState({ currentFrame: 10 });

    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    expect(
      screen.queryByTitle("現在のフレームのキーフレーム削除"),
    ).not.toBeInTheDocument();
  });

  it("削除ボタンでキーフレームが削除される", async () => {
    const user = userEvent.setup();
    useTimelineStore.setState({ currentFrame: 45 });

    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const removeBtn = screen.getByTitle("現在のフレームのキーフレーム削除");
    await user.click(removeBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const track = clip.tracks.find((t) => t.parameterId === "p1")!;
    expect(track.keyframes.find((k) => k.frame === 45)).toBeUndefined();
  });

  it("現在のフレーム上のキーフレームに active クラスが付く", () => {
    useTimelineStore.setState({ currentFrame: 45 });

    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const markers = document.querySelectorAll(".tl-keyframe");
    const activeMarkers = document.querySelectorAll(".tl-keyframe.active");
    expect(markers).toHaveLength(3);
    expect(activeMarkers).toHaveLength(1);
  });

  it("キーフレームのツールチップにフレーム番号と値を表示する", () => {
    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const markers = document.querySelectorAll(".tl-keyframe");
    expect(markers[0]!.getAttribute("title")).toContain("F0");
    expect(markers[0]!.getAttribute("title")).toContain("-30.00");
    expect(markers[1]!.getAttribute("title")).toContain("F45");
  });

  it("空のトラック（キーフレームなし）でもエラーにならない", () => {
    const emptyTrack: AnimationTrack = {
      parameterId: "p1",
      keyframes: [],
    };

    expect(() =>
      render(<TrackRow track={emptyTrack} clipId={clipId} duration={90} />),
    ).not.toThrow();
  });

  it("トラック領域クリックでシークが発生する", () => {
    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const content = document.querySelector(".tl-track-content") as HTMLElement;
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 890,
      bottom: 30,
      width: 890,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.click(content, { clientX: 445 });
    expect(useTimelineStore.getState().currentFrame).toBe(45);
  });

  it("パラメータが見つからない場合でもキーフレーム追加でエラーにならない", async () => {
    const user = userEvent.setup();
    const track: AnimationTrack = { parameterId: "missing-param", keyframes: [] };
    useTimelineStore.setState({ currentFrame: 5 });

    render(<TrackRow track={track} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);
    const clip = useEditorStore.getState().project!.clips[0]!;
    const t = clip.tracks.find((tr) => tr.parameterId === "missing-param");
    expect(t).toBeUndefined();
  });

  it("bezier補間のキーフレームのツールチップに(bezier)と表示される", () => {
    const bezierTrack: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "bezier" as const,
          cp1x: 0.25,
          cp1y: 0,
          cp2x: 0.75,
          cp2y: 1,
        },
        { frame: 89, value: 30, interpolation: "linear" as const },
      ],
    };

    render(<TrackRow track={bezierTrack} clipId={clipId} duration={90} />);

    const markers = document.querySelectorAll(".tl-keyframe");
    expect(markers[0]!.getAttribute("title")).toContain("(bezier)");
    expect(markers[1]!.getAttribute("title")).toContain("(linear)");
  });

  it("step補間のキーフレームのツールチップに(step)と表示される", () => {
    const stepTrack: AnimationTrack = {
      parameterId: "p1",
      keyframes: [
        { frame: 0, value: 0, interpolation: "step" as const },
        { frame: 89, value: 30, interpolation: "linear" as const },
      ],
    };

    render(<TrackRow track={stepTrack} clipId={clipId} duration={90} />);

    const markers = document.querySelectorAll(".tl-keyframe");
    expect(markers[0]!.getAttribute("title")).toContain("(step)");
  });

  it("defaultValue がパラメータ値として使われる（未設定時）", async () => {
    const user = userEvent.setup();
    useTimelineStore.setState({ currentFrame: 20 });
    useParameterStore.setState({ parameterValues: {} });

    render(<TrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const track = clip.tracks.find((t) => t.parameterId === "p1")!;
    const kf = track.keyframes.find((k) => k.frame === 20);
    expect(kf).toBeDefined();
    expect(kf!.value).toBe(0);
  });
});
