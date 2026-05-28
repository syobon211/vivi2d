import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";

const CONFIRM_BUTTON_LABEL = /OK|\u78ba\u8a8d|\u6c7a\u5b9a/;


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function getColliderCount(window: import("playwright").Page): Promise<number> {
  return window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.colliders?.length ?? 0;
  });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("コライダーパネルが表示される", async ({ window }) => {
  const panel = window.locator(".collider-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".panel-header")).toContainText(/コライダー|Colliders/);
});

test("初期状態で空メッセージが表示される", async ({ window }) => {
  const empty = window.locator(".collider-panel .panel-empty");
  await expect(empty).toBeVisible();
  expect(await getColliderCount(window)).toBe(0);
});


test("矩形コライダーを追加できる", async ({ window }) => {
  await window
    .locator(".collider-actions .physics-btn", {
      hasText: /矩形追加|Add Rectangle/,
    })
    .click();

  const input = window.locator(".collider-name-input");
  await expect(input).toBeVisible();

  await input.fill("頭エリア");
  await window.locator(".param-action-btn", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await expect(window.locator(".collider-item")).toBeVisible();
  await expect(window.locator(".collider-name", { hasText: "頭エリア" })).toBeVisible();
  expect(await getColliderCount(window)).toBe(1);
});


test("円コライダーを追加できる", async ({ window }) => {
  await window
    .locator(".collider-actions .physics-btn", {
      hasText: /円追加|Add Circle/,
    })
    .click();

  const input = window.locator(".collider-name-input");
  await input.fill("ほっぺた");
  await window.locator(".param-action-btn", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await expect(window.locator(".collider-name", { hasText: "ほっぺた" })).toBeVisible();
  expect(await getColliderCount(window)).toBe(1);
});


test("選択中のメッシュからコライダーを追加できる", async ({ window }) => {
  await selectLayer(window, "Red Circle");

  const addMeshBtn = window.locator(".collider-actions .physics-btn", {
    hasText: /メッシュから追加|Add from Mesh/,
  });
  await expect(addMeshBtn).toBeEnabled();
  await addMeshBtn.click();

  await expect(window.locator(".collider-item")).toBeVisible();
  expect(await getColliderCount(window)).toBe(1);
});


test("コライダーを削除できる", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().addRectCollider("削除対象", 0, 0, 100, 100);
  });
  await expect(window.locator(".collider-item")).toBeVisible();

  await window.locator(".collider-remove-btn").click();

  await expect(window.locator(".collider-item")).not.toBeVisible();
  expect(await getColliderCount(window)).toBe(0);
});


test("コライダーの有効/無効を切り替えられる", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().addCircleCollider("トグル対象", 50, 50, 30);
  });

  const item = window.locator(".collider-item");
  await expect(item).toBeVisible();

  const checkbox = item.locator(".collider-toggle input");
  await expect(checkbox).toBeChecked();

  await checkbox.uncheck();
  await expect(item).toHaveClass(/collider-disabled/);

  await checkbox.check();
  await expect(item).not.toHaveClass(/collider-disabled/);
});


test("コライダー名をダブルクリックで編集できる", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().addRectCollider("元の名前", 0, 0, 50, 50);
  });

  await window.locator(".collider-name", { hasText: "元の名前" }).dblclick();

  const inlineInput = window.locator(".collider-name-inline");
  await expect(inlineInput).toBeVisible();
  await inlineInput.fill("新しい名前");
  await inlineInput.press("Enter");

  await expect(window.locator(".collider-name", { hasText: "新しい名前" })).toBeVisible();
});


test("コライダーにタグを設定できる", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().addRectCollider("タグテスト", 0, 0, 50, 50);
  });

  await window.locator(".collider-tag").click();

  const tagInput = window.locator(".collider-tag-input");
  await expect(tagInput).toBeVisible();
  await tagInput.fill("head");
  await tagInput.press("Enter");

  await expect(window.locator(".collider-tag", { hasText: "#head" })).toBeVisible();
});


test("Escキーで追加フォームをキャンセルできる", async ({ window }) => {
  await window
    .locator(".collider-actions .physics-btn", {
      hasText: /矩形追加|Add Rectangle/,
    })
    .click();

  const input = window.locator(".collider-name-input");
  await expect(input).toBeVisible();

  await input.fill("キャンセルされる名前");
  await input.press("Escape");

  await expect(input).not.toBeVisible();
  expect(await getColliderCount(window)).toBe(0);
});


test("複数コライダーを管理できる", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().addRectCollider("頭", 0, 0, 100, 100);
    store.getState().addCircleCollider("ほっぺた左", 30, 50, 20);
    store.getState().addCircleCollider("ほっぺた右", 70, 50, 20);
  });

  await expect(window.locator(".collider-item")).toHaveCount(3);
  expect(await getColliderCount(window)).toBe(3);

  await window.locator(".collider-remove-btn").first().click();
  await expect(window.locator(".collider-item")).toHaveCount(2);
  expect(await getColliderCount(window)).toBe(2);
});
