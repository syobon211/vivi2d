import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VividDialog } from "@/components/VividDialog";

const exportVividProject = vi.fn();
const importVividProject = vi.fn();

vi.mock("@/stores/projectIO", () => ({
  exportVividProject: (password: string) => exportVividProject(password),
  importVividProject: (password: string) => importVividProject(password),
}));

beforeEach(() => {
  exportVividProject.mockReset();
  importVividProject.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("VividDialog", () => {
  describe("エクスポートモード", () => {
    it("確認パスワードが不一致だとエラー表示してエクスポート関数は呼ばれない", async () => {
      render(<VividDialog mode="export" onClose={vi.fn()} />);
      const pwFields = document.querySelectorAll<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      fireEvent.change(pwFields[0]!, { target: { value: "a" } });
      fireEvent.change(pwFields[1]!, { target: { value: "b" } });
      fireEvent.click(screen.getByRole("button", { name: "エクスポート" }));

      await waitFor(() => {
        expect(screen.getByText("確認用パスワードが一致しません")).toBeInTheDocument();
      });
      expect(exportVividProject).not.toHaveBeenCalled();
    });

    it("パスワード一致でエクスポート関数が呼び出される", async () => {
      exportVividProject.mockResolvedValueOnce(true);
      const onClose = vi.fn();
      render(<VividDialog mode="export" onClose={onClose} />);
      expect(
        screen.getByText(".vivid 配布フォーマットでエクスポート"),
      ).toBeInTheDocument();
      expect(screen.getByText(/受信者に共有するパスワード/)).toBeInTheDocument();
      expect(screen.getByText("パスワード")).toBeInTheDocument();
      expect(screen.getByText("パスワード（確認）")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "エクスポート" })).toBeDisabled();

      const pwFields = document.querySelectorAll<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      expect(pwFields).toHaveLength(2);
      fireEvent.change(pwFields[0]!, { target: { value: "samePass" } });
      expect(screen.getByRole("button", { name: "エクスポート" })).toBeEnabled();
      fireEvent.change(pwFields[1]!, { target: { value: "samePass" } });
      fireEvent.click(screen.getByRole("button", { name: "エクスポート" }));

      await waitFor(() => {
        expect(exportVividProject).toHaveBeenCalledWith("samePass");
      });
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("エクスポート失敗時は onClose が呼ばれない", async () => {
      exportVividProject.mockResolvedValueOnce(false);
      const onClose = vi.fn();
      render(<VividDialog mode="export" onClose={onClose} />);

      const pwFields = document.querySelectorAll<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      fireEvent.change(pwFields[0]!, { target: { value: "x" } });
      fireEvent.change(pwFields[1]!, { target: { value: "x" } });
      fireEvent.click(screen.getByRole("button", { name: "エクスポート" }));

      await waitFor(() => {
        expect(exportVividProject).toHaveBeenCalled();
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("インポートモード", () => {
    it("パスワード入力でインポート関数が呼ばれる", async () => {
      importVividProject.mockResolvedValueOnce(true);
      const onClose = vi.fn();
      render(<VividDialog mode="import" onClose={onClose} />);
      expect(screen.getByText(".vivid 配布ファイルをインポート")).toBeInTheDocument();
      expect(screen.getByText(/送信者から共有されたパスワード/)).toBeInTheDocument();
      expect(screen.queryByText("パスワード（確認）")).not.toBeInTheDocument();
      expect(document.querySelectorAll(".vivid-field input[type=password]")).toHaveLength(
        1,
      );
      expect(screen.getByRole("button", { name: "インポート" })).toBeDisabled();

      const pwField = document.querySelector<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      fireEvent.change(pwField!, { target: { value: "mySecret" } });
      fireEvent.click(screen.getByRole("button", { name: "インポート" }));

      await waitFor(() => {
        expect(importVividProject).toHaveBeenCalledWith("mySecret");
      });
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("インポート失敗時は onClose が呼ばれない", async () => {
      importVividProject.mockResolvedValueOnce(false);
      const onClose = vi.fn();
      render(<VividDialog mode="import" onClose={onClose} />);

      const pwField = document.querySelector<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      fireEvent.change(pwField!, { target: { value: "wrongPwd" } });
      fireEvent.click(screen.getByRole("button", { name: "インポート" }));

      await waitFor(() => {
        expect(importVividProject).toHaveBeenCalled();
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("共通動作", () => {
    it("キャンセルボタンで onClose が呼ばれる", () => {
      const onClose = vi.fn();
      render(<VividDialog mode="export" onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("オーバーレイクリックで onClose が呼ばれる", () => {
      const onClose = vi.fn();
      render(<VividDialog mode="export" onClose={onClose} />);
      fireEvent.click(document.querySelector(".modal-content")!);
      expect(onClose).not.toHaveBeenCalled();
      const overlay = document.querySelector(".modal-overlay");
      fireEvent.click(overlay!);
      expect(onClose).toHaveBeenCalled();
    });

    it("処理中は入力フィールドとボタンが無効化", async () => {
      let resolveIt: (v: boolean) => void = () => {};
      exportVividProject.mockImplementation(
        () =>
          new Promise<boolean>((r) => {
            resolveIt = r;
          }),
      );
      render(<VividDialog mode="export" onClose={vi.fn()} />);

      const pwFields = document.querySelectorAll<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      fireEvent.change(pwFields[0]!, { target: { value: "go" } });
      fireEvent.change(pwFields[1]!, { target: { value: "go" } });
      fireEvent.click(screen.getByRole("button", { name: "エクスポート" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /処理中/ })).toBeDisabled();
      });
      expect(pwFields[0]!).toBeDisabled();
      expect(pwFields[1]!).toBeDisabled();
      expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();

      resolveIt(true);
    });

    it("パスワードのみ入力し確認パスワード空で送信すると不一致エラー", async () => {
      render(<VividDialog mode="export" onClose={vi.fn()} />);
      const pwFields = document.querySelectorAll<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      fireEvent.change(pwFields[0]!, { target: { value: "mainPass" } });
      fireEvent.click(screen.getByRole("button", { name: "エクスポート" }));

      await waitFor(() => {
        expect(screen.getByText("確認用パスワードが一致しません")).toBeInTheDocument();
      });
      expect(exportVividProject).not.toHaveBeenCalled();
    });
  });
});
