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
    it("エクスポート用タイトルと説明が表示される", () => {
      render(<VividDialog mode="export" onClose={vi.fn()} />);
      expect(
        screen.getByText(".vivid 配布フォーマットでエクスポート"),
      ).toBeInTheDocument();
      expect(screen.getByText(/受信者に共有するパスワード/)).toBeInTheDocument();
    });

    it("パスワードと確認パスワードの両方のフィールドが表示される", () => {
      render(<VividDialog mode="export" onClose={vi.fn()} />);
      expect(screen.getByText("パスワード")).toBeInTheDocument();
      expect(screen.getByText("パスワード（確認）")).toBeInTheDocument();
      const inputs = screen.getAllByDisplayValue("");
      // Both password inputs start empty
      expect(inputs.length).toBeGreaterThanOrEqual(2);
    });

    it("パスワード未入力時はエクスポートボタンが無効", () => {
      render(<VividDialog mode="export" onClose={vi.fn()} />);
      const submitBtn = screen.getByRole("button", { name: "エクスポート" });
      expect(submitBtn).toBeDisabled();
    });

    it("パスワードを入力するとボタンが有効化", () => {
      render(<VividDialog mode="export" onClose={vi.fn()} />);
      const pwFields = document.querySelectorAll<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      fireEvent.change(pwFields[0]!, { target: { value: "secret123" } });
      expect(screen.getByRole("button", { name: "エクスポート" })).toBeEnabled();
    });

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

      const pwFields = document.querySelectorAll<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      fireEvent.change(pwFields[0]!, { target: { value: "samePass" } });
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
    it("インポート用タイトルと説明が表示される", () => {
      render(<VividDialog mode="import" onClose={vi.fn()} />);
      expect(screen.getByText(".vivid 配布ファイルをインポート")).toBeInTheDocument();
      expect(screen.getByText(/送信者から共有されたパスワード/)).toBeInTheDocument();
    });

    it("確認パスワードのフィールドは表示されない", () => {
      render(<VividDialog mode="import" onClose={vi.fn()} />);
      expect(screen.queryByText("パスワード（確認）")).not.toBeInTheDocument();
      const pwFields = document.querySelectorAll<HTMLInputElement>(
        ".vivid-field input[type='password']",
      );
      expect(pwFields.length).toBe(1);
    });

    it("パスワード未入力時はインポートボタンが無効", () => {
      render(<VividDialog mode="import" onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "インポート" })).toBeDisabled();
    });

    it("パスワード入力でインポート関数が呼ばれる", async () => {
      importVividProject.mockResolvedValueOnce(true);
      const onClose = vi.fn();
      render(<VividDialog mode="import" onClose={onClose} />);

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
      const overlay = document.querySelector(".modal-overlay");
      fireEvent.click(overlay!);
      expect(onClose).toHaveBeenCalled();
    });

    it("モーダル本体クリックは onClose を呼ばない（伝播停止）", () => {
      const onClose = vi.fn();
      render(<VividDialog mode="export" onClose={onClose} />);
      const content = document.querySelector(".modal-content");
      fireEvent.click(content!);
      expect(onClose).not.toHaveBeenCalled();
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
