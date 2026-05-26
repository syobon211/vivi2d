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

  it("通知を追加できる", () => {
    useNotificationStore.getState().addNotification("error", "テストエラー");
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("error");
    expect(notifications[0]!.message).toBe("テストエラー");
  });

  it("複数の通知を追加できる", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("error", "エラー1");
    addNotification("warning", "警告1");
    addNotification("info", "情報1");
    expect(useNotificationStore.getState().notifications).toHaveLength(3);
  });

  it("通知を個別に消去できる", () => {
    useNotificationStore.getState().addNotification("error", "エラー");
    const id = useNotificationStore.getState().notifications[0]!.id;
    useNotificationStore.getState().dismiss(id);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("5秒後に自動消去される", () => {
    useNotificationStore.getState().addNotification("info", "自動消去テスト");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("通知の type が正しく設定される", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("warning", "警告");
    expect(useNotificationStore.getState().notifications[0]!.type).toBe("warning");
  });
});
