import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";

function blendModeSelect(window: import("playwright").Page) {
  return window
    .locator(".prop-select")
    .filter({ has: window.locator('option[value="multiply"]') })
    .first();
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await selectLayer(window, "Background");
  await expect(
    window.locator(".properties-form", { hasText: "Background" }),
  ).toBeVisible();
});

test("draw order slider and numeric input are visible", async ({ window }) => {
  await expect(window.locator('.prop-slider[max="1000"]')).toBeVisible();
  await expect(window.locator('.prop-number-input[max="1000"]')).toBeVisible();
});

test("draw order numeric input can be edited", async ({ window }) => {
  const drawOrderInput = window.locator('.prop-number-input[max="1000"]');
  await drawOrderInput.fill("750");
  await drawOrderInput.press("Enter");
  await expect(drawOrderInput).toHaveValue("750");
});

test("blend mode select exposes the full option set", async ({ window }) => {
  const select = blendModeSelect(window);
  await expect(select).toBeVisible();

  const options = select.locator("option");
  await expect(options).toHaveCount(13);
  await expect(options.nth(0)).toHaveAttribute("value", "normal");
  await expect(options.nth(1)).toHaveAttribute("value", "add");
  await expect(options.nth(2)).toHaveAttribute("value", "multiply");
});

test("blend mode can be changed", async ({ window }) => {
  const select = blendModeSelect(window);

  await select.selectOption("add");
  await expect(select).toHaveValue("add");

  await select.selectOption("multiply");
  await expect(select).toHaveValue("multiply");

  await select.selectOption("normal");
  await expect(select).toHaveValue("normal");
});

test("multiply and screen color pickers are visible", async ({ window }) => {
  const colorInputs = window.locator(".prop-color-input");
  await expect(colorInputs).toHaveCount(2);
});

test("multiply color defaults to white", async ({ window }) => {
  const colorInputs = window.locator(".prop-color-input");
  await expect(colorInputs.first()).toHaveValue("#ffffff");
});

test("screen color defaults to black", async ({ window }) => {
  const colorInputs = window.locator(".prop-color-input");
  await expect(colorInputs.nth(1)).toHaveValue("#000000");
});

test("culling checkbox is visible for ViviMeshes", async ({ window }) => {
  const checkbox = window.locator('.prop-checkbox-label input[type="checkbox"]');
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();
});

test("culling checkbox can be toggled", async ({ window }) => {
  const checkbox = window.locator('.prop-checkbox-label input[type="checkbox"]');

  await checkbox.click();
  await expect(checkbox).toBeChecked();

  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
});

test("all draw property controls are visible together", async ({ window }) => {
  await expect(window.locator('.prop-slider[max="1000"]')).toBeVisible();
  await expect(blendModeSelect(window)).toBeVisible();
  await expect(window.locator(".prop-color-input")).toHaveCount(2);
  await expect(
    window.locator('.prop-checkbox-label input[type="checkbox"]'),
  ).toBeVisible();
});

test("draw property controls stay visible for a selected layer", async ({ window }) => {
  await expect(window.locator('.prop-slider[max="1000"]')).toBeVisible();
  await expect(window.locator(".prop-color-input")).toHaveCount(2);
  await expect(
    window.locator('.prop-checkbox-label input[type="checkbox"]'),
  ).toBeVisible();
});
