import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SceneBlendPanel } from "@/components/SceneBlendPanel";
import { useEditorStore } from "@/stores/editorStore";
import { createEmptyProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";


function setupProjectWithScenes() {
  const project = {
    ...createEmptyProject(),
    scenes: [
      { id: "scene-1", name: "メインシーン", clips: [] },
      { id: "scene-2", name: "サブシーン", clips: [] },
    ],
  };
  useEditorStore.setState({ project, projectVersion: 1 });
  return project;
}

function setupProjectWithBlend() {
  const project = {
    ...createEmptyProject(),
    scenes: [
      { id: "scene-1", name: "メインシーン", clips: [] },
      { id: "scene-2", name: "サブシーン", clips: [] },
    ],
    sceneBlends: [
      {
        id: "blend-1",
        sourceSceneId: "scene-1",
        targetSceneId: "scene-2",
        mode: "crossfade" as const,
        transitionFrames: 30,
        easing: "linear" as const,
      },
    ],
  };
  useEditorStore.setState({ project, projectVersion: 1 });
  return project;
}

describe("SceneBlendPanel", () => {
  beforeEach(() => {
    resetEditorStore();
  });

  afterEach(() => {
    resetEditorStore();
  });

  it("プロジェクトなしで何も表示されない", () => {
    const { container } = render(<SceneBlendPanel />);
    expect(container.querySelector(".scene-blend-panel")).not.toBeInTheDocument();
  });

  it("パネルヘッダーが表示される", () => {
    setupProjectWithScenes();
    render(<SceneBlendPanel />);
    expect(screen.getByText("シーンブレンド")).toBeInTheDocument();
  });

  it("ブレンドなし時にメッセージが表示される", () => {
    setupProjectWithScenes();
    render(<SceneBlendPanel />);
    expect(screen.getByText("ブレンドなし")).toBeInTheDocument();
  });

  it("追加ボタンが表示される", () => {
    setupProjectWithScenes();
    render(<SceneBlendPanel />);
    expect(screen.getByText("+ ブレンド追加")).toBeInTheDocument();
  });

  it("シーンが2つ未満のとき追加ボタンがdisabled", () => {
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        scenes: [{ id: "s1", name: "唯一のシーン", clips: [] }],
      },
      projectVersion: 1,
    });
    render(<SceneBlendPanel />);
    expect(screen.getByText("+ ブレンド追加")).toBeDisabled();
  });

  it("追加ボタンクリックでフォームが表示される", async () => {
    const user = userEvent.setup();
    setupProjectWithScenes();
    render(<SceneBlendPanel />);
    await user.click(screen.getByText("+ ブレンド追加"));
    expect(screen.getByText(/OK|確認/)).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
  });

  it("追加フォームでキャンセルするとフォームが閉じる", async () => {
    const user = userEvent.setup();
    setupProjectWithScenes();
    render(<SceneBlendPanel />);
    await user.click(screen.getByText("+ ブレンド追加"));
    await user.click(screen.getByText("キャンセル"));
    expect(screen.getByText("+ ブレンド追加")).toBeInTheDocument();
  });

  it("ソースとターゲットを選択してOKでブレンドが作成される", async () => {
    const user = userEvent.setup();
    setupProjectWithScenes();
    render(<SceneBlendPanel />);

    await user.click(screen.getByText("+ ブレンド追加"));
    const selects = document.querySelectorAll(".scene-blend-select");
    fireEvent.change(selects[0]!, { target: { value: "scene-1" } });
    fireEvent.change(selects[1]!, { target: { value: "scene-2" } });
    await user.click(screen.getByText(/OK|確認/));

    const project = useEditorStore.getState().project!;
    expect(project.sceneBlends!.length).toBe(1);
  });

  it("同じシーンを選択した場合はブレンドが作成されない", async () => {
    const user = userEvent.setup();
    setupProjectWithScenes();
    render(<SceneBlendPanel />);

    await user.click(screen.getByText("+ ブレンド追加"));
    const selects = document.querySelectorAll(".scene-blend-select");
    fireEvent.change(selects[0]!, { target: { value: "scene-1" } });
    fireEvent.change(selects[1]!, { target: { value: "scene-1" } });
    await user.click(screen.getByText(/OK|確認/));

    const project = useEditorStore.getState().project!;
    expect(project.sceneBlends ?? []).toHaveLength(0);
  });

  it("ソースが未選択の場合はブレンドが作成されない", async () => {
    const user = userEvent.setup();
    setupProjectWithScenes();
    render(<SceneBlendPanel />);

    await user.click(screen.getByText("+ ブレンド追加"));
    const selects = document.querySelectorAll(".scene-blend-select");
    fireEvent.change(selects[1]!, { target: { value: "scene-2" } });
    await user.click(screen.getByText(/OK|確認/));

    const project = useEditorStore.getState().project!;
    expect(project.sceneBlends ?? []).toHaveLength(0);
  });

  it("既存ブレンドが表示される", () => {
    setupProjectWithBlend();
    render(<SceneBlendPanel />);
    expect(screen.getByText("メインシーン → サブシーン")).toBeInTheDocument();
  });

  it("ブレンド削除ボタンでブレンドが削除される", async () => {
    const user = userEvent.setup();
    setupProjectWithBlend();
    render(<SceneBlendPanel />);

    await user.click(screen.getByTitle("削除"));

    const project = useEditorStore.getState().project!;
    expect(project.sceneBlends!).toHaveLength(0);
  });

  it("ブレンドモードを変更できる", () => {
    setupProjectWithBlend();
    render(<SceneBlendPanel />);

    const modeSelect = document.querySelectorAll("select")[0]!;
    fireEvent.change(modeSelect, { target: { value: "additive" } });

    const project = useEditorStore.getState().project!;
    expect(project.sceneBlends![0]!.mode).toBe("additive");
  });

  it("遷移フレーム数を変更できる", () => {
    setupProjectWithBlend();
    render(<SceneBlendPanel />);

    const frameInput = screen.getByRole("spinbutton");
    fireEvent.change(frameInput, { target: { value: "60" } });

    const project = useEditorStore.getState().project!;
    expect(project.sceneBlends![0]!.transitionFrames).toBe(60);
  });

  it("イージングを変更できる", () => {
    setupProjectWithBlend();
    render(<SceneBlendPanel />);

    const selects = document.querySelectorAll("select");
    const easingSelect = selects[selects.length - 1]!;
    fireEvent.change(easingSelect, { target: { value: "bezier" } });

    const project = useEditorStore.getState().project!;
    expect(project.sceneBlends![0]!.easing).toBe("bezier");
  });

  it("存在しないシーンIDの場合は「?」が表示される", () => {
    const project = {
      ...createEmptyProject(),
      scenes: [],
      sceneBlends: [
        {
          id: "blend-1",
          sourceSceneId: "nonexistent-1",
          targetSceneId: "nonexistent-2",
          mode: "crossfade" as const,
          transitionFrames: 30,
          easing: "linear" as const,
        },
      ],
    };
    useEditorStore.setState({ project, projectVersion: 1 });
    render(<SceneBlendPanel />);
    expect(screen.getByText("? → ?")).toBeInTheDocument();
  });

  it("フレーム数を0以下にすると1にクランプされる", () => {
    setupProjectWithBlend();
    render(<SceneBlendPanel />);

    const frameInput = screen.getByRole("spinbutton");
    fireEvent.change(frameInput, { target: { value: "0" } });

    const project = useEditorStore.getState().project!;
    expect(project.sceneBlends![0]!.transitionFrames).toBe(1);
  });
});
