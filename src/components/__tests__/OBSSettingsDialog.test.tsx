import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAllStores } from "@/test/store-reset";
import { OBSSettingsDialog } from "../OBSSettingsDialog";

describe("OBSSettingsDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
    try {
      localStorage.removeItem("vivi2d-obs-url");
    } catch {
      /* ignore */
    }
  });

  it("タイトルを表示する", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    expect(
      screen.getByText(/OBS Studio.*接続設定|OBS Studio.*Connection/i),
    ).toBeInTheDocument();
  });

  it("デフォルトURLが表示される", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    expect(screen.getByDisplayValue("ws://127.0.0.1:4455")).toBeInTheDocument();
  });

  it("パスワード入力欄がある", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    const pwInput = document.querySelector('input[type="password"]');
    expect(pwInput).toBeInTheDocument();
  });

  it("URLを変更できる", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    const input = screen.getByDisplayValue("ws://127.0.0.1:4455");
    fireEvent.change(input, { target: { value: "ws://192.168.1.100:4455" } });
    expect(screen.getByDisplayValue("ws://192.168.1.100:4455")).toBeInTheDocument();
  });

  it("保存ボタンでlocalStorageに保存してonCloseが呼ばれる", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    const input = screen.getByDisplayValue("ws://127.0.0.1:4455");
    fireEvent.change(input, { target: { value: "ws://custom:4455" } });

    fireEvent.click(screen.getByText(/保存|Save/i));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("vivi2d-obs-url")).toBe("ws://custom:4455");
  });

  it("キャンセルボタンでonCloseが呼ばれる", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(/キャンセル|Cancel/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("オーバーレイクリックでonCloseが呼ばれる", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("モーダルコンテンツクリックではonCloseが呼ばれない", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    fireEvent.click(document.querySelector(".modal-content")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("注意事項テキストが表示される", () => {
    render(<OBSSettingsDialog onClose={onClose} />);
    expect(
      screen.getByText(/WebSocket.*サーバー|WebSocket.*server/i),
    ).toBeInTheDocument();
  });

  it("localStorageに保存済みURLがあれば復元される", () => {
    localStorage.setItem("vivi2d-obs-url", "ws://saved:9999");
    render(<OBSSettingsDialog onClose={onClose} />);
    expect(screen.getByDisplayValue("ws://saved:9999")).toBeInTheDocument();
  });
});
