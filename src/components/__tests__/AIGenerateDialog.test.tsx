import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useComfyUIStore } from "@/stores/comfyuiStore";
import { resetAllStores } from "@/test/store-reset";
import { AIGenerateDialog } from "../AIGenerateDialog";


vi.mock("@vivi2d/provider-comfyui/workflows/image-to-layers", () => ({
  buildImageToLayersWorkflow: vi
    .fn()
    .mockReturnValue({ "1": { class_type: "test", inputs: {} } }),
}));
vi.mock("@vivi2d/provider-comfyui/workflows/prompt-to-layers", () => ({
  buildPromptToLayersWorkflow: vi
    .fn()
    .mockReturnValue({ "1": { class_type: "test", inputs: {} } }),
}));

describe("AIGenerateDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    resetAllStores();
    useComfyUIStore.getState().setBaseUrl("http://127.0.0.1:8188");
    useComfyUIStore.getState().reset();
    vi.clearAllMocks();
  });

  it("ダイアログタイトルを表示する", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    expect(
      screen.getByRole("dialog", {
        name: /自動モデル生成|Automatic Model Generation/i,
      }),
    ).toBeInTheDocument();
  });

  it("画像からの生成タブがデフォルトで選択される", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const tabs = document.querySelectorAll(".ai-gen-tab");
    expect(tabs[0]!.classList.contains("active")).toBe(true);
    expect(tabs[1]!.classList.contains("active")).toBe(false);
  });

  it("プロンプトタブに切り替えるとテキストエリアが表示される", () => {
    render(<AIGenerateDialog onClose={onClose} />);

    expect(screen.queryAllByRole("textbox").length).toBe(0);

    const promptTab = screen.getByText(/プロンプトから|From Prompt/i);
    fireEvent.click(promptTab);

    expect(screen.getAllByRole("textbox").length).toBeGreaterThanOrEqual(1);
  });

  it("シード・解像度・ステップ数のパラメータが表示される", () => {
    render(<AIGenerateDialog onClose={onClose} />);

    expect(screen.getByText(/シード|Seed/i)).toBeInTheDocument();
    expect(screen.getByText(/解像度|Resolution/i)).toBeInTheDocument();
    expect(screen.getByText(/ステップ数|Steps/i)).toBeInTheDocument();
  });

  it("解像度セレクトに1280（推奨）が含まれる", () => {
    render(<AIGenerateDialog onClose={onClose} />);

    const select = screen.getByDisplayValue(/1280/);
    expect(select).toBeInTheDocument();
  });

  it("ライセンス注記が表示される", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    expect(screen.getByText(/ComfyUI.*See-through/i)).toBeInTheDocument();
  });

  it("閉じるボタンでonCloseが呼ばれる", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const closeBtn = screen.getByText(/閉じる|Close/i);
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("エラーが設定されるとエラーメッセージが表示される", () => {
    useComfyUIStore.getState().setError("テスト接続エラー");
    render(<AIGenerateDialog onClose={onClose} />);
    expect(screen.getByText(/テスト接続エラー/)).toBeInTheDocument();
  });

  it("生成中は閉じるボタンが無効化される", () => {
    useComfyUIStore.getState().setGenerating(true);
    render(<AIGenerateDialog onClose={onClose} />);

    const closeBtn = screen.getByText(/閉じる|Close/i);
    expect(closeBtn).toBeDisabled();
  });

  it("生成中はタブ切り替えが無効化される", () => {
    useComfyUIStore.getState().setGenerating(true);
    render(<AIGenerateDialog onClose={onClose} />);

    const tabs = screen
      .getAllByRole("button")
      .filter((b) => b.classList.contains("ai-gen-tab"));
    for (const tab of tabs) {
      expect(tab).toBeDisabled();
    }
  });

  it("プロンプトモードでプロンプトが空だと生成ボタンが無効化される", () => {
    render(<AIGenerateDialog onClose={onClose} />);

    const promptTab = screen.getByText(/プロンプトから|From Prompt/i);
    fireEvent.click(promptTab);

    const textarea = screen.getAllByRole("textbox")[0]!;
    fireEvent.change(textarea, { target: { value: "" } });

    const genBtn = screen.getByText(/生成.*開始|Start Generation/i);
    expect(genBtn).toBeDisabled();
  });

  it("進捗表示がgenerating=true時のみ表示される", () => {
    const { rerender } = render(<AIGenerateDialog onClose={onClose} />);

    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();

    useComfyUIStore.getState().setGenerating(true);
    useComfyUIStore.getState().setProgress("処理中...", 42);
    rerender(<AIGenerateDialog onClose={onClose} />);

    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it("オーバーレイクリックでonCloseが呼ばれる", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("シード値を変更できる", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const seedInput = screen.getByDisplayValue("42");
    fireEvent.change(seedInput, { target: { value: "123" } });
    expect(screen.getByDisplayValue("123")).toBeInTheDocument();
  });

  it("解像度を変更できる", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const select = screen.getByDisplayValue(/1280/);
    fireEvent.change(select, { target: { value: "1024" } });
    expect(screen.getByDisplayValue("1024")).toBeInTheDocument();
  });

  it("ステップ数を変更できる", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const stepsInput = screen.getByDisplayValue("30");
    fireEvent.change(stepsInput, { target: { value: "50" } });
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
  });

  it("プロンプトモードでネガティブプロンプトを変更できる", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const promptTab = screen.getByText(/プロンプトから|From Prompt/i);
    fireEvent.click(promptTab);

    const textareas = screen.getAllByRole("textbox");
    expect(textareas.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(textareas[1]!, { target: { value: "ugly, deformed" } });
  });

  it("画像タブではテキストエリアが表示されない", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    expect(screen.queryAllByRole("textbox").length).toBe(0);
  });

  it("プロンプトモードで入力があると生成ボタンが有効になる", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const promptTab = screen.getByText(/プロンプトから|From Prompt/i);
    fireEvent.click(promptTab);

    const genBtn = screen.getByText(/生成.*開始|Start Generation/i);
    expect(genBtn).not.toBeDisabled();
  });

  it("モーダルコンテンツクリックで閉じない", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    const content = document.querySelector(".modal-content");
    if (content) fireEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("画像タブのボタンテキストが正しい", () => {
    render(<AIGenerateDialog onClose={onClose} />);
    expect(
      screen.getByText(/画像を選.*生成|Select Image.*Generate/i),
    ).toBeInTheDocument();
  });
});
