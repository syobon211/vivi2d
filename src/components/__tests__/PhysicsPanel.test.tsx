import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhysicsPanel } from "@/components/PhysicsPanel";
import { clearTextures } from "@/lib/texture-store";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { useTimelineStore } from "@/stores/timelineStore";
import { resetEditorStore, resetPhysicsStore } from "@/test/store-reset";

describe("PhysicsPanel", () => {
  beforeEach(() => {
    resetEditorStore();
    resetPhysicsStore();
    clearTextures();
  });

  it("プロジェクトなしでは何も表示しない", () => {
    const { container } = render(<PhysicsPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("プロジェクトありでパネルヘッダーが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<PhysicsPanel />);
    expect(screen.getByText("物理演算")).toBeInTheDocument();
  });

  it("有効チェックボックスが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<PhysicsPanel />);
    expect(screen.getByText("有効")).toBeInTheDocument();
  });

  it("グループ追加ボタンでグループを追加できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<PhysicsPanel />);

    fireEvent.click(screen.getByText("+ グループ追加"));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.physicsGroups).toHaveLength(1);
      expect(screen.getByText("物理グループ 1")).toBeInTheDocument();
    });
  });

  it("グループ削除ボタンでグループを削除できる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テストグループ");

    render(<PhysicsPanel />);
    fireEvent.click(screen.getByTitle("グループを削除"));

    expect(useEditorStore.getState().project!.physicsGroups).toHaveLength(0);
  });

  it("物理有効チェックボックスでisActiveが切り替わる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<PhysicsPanel />);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);

    expect(usePhysicsStore.getState().isActive).toBe(false);
  });

  it("重力スライダーが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テスト");

    render(<PhysicsPanel />);
    expect(screen.getByText("重力")).toBeInTheDocument();
    expect(screen.getByText("風")).toBeInTheDocument();
  });

  it("振り子追加ボタンで振り子を追加できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テスト");

    render(<PhysicsPanel />);
    fireEvent.click(screen.getByTitle("振り子を追加"));

    await waitFor(() => {
      const group = useEditorStore.getState().project!.physicsGroups[0]!;
      expect(group.pendulums).toHaveLength(2);
    });
  });

  it("リセットボタンが物理グループがある場合に表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テスト");

    render(<PhysicsPanel />);
    expect(screen.getByText("リセット")).toBeInTheDocument();
  });

  it("物理グループがない場合リセットボタンが表示されない", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");

    render(<PhysicsPanel />);
    expect(screen.queryByText("リセット")).not.toBeInTheDocument();
  });

  it("アクティブクリップがない場合ベイクボタンが表示されない", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テスト");

    render(<PhysicsPanel />);
    expect(screen.queryByText("ベイク")).not.toBeInTheDocument();
  });

  it("アクティブクリップがある場合ベイクボタンが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テスト");
    const project = useEditorStore.getState().project!;
    const clip = {
      id: "clip-1",
      name: "テストクリップ",
      duration: 90,
      fps: 30,
      tracks: [],
    };
    const scene = { id: "scene-1", name: "テストシーン", clips: [clip] };
    useEditorStore.setState({
      project: { ...project, scenes: [scene] },
      projectVersion: 2,
    });
    useTimelineStore.setState({ activeClipId: "clip-1" });

    render(<PhysicsPanel />);
    expect(screen.getByText("ベイク")).toBeInTheDocument();
  });

  it("リセットボタンクリックで物理状態がリセットされる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テスト");

    render(<PhysicsPanel />);
    fireEvent.click(screen.getByText("リセット"));

    expect(usePhysicsStore.getState().isActive).toBe(true);
  });


  it("ベイクボタンクリックでbakePhysicsToClipが呼ばれる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テスト");
    const project = useEditorStore.getState().project!;
    const clip = {
      id: "clip-1",
      name: "テストクリップ",
      duration: 90,
      fps: 30,
      tracks: [],
    };
    const scene = { id: "scene-1", name: "テストシーン", clips: [clip] };
    useEditorStore.setState({
      project: { ...project, scenes: [scene] },
      projectVersion: 2,
    });
    useTimelineStore.setState({ activeClipId: "clip-1" });

    const spy = vi.spyOn(useClipStore.getState(), "bakePhysicsToClip");

    render(<PhysicsPanel />);
    fireEvent.click(screen.getByText("ベイク"));

    expect(spy).toHaveBeenCalledWith("clip-1", {
      startFrame: 0,
      endFrame: 90,
      fps: 30,
      sampleInterval: 1,
    });
    spy.mockRestore();
  });

  it("アクティブクリップIDがあるが該当クリップが見つからない場合ベイクが無視される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().addPhysicsGroup("テスト");
    const project = useEditorStore.getState().project!;
    const clip = {
      id: "clip-1",
      name: "テストクリップ",
      duration: 90,
      fps: 30,
      tracks: [],
    };
    const scene = { id: "scene-1", name: "テストシーン", clips: [clip] };
    useEditorStore.setState({
      project: { ...project, scenes: [scene] },
      projectVersion: 2,
    });
    useTimelineStore.setState({ activeClipId: "nonexistent-clip" });

    const spy = vi.spyOn(useClipStore.getState(), "bakePhysicsToClip");

    render(<PhysicsPanel />);
    fireEvent.click(screen.getByText("ベイク"));

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("物理有効チェックをオフ→オンで切り替えできる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    usePhysicsStore.getState().setActive(false);
    render(<PhysicsPanel />);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).not.toBeChecked();

    fireEvent.click(checkboxes[0]!);
    expect(usePhysicsStore.getState().isActive).toBe(true);
  });

  it("グループ名が表示される（追加時にindex+1が名前に含まれる）", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<PhysicsPanel />);

    fireEvent.click(screen.getByText("+ グループ追加"));
    expect(screen.getByText("物理グループ 1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("+ グループ追加"));
    expect(screen.getByText("物理グループ 2")).toBeInTheDocument();
  });
});
