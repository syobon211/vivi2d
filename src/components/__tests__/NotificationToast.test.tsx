import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNotificationStore } from "@/stores/notificationStore";
import { resetNotificationStore } from "@/test/store-reset";
import { NotificationToast } from "../NotificationToast";


describe("NotificationToast", () => {
  beforeEach(() => {
    resetNotificationStore();
  });
  afterEach(() => {
    resetNotificationStore();
  });

  it("通知がない場合は何もレンダリングしない", () => {
    const { container } = render(<NotificationToast />);

    expect(container.querySelector(".notification-container")).not.toBeInTheDocument();
  });

  it("通知メッセージが表示される", () => {
    useNotificationStore.getState().addNotification("info", "テスト通知");

    render(<NotificationToast />);

    expect(screen.getByText("テスト通知")).toBeInTheDocument();
  });

  it("複数の通知が表示される", () => {
    useNotificationStore.getState().addNotification("info", "通知A");
    useNotificationStore.getState().addNotification("warning", "通知B");
    useNotificationStore.getState().addNotification("error", "通知C");

    render(<NotificationToast />);

    expect(screen.getByText("通知A")).toBeInTheDocument();
    expect(screen.getByText("通知B")).toBeInTheDocument();
    expect(screen.getByText("通知C")).toBeInTheDocument();
  });

  it("通知タイプに応じたクラスが付与される", () => {
    useNotificationStore.getState().addNotification("warning", "警告テスト");

    const { container } = render(<NotificationToast />);

    expect(container.querySelector(".notification-warning")).toBeInTheDocument();
  });

  it("閉じるボタンをクリックすると通知が消える", async () => {
    const user = userEvent.setup();
    useNotificationStore.getState().addNotification("info", "消す通知");

    render(<NotificationToast />);

    expect(screen.getByText("消す通知")).toBeInTheDocument();

    const closeBtn = screen.getByText("×");
    await user.click(closeBtn);

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("複数通知のうち1つだけ閉じることができる", async () => {
    const user = userEvent.setup();
    useNotificationStore.getState().addNotification("info", "残す通知");
    useNotificationStore.getState().addNotification("warning", "消す通知");

    render(<NotificationToast />);

    const closeBtns = screen.getAllByText("×");
    await user.click(closeBtns[1]!);

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0]!.message).toBe("残す通知");
  });

  describe("ARIA（ライブリージョン）", () => {
    it("コンテナが role=region + aria-label を持つ", () => {
      useNotificationStore.getState().addNotification("info", "領域テスト");

      render(<NotificationToast />);

      const region = screen.getByRole("region", { name: "通知" });
      expect(region).toBeInTheDocument();
    });

    it("info 通知は role=status + aria-live=polite で読み上げられる", () => {
      useNotificationStore.getState().addNotification("info", "情報A");

      render(<NotificationToast />);

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveAttribute("aria-atomic", "true");
      expect(status.textContent).toContain("情報A");
    });

    it("warning 通知は role=status + aria-live=polite で読み上げられる", () => {
      useNotificationStore.getState().addNotification("warning", "警告A");

      render(<NotificationToast />);

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
    });

    it("error 通知は role=alert + aria-live=assertive で即時読み上げられる", () => {
      useNotificationStore.getState().addNotification("error", "致命的エラー");

      render(<NotificationToast />);

      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-live", "assertive");
      expect(alert).toHaveAttribute("aria-atomic", "true");
      expect(alert.textContent).toContain("致命的エラー");
    });

    it("閉じるボタンに aria-label が付与される", () => {
      useNotificationStore.getState().addNotification("info", "閉じボタン検証");

      render(<NotificationToast />);

      const closeBtn = screen.getByRole("button", { name: "通知を閉じる" });
      expect(closeBtn).toBeInTheDocument();
    });

    it("error と info の混在時は alert と status が両方出る", () => {
      useNotificationStore.getState().addNotification("info", "情報B");
      useNotificationStore.getState().addNotification("error", "エラーB");

      render(<NotificationToast />);

      expect(screen.getByRole("alert").textContent).toContain("エラーB");
      expect(screen.getByRole("status").textContent).toContain("情報B");
    });
  });
});
