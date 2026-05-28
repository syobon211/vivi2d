import { fireEvent, render, screen, within } from "@testing-library/react";
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

describe("ExportDialog", () => {
  it("ダイアログタイトルが表示される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText("Spine JSON エクスポート")).toBeInTheDocument();
  });

  it("「キャンセル」クリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("「エクスポート」ボタンが表示される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText("エクスポート")).toBeInTheDocument();
  });

  it("出力ファイル一覧が表示される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText(/spine\.json/)).toBeInTheDocument();
    expect(screen.getByText(/texture_00\.png/)).toBeInTheDocument();
  });
});

describe("ExportDialog — レイヤー選択", () => {
  it("全ViviMeshがチェックボックス付きで表示される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const list = screen.getByTestId("layer-select-list");
    expect(within(list).getByText("顔")).toBeInTheDocument();
    expect(within(list).getByText("体")).toBeInTheDocument();
    expect(within(list).getByText("背景")).toBeInTheDocument();
  });

  it("初期状態で全レイヤーが選択されている", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const checkboxes = screen
      .getByTestId("layer-select-list")
      .querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    for (const cb of checkboxes) {
      expect(cb).toBeChecked();
    }
  });

  it("レイヤー数カウンターが正しい", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText("レイヤー (3/3)")).toBeInTheDocument();
  });

  it("チェックボックスをクリックすると選択が切り替わる", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const list = screen.getByTestId("layer-select-list");
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();
    expect(screen.getByText("レイヤー (2/3)")).toBeInTheDocument();
  });

  it("「全解除」で全レイヤーが解除される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByText("全解除")[0]!);
    expect(screen.getByText("レイヤー (0/3)")).toBeInTheDocument();
    const checkboxes = screen
      .getByTestId("layer-select-list")
      .querySelectorAll('input[type="checkbox"]');
    for (const cb of checkboxes) {
      expect(cb).not.toBeChecked();
    }
  });

  it("全解除後に「全選択」で全レイヤーが復活する", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByText("全解除")[0]!);
    fireEvent.click(screen.getAllByText("全選択")[0]!);
    expect(screen.getByText("レイヤー (3/3)")).toBeInTheDocument();
  });

  it("レイヤー0件時はエクスポートボタンが無効化される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByText("全解除")[0]!);
    expect(screen.getByText("エクスポート")).toBeDisabled();
  });
});

describe("ExportDialog — クリップ選択", () => {
  it("全クリップがチェックボックス付きで表示される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const list = screen.getByTestId("clip-select-list");
    expect(within(list).getByText("待機")).toBeInTheDocument();
    expect(within(list).getByText("歩行")).toBeInTheDocument();
  });

  it("初期状態で全クリップが選択されている", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const checkboxes = screen
      .getByTestId("clip-select-list")
      .querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    for (const cb of checkboxes) {
      expect(cb).toBeChecked();
    }
  });

  it("クリップ数カウンターが正しい", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByText("アニメーション (2/2)")).toBeInTheDocument();
  });

  it("クリップをトグルできる", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const list = screen.getByTestId("clip-select-list");
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();
    expect(screen.getByText("アニメーション (1/2)")).toBeInTheDocument();
  });

  it("クリップがないプロジェクトではクリップセクションが非表示", () => {
    mockProject = createEmptyProject();
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.queryByTestId("clip-select-list")).not.toBeInTheDocument();
  });
});


describe("ExportDialog — handleExport", () => {
  it("エクスポートボタンクリックでselectExportDirectoryが呼ばれる", async () => {
    const mockSelectDir = vi.fn().mockResolvedValue(undefined);
    const origAPI = window.electronAPI;
    window.electronAPI = { ...origAPI, selectExportDirectory: mockSelectDir } as any;

    render(<ExportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("エクスポート"));

    await vi.waitFor(() => {
      expect(mockSelectDir).toHaveBeenCalled();
    });

    window.electronAPI = origAPI;
  });

  it("ディレクトリ未選択時は早期リターンする", async () => {
    const mockSelectDir = vi.fn().mockResolvedValue(undefined);
    const mockWriteFiles = vi.fn();
    const origAPI = window.electronAPI;
    window.electronAPI = {
      ...origAPI,
      selectExportDirectory: mockSelectDir,
      writeExportFiles: mockWriteFiles,
    } as any;

    render(<ExportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("エクスポート"));

    await vi.waitFor(() => {
      expect(mockSelectDir).toHaveBeenCalled();
    });
    expect(mockWriteFiles).not.toHaveBeenCalled();

    window.electronAPI = origAPI;
  });

  it("プロジェクトがnullの場合はエクスポートしない", async () => {
    mockProject = null;
    const mockSelectDir = vi.fn();
    const origAPI = window.electronAPI;
    window.electronAPI = { ...origAPI, selectExportDirectory: mockSelectDir } as any;

    render(<ExportDialog onClose={vi.fn()} />);

    const exportBtn = screen.getByText("エクスポート");
    fireEvent.click(exportBtn);

    expect(mockSelectDir).not.toHaveBeenCalled();

    window.electronAPI = origAPI;
  });

  it("全レイヤーの選択を解除するとエクスポートボタンが無効になる", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const list = screen.getByTestId("layer-select-list");
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');

    for (const cb of checkboxes) {
      if ((cb as HTMLInputElement).checked) {
        fireEvent.click(cb);
      }
    }

    const exportBtn = screen.getByText("エクスポート");
    expect(exportBtn.closest("button")).toBeDisabled();
  });

  it("部分選択時にレイヤーカウンターが更新される", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    const list = screen.getByTestId("layer-select-list");
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');

    fireEvent.click(checkboxes[0]!);
    expect(screen.getByText(/レイヤー.*\(2\/3\)/)).toBeInTheDocument();
  });
});
