import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnimationClip } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createEmptyProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetSceneStore,
  resetTimelineStore,
} from "@/test/store-reset";
import { SceneSelector } from "../timeline/SceneSelector";


function setupStores(
  scenes: Array<{ id: string; name: string; clips: AnimationClip[] }> = [],
  activeSceneId: string | null = null,
) {
  const project = {
    ...createEmptyProject(),
    scenes,
  };

  useEditorStore.setState({ project, projectVersion: 1 });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
  useTimelineStore.setState({
    activeSceneId,
    activeClipId: null,
    currentFrame: 0,
    isPlaying: false,
    isLooping: false,
  });
}


describe("SceneSelector", () => {
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
    resetSceneStore();
  });

  it("シーン未選択時にデフォルトオプションが表示される", () => {
    setupStores();

    render(<SceneSelector />);

    expect(screen.getByText("シーン未選択")).toBeInTheDocument();
  });

  it("シーン一覧がドロップダウンに表示される", () => {
    setupStores([
      { id: "s1", name: "シーン1", clips: [] },
      { id: "s2", name: "シーン2", clips: [] },
    ]);

    render(<SceneSelector />);

    expect(screen.getByText("シーン1")).toBeInTheDocument();
    expect(screen.getByText("シーン2")).toBeInTheDocument();
  });

  it("新規シーンボタンが表示される", () => {
    setupStores();

    render(<SceneSelector />);

    expect(screen.getByTitle("新規シーン")).toBeInTheDocument();
  });

  it("シーン選択時に複製・削除ボタンが表示される", () => {
    setupStores([{ id: "s1", name: "シーン1", clips: [] }], "s1");

    render(<SceneSelector />);

    expect(screen.getByTitle("シーン複製")).toBeInTheDocument();
    expect(screen.getByTitle("シーン削除")).toBeInTheDocument();
  });

  it("シーン未選択時は複製・削除ボタンが表示されない", () => {
    setupStores([{ id: "s1", name: "シーン1", clips: [] }]);

    render(<SceneSelector />);

    expect(screen.queryByTitle("シーン複製")).not.toBeInTheDocument();
    expect(screen.queryByTitle("シーン削除")).not.toBeInTheDocument();
  });

  it("新規シーンボタンでシーンが作成される", async () => {
    const user = userEvent.setup();
    setupStores();

    render(<SceneSelector />);

    const createBtn = screen.getByTitle("新規シーン");
    await user.click(createBtn);

    const project = useEditorStore.getState().project!;
    expect(project.scenes.length).toBe(1);
    expect(project.scenes[0]!.name).toBe("シーン 1");

    const activeSceneId = useTimelineStore.getState().activeSceneId;
    expect(activeSceneId).toBe(project.scenes[0]!.id);
  });

  it("シーン削除ボタンでシーンが削除される", async () => {
    const user = userEvent.setup();
    setupStores([{ id: "s1", name: "シーン1", clips: [] }], "s1");

    render(<SceneSelector />);

    const deleteBtn = screen.getByTitle("シーン削除");
    await user.click(deleteBtn);

    const project = useEditorStore.getState().project!;
    expect(project.scenes.length).toBe(0);
    expect(useTimelineStore.getState().activeSceneId).toBeNull();
  });

  it("シーン複製ボタンでシーンが複製される", async () => {
    const user = userEvent.setup();
    setupStores([{ id: "s1", name: "シーン1", clips: [] }], "s1");

    render(<SceneSelector />);

    const dupBtn = screen.getByTitle("シーン複製");
    await user.click(dupBtn);

    const project = useEditorStore.getState().project!;
    expect(project.scenes.length).toBe(2);
    const activeSceneId = useTimelineStore.getState().activeSceneId;
    expect(activeSceneId).not.toBe("s1");
    expect(activeSceneId).toMatch(/\S/);
  });

  it("セレクトボックスでシーンを切り替えられる", async () => {
    const user = userEvent.setup();
    setupStores(
      [
        { id: "s1", name: "シーン1", clips: [] },
        { id: "s2", name: "シーン2", clips: [] },
      ],
      "s1",
    );

    render(<SceneSelector />);

    const select = screen.getByTitle("シーン選択");
    await user.selectOptions(select, "s2");

    expect(useTimelineStore.getState().activeSceneId).toBe("s2");
  });
});
