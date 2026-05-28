import { expect, test } from "../fixtures";

test("選択ツールが初期状態で active", async ({ window }) => {
  const selectBtn = window.locator(".tool-btn", { hasText: "↖ 選択" });
  await expect(selectBtn).toHaveClass(/active/);
});

test("メニューからパンツールに切り替え", async ({ window }) => {
  const panBtn = window.locator(".tool-btn", { hasText: "✋ パン" });
  await panBtn.click();

  await expect(panBtn).toHaveClass(/active/);

  const selectBtn = window.locator(".tool-btn", { hasText: "↖ 選択" });
  await expect(selectBtn).not.toHaveClass(/active/);
});

test("メニューからメッシュ編集ツールに切り替え", async ({ window }) => {
  const meshBtn = window.locator(".tool-btn", { hasText: "◇ メッシュ" });
  await meshBtn.click();

  await expect(meshBtn).toHaveClass(/active/);
});

test("キーボード V でツール切り替え", async ({ window }) => {
  await window.locator(".tool-btn", { hasText: "✋ パン" }).click();

  await window.keyboard.press("v");

  const selectBtn = window.locator(".tool-btn", { hasText: "↖ 選択" });
  await expect(selectBtn).toHaveClass(/active/);
});

test("キーボード H でパンツール切り替え", async ({ window }) => {
  await window.locator(".app").click();
  await window.keyboard.press("h");

  const panBtn = window.locator(".tool-btn", { hasText: "✋ パン" });
  await expect(panBtn).toHaveClass(/active/);
});

test("キーボード M でメッシュ編集ツール切り替え", async ({ window }) => {
  await window.locator(".app").click();
  await window.keyboard.press("m");

  const meshBtn = window.locator(".tool-btn", { hasText: "◇ メッシュ" });
  await expect(meshBtn).toHaveClass(/active/);
});

test("リセットボタンが存在する", async ({ window }) => {
  await window.locator(".menu-dropdown-trigger", { hasText: /表示|View/ }).click();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: "リセット" }),
  ).toBeVisible();
  await window.keyboard.press("Escape");
});
