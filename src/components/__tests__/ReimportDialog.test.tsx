import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as psdReimport from "@/lib/psd-reimport";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createEmptyProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";
import { ReimportDialog } from "../ReimportDialog";


function setupStores() {
  useEditorStore.setState({
    project: createEmptyProject(),
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
}

describe("ReimportDialog", () => {
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
  });

  it("ダイアログタイトルが表示される", () => {
    render(<ReimportDialog onClose={vi.fn()} />);

    expect(screen.getByText("PSD 再読み込み")).toBeInTheDocument();
  });

  it("説明テキストが表示される", () => {
    render(<ReimportDialog onClose={vi.fn()} />);

    expect(
      screen.getByText(/差分を確認する PSD ファイルを選択してください/),
    ).toBeInTheDocument();
  });

  it("PSDファイル選択ボタンが表示される", () => {
    render(<ReimportDialog onClose={vi.fn()} />);

    expect(screen.getByText("PSD ファイルを選択")).toBeInTheDocument();
  });

  it("キャンセルボタンが表示される", () => {
    render(<ReimportDialog onClose={vi.fn()} />);

    expect(screen.getByText("キャンセル")).toBeInTheDocument();
  });

  it("キャンセルクリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<ReimportDialog onClose={onClose} />);

    fireEvent.click(screen.getByText("キャンセル"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("モーダルオーバーレイクリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<ReimportDialog onClose={onClose} />);

    const overlay = document.querySelector(".modal-overlay")!;
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("モーダルコンテンツクリックでは onClose が呼ばれない", () => {
    const onClose = vi.fn();
    render(<ReimportDialog onClose={onClose} />);

    const content = document.querySelector(".modal-content")!;
    fireEvent.click(content);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("初期状態では適用ボタンが表示されない", () => {
    render(<ReimportDialog onClose={vi.fn()} />);

    expect(screen.queryByText("適用")).not.toBeInTheDocument();
  });

  it("プロジェクト未読み込み時はファイル選択ボタンが無効", () => {
    useEditorStore.setState({ project: null });

    render(<ReimportDialog onClose={vi.fn()} />);

    const btn = screen.getByText("PSD ファイルを選択");
    expect(btn).toBeDisabled();
  });


  it("PSDファイル選択で analyzePsdReimport が呼ばれ差分が表示される", async () => {
    const fakeBuffer = new ArrayBuffer(8);
    (window.electronAPI.openPsdFile as any) = vi
      .fn()
      .mockResolvedValue({ buffer: fakeBuffer, path: "test.psd" });
    const analyzeSpy = vi.spyOn(psdReimport, "analyzePsdReimport").mockReturnValue({
      diff: {
        updated: [{ nodeId: "n1", nodeName: "レイヤー1" } as any],
        added: [{ nodeName: "新レイヤー" } as any],
        removed: [],
      },
      project: createEmptyProject(),
    } as any);

    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("PSD ファイルを選択"));

    await waitFor(() => {
      expect(analyzeSpy).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("更新 (1)")).toBeInTheDocument();
      expect(screen.getByText("新規追加 (1)")).toBeInTheDocument();
      expect(screen.getByText("レイヤー1")).toBeInTheDocument();
      expect(screen.getByText("新レイヤー")).toBeInTheDocument();
    });
    analyzeSpy.mockRestore();
  });

  it("PSDファイル選択がキャンセルされた場合は何も起きない", async () => {
    (window.electronAPI.openPsdFile as any) = vi.fn().mockResolvedValue(null);
    const analyzeSpy = vi.spyOn(psdReimport, "analyzePsdReimport");

    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("PSD ファイルを選択"));

    await waitFor(() => {
      expect(window.electronAPI.openPsdFile).toHaveBeenCalled();
    });

    expect(analyzeSpy).not.toHaveBeenCalled();
    analyzeSpy.mockRestore();
  });

  it("PSD解析エラー時に通知が送られる", async () => {
    (window.electronAPI.openPsdFile as any) = vi
      .fn()
      .mockRejectedValue(new Error("解析エラー"));
    const addNotification = vi.fn();
    useNotificationStore.setState({ addNotification } as any);

    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("PSD ファイルを選択"));

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("PSD解析失敗"),
      );
    });
  });


  it("削除のみの差分では適用ボタンが表示されない", async () => {
    const fakeBuffer = new ArrayBuffer(8);
    (window.electronAPI.openPsdFile as any) = vi
      .fn()
      .mockResolvedValue({ buffer: fakeBuffer });
    const analyzeSpy = vi.spyOn(psdReimport, "analyzePsdReimport").mockReturnValue({
      diff: {
        updated: [],
        added: [],
        removed: [{ nodeId: "n2", nodeName: "消えたレイヤー" } as any],
      },
      project: createEmptyProject(),
    } as any);

    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("PSD ファイルを選択"));

    await waitFor(() => {
      expect(screen.getByText("PSDから消失 (1)")).toBeInTheDocument();
    });
    expect(screen.queryByText("適用")).not.toBeInTheDocument();
    analyzeSpy.mockRestore();
  });

  it("差分なしの場合 '変更なし' 表示になる", async () => {
    const fakeBuffer = new ArrayBuffer(8);
    (window.electronAPI.openPsdFile as any) = vi
      .fn()
      .mockResolvedValue({ buffer: fakeBuffer });
    const analyzeSpy = vi.spyOn(psdReimport, "analyzePsdReimport").mockReturnValue({
      diff: { updated: [], added: [], removed: [] },
      project: createEmptyProject(),
    } as any);

    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("PSD ファイルを選択"));

    await waitFor(() => {
      expect(screen.getByText(/変更はありません|No changes/)).toBeInTheDocument();
    });
    analyzeSpy.mockRestore();
  });

  it("適用ボタンクリックで applyPsdReimport と onClose が呼ばれる", async () => {
    const fakeBuffer = new ArrayBuffer(8);
    (window.electronAPI.openPsdFile as any) = vi
      .fn()
      .mockResolvedValue({ buffer: fakeBuffer });
    const updatedProject = createEmptyProject();
    const analyzeSpy = vi.spyOn(psdReimport, "analyzePsdReimport").mockReturnValue({
      diff: {
        updated: [{ nodeId: "n1", nodeName: "レイヤー1" } as any],
        added: [],
        removed: [],
      },
      project: updatedProject,
    } as any);
    const applySpy = vi.spyOn(psdReimport, "applyPsdReimport").mockReturnValue({
      project: updatedProject,
      diff: {
        updated: [{ nodeId: "n1", nodeName: "レイヤー1" } as any],
        added: [],
        removed: [],
      },
    } as any);
    const onClose = vi.fn();

    render(<ReimportDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("PSD ファイルを選択"));
    await waitFor(() => {
      expect(screen.getByText("適用")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("適用"));

    expect(applySpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    analyzeSpy.mockRestore();
    applySpy.mockRestore();
  });

  it("適用時のエラーで通知が送られる", async () => {
    const fakeBuffer = new ArrayBuffer(8);
    (window.electronAPI.openPsdFile as any) = vi
      .fn()
      .mockResolvedValue({ buffer: fakeBuffer });
    const analyzeSpy = vi.spyOn(psdReimport, "analyzePsdReimport").mockReturnValue({
      diff: {
        updated: [{ nodeId: "n1", nodeName: "L" } as any],
        added: [],
        removed: [],
      },
      project: createEmptyProject(),
    } as any);
    const applySpy = vi.spyOn(psdReimport, "applyPsdReimport").mockImplementation(() => {
      throw new Error("apply failed");
    });
    const addNotification = vi.fn();
    useNotificationStore.setState({ addNotification } as any);

    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("PSD ファイルを選択"));
    await waitFor(() => {
      expect(screen.getByText("適用")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("適用"));

    expect(addNotification).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("再インポート失敗"),
    );
    analyzeSpy.mockRestore();
    applySpy.mockRestore();
  });
});
