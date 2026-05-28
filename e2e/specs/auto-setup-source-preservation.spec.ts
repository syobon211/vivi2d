import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ElectronApplication, Page } from "playwright";
import { expect, test } from "../fixtures";
import { importPsdAndWait, waitForStableFrame, waitForViviRuntime } from "../helpers/app";
import {
  captureCanvasGateScreenshot,
  expectCanvasSourcePreserved,
  readCanvasPreservationStats,
} from "../helpers/canvas-preservation";
import { clickFileMenuItem } from "../helpers/operations";
import {
  resolveCharacterPsdPath,
  resolveOptionalPracticalPsdPath,
  resolveSimplePsdPath,
} from "../helpers/psd-fixtures";

const SCREENSHOT_DIR = path.resolve("test-screenshots", "auto-setup-safety");
const OPTIONAL_PRACTICAL_PSD = resolveOptionalPracticalPsdPath();
const FIXTURES = [
  { id: "simple", path: resolveSimplePsdPath(), firstLayerText: "Background" },
  { id: "character-test", path: resolveCharacterPsdPath(), firstLayerText: "" },
  ...(OPTIONAL_PRACTICAL_PSD
    ? [{ id: "practical", path: OPTIONAL_PRACTICAL_PSD, firstLayerText: "" }]
    : []),
] as const;

async function loadFixturePsd(
  app: ElectronApplication,
  window: Page,
  psdPath: string,
  firstLayerText: string,
) {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await importPsdAndWait(app, window, psdPath, firstLayerText);
  await waitForViviRuntime(window);
  await expect(window.locator(".canvas-container canvas")).toBeVisible({
    timeout: 15_000,
  });
  await expect(window.locator(".layer-item .layer-name").first()).toBeVisible({
    timeout: 15_000,
  });
}

async function openAutoSetup(window: Page) {
  await clickFileMenuItem(window, "Auto Setup");
  await expect(window.locator(".auto-setup-dialog")).toBeVisible({ timeout: 5_000 });
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

async function clickDetect(window: Page) {
  const button = window.locator(".auto-setup-footer-cta .modal-btn-primary");
  await expect(button).toBeVisible();
  await button.click();
}

async function waitForDetectTable(window: Page) {
  const table = window.locator(".auto-setup-table");
  const empty = window.locator(".auto-setup-empty");
  await expect
    .poll(
      async () => {
        if (await table.isVisible().catch(() => false)) return "table";
        if (await empty.isVisible().catch(() => false)) return "empty";
        return "pending";
      },
      { timeout: 60_000 },
    )
    .toMatch(/table|empty/);

  await expect(table, "Auto Setup should detect at least one fixture row").toBeVisible();
  await expect(window.locator(".auto-setup-table tbody tr")).not.toHaveCount(0);
}

test.describe("Auto Setup preserves visible source fixtures", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const fixture of FIXTURES) {
    test(`preserves ${fixture.id} after apply`, async ({ app, window }) => {
      test.setTimeout(150_000);

      await loadFixturePsd(app, window, fixture.path, fixture.firstLayerText);
      const before = await readCanvasPreservationStats(window);
      expect(before.inkPixels).toBeGreaterThan(0);
      await captureCanvasGateScreenshot(
        window,
        SCREENSHOT_DIR,
        `${fixture.id}-before-auto-setup.png`,
      );

      await openAutoSetup(window);
      await setMinimumConfidence(window, 0.1);
      await clickDetect(window);
      await waitForDetectTable(window);

      const previewButton = window.locator(".auto-setup-actions .modal-btn-primary");
      await previewButton.click();
      await expect(window.locator(".auto-setup-list").first()).toBeVisible();

      const applyButton = window.locator(".auto-setup-actions .modal-btn-primary");
      await applyButton.click();
      await expect(window.locator(".auto-setup-dialog")).not.toBeVisible({
        timeout: 10_000,
      });
      await waitForStableFrame(window, 4);

      const after = await readCanvasPreservationStats(window);
      await captureCanvasGateScreenshot(
        window,
        SCREENSHOT_DIR,
        `${fixture.id}-after-auto-setup.png`,
      );
      expectCanvasSourcePreserved(before, after);
    });
  }
});
