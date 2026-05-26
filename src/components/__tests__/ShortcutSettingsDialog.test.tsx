import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShortcutSettingsDialog } from "@/components/ShortcutSettingsDialog";
import { useI18nStore } from "@/lib/i18n";
import {
  DEFAULT_KEYMAP,
  SHORTCUT_ACTIONS,
  useShortcutStore,
} from "@/stores/shortcutStore";
import { resetShortcutStore } from "@/test/store-reset";


describe("ShortcutSettingsDialog", () => {
  beforeEach(() => {
    resetShortcutStore();
    useI18nStore.getState().setLocale("ja");
  });

  afterEach(() => {
    resetShortcutStore();
    useI18nStore.getState().setLocale("ja");
  });

  it("ダイアログタイトルが表示される", () => {
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    expect(screen.getByText("ショートカット設定")).toBeInTheDocument();
  });

  it("全ショートカットアクションが表示される", () => {
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const expectedLabels = [
      "元に戻す",
      "やり直し",
      "保存",
      "名前を付けて保存",
      "全選択",
      "レイヤーを上に移動",
      "レイヤーを下に移動",
      "選択ツール",
      "パンツール",
      "メッシュ編集ツール",
      "一時パン（長押し）",
    ];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("英語ロケールではショートカットアクション名も英語で表示される", () => {
    useI18nStore.getState().setLocale("en");

    render(<ShortcutSettingsDialog onClose={vi.fn()} />);

    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
    expect(screen.getByText("Move Layer Up")).toBeInTheDocument();
    expect(screen.queryByText("元に戻す")).not.toBeInTheDocument();
    expect(screen.queryByText("レイヤーを上に移動")).not.toBeInTheDocument();
  });

  it("閉じるボタンでonCloseが呼ばれる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShortcutSettingsDialog onClose={onClose} />);
    await user.click(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("オーバーレイクリックでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<ShortcutSettingsDialog onClose={onClose} />);
    const overlay = document.querySelector(".modal-overlay")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("モーダルコンテンツクリックではonCloseが呼ばれない", () => {
    const onClose = vi.fn();
    render(<ShortcutSettingsDialog onClose={onClose} />);
    const content = document.querySelector(".modal-content")!;
    fireEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("キーボタンクリックでキャプチャモードに入る", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const keyBtns = document.querySelectorAll(".shortcut-key-btn");
    await user.click(keyBtns[0]!);
    expect(screen.getByText("キーを入力...")).toBeInTheDocument();
  });

  it("キャプチャ中にキーを押すとショートカットが変更される", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const keyBtns = document.querySelectorAll(".shortcut-key-btn");
    await user.click(keyBtns[0]!);

    fireEvent.keyDown(window, { key: "a", code: "KeyA" });

    const action = SHORTCUT_ACTIONS[0]!;
    const binding = useShortcutStore.getState().keymap[action];
    expect(binding.key).toBe("a");
  });

  it("キャプチャ中にEscapeでキャプチャがキャンセルされる", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const keyBtns = document.querySelectorAll(".shortcut-key-btn");
    await user.click(keyBtns[0]!);

    expect(screen.getByText("キーを入力...")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByText("キーを入力...")).not.toBeInTheDocument();
  });

  it("キャプチャ中に修飾キー単体は無視される", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const keyBtns = document.querySelectorAll(".shortcut-key-btn");
    await user.click(keyBtns[0]!);

    fireEvent.keyDown(window, { key: "Control" });

    expect(screen.getByText("キーを入力...")).toBeInTheDocument();
  });

  it("全てリセットボタンで全ショートカットがデフォルトに戻る", async () => {
    const user = userEvent.setup();
    const action = SHORTCUT_ACTIONS[0]!;
    useShortcutStore.getState().setShortcut(action, {
      key: "x",
      ctrl: true,
      shift: false,
      alt: false,
    });

    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    await user.click(screen.getByText("全てリセット"));

    const binding = useShortcutStore.getState().keymap[action];
    expect(binding).toEqual(DEFAULT_KEYMAP[action]);
  });

  it("個別リセットボタンがデフォルトと同じときはdisabled", () => {
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const resetBtns = document.querySelectorAll(".shortcut-reset-btn");
    for (const btn of resetBtns) {
      expect(btn).toBeDisabled();
    }
  });

  it("変更後は個別リセットボタンが有効になる", () => {
    const action = SHORTCUT_ACTIONS[0]!;
    useShortcutStore.getState().setShortcut(action, {
      key: "x",
      ctrl: true,
      shift: false,
      alt: false,
    });

    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const resetBtns = document.querySelectorAll(".shortcut-reset-btn");
    expect(resetBtns[0]).not.toBeDisabled();
  });

  it("個別リセットボタンクリックでデフォルトに戻る", async () => {
    const user = userEvent.setup();
    const action = SHORTCUT_ACTIONS[0]!;
    useShortcutStore.getState().setShortcut(action, {
      key: "x",
      ctrl: true,
      shift: false,
      alt: false,
    });

    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const resetBtns = document.querySelectorAll(".shortcut-reset-btn");
    await user.click(resetBtns[0]!);

    const binding = useShortcutStore.getState().keymap[action];
    expect(binding).toEqual(DEFAULT_KEYMAP[action]);
  });

  it("エクスポートボタンが表示される", () => {
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    expect(screen.getByText("エクスポート")).toBeInTheDocument();
  });

  it("インポートボタンが表示される", () => {
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    expect(screen.getByText("インポート")).toBeInTheDocument();
  });

  it("キャプチャ中にキーボタンを再クリックするとキャプチャがキャンセルされる", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettingsDialog onClose={vi.fn()} />);
    const keyBtns = document.querySelectorAll(".shortcut-key-btn");

    await user.click(keyBtns[0]!);
    expect(screen.getByText("キーを入力...")).toBeInTheDocument();

    await user.click(keyBtns[0]!);
    expect(screen.queryByText("キーを入力...")).not.toBeInTheDocument();
  });
});
