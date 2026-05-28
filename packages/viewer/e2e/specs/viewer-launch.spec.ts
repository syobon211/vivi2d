import { expect, test } from "@playwright/test";
import {
  collectPageErrors,
  openSideSheet,
  setViewerLocale,
  withViewer,
} from "../support/viewer-page";

test("viewer-launch: starts the Electron viewer", async () => {
  await withViewer(async ({ page }) => {
    await expect(page).toHaveTitle(/Vivi Viewer/);
  });
});

test("viewer-launch: renders the main Japanese UI without a model", async () => {
  await withViewer(async ({ page }) => {
    await setViewerLocale(page, "ja");

    await expect(
      page.locator('[data-testid="main-toolbar"]').getByText("モデルを開く"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="settings-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="workflow-primary-action"]')).toBeVisible();

    await openSideSheet(page, "input-effects");
    await expect(page.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeDisabled();
  });
});

test("viewer-launch: has no fatal page errors during boot", async () => {
  await withViewer(async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.waitForTimeout(2_000);

    expect(errors).toHaveLength(0);
  });
});
