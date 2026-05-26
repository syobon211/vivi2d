import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BoneTrack } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createBoneNode, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { BoneTrackRow } from "../timeline/BoneTrackRow";


const boneNode = createBoneNode({ id: "bone-1", name: "テストボーン" });
const clipId = "clip-1";

function setupStores() {
  const project = {
    ...createEmptyProject(),
    layers: [boneNode],
    clips: [
      {
        id: clipId,
        name: "テスト",
        duration: 90,
        fps: 30,
        tracks: [],
        boneTracks: [
          {
            boneId: "bone-1",
            property: "angle" as const,
            keyframes: [
              { frame: 0, value: 0, interpolation: "linear" as const },
              { frame: 45, value: 15, interpolation: "linear" as const },
              { frame: 89, value: 30, interpolation: "linear" as const },
            ],
          },
        ],
      },
    ],
    scenes: [{ id: "scene-1", name: "シーン1", clips: [] }],
  };

  useEditorStore.setState({ project, projectVersion: 1 });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeClipId: clipId,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
  });
}

function createTestTrack(): BoneTrack {
  return {
    boneId: "bone-1",
    property: "angle",
    keyframes: [
      { frame: 0, value: 0, interpolation: "linear" as const },
      { frame: 45, value: 15, interpolation: "linear" as const },
      { frame: 89, value: 30, interpolation: "linear" as const },
    ],
  };
}


