import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuBar } from "@/components/MenuBar";
import { useI18nStore } from "@/lib/i18n";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useMultiViewStore } from "@/stores/multiViewStore";
import * as projectIO from "@/stores/projectIO";
import { useThemeStore } from "@/stores/themeStore";
import { useViewportStore } from "@/stores/viewportStore";
import { resetAllStores } from "@/test/store-reset";

async function openFileMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("ファイル ▾"));
}

async function openViewMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("表示 ▾"));
}

describe("MenuBar", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [{ name: "レイヤー1", left: 0, top: 0, right: 100, bottom: 100 }],
    } as any);
    vi.mocked(window.electronAPI.openPsdFile).mockReset();
    vi.mocked(window.electronAPI.saveFile).mockReset();
    vi.mocked(window.electronAPI.openViviFile).mockReset();
  });

  afterEach(() => {
    clearTextures();
  });

  it("アプリタイトルを表示する", () => {
    render(<MenuBar />);
    expect(screen.getByText("Vivi2D")).toBeInTheDocument();
  });

  it("ファイルドロップダウンに「PSDをインポート」「開く」がある", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);
    await openFileMenu(user);
    expect(screen.getByText("PSDをインポート")).toBeInTheDocument();
    expect(screen.getByText("開く")).toBeInTheDocument();
  });

  it("プロジェクト未読み込み時に「閉じる」がドロップダウンに無い", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);
    await openFileMenu(user);
    expect(screen.queryByText("閉じる")).not.toBeInTheDocument();
  });

  it("プロジェクト読み込み後に「閉じる」がドロップダウンにある", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    await openFileMenu(user);
    expect(screen.getByText("閉じる")).toBeInTheDocument();
  });

  it("プロジェクト名を表示する", () => {
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "MyModel.psd");
    render(<MenuBar />);
    expect(screen.getByText("MyModel")).toBeInTheDocument();
  });

  it("「PSDをインポート」でElectronダイアログを呼び出す", async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.openPsdFile).mockResolvedValue({
      buffer: new ArrayBuffer(8),
      fileName: "opened.psd",
    });

    render(<MenuBar />);
    await openFileMenu(user);
    await user.click(screen.getByText("PSDをインポート"));

    expect(window.electronAPI.openPsdFile).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().project).not.toBeNull();
    expect(useEditorStore.getState().project!.name).toBe("opened");
  });

  it("ダイアログキャンセル時はプロジェクトを変更しない", async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.openPsdFile).mockResolvedValue(null);

    render(<MenuBar />);
    await openFileMenu(user);
    await user.click(screen.getByText("PSDをインポート"));

    expect(useEditorStore.getState().project).toBeNull();
  });

  it("「閉じる」でプロジェクトを閉じる", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);

    await openFileMenu(user);
    await user.click(screen.getByText("閉じる"));
    expect(useEditorStore.getState().project).toBeNull();
  });

  it("表示ドロップダウンからビューをリセットできる", async () => {
    const user = userEvent.setup();
    useViewportStore.getState().setZoom(5);
    useViewportStore.getState().setPan(300, 200);

    render(<MenuBar />);
    await openViewMenu(user);
    await user.click(screen.getByTitle("ビューをリセット"));

    const state = useViewportStore.getState();
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

  it("プロジェクト読み込み後に「保存」「別名で保存」がある", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    await openFileMenu(user);
    expect(screen.getByText("保存")).toBeInTheDocument();
    expect(screen.getByText("別名で保存")).toBeInTheDocument();
  });

  it("「保存」で saveProject(false) を呼び出す", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const spy = vi.spyOn(projectIO, "saveProject").mockResolvedValue(true);

    render(<MenuBar />);
    await openFileMenu(user);
    await user.click(screen.getByText("保存"));

    expect(spy).toHaveBeenCalledWith(false);
    spy.mockRestore();
  });

  it("「別名で保存」で saveProject(true) を呼び出す", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const spy = vi.spyOn(projectIO, "saveProject").mockResolvedValue(true);

    render(<MenuBar />);
    await openFileMenu(user);
    await user.click(screen.getByText("別名で保存"));

    expect(spy).toHaveBeenCalledWith(true);
    spy.mockRestore();
  });

  it("「開く」で loadProject を呼び出す", async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.openViviFile).mockResolvedValue(null);
    const spy = vi.spyOn(projectIO, "loadProject").mockResolvedValue(false);

    render(<MenuBar />);
    await openFileMenu(user);
    await user.click(screen.getByText("開く"));

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });


  it("選択ツールボタンに active クラスが付く", () => {
    render(<MenuBar />);
    const selectBtn = screen.getByTitle("選択ツール (V)");
    expect(selectBtn).toHaveClass("active");
  });

  it("パンツール切り替えで activeTool が変わる", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await user.click(screen.getByTitle("パンツール (H)"));
    expect(useViewportStore.getState().activeTool).toBe("pan");
  });

  it("メッシュ編集ボタンが表示される", () => {
    render(<MenuBar />);
    expect(screen.getByTitle("メッシュ編集 (M)")).toBeInTheDocument();
  });

  it("メッシュ編集ボタンクリックで activeTool が meshEdit になる", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await user.click(screen.getByTitle("メッシュ編集 (M)"));
    expect(useViewportStore.getState().activeTool).toBe("meshEdit");
  });

  it("meshEdit 選択時にメッシュ編集ボタンに active クラスが付く", () => {
    useViewportStore.getState().setTool("meshEdit");
    render(<MenuBar />);
    expect(screen.getByTitle("メッシュ編集 (M)")).toHaveClass("active");
  });

  it("meshEdit 選択時に選択ツールの active クラスが外れる", () => {
    useViewportStore.getState().setTool("meshEdit");
    render(<MenuBar />);
    expect(screen.getByTitle("選択ツール (V)")).not.toHaveClass("active");
  });

  it("ツール切り替えが相互排他的に動作する", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await user.click(screen.getByTitle("メッシュ編集 (M)"));
    expect(useViewportStore.getState().activeTool).toBe("meshEdit");

    await user.click(screen.getByTitle("パンツール (H)"));
    expect(useViewportStore.getState().activeTool).toBe("pan");

    await user.click(screen.getByTitle("選択ツール (V)"));
    expect(useViewportStore.getState().activeTool).toBe("select");
  });


  it("表示メニューからデフォルトフォームロックを切り替えられる", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);
    await openViewMenu(user);
    const lockItem = screen.getByTitle(
      "デフォルトフォームロック — 有効時、デフォルト値での形状編集を禁止",
    );
    await user.click(lockItem);
    expect(useViewportStore.getState().defaultFormLocked).toBe(true);
  });

  it("表示メニューからオニオンスキンを切り替えられる", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);
    await openViewMenu(user);
    const onionItem = screen.getByTitle("オニオンスキン — 前後フレームの半透明表示");
    await user.click(onionItem);
    expect(useViewportStore.getState().onionSkin.enabled).toBe(true);
  });

  it("表示メニューから分割表示を有効にできる", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);
    await openViewMenu(user);
    const splitItem = screen.getByTitle("マルチビュー（キャンバス分割）");
    await user.click(splitItem);
    expect(useMultiViewStore.getState().enabled).toBe(true);
  });

  it("分割表示が有効なとき再クリックで無効にできる", async () => {
    const user = userEvent.setup();
    useMultiViewStore.getState().enableMultiView("horizontal");
    render(<MenuBar />);
    await openViewMenu(user);
    const splitItem = screen.getByTitle("マルチビュー（キャンバス分割）");
    await user.click(splitItem);
    expect(useMultiViewStore.getState().enabled).toBe(false);
  });

  it("設定メニューからテーマを切り替えられる", async () => {
    const user = userEvent.setup();
    const themeBefore = useThemeStore.getState().theme;
    render(<MenuBar />);
    await user.click(screen.getByText("設定 ▾"));
    await user.click(screen.getByTitle("テーマ切替"));
    const themeAfter = useThemeStore.getState().theme;
    expect(themeAfter).not.toBe(themeBefore);
    useThemeStore.getState().toggleTheme();
  });

  it("設定メニューから言語を切り替えられる", async () => {
    const user = userEvent.setup();
    useI18nStore.getState().setLocale("ja");
    render(<MenuBar />);
    await user.click(screen.getByText("設定 ▾"));
    await user.click(screen.getByTitle("English に切り替え"));
    expect(useI18nStore.getState().locale).toBe("en");
    useI18nStore.getState().setLocale("ja");
  });

  it("プロジェクト読み込み後にSDKエクスポートをクリックするとダイアログが開く", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    await openFileMenu(user);
    await user.click(screen.getByText("SDKエクスポート"));
    expect(await screen.findByText("Spine JSON エクスポート")).toBeInTheDocument();
  });

  it("プロジェクト読み込み後にメディア出力メニューが表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    await openFileMenu(user);
    expect(screen.getByText("メディア出力")).toBeInTheDocument();
  });

  it("プロジェクト読み込み後にPSD再読込メニューが表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    await openFileMenu(user);
    expect(screen.getByText("PSD再読込")).toBeInTheDocument();
  });

  it("プロジェクト読み込み後に検証メニューが表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    await openFileMenu(user);
    expect(screen.getByText("検証")).toBeInTheDocument();
  });

  it("プロジェクト読み込み後に自動セットアップメニューが表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    await openFileMenu(user);
    expect(screen.getByText("自動セットアップ")).toBeInTheDocument();
  });

  it("設定メニューからショートカット設定を開ける", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);
    await user.click(screen.getByText("設定 ▾"));
    await user.click(screen.getByTitle("ショートカット設定"));
    expect(await screen.findByText("ショートカット設定")).toBeInTheDocument();
  });

  it("プロジェクトありでundo/redoボタンが表示される", () => {
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    expect(screen.getByTitle("元に戻す (Ctrl+Z)")).toBeInTheDocument();
    expect(screen.getByTitle("やり直し (Ctrl+Shift+Z)")).toBeInTheDocument();
  });

  it("undoスタックが空のときundoボタンがdisabled", () => {
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    expect(screen.getByTitle("元に戻す (Ctrl+Z)")).toBeDisabled();
  });

  it("redoスタックが空のときredoボタンがdisabled", () => {
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);
    expect(screen.getByTitle("やり直し (Ctrl+Shift+Z)")).toBeDisabled();
  });

  it("「閉じる」後にビューがリセットされる", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useViewportStore.getState().setZoom(3);
    render(<MenuBar />);

    await openFileMenu(user);
    await user.click(screen.getByText("閉じる"));

    expect(useViewportStore.getState().zoom).toBe(1);
  });


  it("プロジェクト読み込み後にPSD再読込が表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);

    await openFileMenu(user);
    expect(screen.getByText(/PSD再読込|PSD Reimport/i)).toBeInTheDocument();
  });

  it("プロジェクト読み込み後に自動セットアップが表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);

    await openFileMenu(user);
    expect(screen.getByText(/自動セットアップ|Auto Setup/i)).toBeInTheDocument();
  });

  it("プロジェクト読み込み後にSDKエクスポートが表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);

    await openFileMenu(user);
    expect(screen.getByText(/SDKエクスポート|SDK Export/i)).toBeInTheDocument();
  });

  it("プロジェクト読み込み後にGLBエクスポートが表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);

    await openFileMenu(user);
    expect(screen.getByText(/GLB/i)).toBeInTheDocument();
  });

  it("プロジェクト読み込み後に検証メニューが表示される", async () => {
    const user = userEvent.setup();
    projectIO.loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<MenuBar />);

    await openFileMenu(user);
    expect(screen.getByText(/検証|Validate/i)).toBeInTheDocument();
  });


  it("外部連携メニューに自動モデル生成が表示される", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    const integrations = screen.getByText(/外部連携|Integrations/i);
    await user.click(integrations);
    expect(screen.getByText(/モデル生成|Generate Model/i)).toBeInTheDocument();
  });

  it("外部連携メニューにComfyUI設定が表示される", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    const integrations = screen.getByText(/外部連携|Integrations/i);
    await user.click(integrations);
    expect(
      screen.getByTitle(/ComfyUI.*接続設定|ComfyUI.*Connection/i),
    ).toBeInTheDocument();
  });

  it("外部連携メニューにOBS設定が表示される", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    const integrations = screen.getByText(/外部連携|Integrations/i);
    await user.click(integrations);
    expect(screen.getByText(/OBS/i)).toBeInTheDocument();
  });

  it("外部連携メニューにVTube Studio設定が表示される", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    const integrations = screen.getByText(/外部連携|Integrations/i);
    await user.click(integrations);
    expect(screen.getByText(/VTube Studio/i)).toBeInTheDocument();
  });
});
