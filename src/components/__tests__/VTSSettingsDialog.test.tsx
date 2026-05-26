import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAllStores } from "@/test/store-reset";
import { VTSSettingsDialog } from "../VTSSettingsDialog";

describe("VTSSettingsDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
    try {
      localStorage.removeItem("vivi2d-vts-url");
    } catch {
      /* ignore */
    }
  });

  it("タイトルを表示する", () => {
    render(<VTSSettingsDialog onClose={onClose} />);
    expect(
      screen.getByText(/VTube Studio.*接続設定|VTube Studio.*Connection/i),
    ).toBeInTheDocument();
  });

  it("デフォルトURLが表示される", () => {
    render(<VTSSettingsDialog onClose={onClose} />);
    expect(screen.getByDisplayValue("ws://127.0.0.1:8001")).toBeInTheDocument();
  });

  it("URLを変更できる", () => {
    render(<VTSSettingsDialog onClose={onClose} />);
    const input = screen.getByDisplayValue("ws://127.0.0.1:8001");
    fireEvent.change(input, { target: { value: "ws://192.168.1.100:8001" } });
    expect(screen.getByDisplayValue("ws://192.168.1.100:8001")).toBeInTheDocument();
  });

  it("保存ボタンでlocalStorageに保存してonCloseが呼ばれる", () => {
    render(<VTSSettingsDialog onClose={onClose} />);
    const input = screen.getByDisplayValue("ws://127.0.0.1:8001");
    fireEvent.change(input, { target: { value: "ws://custom:8001" } });

    fireEvent.click(screen.getByText(/保存|Save/i));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("vivi2d-vts-url")).toBe("ws://custom:8001");
  });

  it("キャンセルボタンでonCloseが呼ばれる", () => {
    render(<VTSSettingsDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(/キャンセル|Cancel/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("オーバーレイクリックでonCloseが呼ばれる", () => {
    render(<VTSSettingsDialog onClose={onClose} />);
    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("モーダルコンテンツクリックではonCloseが呼ばれない", () => {
    render(<VTSSettingsDialog onClose={onClose} />);
    fireEvent.click(document.querySelector(".modal-content")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("注意事項テキストが表示される", () => {
    render(<VTSSettingsDialog onClose={onClose} />);
    expect(
      screen.getByText(/VTube Studio.*起動|VTube Studio.*running/i),
    ).toBeInTheDocument();
  });

  it("localStorageに保存済みURLがあれば復元される", () => {
    localStorage.setItem("vivi2d-vts-url", "ws://saved:7777");
    render(<VTSSettingsDialog onClose={onClose} />);
    expect(screen.getByDisplayValue("ws://saved:7777")).toBeInTheDocument();
  });
});
