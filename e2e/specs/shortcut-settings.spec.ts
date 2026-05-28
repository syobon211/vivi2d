import { expect, test } from "../fixtures";
import { clickSettingsMenuItem } from "../helpers/operations";

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await window.evaluate(() => localStorage.removeItem("vivi2d-shortcuts"));
  await window.evaluate(() => localStorage.removeItem("vivi2d-locale"));
});

test.afterEach(async ({ window }) => {
  await window.evaluate(() => localStorage.removeItem("vivi2d-shortcuts"));
  await window.evaluate(() => localStorage.removeItem("vivi2d-locale"));
});

async function openShortcuts(window: import("playwright").Page) {
  await clickSettingsMenuItem(window, "Shortcuts");
  await expect(window.locator(".shortcut-dialog")).toBeVisible();
  await expect(window.locator(".modal-title")).not.toHaveText("");
}

test("opens the shortcut settings dialog", async ({ window }) => {
  await openShortcuts(window);
});

test("shows shortcut rows", async ({ window }) => {
  await openShortcuts(window);

  await expect(window.locator(".shortcut-row")).not.toHaveCount(0);
  await expect(window.locator(".shortcut-key-btn").first()).toBeVisible();
});

test("shows shortcut action labels in English when locale is English", async ({
  window,
}) => {
  await window.evaluate(() => localStorage.setItem("vivi2d-locale", "en"));
  await window.reload();
  await openShortcuts(window);

  await expect(
    window.locator(".shortcut-row").first().locator(".shortcut-col-action"),
  ).toHaveText("Undo");
  await expect(window.locator(".shortcut-dialog")).toContainText("Move Layer Up");
  await expect(window.locator(".shortcut-dialog")).not.toContainText("元に戻す");
});

test("localizes layer movement shortcuts in Simplified Chinese and Korean", async ({
  window,
}) => {
  const expectations = [
    {
      locale: "zh-Hans",
      up: "上移图层",
      down: "下移图层",
      english: "Move Layer Up",
    },
    {
      locale: "ko-KR",
      up: "레이어 위로 이동",
      down: "레이어 아래로 이동",
      english: "Move Layer Up",
    },
  ] as const;

  for (const { locale, up, down, english } of expectations) {
    await window.evaluate((nextLocale) => {
      localStorage.setItem("vivi2d-locale", nextLocale);
    }, locale);
    await window.reload();
    await openShortcuts(window);

    await expect(window.locator(".shortcut-dialog")).toContainText(up);
    await expect(window.locator(".shortcut-dialog")).toContainText(down);
    await expect(window.locator(".shortcut-dialog")).not.toContainText(english);

    await window.locator(".shortcut-footer .prop-btn").last().click();
    await expect(window.locator(".shortcut-dialog")).not.toBeVisible();
  }
});

test("enters and exits capture mode", async ({ window }) => {
  await openShortcuts(window);

  const firstKey = window.locator(".shortcut-key-btn").first();
  const originalText = await firstKey.textContent();

  await firstKey.click();
  await expect(firstKey).toHaveClass(/capturing/);

  await window.keyboard.press("Escape");
  await expect(firstKey).not.toHaveClass(/capturing/);
  await expect(firstKey).toContainText(originalText ?? "");
});

test("updates a shortcut binding", async ({ window }) => {
  await openShortcuts(window);

  const firstKey = window.locator(".shortcut-key-btn").first();
  await firstKey.click();
  await window.keyboard.press("Control+Y");

  await expect(firstKey).not.toHaveClass(/capturing/);
  await expect(firstKey).toContainText("Ctrl+Y");
});

test("resets a shortcut to default", async ({ window }) => {
  await openShortcuts(window);

  const row = window.locator(".shortcut-row").first();
  const keyButton = row.locator(".shortcut-key-btn");
  await keyButton.click();
  await window.keyboard.press("Control+Y");
  await expect(keyButton).toContainText("Ctrl+Y");

  await row.locator(".shortcut-reset-btn").click();
  await expect(keyButton).toContainText(/Ctrl\+/);
});

test("closes the shortcut settings dialog", async ({ window }) => {
  await openShortcuts(window);

  await window
    .locator(".shortcut-footer .prop-btn", { hasText: /Close|閉じる/i })
    .click();
  await expect(window.locator(".shortcut-dialog")).not.toBeVisible();
});
