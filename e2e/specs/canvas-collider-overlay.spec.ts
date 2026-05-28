import { expect, test } from "../fixtures";


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function addRect(
  window: import("playwright").Page,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<string> {
  return window.evaluate(
    ([n, ax, ay, aw, ah]) => {
      const v = window.__vivi2d!;
      const store = v.useColliderStore as any;
      return store.getState().addRectCollider(n, ax, ay, aw, ah) as string;
    },
    [name, x, y, w, h] as const,
  );
}

async function addCircle(
  window: import("playwright").Page,
  name: string,
  cx: number,
  cy: number,
  r: number,
): Promise<string> {
  return window.evaluate(
    ([n, ax, ay, ar]) => {
      const v = window.__vivi2d!;
      const store = v.useColliderStore as any;
      return store.getState().addCircleCollider(n, ax, ay, ar) as string;
    },
    [name, cx, cy, r] as const,
  );
}

async function getSelectedColliderId(
  window: import("playwright").Page,
): Promise<string | null> {
  return window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    return store.getState().selectedColliderId as string | null;
  });
}

async function getColliderShape(
  window: import("playwright").Page,
  colliderId: string,
): Promise<Record<string, unknown> | null> {
  return window.evaluate((id) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const colliders = store.getState().project?.colliders ?? [];
    const c = colliders.find((c: any) => c.id === id);
    return c ? { ...c.shape } : null;
  }, colliderId);
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("コライダーを追加するとキャンバスがクラッシュしない", async ({ window }) => {
  await addRect(window, "テスト矩形", 100, 100, 200, 150);
  await addCircle(window, "テスト円", 400, 300, 80);

  const canvas = window.locator(".canvas-container canvas");
  await expect(canvas).toBeVisible();
});

test("複数コライダーを追加してもオーバーレイが正常に動作する", async ({ window }) => {
  for (let i = 0; i < 5; i++) {
    await addRect(window, `矩形${i}`, i * 100, i * 50, 80, 60);
  }
  for (let i = 0; i < 3; i++) {
    await addCircle(window, `円${i}`, 500 + i * 100, 200, 40);
  }

  const canvas = window.locator(".canvas-container canvas");
  await expect(canvas).toBeVisible();

  const count = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.colliders?.length ?? 0;
  });
  expect(count).toBe(8);
});


test("パネルでコライダーをクリックするとselectedColliderIdが更新される", async ({
  window,
}) => {
  const id = await addRect(window, "選択テスト", 100, 100, 200, 150);

  expect(await getSelectedColliderId(window)).toBeNull();

  await window.locator(".collider-item").click();

  expect(await getSelectedColliderId(window)).toBe(id);
});

test("パネルでコライダーを選択するとハイライトCSSが適用される", async ({ window }) => {
  await addRect(window, "ハイライト", 100, 100, 200, 150);

  const item = window.locator(".collider-item");
  await expect(item).toBeVisible();

  await item.click();

  await expect(item).toHaveClass(/collider-selected/);
});

test("別のコライダーをクリックすると選択が切り替わる", async ({ window }) => {
  const id1 = await addRect(window, "矩形A", 0, 0, 100, 100);
  const id2 = await addCircle(window, "円B", 300, 300, 50);

  const items = window.locator(".collider-item");
  await expect(items).toHaveCount(2);

  await items.first().click();
  expect(await getSelectedColliderId(window)).toBe(id1);
  await expect(items.first()).toHaveClass(/collider-selected/);
  await expect(items.nth(1)).not.toHaveClass(/collider-selected/);

  await items.nth(1).click();
  expect(await getSelectedColliderId(window)).toBe(id2);
  await expect(items.first()).not.toHaveClass(/collider-selected/);
  await expect(items.nth(1)).toHaveClass(/collider-selected/);
});


test("selectCollider APIで選択するとパネルのハイライトが更新される", async ({
  window,
}) => {
  const id = await addRect(window, "API選択", 50, 50, 100, 100);

  await window.evaluate((colliderId) => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().selectCollider(colliderId);
  }, id);

  await expect(window.locator(".collider-item")).toHaveClass(/collider-selected/);
});

test("コライダー削除で選択がクリアされる", async ({ window }) => {
  const id = await addRect(window, "削除対象", 50, 50, 100, 100);

  await window.evaluate((colliderId) => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().selectCollider(colliderId);
  }, id);
  expect(await getSelectedColliderId(window)).toBe(id);

  await window.locator(".collider-remove-btn").click();

  expect(await getSelectedColliderId(window)).toBeNull();
});

test("updateShape APIでコライダー形状を変更できる", async ({ window }) => {
  const id = await addRect(window, "移動テスト", 100, 100, 200, 150);

  await window.evaluate((colliderId) => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().updateShape(colliderId, { x: 300, y: 250 });
  }, id);

  const shape = await getColliderShape(window, id);
  expect(shape).toBeTruthy();
  expect(shape!.x).toBe(300);
  expect(shape!.y).toBe(250);
  expect(shape!.width).toBe(200);
  expect(shape!.height).toBe(150);
});

test("円コライダーの半径を変更できる", async ({ window }) => {
  const id = await addCircle(window, "リサイズ", 200, 200, 50);

  await window.evaluate((colliderId) => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().updateShape(colliderId, { radius: 120 });
  }, id);

  const shape = await getColliderShape(window, id);
  expect(shape).toBeTruthy();
  expect(shape!.radius).toBe(120);
});


test("無効コライダーのオーバーレイ表示でクラッシュしない", async ({ window }) => {
  await addRect(window, "無効", 100, 100, 200, 150);

  await window.locator(".collider-toggle input").uncheck();

  const canvas = window.locator(".canvas-container canvas");
  await expect(canvas).toBeVisible();
});
