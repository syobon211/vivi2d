import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { clickFileMenuItem } from "../helpers/operations";

const IS_RECORDING_WORKFLOWS = process.env.VIVI2D_RECORD_E2E_WORKFLOWS === "1";
const DEBUG_PANEL_SCREENSHOT_PATH = process.env.VIVI2D_DEBUG_PANEL_SCREENSHOT_PATH;
const DEBUG_PANEL_SCREENSHOT_DIR = process.env.VIVI2D_DEBUG_PANEL_SCREENSHOT_DIR;

test.skip(
  !IS_RECORDING_WORKFLOWS && !DEBUG_PANEL_SCREENSHOT_DIR && !DEBUG_PANEL_SCREENSHOT_PATH,
  "Recording-only demo coverage is enabled by workflow recording or screenshot env vars.",
);

async function openAutoSetup(window: Page) {
  await clickFileMenuItem(window, "Auto Setup");
  await expect(window.locator(".auto-setup-dialog")).toBeVisible({ timeout: 5_000 });
}

async function clickDetect(window: Page) {
  const button = window.locator(".auto-setup-footer-cta .modal-btn-primary");
  await expect(button).toBeVisible();
  await button.click();
}

async function setMinimumConfidence(window: Page, value: number) {
  const slider = window.locator(".auto-setup-confidence input[type='range']");
  await expect(slider).toBeVisible();
  await slider.evaluate((element, nextValue) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(element, String(nextValue));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function waitForDetectOutcome(window: Page): Promise<"table" | "empty"> {
  const table = window.locator(".auto-setup-table");
  const empty = window.locator(".auto-setup-empty");
  await expect
    .poll(
      async () => {
        if (await table.isVisible().catch(() => false)) return "table";
        if (await empty.isVisible().catch(() => false)) return "empty";
        return "pending";
      },
      { timeout: 20_000 },
    )
    .toMatch(/table|empty/);

  return (await table.isVisible().catch(() => false)) ? "table" : "empty";
}

async function waitForDebugPanel(window: Page, screenshotName: string) {
  const toggle = window.locator(".auto-setup-debug-toggle");
  await expect(toggle).toBeVisible({ timeout: 5_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }

  const debugPanel = window.locator(".auto-setup-debug-panel");
  await expect(debugPanel).toBeVisible({ timeout: 5_000 });
  await debugPanel.scrollIntoViewIfNeeded();

  const screenshotPath =
    DEBUG_PANEL_SCREENSHOT_PATH ??
    (DEBUG_PANEL_SCREENSHOT_DIR
      ? path.join(DEBUG_PANEL_SCREENSHOT_DIR, `${screenshotName}.png`)
      : null);
  if (screenshotPath) {
    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await window.screenshot({ fullPage: false, path: screenshotPath });
  }

  if (IS_RECORDING_WORKFLOWS) {
    await window.waitForTimeout(4_000);
  }
}

test("Auto Setup debug preview records character PSD layer map", async ({
  loadCharacterPsd,
  window,
}) => {
  await window.setViewportSize({ height: 1080, width: 1920 });
  await loadCharacterPsd();

  await openAutoSetup(window);
  await setMinimumConfidence(window, 0.1);
  await clickDetect(window);

  const outcome = await waitForDetectOutcome(window);
  expect(outcome).toBe("table");
  await expect(window.locator(".auto-setup-table tbody tr").first()).toBeVisible();

  const previewButton = window.locator(".auto-setup-actions .modal-btn-primary");
  await previewButton.click();
  await expect(window.locator(".auto-setup-list").first()).toBeVisible();
  await waitForDebugPanel(window, "character-layer-map");
});
