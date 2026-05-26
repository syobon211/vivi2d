import { expect, test } from "../fixtures";

function panel(window: import("playwright").Page) {
  return window.locator(".physics-panel");
}

function addGroupButton(window: import("playwright").Page) {
  return window.locator(".physics-panel .physics-btn", {
    hasText: /\+ Add Group|\+ グループ追加/,
  });
}

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("物理演算パネルが表示される", async ({ window }) => {
  await expect(panel(window)).toBeVisible();
  await expect(panel(window).locator(".panel-header")).toContainText(/Physics|物理演算/);
});

test("物理演算の有効/無効を切り替えられる", async ({ window }) => {
  const toggle = window.locator(".physics-panel .physics-toggle input[type='checkbox']");
  const initialState = await toggle.isChecked();

  await toggle.click();
  if (initialState) {
    await expect(toggle).not.toBeChecked();
  } else {
    await expect(toggle).toBeChecked();
  }

  await toggle.click();
  if (initialState) {
    await expect(toggle).toBeChecked();
  } else {
    await expect(toggle).not.toBeChecked();
  }
});

test("物理グループを追加できる", async ({ window }) => {
  await addGroupButton(window).click();

  await expect(window.locator(".physics-group")).toHaveCount(1);
  await expect(window.locator(".physics-group-name")).toContainText(
    /Physics Group 1|物理グループ 1|物理グループ1/,
  );
  await expect(
    window.locator(".physics-panel .physics-btn", { hasText: /Reset|リセット/ }),
  ).toBeVisible();
});

test("複数の物理グループを追加できる", async ({ window }) => {
  await addGroupButton(window).click();
  await addGroupButton(window).click();

  await expect(window.locator(".physics-group")).toHaveCount(2);
  await expect(window.locator(".physics-group-name").nth(1)).toContainText(
    /Physics Group 2|物理グループ 2|物理グループ2/,
  );
});

test("テンプレート dropdown が表示される", async ({ window }) => {
  const templateBtn = window.locator(".physics-panel .template-dropdown-btn");
  await expect(templateBtn).toBeVisible();
});

test("テンプレート menu を開いて選択できる", async ({ window }) => {
  const templateBtn = window.locator(".physics-panel .template-dropdown-btn");
  await templateBtn.click();

  const menu = window.locator(".template-dropdown-menu");
  await expect(menu).toBeVisible();

  const items = menu.locator(".template-dropdown-item");
  expect(await items.count()).toBeGreaterThan(0);

  await items.first().click();
  await expect(menu).not.toBeVisible();
});
