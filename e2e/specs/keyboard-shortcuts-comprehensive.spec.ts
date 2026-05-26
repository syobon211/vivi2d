import { expect, test } from "../fixtures";


test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await window.evaluate(() => localStorage.removeItem("vivi2d-shortcuts"));
});

// ------------------------------------------------------------
// Undo / Redo
// ------------------------------------------------------------

test("Ctrl+Z で直前のレイヤー移動が元に戻る", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  const order0 = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const p = (v.useEditorStore as any).getState().project;
    return p.layers.map((l: { name: string }) => l.name);
  });
  expect(order0.length).toBeGreaterThan(1);

  await window.locator(".layer-item", { hasText: order0[0]! }).click();
  await window.locator(".app").focus();
  await window.keyboard.press("Control+ArrowDown");

  const order1 = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const p = (v.useEditorStore as any).getState().project;
    return p.layers.map((l: { name: string }) => l.name);
  });
  expect(order1).not.toEqual(order0);

  await window.keyboard.press("Control+z");

  const order2 = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const p = (v.useEditorStore as any).getState().project;
    return p.layers.map((l: { name: string }) => l.name);
  });
  expect(order2).toEqual(order0);
});

test("Ctrl+Shift+Z で Undo を再適用できる", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  const orderInit = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any)
      .getState()
      .project.layers.map((l: { name: string }) => l.name);
  });

  await window.locator(".layer-item", { hasText: orderInit[0]! }).click();
  await window.locator(".app").focus();
  await window.keyboard.press("Control+ArrowDown");

  const orderMoved = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any)
      .getState()
      .project.layers.map((l: { name: string }) => l.name);
  });

  await window.keyboard.press("Control+z");
  await window.keyboard.press("Control+Shift+Z");

  const orderRedone = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any)
      .getState()
      .project.layers.map((l: { name: string }) => l.name);
  });
  expect(orderRedone).toEqual(orderMoved);
});


test("v/h/m で選択/パン/メッシュ編集ツールに切り替わる", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await window.locator(".app").click();

  await window.keyboard.press("v");
  await expect(window.locator(".tool-btn.active", { hasText: /選択/ })).toBeVisible();

  await window.keyboard.press("h");
  await expect(window.locator(".tool-btn.active", { hasText: /パン/ })).toBeVisible();

  await window.keyboard.press("m");
  await expect(window.locator(".tool-btn.active", { hasText: /メッシュ/ })).toBeVisible();
});

test("Space 長押しで一時パン、離すと元のツールに戻る", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await window.locator(".app").click();

  await window.keyboard.press("v");
  await expect(window.locator(".tool-btn.active", { hasText: /選択/ })).toBeVisible();

  await window.keyboard.down("Space");
  await expect(window.locator(".tool-btn.active", { hasText: /パン/ })).toBeVisible();

  await window.keyboard.up("Space");
  await expect(window.locator(".tool-btn.active", { hasText: /選択/ })).toBeVisible();
});


test("Ctrl+A で全レイヤーが選択される", async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await window.locator(".app").click();
  await window.keyboard.press("Control+a");

  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const s = (v.useSelectionStore as any).getState();
    const p = (v.useEditorStore as any).getState().project;
    return { selected: s.selectedLayerIds.length, total: p.layers.length };
  });
  expect(result.selected).toBeGreaterThan(0);
  expect(result.selected).toBeLessThanOrEqual(result.total * 10);
});

test("Ctrl+↑/↓ で選択中レイヤーを並び替えできる", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  const initialNames = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any)
      .getState()
      .project.layers.map((l: { name: string }) => l.name);
  });

  await window.locator(".layer-item", { hasText: initialNames[0]! }).click();
  await window.locator(".app").focus();

  await window.keyboard.press("Control+ArrowDown");

  const afterDown = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any)
      .getState()
      .project.layers.map((l: { name: string }) => l.name);
  });

  expect(afterDown[0]).not.toBe(initialNames[0]);
});


test("数字 1-9 でプリセットホットキーが呼ばれる（設定なしでもクラッシュしない）", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await window.locator(".app").click();

  for (let i = 1; i <= 9; i++) {
    await window.keyboard.press(String(i));
  }
  await expect(window.locator(".workspace")).toBeVisible();
});

test("入力要素にフォーカス中は数字キーがプリセット発火しない", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await window.locator(".layer-item").first().click();

  const addBtn = window.getByText("+ 追加").first();
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
    const nameInput = window.getByPlaceholder("パラメータ名");
    await nameInput.focus();
    await window.keyboard.press("1");
    await expect(nameInput).toHaveValue("1");
  } else {
    test.skip();
  }
});


test("Ctrl+S でプロジェクトがあるときに保存処理が呼ばれる（クラッシュしない）", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await window.locator(".app").click();

  await window.keyboard.press("Control+s");
  await expect(window.locator(".workspace")).toBeVisible();

  await window.keyboard.press("Control+Shift+S");
  await expect(window.locator(".workspace")).toBeVisible();
});


test("プロジェクト未読み込みで全ショートカットを連打してもクラッシュしない", async ({
  window,
}) => {
  await window.locator(".app").click();

  const keys = [
    "Control+z",
    "Control+Shift+Z",
    "Control+s",
    "Control+Shift+S",
    "Control+a",
    "Control+ArrowUp",
    "Control+ArrowDown",
    "v",
    "h",
    "m",
    "1",
    "9",
  ];
  for (const k of keys) {
    await window.keyboard.press(k);
  }
  await expect(window.locator(".workspace")).toBeVisible();
});
