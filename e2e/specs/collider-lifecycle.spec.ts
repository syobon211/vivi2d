import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";

const CONFIRM_BUTTON_LABEL = /OK|\u78ba\u8a8d|\u6c7a\u5b9a/;


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("コライダーのフルライフサイクル: 追加→選択→形状変更→トグル→タグ→名前変更→削除", async ({
  window,
}) => {
  await window
    .locator(".collider-actions .physics-btn", { hasText: /矩形追加|Add Rectangle/ })
    .click();
  const nameInput = window.locator(".collider-name-input");
  await nameInput.fill("頭エリア");
  await window.locator(".param-action-btn", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await expect(window.locator(".collider-item")).toBeVisible();
  const colliderId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project.colliders[0].id as string;
  });
  expect(colliderId).toBeTruthy();

  await window.locator(".collider-item").click();
  const selectedId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    return store.getState().selectedColliderId;
  });
  expect(selectedId).toBe(colliderId);
  await expect(window.locator(".collider-item")).toHaveClass(/collider-selected/);

  await window.evaluate((id) => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().updateShape(id, { x: 200, y: 300, width: 150, height: 100 });
  }, colliderId);

  const shape = await window.evaluate((id) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const c = store.getState().project.colliders.find((c: any) => c.id === id);
    return { ...c.shape };
  }, colliderId);
  expect(shape.x).toBe(200);
  expect(shape.y).toBe(300);
  expect(shape.width).toBe(150);
  expect(shape.height).toBe(100);

  const checkbox = window.locator(".collider-toggle input");
  await checkbox.uncheck();
  await expect(window.locator(".collider-item")).toHaveClass(/collider-disabled/);

  const enabledAfterDisable = await window.evaluate((id) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project.colliders.find((c: any) => c.id === id).enabled;
  }, colliderId);
  expect(enabledAfterDisable).toBe(false);

  await checkbox.check();
  await expect(window.locator(".collider-item")).not.toHaveClass(/collider-disabled/);

  await window.locator(".collider-tag").click();
  const tagInput = window.locator(".collider-tag-input");
  await tagInput.fill("head");
  await tagInput.press("Enter");
  await expect(window.locator(".collider-tag", { hasText: "#head" })).toBeVisible();

  await window.locator(".collider-name", { hasText: "頭エリア" }).dblclick();
  const inlineInput = window.locator(".collider-name-inline");
  await inlineInput.fill("頭コライダー");
  await inlineInput.press("Enter");
  await expect(
    window.locator(".collider-name", { hasText: "頭コライダー" }),
  ).toBeVisible();

  await window.locator(".collider-remove-btn").click();
  await expect(window.locator(".collider-item")).not.toBeVisible();

  const finalCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project.colliders.length;
  });
  expect(finalCount).toBe(0);

  const finalSel = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    return store.getState().selectedColliderId;
  });
  expect(finalSel).toBeNull();
});

test("複数コライダーの操作ワークフロー: 3種追加→選択切替→個別削除", async ({
  window,
}) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useColliderStore as any;
    store.getState().addRectCollider("矩形A", 0, 0, 100, 100);
    store.getState().addCircleCollider("円B", 200, 200, 50);
    store.getState().addRectCollider("矩形C", 300, 100, 80, 60);
  });

  await expect(window.locator(".collider-item")).toHaveCount(3);

  await window.locator(".collider-item").nth(1).click();
  let sel = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useColliderStore as any).getState().selectedColliderId;
  });
  const circleBId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project.colliders[1].id;
  });
  expect(sel).toBe(circleBId);

  await window.locator(".collider-item").nth(2).click();
  sel = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useColliderStore as any).getState().selectedColliderId;
  });
  const rectCId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project.colliders[2].id;
  });
  expect(sel).toBe(rectCId);

  await window.locator(".collider-remove-btn").nth(1).click();
  await expect(window.locator(".collider-item")).toHaveCount(2);

  sel = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useColliderStore as any).getState().selectedColliderId;
  });
  expect(sel).toBe(rectCId);

  await window.locator(".collider-remove-btn").first().click();
  await window.locator(".collider-remove-btn").first().click();
  await expect(window.locator(".collider-item")).not.toBeVisible();

  const finalCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project.colliders.length;
  });
  expect(finalCount).toBe(0);
});

test("メッシュコライダー追加→パネル操作の統合テスト", async ({ window }) => {
  await selectLayer(window, "Red Circle");

  await window
    .locator(".collider-actions .physics-btn", {
      hasText: /メッシュから追加|Add from Mesh/,
    })
    .click();

  await expect(window.locator(".collider-item")).toBeVisible();

  await expect(window.locator(".collider-shape-badge")).toBeVisible();

  await window.locator(".collider-tag").click();
  const tagInput = window.locator(".collider-tag-input");
  await tagInput.fill("body");
  await tagInput.press("Enter");
  await expect(window.locator(".collider-tag", { hasText: "#body" })).toBeVisible();

  const checkbox = window.locator(".collider-toggle input");
  await checkbox.uncheck();
  await expect(window.locator(".collider-item")).toHaveClass(/collider-disabled/);
  await checkbox.check();

  await window.locator(".collider-remove-btn").click();
  await expect(window.locator(".collider-item")).not.toBeVisible();
});
