import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "@/stores/notificationStore";
import { resetNotificationStore } from "@/test/store-reset";

describe("notificationStore", () => {
  beforeEach(() => {
    resetNotificationStore();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("全通知種別の内容を保存し指定IDだけを消去する", () => {
    const { addNotification, dismiss } = useNotificationStore.getState();
    addNotification("error", "エラー1");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    addNotification("warning", "警告1");
    addNotification("info", "情報1");
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications.map(({ type, message }) => ({ type, message }))).toEqual([
      { type: "error", message: "エラー1" },
      { type: "warning", message: "警告1" },
      { type: "info", message: "情報1" },
    ]);
    expect(new Set(notifications.map(({ id }) => id)).size).toBe(3);
    dismiss(notifications[1]!.id);
    expect(useNotificationStore.getState().notifications).toEqual([
      notifications[0], notifications[2],
    ]);
    dismiss(notifications[0]!.id);
    dismiss(notifications[2]!.id);
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });





  it("5秒後に自動消去される", () => {
    useNotificationStore.getState().addNotification("info", "自動消去テスト");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });


});
