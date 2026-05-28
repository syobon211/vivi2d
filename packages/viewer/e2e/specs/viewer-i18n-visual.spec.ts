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

async function setLocaleAndReload(
  window: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>["firstWindow"]>>,
  locale: "ja" | "en",
) {
  await window.evaluate((l) => localStorage.setItem("vivi-viewer-locale", l), locale);
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
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

test("日英対比: 起動画面のレイアウトが両言語で崩れない", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  await setLocaleAndReload(window, "ja");
  await expect(window.getByRole("button", { name: "モデルを開く" })).toBeVisible({ timeout: 5_000 });
  await expect(window.locator("p", { hasText: ".viviファイルをドロップ" })).toBeVisible();
  await window.screenshot({ path: path.join(screenshotDir, "compare-ja-launch.png") });

  await setLocaleAndReload(window, "en");
  await expect(window.getByRole("button", { name: "Open Model" })).toBeVisible({ timeout: 5_000 });
  await expect(window.locator("p", { hasText: "Drop .vivi file here" })).toBeVisible();
  await window.screenshot({ path: path.join(screenshotDir, "compare-en-launch.png") });

  await app.close();
});

test("日英対比: モデル読込後のUIが両言語で正しい", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  await setLocaleAndReload(window, "ja");
  await loadModel(window);
  await openSettingsPanel(window, "input-effects");
  await expect(window.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeVisible();
  await expect(window.locator('[data-testid="viewer-toggle-hand-tracking"]')).toBeVisible();
  await window.screenshot({ path: path.join(screenshotDir, "compare-ja-model.png") });

  await setLocaleAndReload(window, "en");
  await loadModel(window);
  await openSettingsPanel(window, "input-effects");
  await expect(window.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeVisible();
  await expect(window.locator('[data-testid="viewer-toggle-hand-tracking"]')).toBeVisible();
  await expect(window.locator("body")).toContainText(/Face\s*\d+/);
  await window.screenshot({ path: path.join(screenshotDir, "compare-en-model.png") });

  await app.close();
});

test("日英対比: HUD表示が両言語で正しい", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  await setLocaleAndReload(window, "ja");
  await loadModel(window);
  await openSettingsPanel(window);
  await window.locator('[data-testid="session-toggle-hud"]').click();
  const hud = window.locator('[data-testid="hud-overlay"]');
  await expect(hud).toBeVisible({ timeout: 3_000 });
  await window.waitForTimeout(1_000);
  await window.screenshot({ path: path.join(screenshotDir, "compare-ja-hud.png") });

  await setLocaleAndReload(window, "en");
  await loadModel(window);
  await openSettingsPanel(window);
  await window.locator('[data-testid="session-toggle-hud"]').click();
  await expect(hud).toBeVisible({ timeout: 3_000 });
  await window.waitForTimeout(1_000);
  const hudText = await hud.textContent();
  expect(hudText).toContain("FPS");
  expect(hudText).toContain("meshes");
  await window.screenshot({ path: path.join(screenshotDir, "compare-en-hud.png") });

  await app.close();
});

test("日英対比: 背景モードselectが両言語で正しい選択肢を持つ", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  await setLocaleAndReload(window, "ja");
  await openSettingsPanel(window);
  const bgSelect = window.locator("select").filter({ hasText: /透明|グリーン|Transparent|Green/ });
  const jaOptions = await bgSelect.locator("option").allTextContents();
  expect(jaOptions).toContain("透明");
  expect(jaOptions).toContain("グリーンバック");
  expect(jaOptions).toContain("ブルーバック");

  await setLocaleAndReload(window, "en");
  await openSettingsPanel(window);
  const enOptions = await bgSelect.locator("option").allTextContents();
  expect(enOptions).toContain("Transparent");
  expect(enOptions).toContain("Green Screen");
  expect(enOptions).toContain("Blue Screen");

  await app.close();
});

test("日英対比: エフェクトボタンが両言語で同一", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  await setLocaleAndReload(window, "ja");
  await loadModel(window);
  await openSettingsPanel(window, "input-effects");
  const jaEffects = ["紙吹雪", "ハート", "星", "きらめき"];
  for (const effectLabel of jaEffects) {
    await expect(window.locator("button", { hasText: effectLabel })).toBeVisible();
  }

  await setLocaleAndReload(window, "en");
  await loadModel(window);
  await openSettingsPanel(window, "input-effects");
  for (const effectLabel of ["Confetti", "Hearts", "Stars", "Sparkles"]) {
    await expect(window.locator("button", { hasText: effectLabel })).toBeVisible();
  }

  await app.close();
});
