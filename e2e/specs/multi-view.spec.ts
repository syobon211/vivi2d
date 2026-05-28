import { expect, test } from "../fixtures";

async function openViewMenu(window: import("playwright").Page) {
  await window.locator(".menu-dropdown-trigger", { hasText: /View|表示/ }).click();
}

function splitViewMenuItem(window: import("playwright").Page) {
  return window.locator(".menu-dropdown-item", { hasText: /Split View|分割表示/ });
}

async function toggleSplitView(window: import("playwright").Page) {
  await openViewMenu(window);
  await splitViewMenuItem(window).click();
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});

test("分割表示ボタンが表示される", async ({ window }) => {
  await openViewMenu(window);
  await expect(splitViewMenuItem(window)).toBeVisible();
  await window.keyboard.press("Escape");
});

test("分割表示は初期状態で inactive", async ({ window }) => {
  await openViewMenu(window);
  await expect(splitViewMenuItem(window)).toBeVisible();
  await expect(splitViewMenuItem(window)).not.toHaveClass(/active/);
  await window.keyboard.press("Escape");
});

test("分割表示を有効にすると multi-view が表示される", async ({ window }) => {
  await toggleSplitView(window);

  await openViewMenu(window);
  await expect(splitViewMenuItem(window)).toHaveClass(/active/);
  await window.keyboard.press("Escape");

  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });
});

test("multi-view は 2 pane で表示される", async ({ window }) => {
  await toggleSplitView(window);
  await expect(window.locator(".multi-view-pane")).toHaveCount(2, { timeout: 5000 });
});

test("分割表示を無効にすると通常 canvas に戻る", async ({ window }) => {
  await toggleSplitView(window);
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await toggleSplitView(window);
  await expect(window.locator(".multi-view-container")).not.toBeVisible({
    timeout: 5000,
  });

  await openViewMenu(window);
  await expect(splitViewMenuItem(window)).not.toHaveClass(/active/);
  await window.keyboard.press("Escape");

  await expect(window.locator(".canvas-container")).toBeVisible();
});

test("別 pane をクリックすると active が切り替わる", async ({ window }) => {
  await toggleSplitView(window);
  await expect(window.locator(".multi-view-pane")).toHaveCount(2, { timeout: 5000 });

  const secondPane = window.locator(".multi-view-pane").nth(1);
  await secondPane.click();
  await expect(secondPane).toHaveClass(/active/, { timeout: 3000 });
});

test("layout-horizontal class が付く", async ({ window }) => {
  await toggleSplitView(window);
  await expect(window.locator(".multi-view-container.layout-horizontal")).toBeVisible({
    timeout: 5000,
  });
});

test("設定変更後も multi-view が維持される", async ({ window }) => {
  await toggleSplitView(window);
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.locator(".menu-dropdown-trigger", { hasText: /Settings|設定/ }).click();
  const themeItem = window.locator(".menu-dropdown-item", {
    hasText: /(Light Mode|Dark Mode|ライトモード|ダークモード)/,
  });
  const textBefore = await themeItem.textContent();
  await themeItem.click();

  await window.locator(".menu-dropdown-trigger", { hasText: /Settings|設定/ }).click();
  await expect(async () => {
    const textAfter = await window
      .locator(".menu-dropdown-item", {
        hasText: /(Light Mode|Dark Mode|ライトモード|ダークモード)/,
      })
      .textContent();
    expect(textAfter).not.toBe(textBefore);
  }).toPass({ timeout: 3000 });
  await window.keyboard.press("Escape");

  await expect(window.locator(".multi-view-container")).toBeVisible();
});

test("分割表示を繰り返し toggle しても正常に戻る", async ({ window }) => {
  await toggleSplitView(window);
  await toggleSplitView(window);
  await toggleSplitView(window);
  await toggleSplitView(window);

  await expect(window.locator(".canvas-container")).toBeVisible({ timeout: 5000 });
  await openViewMenu(window);
  await expect(splitViewMenuItem(window)).not.toHaveClass(/active/);
  await window.keyboard.press("Escape");
});
