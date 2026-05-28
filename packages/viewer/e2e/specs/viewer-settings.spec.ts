import { expect, test } from "@playwright/test";
import {
  openSettingsPanel,
  setViewerLocale,
  withViewer,
} from "../support/viewer-page";

async function readStoredSettings(page: Parameters<typeof openSettingsPanel>[0]) {
  const stored = await page.evaluate(() =>
    localStorage.getItem("vivi-viewer-settings"),
  );
  expect(stored).not.toBeNull();
  return JSON.parse(stored!);
}

test("viewer-settings: persists smoothing changes", async () => {
  await withViewer(async ({ page }) => {
    await setViewerLocale(page, "ja");
    await openSettingsPanel(page);

    await page.locator('input[type="range"]').fill("0.8");

    const settings = await readStoredSettings(page);
    expect(settings.smoothing).toBe(0.8);
  });
});

test("viewer-settings: persists background mode changes", async () => {
  await withViewer(async ({ page }) => {
    await setViewerLocale(page, "ja");
    await openSettingsPanel(page);

    const bgSelect = page.locator("select").filter({
      hasText: /透明|グリーンバック|ブルーバック/,
    });
    await bgSelect.selectOption("green");

    const settings = await readStoredSettings(page);
    expect(settings.bgMode).toBe("green");
  });
});

test("viewer-settings: restores persisted settings after reload", async () => {
  await withViewer(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        "vivi-viewer-settings",
        JSON.stringify({
          bgMode: "blue",
          smoothing: 0.85,
          cameraDeviceId: "",
          alwaysOnTop: false,
        }),
      );
      localStorage.setItem("vivi-viewer-locale", "ja");
    });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await openSettingsPanel(page);

    const bgValue = await page
      .locator("select")
      .filter({ hasText: /透明|グリーンバック|ブルーバック/ })
      .inputValue();
    const sliderValue = await page.locator('input[type="range"]').inputValue();

    expect(bgValue).toBe("blue");
    expect(Number(sliderValue)).toBeCloseTo(0.85, 1);
  });
});

test("viewer-settings: restores zero smoothing after reload", async () => {
  await withViewer(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        "vivi-viewer-settings",
        JSON.stringify({
          bgMode: "transparent",
          smoothing: 0,
          cameraDeviceId: "",
          alwaysOnTop: false,
        }),
      );
      localStorage.setItem("vivi-viewer-locale", "ja");
    });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await openSettingsPanel(page);

    expect(Number(await page.locator('input[type="range"]').inputValue())).toBe(0);
    await expect(page.locator("span", { hasText: "0%" })).toBeVisible({
      timeout: 2_000,
    });
  });
});
