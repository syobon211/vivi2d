import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNotificationStore } from "@/stores/notificationStore";
import { resetNotificationStore } from "@/test/store-reset";
import { NotificationToast } from "../NotificationToast";

describe("NotificationToast", () => {
  beforeEach(resetNotificationStore);
  afterEach(resetNotificationStore);

  it("通知がない場合は何もレンダリングしない", () => {
    const { container } = render(<NotificationToast />);
    expect(container.querySelector(".notification-container")).not.toBeInTheDocument();
  });

  it("各重要度を読み上げ可能に表示し、指定通知だけを閉じて最後に空になる", async () => {
    const user = userEvent.setup();
    useNotificationStore.getState().addNotification("info", "通知A");
    useNotificationStore.getState().addNotification("warning", "通知B");
    useNotificationStore.getState().addNotification("error", "通知C");
    render(<NotificationToast />);

    expect(screen.getByRole("region", { name: "通知" })).toBeInTheDocument();
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toHaveTextContent("通知A");
    expect(statuses[1]).toHaveTextContent("通知B");
    expect(statuses[1]).toHaveClass("notification-warning");
    for (const status of statuses) {
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveAttribute("aria-atomic", "true");
    }
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("通知C");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("aria-atomic", "true");
    expect(screen.getAllByRole("button", { name: "通知を閉じる" })).toHaveLength(3);

    await user.click(within(statuses[1]!).getByRole("button", { name: "通知を閉じる" }));
    expect(screen.queryByText("通知B")).not.toBeInTheDocument();
    expect(screen.getByText("通知A")).toBeInTheDocument();
    expect(screen.getByText("通知C")).toBeInTheDocument();
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual([
      "通知A",
      "通知C",
    ]);
    await user.click(within(alert).getByRole("button", { name: "通知を閉じる" }));
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual([
      "通知A",
    ]);
    await user.click(screen.getByRole("button", { name: "通知を閉じる" }));
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "通知" })).not.toBeInTheDocument();
  });
});
