import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PsdReimportPreview } from "@/lib/psd-reimport";
import {
  analyzePsdReimport,
  applyPsdReimport,
  disposePsdReimport,
} from "@/lib/psd-reimport";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { createEmptyProject } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";
import { ReimportDialog } from "../ReimportDialog";

vi.mock("@/lib/psd-reimport", () => ({
  analyzePsdReimport: vi.fn(),
  applyPsdReimport: vi.fn(),
  disposePsdReimport: vi.fn(),
}));

function createPreview(): PsdReimportPreview {
  return {
    documentWidth: 800,
    documentHeight: 600,
    entries: [
      {
        leafIndex: 0,
        nodeId: "paint",
        nodeName: "Paint",
        status: "eligible",
        oldWidth: 32,
        oldHeight: 32,
        newWidth: 32,
        newHeight: 32,
        sourceLeft: 5,
        sourceTop: 6,
      },
      {
        leafIndex: 1,
        nodeId: "detail",
        nodeName: "Detail",
        status: "needs-confirmation",
        oldWidth: 32,
        oldHeight: 32,
        newWidth: 64,
        newHeight: 64,
        sourceLeft: 10,
        sourceTop: 12,
      },
      {
        leafIndex: 2,
        nodeId: "shadow",
        nodeName: "Shadow",
        status: "needs-confirmation",
        oldWidth: 16,
        oldHeight: 16,
        newWidth: 32,
        newHeight: 32,
        sourceLeft: 0,
        sourceTop: 0,
      },
      {
        leafIndex: 3,
        nodeId: "aspect",
        nodeName: "Aspect",
        status: "held",
        reason: "aspect-ratio-change",
        oldWidth: 30,
        oldHeight: 10,
        newWidth: 30,
        newHeight: 20,
        sourceLeft: 0,
        sourceTop: 0,
      },
      {
        leafIndex: 4,
        nodeName: "New",
        status: "unmatched",
        newWidth: 16,
        newHeight: 16,
        sourceLeft: 0,
        sourceTop: 0,
      },
    ],
    removed: [{ nodeId: "old", nodeName: "Old" }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function selectFile() {
  fireEvent.click(screen.getByRole("button", { name: "PSD ファイルを選択" }));
  await screen.findByRole("checkbox", { name: "Paint" });
}

describe("ReimportDialog", () => {
  const file = { buffer: new ArrayBuffer(8), fileName: "test.psd" };

  beforeEach(() => {
    useEditorStore.setState({ project: createEmptyProject(), projectVersion: 1 });
    vi.mocked(window.electronAPI.openPsdFile).mockReset().mockResolvedValue(file);
    vi.mocked(analyzePsdReimport).mockReset().mockReturnValue(createPreview());
    vi.mocked(applyPsdReimport).mockReset().mockReturnValue({ updatedCount: 1 });
    vi.mocked(disposePsdReimport).mockReset();
    vi.spyOn(useNotificationStore.getState(), "addNotification").mockImplementation(
      () => {},
    );
  });

  afterEach(() => {
    cleanup();
    resetEditorStore();
    vi.restoreAllMocks();
  });

  it("shows the update-only preview, raster sizes and separate source coordinates", async () => {
    const project = useEditorStore.getState().project;
    render(<ReimportDialog onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "PSD 再読み込み" })).toBeInTheDocument();
    expect(screen.getByText(/レイヤーは追加しません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "適用" })).not.toBeInTheDocument();
    await selectFile();

    expect(analyzePsdReimport).toHaveBeenCalledExactlyOnceWith(file.buffer, project);
    expect(
      screen.getByText(/入力 PSD のドキュメントサイズ: 800 × 600/),
    ).toBeInTheDocument();
    expect(screen.getByText("入力 PSD 内の位置: (5, 6) px")).toBeInTheDocument();
    expect(
      screen.getByText("テクスチャの画素数（現在 → 入力）: 32 × 32 → 64 × 64 px"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/モデルのサイズ・配置・メッシュ・UV・リグは変更しません/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/同じサイズでも画像のフレーム変更は自動検出できません/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/PSD の位置とドキュメントサイズはモデルに反映しません/),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Paint" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Detail" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Aspect" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "New" })).toBeDisabled();
    expect(screen.getByText(/テクスチャの縦横比が変わっています/)).toBeInTheDocument();
    expect(
      screen.getByText("対応する既存レイヤーなし — 追加しません"),
    ).toBeInTheDocument();
    expect(screen.getByText("PSDから消失 (1)")).toBeInTheDocument();
    expect(
      screen.getByText("以下はプロジェクトに残ります（削除されません）"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/新規追加/)).not.toBeInTheDocument();
  });

  it("passes only selected existing layers to the atomic adapter without replacing the project", async () => {
    const preview = createPreview();
    vi.mocked(analyzePsdReimport).mockReturnValue(preview);
    const project = useEditorStore.getState().project;
    const onClose = vi.fn();
    render(<ReimportDialog onClose={onClose} />);
    await selectFile();
    fireEvent.click(screen.getByRole("button", { name: "適用" }));

    expect(applyPsdReimport).toHaveBeenCalledExactlyOnceWith(preview, {
      selectedLeafIndices: [0],
      confirmedResolutionLeafIndices: [],
    });
    expect(useEditorStore.getState().project).toBe(project);
    expect(useNotificationStore.getState().addNotification).toHaveBeenCalledWith(
      "info",
      "PSD再インポート完了: 1 件更新",
    );
    expect(disposePsdReimport).toHaveBeenCalledWith(preview);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("requires confirmation for the exact selected resolution changes and invalidates changed sets", async () => {
    render(<ReimportDialog onClose={vi.fn()} />);
    await selectFile();
    const apply = screen.getByRole("button", { name: "適用" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Detail" }));
    expect(apply).toBeDisabled();
    expect(screen.getByText("Detail: 32 × 32 → 64 × 64 px")).toBeInTheDocument();
    expect(screen.getByText(/縦横比が同じだけでは保証できません/)).toBeInTheDocument();
    fireEvent.click(apply);
    expect(applyPsdReimport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "同じフレームであることを確認" }));
    expect(apply).toBeEnabled();
    // Changing an ordinary artwork selection does not invalidate the resolution set.
    fireEvent.click(screen.getByRole("checkbox", { name: "Paint" }));
    expect(apply).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Shadow" }));
    expect(apply).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "同じフレームであることを確認" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Shadow" }));
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "同じフレームであることを確認" }));
    fireEvent.click(apply);
    expect(applyPsdReimport).toHaveBeenCalledWith(expect.anything(), {
      selectedLeafIndices: [1],
      confirmedResolutionLeafIndices: [1],
    });
  });

  it("keeping current resolution textures retains same-size selections without applying automatically", async () => {
    render(<ReimportDialog onClose={vi.fn()} />);
    await selectFile();
    fireEvent.click(screen.getByRole("checkbox", { name: "Detail" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Shadow" }));
    fireEvent.click(
      screen.getByRole("button", { name: "これらのレイヤーは現在の画像を保持" }),
    );
    expect(screen.getByRole("checkbox", { name: "Paint" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Detail" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Shadow" })).not.toBeChecked();
    expect(applyPsdReimport).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "適用" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Paint" }));
    expect(screen.getByRole("button", { name: "適用" })).toBeDisabled();
  });

  it("reports an adapter no-op without a false updated or added count", async () => {
    vi.mocked(applyPsdReimport).mockReturnValue({ updatedCount: 0 });
    const onClose = vi.fn();
    render(<ReimportDialog onClose={onClose} />);
    await selectFile();
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(
      useNotificationStore.getState().addNotification,
    ).toHaveBeenCalledExactlyOnceWith("info", "変更はありません。");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reselecting disposes the old preview and never carries its confirmation forward", async () => {
    const first = createPreview();
    const second = createPreview();
    vi.mocked(analyzePsdReimport).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { unmount } = render(<ReimportDialog onClose={vi.fn()} />);
    await selectFile();
    fireEvent.click(screen.getByRole("checkbox", { name: "Detail" }));
    fireEvent.click(screen.getByRole("button", { name: "同じフレームであることを確認" }));
    await selectFile();
    expect(disposePsdReimport).toHaveBeenCalledExactlyOnceWith(first);
    expect(screen.getByRole("checkbox", { name: "Detail" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Detail" }));
    expect(screen.getByRole("button", { name: "適用" })).toBeDisabled();
    unmount();
    expect(disposePsdReimport).toHaveBeenLastCalledWith(second);
  });

  it("cancel and backdrop dismissal dispose previews, but clicks inside do not close", async () => {
    const preview = createPreview();
    vi.mocked(analyzePsdReimport).mockReturnValue(preview);
    const onClose = vi.fn();
    render(<ReimportDialog onClose={onClose} />);
    await selectFile();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(disposePsdReimport).toHaveBeenCalledExactlyOnceWith(preview);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not analyze a late native file result after cancel", async () => {
    const pending = deferred<typeof file | null>();
    vi.mocked(window.electronAPI.openPsdFile).mockReturnValue(pending.promise);
    const onClose = vi.fn();
    render(<ReimportDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "PSD ファイルを選択" }));
    expect(screen.getByRole("button", { name: "解析中..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await act(async () => pending.resolve(file));
    expect(analyzePsdReimport).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disposes a late prepared result after unmount instead of publishing it", async () => {
    const pending = deferred<PsdReimportPreview>();
    // Exercise the awaited-result lifetime independently of the adapter's synchronous decode.
    vi.mocked(analyzePsdReimport).mockReturnValue(
      pending.promise as unknown as PsdReimportPreview,
    );
    const { unmount } = render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "PSD ファイルを選択" }));
    await waitFor(() => expect(analyzePsdReimport).toHaveBeenCalledOnce());
    unmount();
    const preview = createPreview();
    await act(async () => pending.resolve(preview));
    expect(disposePsdReimport).toHaveBeenCalledExactlyOnceWith(preview);
    expect(applyPsdReimport).not.toHaveBeenCalled();
  });

  it("captures the project before file selection and rejects a preview from a changed project", async () => {
    const original = useEditorStore.getState().project;
    const pending = deferred<typeof file | null>();
    vi.mocked(window.electronAPI.openPsdFile).mockReturnValue(pending.promise);
    const preview = createPreview();
    vi.mocked(analyzePsdReimport).mockReturnValue(preview);
    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "PSD ファイルを選択" }));
    act(() => useEditorStore.setState({ project: createEmptyProject() }));
    await act(async () => pending.resolve(file));
    expect(analyzePsdReimport).toHaveBeenCalledExactlyOnceWith(file.buffer, original);
    expect(disposePsdReimport).toHaveBeenCalledExactlyOnceWith(preview);
    expect(screen.queryByRole("button", { name: "適用" })).not.toBeInTheDocument();
    expect(useNotificationStore.getState().addNotification).toHaveBeenCalledWith(
      "error",
      "PSDの解析に失敗しました。ファイルを選び直してください。",
    );
  });

  it("handles file-dialog cancellation and disables selection without a project", async () => {
    vi.mocked(window.electronAPI.openPsdFile).mockResolvedValue(null);
    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "PSD ファイルを選択" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "PSD ファイルを選択" })).toBeEnabled(),
    );
    expect(analyzePsdReimport).not.toHaveBeenCalled();
    act(() => useEditorStore.setState({ project: null }));
    expect(screen.getByRole("button", { name: "PSD ファイルを選択" })).toBeDisabled();
  });

  it("does not offer Apply for missing or unmatched layers only", async () => {
    const original = createPreview();
    const preview = {
      ...original,
      entries: original.entries.filter((entry) => entry.status === "unmatched"),
    };
    vi.mocked(analyzePsdReimport).mockReturnValue(preview);
    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "PSD ファイルを選択" }));
    await screen.findByText("PSDから消失 (1)");
    expect(screen.queryByRole("button", { name: "適用" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "New" })).toBeDisabled();
  });

  it("shows no changes for an empty preview", async () => {
    vi.mocked(analyzePsdReimport).mockReturnValue({
      documentWidth: 800,
      documentHeight: 600,
      entries: [],
      removed: [],
    });
    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "PSD ファイルを選択" }));
    expect(await screen.findByText("変更はありません。")).toBeInTheDocument();
  });

  it("keeps decoder and file errors out of notifications", async () => {
    vi.mocked(window.electronAPI.openPsdFile).mockRejectedValue(
      new Error("C:/synthetic-secret/token-canary.psd"),
    );
    render(<ReimportDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "PSD ファイルを選択" }));
    await waitFor(() =>
      expect(
        useNotificationStore.getState().addNotification,
      ).toHaveBeenCalledExactlyOnceWith(
        "error",
        "PSDの解析に失敗しました。ファイルを選び直してください。",
      ),
    );
  });

  it("discards a failed Apply preview, reports a fixed error and requires reanalysis", async () => {
    const preview = createPreview();
    vi.mocked(analyzePsdReimport).mockReturnValue(preview);
    vi.mocked(applyPsdReimport).mockImplementation(() => {
      throw new Error("C:/synthetic-secret/token-canary.psd");
    });
    const onClose = vi.fn();
    render(<ReimportDialog onClose={onClose} />);
    await selectFile();
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(
      useNotificationStore.getState().addNotification,
    ).toHaveBeenCalledExactlyOnceWith(
      "error",
      "PSDの再読み込みに失敗しました。ファイルを選び直して再試行してください。",
    );
    expect(disposePsdReimport).toHaveBeenCalledExactlyOnceWith(preview);
    expect(screen.queryByRole("button", { name: "適用" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PSD ファイルを選択" })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
