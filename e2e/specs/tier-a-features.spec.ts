import { expect, test } from "../fixtures";
import { clickFileMenuItem, clickViewMenuItem, selectLayer } from "../helpers/operations";

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});

function viewMenuTrigger(window: import("playwright").Page) {
  return window.locator(".menu-dropdown-trigger").nth(1);
}

function viewMenuPanel(window: import("playwright").Page) {
  return viewMenuTrigger(window).locator("..").locator(".menu-dropdown-panel");
}

test("form lock menu item is visible in the View menu", async ({ window }) => {
  await viewMenuTrigger(window).click();
  await expect(
    viewMenuPanel(window).locator(".menu-dropdown-item").first(),
  ).toBeVisible();
  await window.keyboard.press("Escape");
});

test("form lock toggles its active state", async ({ window }) => {
  await clickViewMenuItem(window, "Form Lock");
  await viewMenuTrigger(window).click();
  await expect(viewMenuPanel(window).locator(".menu-dropdown-item").first()).toHaveClass(
    /active/,
  );
  await window.keyboard.press("Escape");

  await clickViewMenuItem(window, "Form Lock");
  await viewMenuTrigger(window).click();
  await expect(
    viewMenuPanel(window).locator(".menu-dropdown-item").first(),
  ).not.toHaveClass(/active/);
  await window.keyboard.press("Escape");
});

test("form lock disables auto mesh actions", async ({ window }) => {
  await selectLayer(window, "Red Circle");
  await clickViewMenuItem(window, "Form Lock");
  await expect(window.locator(".auto-mesh-btn").first()).toBeDisabled();
});

test("onion skin starts disabled", async ({ window }) => {
  await viewMenuTrigger(window).click();
  const onionItem = viewMenuPanel(window).locator(".menu-dropdown-item").nth(1);
  await expect(onionItem).toBeVisible();
  await expect(onionItem).not.toHaveClass(/active/);
  await window.keyboard.press("Escape");
});

test("onion skin toggles on and off", async ({ window }) => {
  await clickViewMenuItem(window, "Onion Skin");
  await viewMenuTrigger(window).click();
  await expect(viewMenuPanel(window).locator(".menu-dropdown-item").nth(1)).toHaveClass(
    /active/,
  );
  await window.keyboard.press("Escape");

  await clickViewMenuItem(window, "Onion Skin");
  await viewMenuTrigger(window).click();
  await expect(
    viewMenuPanel(window).locator(".menu-dropdown-item").nth(1),
  ).not.toHaveClass(/active/);
  await window.keyboard.press("Escape");
});

test("open command can be invoked without leaving the workspace", async ({ window }) => {
  await clickFileMenuItem(window, "Open");
  await expect(window.locator(".workspace")).toBeVisible();
});

test("tool buttons switch active state", async ({ window }) => {
  const selectTool = window.locator(".tool-btn").nth(0);
  const panTool = window.locator(".tool-btn").nth(1);
  const meshTool = window.locator(".tool-btn").nth(2);

  await selectTool.click();
  await expect(selectTool).toHaveClass(/active/);

  await panTool.click();
  await expect(panTool).toHaveClass(/active/);

  await meshTool.click();
  await expect(meshTool).toHaveClass(/active/);
});
