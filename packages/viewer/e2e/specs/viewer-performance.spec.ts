import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(import.meta.dirname, "../fixtures/test.vivi");
const largePath = path.resolve(import.meta.dirname, "../fixtures/test-large.vivi");

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
  viviPath: string = testViviPath,
) {
  const viviContent = fs.readFileSync(viviPath, "utf-8");
  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: path.basename(viviPath),
    mimeType: "application/json",
    buffer: Buffer.from(viviContent),
  });
  await expect(window.locator("canvas")).toBeVisible({ timeout: 15_000 });
}


test("大容量モデル（50レイヤー）が5秒以内に読み込まれる", async () => {
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

  const startTime = Date.now();
  await loadModel(window, largePath);
  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(5_000);

  await expect(
    window.locator("span", { hasText: "Large Test Model" }),
  ).toBeVisible({ timeout: 3_000 });

  expect(errors).toHaveLength(0);

  await app.close();
});

test("large model HUD reports 50 meshes", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await loadModel(window, largePath);

  await openSettingsPanel(window);

  await window.locator('[data-testid="session-toggle-hud"]').click();
  const hud = window.locator('[data-testid="hud-overlay"]');
  await expect(hud).toBeVisible({ timeout: 3_000 });

  await window.waitForTimeout(1_000);

  const hudText = await hud.textContent();
  expect(hudText).toContain("50 メッシュ");

  await app.close();
});


test("エフェクト4種を連続再生してもフレームレートが維持される", async () => {
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

  await openSettingsPanel(window);

  await window.locator('[data-testid="session-toggle-hud"]').click();
  await window.waitForTimeout(1_000);

  await openSettingsPanel(window, "input-effects");
  for (let i = 0; i < 3; i++) {
    await window.locator("button", { hasText: "紙吹雪" }).click();
    await window.locator("button", { hasText: "ハート" }).click();
    await window.locator("button", { hasText: "星" }).click();
    await window.locator("button", { hasText: "きらめき" }).click();
    await window.waitForTimeout(100);
  }

  await window.waitForTimeout(2_000);

  const hud = window.locator('[data-testid="hud-overlay"]');
  const hudText = await hud.textContent();
  const fpsMatch = hudText?.match(/(\d+)\s*FPS/);
  expect(fpsMatch).not.toBeNull();
  expect(fpsMatch).toBeDefined();
  const fps = parseInt(fpsMatch![1]!);

  expect(fps).toBeGreaterThan(10);

  expect(errors).toHaveLength(0);

  await app.close();
});

test("大容量モデルで全エフェクトを再生してもクラッシュしない", async () => {
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
  await loadModel(window, largePath);

  await openSettingsPanel(window, "input-effects");

  const effects = ["紙吹雪", "ハート", "星", "きらめき"];
  for (const effect of effects) {
    for (let i = 0; i < 5; i++) {
      await window.locator("button", { hasText: effect }).click();
    }
  }

  await window.waitForTimeout(3_000);

  expect(errors).toHaveLength(0);

  await app.close();
});
