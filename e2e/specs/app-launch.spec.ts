import { expect, test } from "../fixtures";

test("初期起動でタイトル・ワークスペース・ツール・未読込メニューが表示される", async ({
  window,
}) => {
  await expect(window).toHaveTitle("Vivi2D Editor");
  await expect(window.locator(".app-title", { hasText: "Vivi2D" })).toBeVisible();
  await expect(window.locator(".workspace")).toBeVisible();
  await expect(window.locator(".tool-btn", { hasText: /選択|Select/ })).toBeVisible();
  await expect(window.locator(".tool-btn", { hasText: /パン|Pan/ })).toBeVisible();
  await expect(window.locator(".tool-btn", { hasText: /メッシュ|Mesh/ })).toBeVisible();
  await window.locator(".menu-dropdown-trigger", { hasText: /ファイル|File/ }).click();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: /PSDをインポート|Import PSD/ }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: /名前を付けて保存|Save As/ }),
  ).not.toBeVisible();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: /閉じる|Close/ }),
  ).not.toBeVisible();
  await window.keyboard.press("Escape");
});