describe("BoneTrackRow", () => {
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

  it("キーフレームマーカーを表示する", () => {
    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const markers = document.querySelectorAll(".tl-keyframe-bone");
    expect(markers).toHaveLength(3);
  });

  it("キーフレーム追加ボタンが表示される", () => {
    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    expect(screen.getByTitle("現在のフレームにキーフレーム追加")).toBeInTheDocument();
  });

  it("現在のフレームにキーフレームがある場合、削除ボタンが表示される", () => {
    useTimelineStore.setState({ currentFrame: 0 });

    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    expect(screen.getByTitle("現在のフレームのキーフレーム削除")).toBeInTheDocument();
  });

  it("現在のフレームにキーフレームがない場合、削除ボタンは表示されない", () => {
    useTimelineStore.setState({ currentFrame: 10 });

    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    expect(
      screen.queryByTitle("現在のフレームのキーフレーム削除"),
    ).not.toBeInTheDocument();
  });

  it("現在のフレーム上のキーフレームに active クラスが付く", () => {
    useTimelineStore.setState({ currentFrame: 45 });

    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const activeMarkers = document.querySelectorAll(".tl-keyframe-bone.active");
    expect(activeMarkers).toHaveLength(1);
  });

  it("キーフレームのツールチップにフレーム番号と値が表示される", () => {
    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const markers = document.querySelectorAll(".tl-keyframe-bone");
    expect(markers[0]!.getAttribute("title")).toContain("F0");
    expect(markers[0]!.getAttribute("title")).toContain("0.00");
    expect(markers[1]!.getAttribute("title")).toContain("F45");
    expect(markers[1]!.getAttribute("title")).toContain("15.00");
  });

  it("空のトラック（キーフレームなし）でもエラーにならない", () => {
    const emptyTrack: BoneTrack = {
      boneId: "bone-1",
      property: "angle",
      keyframes: [],
    };

    expect(() =>
      render(<BoneTrackRow track={emptyTrack} clipId={clipId} duration={90} />),
    ).not.toThrow();
  });

  it("キーフレーム追加ボタンでストアに反映される", async () => {
    const user = userEvent.setup();
    useTimelineStore.setState({ currentFrame: 10 });

    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const boneTrack = clip.boneTracks?.find(
      (t) => t.boneId === "bone-1" && t.property === "angle",
    );
    expect(boneTrack).toBeDefined();
    const kf = boneTrack!.keyframes.find((k) => k.frame === 10);
    expect(kf).toBeDefined();
  });

  it("削除ボタンでキーフレームがストアから削除される", async () => {
    const user = userEvent.setup();
    useTimelineStore.setState({ currentFrame: 45 });

    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const removeBtn = screen.getByTitle("現在のフレームのキーフレーム削除");
    await user.click(removeBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const boneTrack = clip.boneTracks?.find(
      (t) => t.boneId === "bone-1" && t.property === "angle",
    );
    expect(boneTrack).toBeDefined();
    expect(boneTrack!.keyframes.find((k) => k.frame === 45)).toBeUndefined();
  });

  it("scaleXプロパティのキーフレーム追加で正しい値が使用される", async () => {
    const user = userEvent.setup();
    const boneWithScale = createBoneNode({
      id: "bone-1",
      name: "テストボーン",
      bone: { angle: 0, length: 50, scaleX: 1.5, scaleY: 0.8 },
    });
    const proj = useEditorStore.getState().project!;
    proj.layers = [boneWithScale];
    const scaleXTrack: BoneTrack = {
      boneId: "bone-1",
      property: "scaleX",
      keyframes: [],
    };
    proj.clips[0]!.boneTracks = [...(proj.clips[0]!.boneTracks ?? []), scaleXTrack];
    useEditorStore.setState({ project: { ...proj } });
    useTimelineStore.setState({ currentFrame: 10 });

    render(<BoneTrackRow track={scaleXTrack} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const bt = clip.boneTracks?.find(
      (t) => t.boneId === "bone-1" && t.property === "scaleX",
    );
    expect(bt).toBeDefined();
    const kf = bt!.keyframes.find((k) => k.frame === 10);
    expect(kf).toBeDefined();
    expect(kf!.value).toBe(1.5);
  });

  it("scaleYプロパティのキーフレーム追加で正しい値が使用される", async () => {
    const user = userEvent.setup();
    const boneWithScale = createBoneNode({
      id: "bone-1",
      name: "テストボーン",
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 2.0 },
    });
    const proj = useEditorStore.getState().project!;
    proj.layers = [boneWithScale];
    const scaleYTrack: BoneTrack = {
      boneId: "bone-1",
      property: "scaleY",
      keyframes: [],
    };
    proj.clips[0]!.boneTracks = [...(proj.clips[0]!.boneTracks ?? []), scaleYTrack];
    useEditorStore.setState({ project: { ...proj } });
    useTimelineStore.setState({ currentFrame: 10 });

    render(<BoneTrackRow track={scaleYTrack} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const bt = clip.boneTracks?.find(
      (t) => t.boneId === "bone-1" && t.property === "scaleY",
    );
    expect(bt).toBeDefined();
    const kf = bt!.keyframes.find((k) => k.frame === 10);
    expect(kf).toBeDefined();
    expect(kf!.value).toBe(2.0);
  });

  it("存在しないボーンIDでキーフレーム追加は無視される", async () => {
    const user = userEvent.setup();
    const missingTrack: BoneTrack = {
      boneId: "missing-bone",
      property: "angle",
      keyframes: [],
    };
    useTimelineStore.setState({ currentFrame: 5 });

    render(<BoneTrackRow track={missingTrack} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const bt = clip.boneTracks?.find((t) => t.boneId === "missing-bone");
    expect(bt).toBeUndefined();
  });

  it("プロジェクト未設定でキーフレーム追加はエラーにならない", async () => {
    const user = userEvent.setup();
    useEditorStore.setState({ project: null });
    useTimelineStore.setState({ currentFrame: 5 });

    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);
  });

  it("トラック領域クリックでシークが発生する", () => {
    render(<BoneTrackRow track={createTestTrack()} clipId={clipId} duration={90} />);

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

  it("ネストされたレイヤーツリーからボーンを再帰検索できる", async () => {
    const user = userEvent.setup();
    const childBone = createBoneNode({
      id: "nested-bone",
      name: "ネストボーン",
      bone: { angle: 45, length: 30, scaleX: 1, scaleY: 1 },
    });
    const parentGroup = {
      id: "group-1",
      name: "グループ",
      kind: "group" as const,
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      children: [childBone],
      blendMode: "normal" as const,
      expanded: true,
    };
    const proj = useEditorStore.getState().project!;
    proj.layers = [parentGroup];
    proj.clips[0]!.boneTracks = [
      { boneId: "nested-bone", property: "angle", keyframes: [] },
    ];
    useEditorStore.setState({ project: { ...proj } });
    useTimelineStore.setState({ currentFrame: 5 });

    const nestedTrack: BoneTrack = {
      boneId: "nested-bone",
      property: "angle",
      keyframes: [],
    };

    render(<BoneTrackRow track={nestedTrack} clipId={clipId} duration={90} />);

    const addBtn = screen.getByTitle("現在のフレームにキーフレーム追加");
    await user.click(addBtn);

    const clip = useEditorStore.getState().project!.clips[0]!;
    const bt = clip.boneTracks?.find((t) => t.boneId === "nested-bone");
    expect(bt).toBeDefined();
    const kf = bt!.keyframes.find((k) => k.frame === 5);
    expect(kf).toBeDefined();
    expect(kf!.value).toBe(45);
  });
});
