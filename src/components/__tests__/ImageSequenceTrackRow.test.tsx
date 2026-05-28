import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImageSequenceTrack } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createAnimationClip, createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { ImageSequenceTrackRow } from "../timeline/ImageSequenceTrackRow";
import { TimelineBody } from "../timeline/TimelineBody";


const mesh1 = createViviMesh({ id: "mesh-1", name: "顔" });
const mesh2 = createViviMesh({ id: "mesh-2", name: "髪" });

function setupWithImageSequence() {
  const clip = createAnimationClip({
    id: "clip-1",
    name: "テスト",
    duration: 60,
    fps: 30,
    tracks: [],
    imageSequenceTracks: [
      {
        targetMeshId: "mesh-1",
        entries: [
          { startFrame: 0, imageId: "img-a" },
          { startFrame: 20, imageId: "img-b" },
          { startFrame: 40, imageId: "img-c" },
        ],
      },
    ],
  });

  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [mesh1, mesh2],
      clips: [clip],
    },
    projectVersion: 1,
  });
  useTimelineStore.setState({
    activeClipId: "clip-1",
    activeSceneId: null,
    currentFrame: 0,
    viewMode: "dopeSheet",
    selectedGraphTrackId: null,
  });
}

describe("ImageSequenceTrackRow", () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as ReturnType<typeof readPsd>);
  });
  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
  });

  it("画像シーケンストラックラベルが表示される", () => {
    setupWithImageSequence();
    render(<TimelineBody />);
    expect(screen.getByText(/顔/)).toBeInTheDocument();
  });

  it("画像シーケンスブロックが表示される", () => {
    setupWithImageSequence();
    const { container } = render(<TimelineBody />);
    const blocks = container.querySelectorAll(".tl-imgseq-block");
    expect(blocks.length).toBe(3);
  });

  it("エントリ追加ボタンが表示される", () => {
    setupWithImageSequence();
    render(<TimelineBody />);
    expect(screen.getByTitle("現在のフレームにエントリ追加")).toBeInTheDocument();
  });

  it("トラック追加ドロップダウンに画像シーケンスグループがある", () => {
    setupWithImageSequence();
    const { container } = render(<TimelineBody />);
    const select = container.querySelector(".tl-add-track-select");
    expect(select).toBeInTheDocument();
    const options = select?.querySelectorAll("option");
    const imgSeqOption = Array.from(options ?? []).find(
      (o) => o.value === "imgseq:mesh-2",
    );
    expect(imgSeqOption).toBeDefined();
  });

  it("トラック削除ボタンが表示される", () => {
    setupWithImageSequence();
    render(<TimelineBody />);
    const removeBtns = screen.getAllByTitle("トラック削除");
    expect(removeBtns.length).toBeGreaterThanOrEqual(1);
  });
});


const clipId = "clip-1";

function setupDirectStores() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      clips: [
        {
          id: clipId,
          name: "テスト",
          duration: 90,
          fps: 30,
          tracks: [],
          imageSequenceTracks: [
            {
              targetMeshId: "mesh-1",
              entries: [
                { startFrame: 0, imageId: "img-a" },
                { startFrame: 30, imageId: "img-b" },
                { startFrame: 60, imageId: "img-c" },
              ],
            },
          ],
        },
      ],
    },
    projectVersion: 1,
  });
  useTimelineStore.setState({
    activeClipId: clipId,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
  });
}

function createDirectTrack(): ImageSequenceTrack {
  return {
    targetMeshId: "mesh-1",
    entries: [
      { startFrame: 0, imageId: "img-a" },
      { startFrame: 30, imageId: "img-b" },
      { startFrame: 60, imageId: "img-c" },
    ],
  };
}

describe("ImageSequenceTrackRow 直接テスト", () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as ReturnType<typeof readPsd>);
    setupDirectStores();
  });
  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
  });

  it("現在のフレームにエントリがある場合、削除ボタンが表示される", () => {
    useTimelineStore.setState({ currentFrame: 0 });

    render(
      <ImageSequenceTrackRow track={createDirectTrack()} clipId={clipId} duration={90} />,
    );

    expect(screen.getByTitle("現在のフレームのエントリ削除")).toBeInTheDocument();
  });

  it("現在のフレームにエントリがない場合、削除ボタンは表示されない", () => {
    useTimelineStore.setState({ currentFrame: 10 });

    render(
      <ImageSequenceTrackRow track={createDirectTrack()} clipId={clipId} duration={90} />,
    );

    expect(screen.queryByTitle("現在のフレームのエントリ削除")).not.toBeInTheDocument();
  });

  it("activeフレームのブロックにactiveクラスが付く", () => {
    useTimelineStore.setState({ currentFrame: 15 });

    render(
      <ImageSequenceTrackRow track={createDirectTrack()} clipId={clipId} duration={90} />,
    );

    const active = document.querySelectorAll(".tl-imgseq-block.active");
    expect(active).toHaveLength(1);
  });

  it("トラック領域クリックでシークが発生する", () => {
    render(
      <ImageSequenceTrackRow track={createDirectTrack()} clipId={clipId} duration={90} />,
    );

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

  it("エントリ追加ボタンでストアに反映される", async () => {
    const user = userEvent.setup();
    useTimelineStore.setState({ currentFrame: 15 });

    render(
      <ImageSequenceTrackRow track={createDirectTrack()} clipId={clipId} duration={90} />,
    );

    const addBtn = screen.getByTitle("現在のフレームにエントリ追加");
    await user.click(addBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const isTrack = clip.imageSequenceTracks?.find((t) => t.targetMeshId === "mesh-1");
    expect(isTrack).toBeDefined();
    const entry = isTrack!.entries.find((e) => e.startFrame === 15);
    expect(entry).toBeDefined();
  });

  it("削除ボタンでエントリがストアから削除される", async () => {
    const user = userEvent.setup();
    useTimelineStore.setState({ currentFrame: 30 });

    render(
      <ImageSequenceTrackRow track={createDirectTrack()} clipId={clipId} duration={90} />,
    );

    const removeBtn = screen.getByTitle("現在のフレームのエントリ削除");
    await user.click(removeBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const isTrack = clip.imageSequenceTracks?.find((t) => t.targetMeshId === "mesh-1");
    expect(isTrack).toBeDefined();
    expect(isTrack!.entries.find((e) => e.startFrame === 30)).toBeUndefined();
  });

  it("空のエントリリストでもエラーにならない", () => {
    const emptyTrack: ImageSequenceTrack = {
      targetMeshId: "mesh-1",
      entries: [],
    };

    expect(() =>
      render(<ImageSequenceTrackRow track={emptyTrack} clipId={clipId} duration={90} />),
    ).not.toThrow();
  });

  it("ブロックのツールチップにフレーム範囲と画像IDが表示される", () => {
    render(
      <ImageSequenceTrackRow track={createDirectTrack()} clipId={clipId} duration={90} />,
    );

    const blocks = document.querySelectorAll(".tl-imgseq-block");
    expect(blocks[0]!.getAttribute("title")).toContain("F0-29");
    expect(blocks[0]!.getAttribute("title")).toContain("img-a");
    expect(blocks[2]!.getAttribute("title")).toContain("F60-89");
    expect(blocks[2]!.getAttribute("title")).toContain("img-c");
  });
});
