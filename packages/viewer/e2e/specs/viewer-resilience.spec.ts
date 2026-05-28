import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(import.meta.dirname, "../fixtures/test.vivi");

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


test("ウィンドウリサイズ後もキャンバスが表示され崩れない", async () => {
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

  const canvas = window.locator("canvas");

  const initialSize = await canvas.evaluate((el) => ({
    width: (el as HTMLCanvasElement).width,
    height: (el as HTMLCanvasElement).height,
  }));
  expect(initialSize.width).toBe(200);
  expect(initialSize.height).toBe(200);

  await window.evaluate(() => globalThis.resizeTo(400, 300));
  await window.waitForTimeout(500);

  await expect(canvas).toBeVisible();

  const afterSmall = await canvas.evaluate((el) => ({
    width: (el as HTMLCanvasElement).width,
    height: (el as HTMLCanvasElement).height,
  }));
  expect(afterSmall.width).toBe(200);
  expect(afterSmall.height).toBe(200);

  await window.evaluate(() => globalThis.resizeTo(1200, 900));
  await window.waitForTimeout(500);

  await expect(canvas).toBeVisible();

  expect(errors).toHaveLength(0);

  await app.close();
});

test("ウィンドウリサイズ後にヒットテストが正常に動作する", async () => {
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

  await window.evaluate(() => globalThis.resizeTo(600, 500));
  await window.waitForTimeout(500);

  const canvas = window.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const cx = box!.width * 75 / 200;
  const cy = box!.height * 75 / 200;
  await canvas.click({ position: { x: cx, y: cy } });

  await expect(
    window.locator('[data-testid="hit-overlay"]').filter({ hasText: /Head/ }),
  ).toBeVisible({ timeout: 3_000 });

  await app.close();
});


test("ウィンドウフォーカス喪失→復帰後もアニメーションが継続する", async () => {
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
  const hud = window.locator('[data-testid="hud-overlay"]');
  await expect(hud).toBeVisible({ timeout: 3_000 });
  await window.waitForTimeout(1_000);

  const textBefore = await hud.textContent();
  const fpsBefore = parseInt(textBefore?.match(/(\d+)\s*FPS/)?.[1] ?? "0");

  await window.evaluate(() => {
    globalThis.dispatchEvent(new Event("blur"));
  });
  await window.waitForTimeout(500);
  await window.evaluate(() => {
    globalThis.dispatchEvent(new Event("focus"));
  });
  await window.waitForTimeout(1_000);

  const textAfter = await hud.textContent();
  const fpsAfter = parseInt(textAfter?.match(/(\d+)\s*FPS/)?.[1] ?? "0");
  expect(fpsAfter).toBeGreaterThan(0);

  expect(errors).toHaveLength(0);

  await app.close();
});

test("フォーカス復帰後にUI操作（エフェクト・ホットキー）が正常に動作する", async () => {
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

  await window.evaluate(() => {
    globalThis.dispatchEvent(new Event("blur"));
  });
  await window.waitForTimeout(300);
  await window.evaluate(() => {
    globalThis.dispatchEvent(new Event("focus"));
  });
  await window.waitForTimeout(300);

  await openSettingsPanel(window, "input-effects");

  await window.locator("button", { hasText: "紙吹雪" }).click();
  await window.waitForTimeout(300);

  await window.keyboard.press("1");
  const toast = window.locator('[data-testid="preset-indicator"]');
  await expect(toast).toBeVisible({ timeout: 3_000 });
  await expect(toast).toContainText("1: Smile");

  expect(errors).toHaveLength(0);

  await app.close();
});


test("エフェクト再生中にリサイズしてもクラッシュしない", async () => {
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

  await openSettingsPanel(window, "input-effects");

  await window.locator("button", { hasText: "紙吹雪" }).click();
  await window.locator("button", { hasText: "ハート" }).click();

  await window.evaluate(() => globalThis.resizeTo(500, 400));
  await window.waitForTimeout(300);
  await window.evaluate(() => globalThis.resizeTo(800, 600));
  await window.waitForTimeout(300);
  await window.evaluate(() => globalThis.resizeTo(1024, 768));
  await window.waitForTimeout(500);

  await expect(window.locator("canvas")).toBeVisible();

  expect(errors).toHaveLength(0);

  await app.close();
});

test("背景モード変更中にエフェクト再生してもクラッシュしない", async () => {
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

  const bgSelect = window.locator("select").filter({ hasText: /透明|グリーン/ });
  await bgSelect.selectOption("green");
  await openSettingsPanel(window, "input-effects");
  await window.locator("button", { hasText: "紙吹雪" }).click();
  await openSettingsPanel(window);
  await bgSelect.selectOption("blue");
  await openSettingsPanel(window, "input-effects");
  await window.locator("button", { hasText: "ハート" }).click();
  await openSettingsPanel(window);
  await bgSelect.selectOption("transparent");
  await openSettingsPanel(window, "input-effects");
  await window.locator("button", { hasText: "星" }).click();
  await window.waitForTimeout(500);

  expect(errors).toHaveLength(0);
  await app.close();
});


test("空の .vivi を読み込んでもクラッシュしない", async () => {
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

  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "empty.vivi",
    mimeType: "application/json",
    buffer: Buffer.from(""),
  });
  await window.waitForTimeout(1_000);

  await expect(window.locator('[data-testid="main-toolbar"]')).toBeVisible();

  await app.close();
});

test("不正JSONの .vivi を読み込んでもクラッシュしない", async () => {
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

  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "broken.vivi",
    mimeType: "application/json",
    buffer: Buffer.from("{ not valid json !!!"),
  });
  await window.waitForTimeout(1_000);

  await expect(window.locator('[data-testid="main-toolbar"]')).toBeVisible();

  await app.close();
});

test("必須フィールド欠落の .vivi を読み込んでもクラッシュしない", async () => {
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

  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "incomplete.vivi",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ something: "else" })),
  });
  await window.waitForTimeout(1_000);

  await expect(window.locator('[data-testid="main-toolbar"]')).toBeVisible();

  await app.close();
});
