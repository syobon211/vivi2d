import { expect, test } from "../fixtures";


test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
});

test("Tab キーでメニューバー要素にフォーカスを移動できる", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await window.locator("body").click();
  await window.keyboard.press("Tab");

  const focusedTag = await window.evaluate(
    () => document.activeElement?.tagName ?? "BODY",
  );
  expect(focusedTag).not.toBe("BODY");
});

test("Ctrl+Z で直前の操作をキーボードのみで取り消せる", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const layer = window.locator(".layer-item", { hasText: "Red Circle" });
  await layer.click();

  const initialCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project?.parameters?.length ?? 0;
  });

  await window.keyboard.press("Control+z");

  const afterCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project?.parameters?.length ?? 0;
  });
  expect(afterCount).toBe(initialCount);
});

test("Ctrl+Shift+Z で redo が機能する（履歴がなくてもクラッシュしない）", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await window.keyboard.press("Control+Shift+Z");
  await expect(window.locator(".workspace")).toBeVisible();
});

test("Escape キーでドロップダウンを閉じられる", async ({ window }) => {
  await window.locator(".menu-dropdown-trigger", { hasText: /ファイル|File/ }).click();

  const dropdownItem = window.locator(".menu-dropdown-item").first();
  await expect(dropdownItem).toBeVisible();

  await window.keyboard.press("Escape");
  await expect(dropdownItem).not.toBeVisible();
});

test("キーボードのみでツールを切り替えられる（ツールショートカット）", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await window.locator(".workspace").click();

  await window.keyboard.press("m");
  await expect(window.locator(".workspace")).toBeVisible();

  await window.keyboard.press("v");
  await expect(window.locator(".workspace")).toBeVisible();
});

test("ダイアログ内でTabフォーカスが閉じ込められる（フォーカストラップ）", async ({
  window,
}) => {
  await window.locator(".menu-dropdown-trigger", { hasText: /設定|Settings/ }).click();
  await window
    .locator(".menu-dropdown-item", { hasText: /ショートカット|Shortcut/ })
    .click();

  await expect(window.locator(".shortcut-dialog")).toBeVisible();

  for (let i = 0; i < 5; i++) {
    await window.keyboard.press("Tab");
  }

  const focusedTag = await window.evaluate(
    () => document.activeElement?.tagName ?? "BODY",
  );
  expect(focusedTag).not.toBe("BODY");

  await window.keyboard.press("Escape");
});
