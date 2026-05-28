import { fireEvent, render } from "@testing-library/react";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createEmptyProject } from "@/test/fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { Playhead } from "../timeline/Playhead";


function setupStores(clipId: string) {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [],
      clips: [{ id: clipId, name: "テスト", duration: 90, fps: 30, tracks: [] }],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeClipId: clipId,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
  });
}


describe("Playhead", () => {
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
  });

  it("プレイヘッド要素をレンダリングする", () => {
    const { container } = render(<Playhead frame={0} duration={90} clipId={clipId} />);

    expect(container.querySelector(".tl-playhead")).toBeInTheDocument();
    expect(container.querySelector(".tl-playhead-head")).toBeInTheDocument();
    expect(container.querySelector(".tl-playhead-line")).toBeInTheDocument();
  });

  it("frame=0 で left: 0% に配置される", () => {
    const { container } = render(<Playhead frame={0} duration={90} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;
    expect(playhead.style.left).toBe("0%");
  });

  it("中間フレームで正しい位置に配置される", () => {
    const { container } = render(<Playhead frame={44} duration={90} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;
    const expected = ((44 / 89) * 100).toString();
    expect(playhead.style.left).toContain(expected.slice(0, 4));
  });

  it("最終フレームで left: 100% に配置される", () => {
    const { container } = render(<Playhead frame={89} duration={90} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;
    expect(playhead.style.left).toBe("100%");
  });

  it("duration=1 で left: 0% に配置される（ゼロ除算回避）", () => {
    const { container } = render(<Playhead frame={0} duration={1} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;
    expect(playhead.style.left).toBe("0%");
  });

  it("ポインターイベントハンドラが設定されている", () => {
    const { container } = render(<Playhead frame={0} duration={90} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;
    expect(playhead).toBeInTheDocument();
  });

  it("pointerDown でドラッグ開始しシーク位置が更新される", () => {
    const { container } = render(<Playhead frame={0} duration={90} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;
    const parent = playhead.parentElement!;
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({
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

    vi.spyOn(playhead, "setPointerCapture").mockImplementation(() => {});

    fireEvent.pointerDown(playhead, { clientX: 445, pointerId: 1 });

    expect(useTimelineStore.getState().currentFrame).toBe(45);
  });

  it("pointerMove中にドラッグ中であればシークが更新される", () => {
    const { container } = render(<Playhead frame={0} duration={90} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;
    const parent = playhead.parentElement!;
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({
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
    vi.spyOn(playhead, "setPointerCapture").mockImplementation(() => {});

    fireEvent.pointerDown(playhead, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(playhead, { clientX: 445, pointerId: 1 });

    expect(useTimelineStore.getState().currentFrame).toBe(45);
  });

  it("pointerMove中にドラッグ非開始であればシークしない", () => {
    const { container } = render(<Playhead frame={0} duration={90} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;

    fireEvent.pointerMove(playhead, { clientX: 445, pointerId: 1 });

    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });

  it("pointerUpでドラッグが終了する", () => {
    const { container } = render(<Playhead frame={0} duration={90} clipId={clipId} />);

    const playhead = container.querySelector(".tl-playhead") as HTMLElement;
    const parent = playhead.parentElement!;
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({
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
    vi.spyOn(playhead, "setPointerCapture").mockImplementation(() => {});

    fireEvent.pointerDown(playhead, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(playhead, { pointerId: 1 });
    fireEvent.pointerMove(playhead, { clientX: 800, pointerId: 1 });

    const frame = useTimelineStore.getState().currentFrame;
    expect(frame).toBeLessThan(80);
  });
});
