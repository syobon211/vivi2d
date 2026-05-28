import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(import.meta.dirname, "../fixtures/test.vivi");
const screenshotDir = path.resolve(import.meta.dirname, "../../test-screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
});

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

async function loadModel(
  window: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>["firstWindow"]>>,
) {
  const viviContent = fs.readFileSync(testViviPath, "utf-8");
  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "test.vivi",
    mimeType: "application/json",
    buffer: Buffer.from(viviContent),
  });
  await expect(window.locator("canvas")).toBeVisible({ timeout: 10_000 });
}

test("起動画面のレイアウト確認", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await window.waitForTimeout(500);

  await window.screenshot({ path: path.join(screenshotDir, "01-launch.png") });

  const openBtn = window.locator("label", { hasText: /モデルを開く/ });
  await expect(openBtn).toBeVisible({ timeout: 5_000 });

  const toolbarBox = await openBtn.evaluate((el) => {
    const toolbar = el.closest('div[style]');
    if (!toolbar) return null;
    const rect = toolbar.getBoundingClientRect();
    return { height: rect.height, y: rect.y };
  });
  expect(toolbarBox).not.toBeNull();
  expect(toolbarBox!.height).toBeLessThan(100);

  const placeholder = window.locator("p", { hasText: /.viviファイル/ });
  await expect(placeholder).toBeVisible();

  const phBox = await placeholder.boundingBox();
  const viewport = await window.evaluate(() => ({
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }));
  expect(phBox).not.toBeNull();
  if (phBox) {
    const phCenterY = phBox.y + phBox.height / 2;
    expect(phCenterY).toBeGreaterThan(viewport.height * 0.3);
    expect(phCenterY).toBeLessThan(viewport.height * 0.7);
  }

  await app.close();
});

test("モデル読込後のレイアウト確認", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await loadModel(window);
  await window.waitForTimeout(300);

  await window.screenshot({ path: path.join(screenshotDir, "02-model-loaded.png") });

  await expect(window.locator("canvas")).toBeVisible();

  await expect(window.locator("span", { hasText: "Test Model" })).toBeVisible();

  await openSettingsPanel(window, "input-effects");

  await expect(window.locator("button", { hasText: "紙吹雪" })).toBeVisible();
  await expect(window.locator("button", { hasText: "ハート" })).toBeVisible();
  await expect(window.locator("button", { hasText: "星" })).toBeVisible();
  await expect(window.locator("button", { hasText: "きらめき" })).toBeVisible();

  const placeholder = window.locator("p", { hasText: /.viviファイルをドロップ/ });
  await expect(placeholder).not.toBeVisible();

  await app.close();
});

test("背景モード切替の視覚確認", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await loadModel(window);

  await openSettingsPanel(window);

  const bgSelect = window.locator("select").filter({ hasText: /透明|グリーン/ });

  await bgSelect.selectOption("green");
  await window.waitForTimeout(300);
  await window.screenshot({ path: path.join(screenshotDir, "03-greenback.png") });

  const greenBg = await window.locator("canvas").evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(greenBg).toBe("rgb(0, 255, 0)");

  await bgSelect.selectOption("blue");
  await window.waitForTimeout(300);
  await window.screenshot({ path: path.join(screenshotDir, "04-blueback.png") });

  const blueBg = await window.locator("canvas").evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(blueBg).toBe("rgb(0, 0, 255)");

  await bgSelect.selectOption("transparent");
  await window.waitForTimeout(300);
  await window.screenshot({ path: path.join(screenshotDir, "05-transparent.png") });

  const transpBg = await window.locator("canvas").evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(transpBg).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)/);

  await app.close();
});

test("HUDオンの表示確認", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await loadModel(window);

  await openSettingsPanel(window);

  const hudBtn = window.locator('[data-testid="session-toggle-hud"]');
  await hudBtn.click();

  await window.locator('[data-testid="settings-toggle"]').click();
  await expect(window.locator('[data-testid="settings-panel"]')).not.toBeVisible();

  const hudOverlay = window.locator('[data-testid="hud-overlay"]');
  await expect(hudOverlay).toBeVisible({ timeout: 3_000 });

  await window.waitForTimeout(500);

  await window.screenshot({ path: path.join(screenshotDir, "06-hud-on.png") });

  const hudText = await hudOverlay.textContent();
  expect(hudText).toContain("FPS");
  expect(hudText).toContain("メッシュ");
  expect(hudText).toContain("頂点");

  const hudBox = await hudOverlay.boundingBox();
  expect(hudBox).not.toBeNull();
  if (hudBox) {
    expect(hudBox.x).toBeLessThan(100);
    expect(hudBox.y).toBeLessThan(180);
  }

  await app.close();
});

test("エフェクト再生の視覚確認", async () => {
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
  await loadModel(window);
  await window.waitForTimeout(300);

  await openSettingsPanel(window, "input-effects");

  await window.locator("button", { hasText: "紙吹雪" }).click();
  await window.waitForTimeout(300);

  await window.screenshot({ path: path.join(screenshotDir, "07-confetti.png") });

  expect(errors).toHaveLength(0);

  await app.close();
});

test("ホットキー表情切替の視覚確認", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await loadModel(window);
  await window.waitForTimeout(500);

  await window.keyboard.press("1");

  const toast = window.locator('[data-testid="preset-indicator"]');
  await expect(toast).toBeVisible({ timeout: 3_000 });
  await expect(toast).toContainText("1: Smile");

  await window.screenshot({ path: path.join(screenshotDir, "08-hotkey-preset.png") });

  const toastBox = await toast.boundingBox();
  const viewport = await window.evaluate(() => ({
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }));
  expect(toastBox).not.toBeNull();
  if (toastBox) {
    expect(toastBox.x + toastBox.width).toBeGreaterThan(viewport.width - 100);
    expect(toastBox.y).toBeLessThan(180);
  }

  await app.close();
});
