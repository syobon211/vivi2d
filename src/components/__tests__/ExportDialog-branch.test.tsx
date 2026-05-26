import { fireEvent, render, screen } from "@testing-library/react";
import type { ProjectData, Scene } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "@/components/ExportDialog";
import { createAnimationClip, createViviMesh, createEmptyProject } from "@/test/fixtures";


let mockProject: ProjectData | null = null;

vi.mock("@/stores/editorStore", () => ({
  useEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ project: mockProject }),
}));

vi.mock("@/stores/notificationStore", () => ({
  useNotificationStore: {
    getState: () => ({
      addNotification: vi.fn(),
    }),
  },
}));

function createProjectWithLayers() {
  const meshA = createViviMesh({ name: "顔" });
  const meshB = createViviMesh({ name: "体" });
  const meshC = createViviMesh({ name: "背景" });
  const clipA = createAnimationClip({ name: "待機" });
  const clipB = createAnimationClip({ name: "歩行" });
  const scene: Scene = {
    id: "scene-1",
    name: "シーン1",
    clips: [clipA, clipB],
  };
  const project = createEmptyProject();
  project.layers = [meshA, meshB, meshC];
  project.scenes = [scene];
  return { project, meshA, meshB, meshC, clipA, clipB };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProject = createProjectWithLayers().project;
});

describe("ExportDialog — 追加ブランチ", () => {
  it("プロジェクトが null の場合、エクスポートボタンが無効", () => {
    mockProject = null;
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText("エクスポート")).toBeDisabled();
  });

  it("一部レイヤーのみ選択してもテクスチャファイルが表示される", () => {
    render(<ExportDialog onClose={vi.fn()} />);

    const list = screen.getByTestId("layer-select-list");
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]!);

    expect(screen.getByText("レイヤー (2/3)")).toBeInTheDocument();
    expect(screen.getByText(/texture_00\.png/)).toBeInTheDocument();
  });

  it("全レイヤー解除後に再選択でテクスチャファイルが復活する", () => {
    render(<ExportDialog onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByText("全解除")[0]!);
    expect(screen.queryByText(/texture_00\.png/)).not.toBeInTheDocument();
    expect(screen.getByText("エクスポート")).toBeDisabled();

    fireEvent.click(screen.getAllByText("全選択")[0]!);
    expect(screen.getByText(/texture_00\.png/)).toBeInTheDocument();
    expect(screen.getByText("エクスポート")).not.toBeDisabled();
  });

  it("クリップの全解除・全選択が正しく動作する", () => {
    render(<ExportDialog onClose={vi.fn()} />);

    const deselectBtns = screen.getAllByText("全解除");
    fireEvent.click(deselectBtns[deselectBtns.length - 1]!);
    expect(screen.getByText("アニメーション (0/2)")).toBeInTheDocument();

    const selectBtns = screen.getAllByText("全選択");
    fireEvent.click(selectBtns[selectBtns.length - 1]!);
    expect(screen.getByText("アニメーション (2/2)")).toBeInTheDocument();
  });

  it("オーバーレイクリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);

    const overlay = screen.getByText("エクスポート").closest(".modal-content")!
      .parentElement!;
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("モーダルコンテンツクリックでは onClose が呼ばれない（stopPropagation）", () => {
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);

    const content = screen.getByText("エクスポート").closest(".modal-content")!;
    fireEvent.click(content);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("レイヤーとクリップの個別トグルが独立して動作する", () => {
    render(<ExportDialog onClose={vi.fn()} />);

    const layerList = screen.getByTestId("layer-select-list");
    const layerBoxes = layerList.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(layerBoxes[0]!);
    expect(screen.getByText("レイヤー (2/3)")).toBeInTheDocument();

    const clipList = screen.getByTestId("clip-select-list");
    const clipBoxes = clipList.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(clipBoxes[0]!);
    expect(screen.getByText("アニメーション (1/2)")).toBeInTheDocument();

    expect(screen.getByText("レイヤー (2/3)")).toBeInTheDocument();
  });


  it("レイヤーをトグルして再トグルで元に戻る", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const list = screen.getByTestId("layer-select-list");
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');

    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();

    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();
    expect(screen.getByText("レイヤー (3/3)")).toBeInTheDocument();
  });

  it("クリップをトグルして再トグルで元に戻る", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const list = screen.getByTestId("clip-select-list");
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');

    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();

    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();
    expect(screen.getByText("アニメーション (2/2)")).toBeInTheDocument();
  });

  it("ViviMeshがないプロジェクトでは「ViviMeshなし」が表示される", () => {
    mockProject = {
      ...createEmptyProject(),
      layers: [],
      scenes: [],
    };
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText("ViviMesh がありません")).toBeInTheDocument();
  });

  it("ViviMeshがないとテクスチャファイルが表示されない", () => {
    mockProject = {
      ...createEmptyProject(),
      layers: [],
      scenes: [],
    };
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.queryByText(/texture_00\.png/)).not.toBeInTheDocument();
  });

  it("出力ファイルにspine.jsonが常に表示される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText(/spine\.json/)).toBeInTheDocument();
  });

  it("エクスポートボタンがプロジェクトありでレイヤー選択ありのとき有効", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText("エクスポート")).not.toBeDisabled();
  });
});
