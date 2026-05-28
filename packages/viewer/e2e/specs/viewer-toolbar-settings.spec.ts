import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(import.meta.dirname, "../fixtures/test.vivi");

async function launch() {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  return { app, window };
}

async function loadTestModel(window: Awaited<ReturnType<typeof launch>>["window"]) {
  const viviContent = fs.readFileSync(testViviPath, "utf-8");
  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "test.vivi",
    mimeType: "application/json",
    buffer: Buffer.from(viviContent),
  });
  await expect(window.locator("canvas")).toBeVisible({ timeout: 10_000 });
}

test("ツールバーに必要な4種のトラッキングボタンが揃っている", async () => {
  const { app, window } = await launch();
  const toolbar = window.locator('[data-testid="main-toolbar"]');
  await expect(toolbar).toBeVisible({ timeout: 5_000 });

  const faceBtn = toolbar.locator("button", { hasText: "👤" });
  const handBtn = toolbar.locator("button", { hasText: "✋" });
  const lipBtn = toolbar.locator("button", { hasText: "🎤" });
  const poseBtn = toolbar.locator("button", { hasText: "🏃" });
  await expect(faceBtn).toBeVisible();
  await expect(handBtn).toBeVisible();
  await expect(lipBtn).toBeVisible();
  await expect(poseBtn).toBeVisible();
  await expect(faceBtn).toBeDisabled();
  await expect(handBtn).toBeDisabled();
  await expect(lipBtn).toBeDisabled();
  await expect(poseBtn).toBeDisabled();

  await app.close();
});

test("⚙ボタン押下で設定パネルが開閉する（再描画で状態保持）", async () => {
  const { app, window } = await launch();
  const toolbar = window.locator('[data-testid="main-toolbar"]');
  const panel = window.locator('[data-testid="settings-panel"]');
  const toggle = window.locator('[data-testid="settings-toggle"]');
  await expect(toolbar).toBeVisible({ timeout: 5_000 });

  await expect(panel).not.toBeVisible();

  await toggle.click();
  await expect(panel).toBeVisible({ timeout: 2_000 });

  await toggle.click();
  await expect(panel).not.toBeVisible();

  await toggle.click();
  await expect(panel).toBeVisible({ timeout: 2_000 });

  await app.close();
});

test("モデル読込後の設定パネルにエフェクト・録画・スクリプト全群が揃う", async () => {
  const { app, window } = await launch();
  await loadTestModel(window);

  const toggle = window.locator('[data-testid="settings-toggle"]');
  await toggle.click();
  const panel = window.locator('[data-testid="settings-panel"]');
  await expect(panel).toBeVisible({ timeout: 2_000 });

  await expect(panel.locator("select").first()).toBeVisible();

  await expect(panel.locator("button", { hasText: "紙吹雪" })).toBeVisible();
  await expect(panel.locator("button", { hasText: "ハート" })).toBeVisible();
  await expect(panel.locator("button", { hasText: "星" })).toBeVisible();
  await expect(panel.locator("button", { hasText: "きらめき" })).toBeVisible();

  await expect(panel.locator('input[type="text"]')).toBeVisible();

  await expect(panel.locator("button", { hasText: "設定エクスポート" })).toBeVisible();
  await expect(panel.locator("button", { hasText: "設定インポート" })).toBeVisible();
  await expect(panel.locator("button", { hasText: "📷" })).toBeVisible();

  await app.close();
});
