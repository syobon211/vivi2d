import { expect, test } from "../fixtures";


test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});


test("メニュートリガーに focus → Enter → ArrowDown で項目へ移動できる", async ({
  window,
}) => {
  const fileTrigger = window
    .locator(".menu-dropdown-trigger", { hasText: /ファイル|File/ })
    .first();

  await fileTrigger.focus();
  await expect(fileTrigger).toBeFocused();
  await window.keyboard.press("Enter");

  const panel = window.locator(".menu-dropdown-panel").first();
  await expect(panel).toBeVisible();
  const firstItem = panel.getByRole("menuitem").first();
  await expect(firstItem).toBeFocused();

  await window.keyboard.press("ArrowDown");
  const secondItem = panel.getByRole("menuitem").nth(1);
  await expect(secondItem).toBeFocused();

  await window.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(fileTrigger).toBeFocused();
});


test("レイヤーツリー: ArrowDown/Enter で別レイヤーを選択できる", async ({ window }) => {
  const firstLayerId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const proj = (v.useEditorStore as any).getState().project;
    const id = proj.layers[0]?.id as string | undefined;
    if (id) {
      (v.useSelectionStore as any).getState().selectLayer(id);
    }
    return id;
  });
  expect(firstLayerId).toBeTruthy();

  const tree = window.locator(".layer-list[role='tree']");
  await expect(tree).toBeVisible();

  const focusTarget = tree.locator("[role='treeitem'][tabindex='0']").first();
  await expect(focusTarget).toHaveAttribute("data-layer-id", firstLayerId!);
  await focusTarget.focus();
  await expect(focusTarget).toBeFocused();

  await window.keyboard.press("ArrowDown");

  const afterFocusedId = await window.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a?.dataset?.layerId ?? null;
  });
  expect(afterFocusedId).toBeTruthy();
  expect(afterFocusedId).not.toBe(firstLayerId);

  await window.keyboard.press("Enter");

  const selectedId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useSelectionStore as any).getState().selectedLayerId as string | null;
  });
  expect(selectedId).toBe(afterFocusedId);
});


test("パラメータ追加: ボタンにフォーカス → Enter → 入力 → Enter で追加完了", async ({
  window,
}) => {
  const before = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project.parameters.length as number;
  });

  const addBtn = window
    .locator(".parameter-panel-actions .param-action-btn", {
      hasText: /(\+\s*追加|\+\s*Add|追加|Add)/,
    })
    .first();
  await addBtn.focus();
  await expect(addBtn).toBeFocused();

  await window.keyboard.press("Enter");

  const nameInput = window.locator(".param-add-form .param-add-name").first();
  await expect(nameInput).toBeVisible();
  await expect(nameInput).toBeFocused();

  await window.keyboard.type("kbOnly");

  await window.keyboard.press("Enter");

  await expect(async () => {
    const after = await window.evaluate(() => {
      const v = window.__vivi2d!;
      return (v.useEditorStore as any).getState().project.parameters as {
        name: string;
      }[];
    });
    expect(after.length).toBe(before + 1);
    expect(after.some((p) => p.name === "kbOnly")).toBe(true);
  }).toPass({ timeout: 3_000 });

  await expect(window.locator(".parameter-name", { hasText: "kbOnly" })).toBeVisible();
});


test("SDKエクスポートダイアログ: Escape で閉じ、再度メニュー操作が可能", async ({
  window,
}) => {
  const fileTrigger = window
    .locator(".menu-dropdown-trigger", { hasText: /ファイル|File/ })
    .first();
  await fileTrigger.focus();
  await window.keyboard.press("Enter");

  const panel = window.locator(".menu-dropdown-panel").first();
  await expect(panel).toBeVisible();

  const item = panel
    .getByRole("menuitem")
    .filter({ hasText: /(SDKエクスポート|SDK Export)/ })
    .first();
  await item.focus();
  await window.keyboard.press("Enter");

  const overlay = window.locator(".modal-overlay");
  await expect(overlay).toBeVisible();

  const activeInDialog = await window.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    const modal = document.querySelector(".modal-content") as HTMLElement | null;
    if (!a || !modal) return false;
    return modal.contains(a);
  });
  expect(activeInDialog).toBe(true);

  await window.keyboard.press("Escape");
  await expect(overlay).not.toBeVisible();

  await fileTrigger.focus();
  await window.keyboard.press("Enter");
  await expect(panel).toBeVisible();

  await window.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
});
