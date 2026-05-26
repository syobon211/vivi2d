import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";

const MESH_SECTION_LABEL = /^(Mesh|\u30e1\u30c3\u30b7\u30e5)/;

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

async function toggleFormLock(window: import("playwright").Page) {
  const trigger = window.locator(".menu-dropdown-trigger").nth(1);
  const panel = trigger.locator("..").locator(".menu-dropdown-panel");
  await trigger.click();
  await expect(panel).toBeVisible();
  await panel.locator(".menu-dropdown-item").first().click();
}

test("auto mesh shows the preset selector and generate button", async ({ window }) => {
  await selectLayer(window, "Background");
  await expect(window.locator(".auto-mesh-select").first()).toBeVisible();
  await expect(window.locator(".auto-mesh-btn").first()).toBeVisible();
});

test("clicking generate keeps the mesh panel visible", async ({ window }) => {
  await selectLayer(window, "Background");
  const generateButton = window.locator(".auto-mesh-btn").first();
  await expect(generateButton).toBeVisible();

  await generateButton.click();

  await expect(
    window.locator(".properties-section").filter({ hasText: MESH_SECTION_LABEL }).first(),
  ).toBeVisible();
});

test("auto mesh presets can be switched", async ({ window }) => {
  await selectLayer(window, "Background");

  const select = window.locator(".auto-mesh-select").first();
  await expect(select).toBeVisible();

  await select.selectOption("coarse");
  await expect(select).toHaveValue("coarse");

  await select.selectOption("fine");
  await expect(select).toHaveValue("fine");

  await select.selectOption("standard");
  await expect(select).toHaveValue("standard");
});

test("auto mesh is disabled while form lock is enabled", async ({ window }) => {
  await selectLayer(window, "Red Circle");

  await toggleFormLock(window);
  await expect(window.locator(".auto-mesh-btn").first()).toBeDisabled();

  await toggleFormLock(window);
  await expect(window.locator(".auto-mesh-btn").first()).toBeEnabled();
});
