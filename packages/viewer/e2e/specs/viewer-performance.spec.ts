import { test, expect } from "@playwright/test";
import path from "node:path";
import { withViewer, setViewerLocale, loadFixtureModel, openSideSheet, collectPageErrors } from "../support/viewer-page";

const largePath = path.resolve(import.meta.dirname, "../fixtures/test-large.vivi");

test("大容量モデルを5秒以内に読み込み、50メッシュHUDと全エフェクトを維持する", async () => {
  await withViewer(async ({ page }) => {
    const errors = collectPageErrors(page);
    await setViewerLocale(page, "ja");
    const start = Date.now();
    await loadFixtureModel(page, largePath);
    expect(Date.now() - start).toBeLessThan(5_000);
    await expect(page.getByTestId("context-toolbar")).toContainText("Large Test Model");
    await openSideSheet(page);
    await page.getByTestId("session-toggle-hud").click();
    const hud = page.getByTestId("hud-overlay");
    await expect(hud).toBeVisible();
    await expect(hud).toContainText("50 メッシュ");
    await openSideSheet(page, "input-effects");
    for (const effect of ["紙吹雪", "ハート", "星", "きらめき"]) {
      for (let i = 0; i < 5; i++) await page.getByRole("button", { name: effect, exact: true }).click();
    }
    await page.waitForTimeout(3_000);
    expect(errors).toHaveLength(0);
  });
});

test("エフェクト4種を連続再生してもフレームレートが維持される", async () => {
  await withViewer(async ({ page }) => {
    const errors = collectPageErrors(page);
    await setViewerLocale(page, "ja");
    await loadFixtureModel(page);
    await openSideSheet(page);
    await page.getByTestId("session-toggle-hud").click();
    await page.waitForTimeout(1_000);
    await openSideSheet(page, "input-effects");
    for (let i = 0; i < 3; i++) {
      for (const effect of ["紙吹雪", "ハート", "星", "きらめき"]) {
        await page.getByRole("button", { name: effect, exact: true }).click();
      }
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(2_000);
    const text = await page.getByTestId("hud-overlay").textContent();
    const match = text?.match(/(\d+)\s*FPS/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(10);
    expect(errors).toHaveLength(0);
  });
});
