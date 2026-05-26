import { expect, test } from "@playwright/test";
import {
  collectPageErrors,
  loadFixtureModel,
  openSideSheet,
  openSettingsPanel,
  setViewerLocale,
  withViewer,
} from "../support/viewer-page";

test("viewer-model: loads a .vivi fixture and shows the canvas", async () => {
  await withViewer(async ({ page }) => {
    await setViewerLocale(page, "ja");
    const canvas = page.locator("canvas");

    await expect(canvas).not.toBeVisible({ timeout: 5_000 });
    await loadFixtureModel(page);

    await expect(canvas).toBeVisible({ timeout: 10_000 });
    await openSideSheet(page, "input-effects");
    await expect(page.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeEnabled({
      timeout: 5_000,
    });
  });
});

test("viewer-model: sizes the canvas from the loaded model", async () => {
  await withViewer(async ({ page }) => {
    await setViewerLocale(page, "ja");
    await loadFixtureModel(page);

    const size = await page.locator("canvas").evaluate((el) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));

    expect(size).toEqual({ width: 200, height: 200 });
  });
});

test("viewer-model: loads without page errors", async () => {
  await withViewer(async ({ page }) => {
    const errors = collectPageErrors(page);

    await setViewerLocale(page, "ja");
    await loadFixtureModel(page);
    await page.waitForTimeout(1_000);

    expect(errors).toHaveLength(0);
  });
});

test("viewer-model: switching background modes does not crash", async () => {
  await withViewer(async ({ page }) => {
    const errors = collectPageErrors(page);

    await setViewerLocale(page, "ja");
    await loadFixtureModel(page);
    await openSettingsPanel(page);

    const bgSelect = page.locator("select").filter({
      hasText: /透明|グリーンバック|ブルーバック/,
    });
    await bgSelect.selectOption("green");
    await page.waitForTimeout(200);
    await bgSelect.selectOption("blue");
    await page.waitForTimeout(200);
    await bgSelect.selectOption("transparent");
    await page.waitForTimeout(200);

    expect(errors).toHaveLength(0);
  });
});
