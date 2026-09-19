import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { withViewer, setViewerLocale, loadFixtureModel, openSideSheet } from "../support/viewer-page";

const screenshotDir = path.resolve(import.meta.dirname, "../../test-screenshots");
test.beforeAll(() => fs.mkdirSync(screenshotDir, { recursive: true }));

test("日英の起動画面と背景選択肢を同じ起動で確認する", async () => {
  await withViewer(async ({ page }) => {
    for (const locale of ["ja", "en"] as const) {
      await setViewerLocale(page, locale);
      await expect(page.getByRole("button", { name: locale === "ja" ? "モデルを開く" : "Open Model", exact: true })).toBeVisible();
      await expect(page.locator("p", { hasText: locale === "ja" ? ".viviファイルをドロップ" : "Drop .vivi file here" })).toBeVisible();
      await page.screenshot({ path: path.join(screenshotDir, `compare-${locale}-launch.png`) });
      await openSideSheet(page);
      const options = await page.locator("select").filter({ hasText: /透明|グリーン|Transparent|Green/ }).locator("option").allTextContents();
      for (const expected of locale === "ja" ? ["透明", "グリーンバック", "ブルーバック"] : ["Transparent", "Green Screen", "Blue Screen"]) expect(options).toContain(expected);
    }
  });
});

test("日英のモデル操作、エフェクト、HUDを同じ読込で確認する", async () => {
  await withViewer(async ({ page }) => {
    for (const locale of ["ja", "en"] as const) {
      await setViewerLocale(page, locale);
      await loadFixtureModel(page);
      await openSideSheet(page, "input-effects");
      await expect(page.getByTestId("viewer-toggle-face-tracking")).toBeVisible();
      await expect(page.getByTestId("viewer-toggle-hand-tracking")).toBeVisible();
      if (locale === "en") await expect(page.locator("body")).toContainText(/Face\s*\d+/);
      for (const label of locale === "ja" ? ["紙吹雪", "ハート", "星", "きらめき"] : ["Confetti", "Hearts", "Stars", "Sparkles"]) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(screenshotDir, `compare-${locale}-model.png`) });
      await openSideSheet(page);
      await page.getByTestId("session-toggle-hud").click();
      const hud = page.getByTestId("hud-overlay");
      await expect(hud).toBeVisible();
      await page.waitForTimeout(1_000);
      if (locale === "en") {
        await expect(hud).toContainText("FPS");
        await expect(hud).toContainText("meshes");
      }
      await page.screenshot({ path: path.join(screenshotDir, `compare-${locale}-hud.png`) });
    }
  });
});
