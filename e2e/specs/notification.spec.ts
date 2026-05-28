import { expect, test } from "../fixtures";
import { expectElementWithinViewport, waitForViviRuntime } from "../helpers/app";

async function addNotification(
  window: import("playwright").Page,
  type: "info" | "warning" | "error",
  message: string,
) {
  await window.evaluate(
    ({ notificationType, notificationMessage }) => {
      const vivi = window.__vivi2d!;
      const store = vivi.useNotificationStore as {
        getState: () => {
          addNotification: (kind: "info" | "warning" | "error", text: string) => void;
        };
      };
      store.getState().addNotification(notificationType, notificationMessage);
    },
    { notificationType: type, notificationMessage: message },
  );
}

async function readBoxes(
  locators: import("playwright").Locator,
): Promise<
  Array<NonNullable<Awaited<ReturnType<import("playwright").Locator["boundingBox"]>>>>
> {
  const count = await locators.count();
  const boxes: Array<
    NonNullable<Awaited<ReturnType<import("playwright").Locator["boundingBox"]>>>
  > = [];
  for (let index = 0; index < count; index += 1) {
    const box = await locators.nth(index).boundingBox();
    if (!box) {
      throw new Error(`Bounding box unavailable for notification index ${index}`);
    }
    boxes.push(box);
  }
  return boxes;
}

async function waitForNotificationSettle(window: import("playwright").Page) {
  await window.waitForTimeout(250);
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForViviRuntime(window);
});

test("a single warning toast stays inside the viewport", async ({ window }) => {
  await addNotification(window, "warning", "通知の表示確認");

  const container = window.locator(".notification-container");
  await expect(container).toBeVisible();
  await waitForNotificationSettle(window);
  await expectElementWithinViewport(window, container);

  const notification = window.locator(".notification-warning").first();
  await expect(notification).toBeVisible();
  await expect(notification.locator(".notification-message")).toContainText(
    "通知の表示確認",
  );
  await expectElementWithinViewport(window, notification);
});

test("info toasts auto-dismiss after the timeout", async ({ window }) => {
  await addNotification(window, "info", "自動消滅通知");

  const notification = window.locator(".notification-info").first();
  await expect(notification).toBeVisible();
  await waitForNotificationSettle(window);
  await expect(notification.locator(".notification-message")).toContainText(
    "自動消滅通知",
  );
  await expect(notification).not.toBeVisible({ timeout: 7_000 });
});

test("multiple toasts stack without overlapping and remain inside the viewport", async ({
  window,
}) => {
  await addNotification(window, "info", "通知1");
  await addNotification(window, "warning", "通知2");
  await addNotification(window, "error", "通知3");

  const notifications = window.locator(".notification");
  await expect(notifications).toHaveCount(3);
  await waitForNotificationSettle(window);
  await expectElementWithinViewport(window, window.locator(".notification-container"));

  const boxes = await readBoxes(notifications);
  const baselineX = boxes[0]!.x;
  for (let index = 0; index < boxes.length; index += 1) {
    const locator = notifications.nth(index);
    await expectElementWithinViewport(window, locator);
    if (Math.abs(boxes[index]!.x - baselineX) > 2) {
      throw new Error("Expected stacked notifications to align on the same right column");
    }
    if (index > 0) {
      const previous = boxes[index - 1]!;
      const current = boxes[index]!;
      if (current.y < previous.y + previous.height - 1) {
        throw new Error("Expected stacked notifications not to overlap vertically");
      }
    }
  }
});

test("long notification text wraps instead of overflowing horizontally", async ({
  window,
}) => {
  await addNotification(
    window,
    "error",
    "これは長い通知文です。横方向にはみ出さずに複数行で折り返されることを確認します。かなり長めの説明を入れて、右側のクローズボタンが押せるまま残ることも確認します。さらに説明を足して、通知コンテナの最大幅を超えた場合でも、水平スクロールではなく自然な折り返しになることを保証します。最後にもう少し文を足して、確実に複数行へ折り返させます。",
  );

  const notification = window.locator(".notification-error").first();
  const message = notification.locator(".notification-message");
  await expect(notification).toBeVisible();
  await waitForNotificationSettle(window);
  await expectElementWithinViewport(window, notification);

  const wrapsWithoutOverflow = await message.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const parsedLineHeight = Number.parseFloat(style.lineHeight || "0");
    const parsedFontSize = Number.parseFloat(style.fontSize || "12");
    const effectiveLineHeight = Number.isFinite(parsedLineHeight)
      ? parsedLineHeight
      : parsedFontSize * 1.4;
    const wraps = element.clientHeight > Math.max(effectiveLineHeight * 1.5, 30);
    const noHorizontalOverflow = element.scrollWidth <= element.clientWidth + 1;
    return { wraps, noHorizontalOverflow };
  });
  expect(wrapsWithoutOverflow.wraps).toBe(true);
  expect(wrapsWithoutOverflow.noHorizontalOverflow).toBe(true);
});

test("the close button dismisses a toast immediately", async ({ window }) => {
  await addNotification(window, "error", "手動で閉じる通知");

  const notification = window.locator(".notification-error").first();
  await expect(notification).toBeVisible();
  await waitForNotificationSettle(window);
  await notification.locator(".notification-close").click();
  await expect(notification).not.toBeVisible();
});
