import { expect, test } from "../fixtures";
import { clickFileMenuItem } from "../helpers/operations";

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});

async function openExportDialog(window: import("playwright").Page) {
  await clickFileMenuItem(window, "SDK Export");
  await expect(window.locator(".modal-overlay")).toBeVisible();
  await expect(window.locator(".modal-content")).toContainText(
    /Spine JSON|SDK Export|エクスポート/i,
  );
}

test("opens the SDK export dialog", async ({ window }) => {
  await openExportDialog(window);
});

test("shows the layer selection list", async ({ window }) => {
  await openExportDialog(window);

  const layerList = window.locator("[data-testid='layer-select-list']");
  await expect(layerList).toBeVisible();

  const checkboxes = layerList.locator("input[type='checkbox']");
  const count = await checkboxes.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    await expect(checkboxes.nth(i)).toBeChecked();
  }
});

test("lists output files in the export dialog", async ({ window }) => {
  await openExportDialog(window);

  const fileList = window.locator(".export-file-list");
  await expect(fileList).toBeVisible();
  await expect(fileList.getByText("spine.json")).toBeVisible();
  await expect(fileList.getByText("texture_00.png")).toBeVisible();
});

test("disables export when every layer is deselected", async ({ window }) => {
  await openExportDialog(window);

  const exportButton = window.locator(".modal-btn-primary");
  await expect(exportButton).toBeEnabled();

  const toggleButton = window.locator(".export-toggle-btn").first();
  await expect(toggleButton).toHaveText(/Deselect All|選択解除|全解除/i);
  await toggleButton.click();

  await expect(exportButton).toBeDisabled();
  await expect(toggleButton).toHaveText(/Select All|すべて選択|全選択/i);

  await toggleButton.click();
  await expect(exportButton).toBeEnabled();
});

test("closes the dialog with Escape", async ({ window }) => {
  await openExportDialog(window);

  await window.keyboard.press("Escape");
  await expect(window.locator(".modal-overlay")).not.toBeVisible();
});

test("closes the dialog when clicking the overlay", async ({ window }) => {
  await openExportDialog(window);

  await window.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
  await expect(window.locator(".modal-overlay")).not.toBeVisible();
});

test("closes the dialog from the secondary button", async ({ window }) => {
  await openExportDialog(window);

  await window.locator(".modal-btn").first().click();
  await expect(window.locator(".modal-overlay")).not.toBeVisible();
});

test("updates the selected layer count", async ({ window }) => {
  await openExportDialog(window);

  const layerList = window.locator("[data-testid='layer-select-list']");
  const checkboxes = layerList.locator("input[type='checkbox']");
  const count = await checkboxes.count();

  const sectionTitle = window.locator(".export-section-title").first();
  await expect(sectionTitle).toContainText(`${count}/${count}`);

  await checkboxes.first().uncheck();
  await expect(sectionTitle).toContainText(`${count - 1}/${count}`);

  await checkboxes.first().check();
  await expect(sectionTitle).toContainText(`${count}/${count}`);
});
