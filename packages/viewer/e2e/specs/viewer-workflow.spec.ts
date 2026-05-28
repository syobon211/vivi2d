import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(import.meta.dirname, "../fixtures/test.vivi");
const screenshotDir = path.resolve(import.meta.dirname, "../../test-screenshots");

async function openSettingsPanel(
  window: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>["firstWindow"]>>,
  section: "session" | "input-effects" = "session",
) {
  const sheet = window.locator('[data-testid="side-sheet"]');
  if (!(await sheet.isVisible())) {
    await window.locator('[data-testid="settings-toggle"]').click();
    await expect(sheet).toBeVisible({ timeout: 2_000 });
  }
  await window.locator(`[data-testid="side-sheet-tab-${section}"]`).click();
  await expect(window.locator(`[data-testid="side-sheet-panel-${section}"]`)).toBeVisible({
    timeout: 2_000,
  });
}

test.beforeAll(() => {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
});

test("完全ワークフロー: 起動→読込→設定→エフェクト→HUD→ホットキー→背景", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));

  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  const title = await window.title();
  expect(title).toContain("Vivi Viewer");

  const openBtn = window.locator("label", { hasText: /モデルを開く/ });
  await expect(openBtn).toBeVisible({ timeout: 10_000 });

  const placeholder = window.locator("p", { hasText: /.viviファイル/ });
  await expect(placeholder).toBeVisible();

  await window.screenshot({ path: path.join(screenshotDir, "wf-01-launch.png") });

  const viviContent = fs.readFileSync(testViviPath, "utf-8");
  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "test.vivi",
    mimeType: "application/json",
    buffer: Buffer.from(viviContent),
  });

  const canvas = window.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 10_000 });

  await expect(placeholder).not.toBeVisible();

  await expect(window.locator("span", { hasText: "Test Model" })).toBeVisible();

  await openSettingsPanel(window, "input-effects");
  await expect(window.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeEnabled({
    timeout: 5_000,
  });

  await window.screenshot({ path: path.join(screenshotDir, "wf-02-model-loaded.png") });

  await openSettingsPanel(window);

  const slider = window.locator('input[type="range"]');
  await expect(slider).toBeVisible();

  await slider.fill("0.3");
  await expect(window.locator("span", { hasText: "30%" })).toBeVisible({ timeout: 2_000 });

  await window.screenshot({ path: path.join(screenshotDir, "wf-03-smoothing.png") });

  const bgSelect = window.locator("select").filter({ hasText: /透明|グリーン/ });
  await bgSelect.selectOption("green");
  await window.waitForTimeout(300);

  const greenBg = await canvas.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(greenBg).toBe("rgb(0, 255, 0)");

  await window.screenshot({ path: path.join(screenshotDir, "wf-04-green-bg.png") });

  await openSettingsPanel(window, "input-effects");
  await window.locator("button", { hasText: "紙吹雪" }).click();
  await window.waitForTimeout(300);
  await window.screenshot({ path: path.join(screenshotDir, "wf-05-confetti.png") });

  await window.locator("button", { hasText: "ハート" }).click();
  await window.waitForTimeout(300);
  await window.screenshot({ path: path.join(screenshotDir, "wf-06-hearts.png") });

  await openSettingsPanel(window);
  const hudBtn = window.locator('[data-testid="session-toggle-hud"]');
  await hudBtn.click();

  const hudOverlay = window.locator('[data-testid="hud-overlay"]');
  await expect(hudOverlay).toBeVisible({ timeout: 3_000 });

  await window.waitForTimeout(1_000);

  const hudText = await hudOverlay.textContent();
  expect(hudText).toContain("FPS");
  expect(hudText).toContain("メッシュ");
  expect(hudText).toContain("頂点");

  await window.screenshot({ path: path.join(screenshotDir, "wf-07-hud-on.png") });

  await hudBtn.click();
  await window.waitForTimeout(300);
  await expect(hudOverlay).not.toBeVisible();

  await window.screenshot({ path: path.join(screenshotDir, "wf-08-hud-off.png") });

  await window.keyboard.press("1");
  const presetToast = window.locator('[data-testid="preset-indicator"]');
  await expect(presetToast).toBeVisible({ timeout: 3_000 });
  await expect(presetToast).toContainText("1: Smile");

  await window.screenshot({ path: path.join(screenshotDir, "wf-09-hotkey-1.png") });

  await window.keyboard.press("2");
  await expect(presetToast).toContainText("2: Angry");

  await window.screenshot({ path: path.join(screenshotDir, "wf-10-hotkey-2.png") });

  await bgSelect.selectOption("transparent");
  await window.waitForTimeout(300);

  const transpBg = await canvas.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(transpBg).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)/);

  await window.screenshot({ path: path.join(screenshotDir, "wf-11-transparent.png") });

  await window.waitForTimeout(500);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const cx = box!.width * 75 / 200;
  const cy = box!.height * 75 / 200;
  await canvas.click({ position: { x: cx, y: cy } });

  const hitLabel = window.locator('[data-testid="hit-overlay"]').filter({ hasText: /Head/ });
  await expect(hitLabel).toBeVisible({ timeout: 3_000 });

  await window.screenshot({ path: path.join(screenshotDir, "wf-12-hit-test.png") });

  expect(errors).toHaveLength(0);

  await app.close();
});
