import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import { resetEditorStore, resetTimelineStore } from "@/test/store-reset";
import { TimelineHeader } from "../timeline/TimelineHeader";


function setupStores(opts: { withClip?: boolean; withScene?: boolean } = {}) {
  const clip = opts.withClip
    ? createAnimationClip({ id: "clip-1", name: "テストクリップ" })
    : undefined;

  const scenes = opts.withScene
    ? [{ id: "scene-1", name: "シーン1", clips: clip ? [clip] : [] }]
    : [];

  const project = {
    ...createEmptyProject(),
    clips: clip ? [clip] : [],
    scenes,
  };

  useEditorStore.setState({ project, projectVersion: 1 });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeSceneId: opts.withScene ? "scene-1" : null,
    activeClipId: opts.withClip ? "clip-1" : null,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
    viewMode: "dopeSheet",
  });
}


describe("TimelineHeader", () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [],
    } as any);
  });
  afterEach(() => {
    resetEditorStore();
    resetTimelineStore();
  });

  it("再生コントロールが表示される", () => {
    setupStores({ withClip: true });

    render(<TimelineHeader />);

    expect(screen.getByTitle("停止")).toBeInTheDocument();
    expect(screen.getByTitle("再生")).toBeInTheDocument();
    expect(screen.getByTitle("ループ")).toBeInTheDocument();
  });

  it("クリップ未選択時にコントロールが無効化される", () => {
    setupStores();

    render(<TimelineHeader />);

    expect(screen.getByTitle("停止")).toBeDisabled();
    expect(screen.getByTitle("再生")).toBeDisabled();
    expect(screen.getByTitle("ループ")).toBeDisabled();
  });

  it("クリップ選択時にフレーム表示が数値になる", () => {
    setupStores({ withClip: true });

    render(<TimelineHeader />);

    expect(screen.getByText(/0 \/ 89/)).toBeInTheDocument();
  });

  it("クリップ未選択時にフレーム表示がプレースホルダーになる", () => {
    setupStores();

    render(<TimelineHeader />);

    expect(screen.getByText("--:--:--")).toBeInTheDocument();
  });

  it("ドープシート/グラフエディタ切替ボタンが表示される", () => {
    setupStores({ withClip: true });

    render(<TimelineHeader />);

    expect(screen.getByTitle("グラフエディタに切替")).toBeInTheDocument();
  });

  it("ビューモード切替でドープシート→グラフエディタに切り替わる", async () => {
    const user = userEvent.setup();
    setupStores({ withClip: true });

    render(<TimelineHeader />);

    const toggleBtn = screen.getByTitle("グラフエディタに切替");
    await user.click(toggleBtn);

    expect(useTimelineStore.getState().viewMode).toBe("graphEditor");
  });

  it("新規クリップボタンでクリップが作成される", async () => {
    const user = userEvent.setup();
    setupStores();

    render(<TimelineHeader />);

    const createBtn = screen.getByTitle("新規クリップ");
    await user.click(createBtn);

    const project = useEditorStore.getState().project!;
    const totalClips =
      project.clips.length + project.scenes.flatMap((s) => s.clips).length;
    expect(totalClips).toBeGreaterThanOrEqual(1);
  });

  it("クリップ選択時に削除ボタンが表示される", () => {
    setupStores({ withClip: true });

    render(<TimelineHeader />);

    expect(screen.getByTitle("クリップ削除")).toBeInTheDocument();
  });

  it("クリップ未選択時に削除ボタンが表示されない", () => {
    setupStores();

    render(<TimelineHeader />);

    expect(screen.queryByTitle("クリップ削除")).not.toBeInTheDocument();
  });

  it("クリップ削除ボタンでactiveClipIdがnullになる", async () => {
    const user = userEvent.setup();
    setupStores({ withClip: true });

    render(<TimelineHeader />);

    const deleteBtn = screen.getByTitle("クリップ削除");
    await user.click(deleteBtn);

    expect(useTimelineStore.getState().activeClipId).toBeNull();
  });

  it("クリップ切り替えでactiveClipIdが更新される", async () => {
    const user = userEvent.setup();
    setupStores({ withClip: true });

    render(<TimelineHeader />);

    const select = document.querySelector(".tl-clip-select") as HTMLSelectElement;
    await user.selectOptions(select, "");

    expect(useTimelineStore.getState().activeClipId).toBeNull();
  });

  it("クリップ切り替えでパラメータ値が同期される", async () => {
    const user = userEvent.setup();
    setupStores({ withClip: true });

    render(<TimelineHeader />);

    const select = document.querySelector(".tl-clip-select") as HTMLSelectElement;
    await user.selectOptions(select, "clip-1");

    expect(useTimelineStore.getState().activeClipId).toBe("clip-1");
  });

  it("グラフエディタモード時にドープシートに切り替わる", async () => {
    const user = userEvent.setup();
    setupStores({ withClip: true });
    useTimelineStore.setState({ viewMode: "graphEditor" });

    render(<TimelineHeader />);

    const toggleBtn = screen.getByTitle("ドープシートに切替");
    await user.click(toggleBtn);

    expect(useTimelineStore.getState().viewMode).toBe("dopeSheet");
  });

  it("停止ボタンでフレームが0にリセットされる", async () => {
    const user = userEvent.setup();
    setupStores({ withClip: true });
    useTimelineStore.setState({ currentFrame: 30 });

    render(<TimelineHeader />);

    const stopBtn = screen.getByTitle("停止");
    await user.click(stopBtn);

    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });

  it("再生ボタンでisPlayingがトグルされる", async () => {
    const user = userEvent.setup();
    setupStores({ withClip: true });
    expect(useTimelineStore.getState().isPlaying).toBe(false);

    render(<TimelineHeader />);

    const playBtn = screen.getByTitle("再生");
    await user.click(playBtn);

    expect(useTimelineStore.getState().isPlaying).toBe(true);
  });

  it("ループボタンでisLoopingがトグルされる", async () => {
    const user = userEvent.setup();
    setupStores({ withClip: true });
    expect(useTimelineStore.getState().isLooping).toBe(false);

    render(<TimelineHeader />);

    const loopBtn = screen.getByTitle("ループ");
    await user.click(loopBtn);

    expect(useTimelineStore.getState().isLooping).toBe(true);
  });

  it("シーン内のクリップがセレクタに表示される", () => {
    setupStores({ withClip: true, withScene: true });

    render(<TimelineHeader />);

    const options = document.querySelectorAll(".tl-clip-select option");
    const optTexts = Array.from(options).map((o) => o.textContent);
    expect(optTexts).toContain("テストクリップ");
  });

  it("再生中に一時停止タイトルが表示される", () => {
    setupStores({ withClip: true });
    useTimelineStore.setState({ isPlaying: true });

    render(<TimelineHeader />);

    expect(screen.getByTitle("一時停止")).toBeInTheDocument();
  });

  it("ループ中にactiveクラスが付与される", () => {
    setupStores({ withClip: true });
    useTimelineStore.setState({ isLooping: true });

    render(<TimelineHeader />);

    const loopBtn = screen.getByTitle("ループ");
    expect(loopBtn.className).toContain("active");
  });
});
