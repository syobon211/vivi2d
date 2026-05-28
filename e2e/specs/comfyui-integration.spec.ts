import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

async function openIntegrationsMenu(window: Page) {
  const trigger = window.locator(".menu-dropdown-trigger").nth(3);
  const panel = window.locator(".menu-dropdown-panel");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(panel).toBeVisible();
}

async function openGenerateModelDialog(window: Page) {
  await openIntegrationsMenu(window);
  await window.locator(".menu-dropdown-panel .menu-dropdown-item").first().click();
}

async function openSettingsDialog(window: Page, index: number) {
  await openIntegrationsMenu(window);
  await window
    .locator(".menu-dropdown-panel .menu-dropdown-item")
    .nth(index + 1)
    .click();
}

test("integrations menu trigger is visible", async ({ window }) => {
  await expect(window.locator(".menu-dropdown-trigger").nth(3)).toBeVisible();
});

test("integrations menu shows ComfyUI, OBS Studio, and VTube Studio sections", async ({
  window,
}) => {
  await openIntegrationsMenu(window);

  await expect(
    window.locator(".menu-dropdown-section", { hasText: "ComfyUI" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-section", { hasText: "OBS Studio" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-section", { hasText: "VTube Studio" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-panel .menu-dropdown-item").first(),
  ).toBeVisible();

  await window.keyboard.press("Escape");
});

test("AI generate dialog opens from the integrations menu", async ({ window }) => {
  await openGenerateModelDialog(window);

  await expect(window.locator(".modal-title")).toBeVisible();
  await expect(window.locator(".ai-gen-tab")).toHaveCount(2);
  await expect(window.locator(".ai-gen-notice").first()).toBeVisible();

  await window.locator(".modal-actions .prop-btn").last().click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
});

test("ComfyUI settings dialog opens", async ({ window }) => {
  await openSettingsDialog(window, 0);

  await expect(window.locator(".modal-title", { hasText: /ComfyUI/ })).toBeVisible();
  await expect(window.locator('input[value="http://127.0.0.1:8188"]')).toBeVisible();

  await window.locator(".prop-btn").last().click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
});

test("ComfyUI settings test connection shows the Vivi2D compat report", async ({
  window,
}) => {
  await openSettingsDialog(window, 0);

  await expect(window.locator(".modal-title", { hasText: /ComfyUI/ })).toBeVisible();

  await window.locator(".ai-gen-input").fill("http://127.0.0.1:8000");
  await window.locator(".prop-btn").first().click();

  await expect(window.locator(".ai-gen-notice", { hasText: /1\.0\.0/ })).toBeVisible();
  await expect(window.locator(".ai-gen-notice", { hasText: /0\.1\.0/ })).toBeVisible();
  await expect(
    window.locator(".ai-gen-notice", { hasText: /vivi2d\.seethrough\.v1/ }),
  ).toBeVisible();
  await expect(
    window.locator(".ai-gen-notice", {
      hasText:
        /Compat.*(decompose|\u5206\u89e3)\s*(OK|\u3042\u308a).*(export|\u66f8\u304d\u51fa\u3057)\s*(OK|\u3042\u308a)/i,
    }),
  ).toBeVisible();

  await window.locator(".prop-btn").last().click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
});

test("OBS Studio settings dialog opens", async ({ window }) => {
  await openSettingsDialog(window, 1);

  await expect(window.locator(".modal-title", { hasText: /OBS Studio/ })).toBeVisible();
  await expect(window.locator('input[value="ws://127.0.0.1:4455"]')).toBeVisible();

  await window.locator(".prop-btn").last().click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
});

test("VTube Studio settings dialog opens", async ({ window }) => {
  await openSettingsDialog(window, 2);

  await expect(window.locator(".modal-title", { hasText: /VTube Studio/ })).toBeVisible();
  await expect(window.locator('input[value="ws://127.0.0.1:8001"]')).toBeVisible();

  await window.locator(".prop-btn").last().click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
});

test("AI generate dialog exposes prompt mode controls", async ({ window }) => {
  await openGenerateModelDialog(window);

  await window.locator(".ai-gen-tab").nth(1).click();
  await expect(window.locator(".ai-gen-textarea").first()).toBeVisible();
  await expect(window.locator(".ai-gen-param").first()).toBeVisible();

  await window.locator(".prop-btn").last().click();
});

test("Blender (.glb) export is visible after loading a PSD", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await window.locator(".menu-dropdown-trigger").first().click();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: /Blender.*\.glb/ }),
  ).toBeVisible();

  await window.keyboard.press("Escape");
});

test("Auto Setup is visible after loading a PSD", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await window.locator(".menu-dropdown-trigger").first().click();
  await expect(
    window.locator(".menu-dropdown-item", {
      hasText: /Auto Setup|自動セットアップ/,
    }),
  ).toBeVisible();

  await window.keyboard.press("Escape");
});
