import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(import.meta.dirname, "../fixtures/test.vivi");
const screenshotDir = path.resolve(import.meta.dirname, "../../test-screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
});

async function launchViewer() {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => {
    localStorage.setItem("vivi-viewer-locale", "ja");
    localStorage.removeItem("vivi-viewer-settings");
  });
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  return { app, window };
}

async function loadModel(
  window: Awaited<ReturnType<typeof launchViewer>>["window"],
) {
  const viviContent = fs.readFileSync(testViviPath, "utf-8");
  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "test.vivi",
    mimeType: "application/json",
    buffer: Buffer.from(viviContent),
  });
  await expect(window.locator("canvas")).toBeVisible({ timeout: 10_000 });
}

async function openPanel(
  window: Awaited<ReturnType<typeof launchViewer>>["window"],
  section: "session" | "input-effects" = "session",
) {
  const sheet = window.locator('[data-testid="side-sheet"]');
  if (!(await sheet.isVisible())) {
    await window.locator('[data-testid="settings-toggle"]').click();
    await expect(sheet).toBeVisible({ timeout: 3_000 });
  }
  await window.locator(`[data-testid="side-sheet-tab-${section}"]`).click();
  await expect(window.locator(`[data-testid="side-sheet-panel-${section}"]`)).toBeVisible({
    timeout: 3_000,
  });
}

test("メインツールバーが1段で正しく表示される", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);

  await expect(window.locator("label", { hasText: /モデルを開く/ })).toBeVisible();
  await expect(window.locator('[data-testid="workflow-primary-action"]')).toBeVisible();
  await expect(window.locator('[data-testid="context-toolbar"]')).toContainText("顔");
  await expect(window.locator('[data-testid="context-toolbar"]')).toContainText("手");
  await expect(window.locator('[data-testid="context-toolbar"]')).toContainText("体");
  await expect(window.locator('[data-testid="settings-toggle"]')).toBeVisible();

  await expect(window.locator('[data-testid="settings-panel"]')).not.toBeVisible();

  await window.screenshot({ path: path.join(screenshotDir, "nf-01-toolbar-1row.png") });
  await app.close();
});

test("⚙ボタンで設定パネルが展開/折りたたみされる", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);

  const gearBtn = window.locator('[data-testid="settings-toggle"]');
  const panel = window.locator('[data-testid="settings-panel"]');

  await expect(panel).not.toBeVisible();

  await gearBtn.click();
  await expect(panel).toBeVisible();

  await window.screenshot({ path: path.join(screenshotDir, "nf-02-panel-open.png") });

  await gearBtn.click();
  await expect(panel).not.toBeVisible();

  await app.close();
});

test("設定パネル内の全要素が表示される", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window);

  await expect(window.locator("button", { hasText: "⏺" })).toBeVisible();
  await expect(window.locator("button", { hasText: "📷" })).toBeVisible();
  await expect(window.locator("button", { hasText: /設定エクスポート/ })).toBeVisible();
  await expect(window.locator("button", { hasText: /設定インポート/ })).toBeVisible();
  await expect(window.locator('[data-testid="session-toggle-hud"]')).toBeVisible();
  await expect(window.locator("button", { hasText: /URLから開く/ })).toBeVisible();

  await openPanel(window, "input-effects");
  await expect(window.locator("button", { hasText: /反応 ON/ })).toBeVisible();
  await expect(window.locator("button", { hasText: "紙吹雪" })).toBeVisible();
  await expect(window.locator("button", { hasText: /🎮/ })).toBeVisible();
  await expect(window.locator("button", { hasText: /🎹/ })).toBeVisible();
  await expect(window.locator("button", { hasText: /スクリプト/ })).toBeVisible();

  await window.screenshot({ path: path.join(screenshotDir, "nf-03-panel-contents.png") });
  await app.close();
});

test("モデル読込後にマッピングバッジが表示される", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);

  const modelInfo = window.locator("span", { hasText: /Test Model/ });
  await expect(modelInfo).toBeVisible({ timeout: 5_000 });

  const faceBadge = window.locator("span").filter({ hasText: /顔:\d+/ }).last();
  await expect(faceBadge).toBeVisible({ timeout: 5_000 });

  await app.close();
});

test("コライダー反応エフェクトのON/OFF切替", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window, "input-effects");

  const reactBtn = window.locator("button").filter({ hasText: /反応/ });
  const initialText = await reactBtn.textContent();
  expect(initialText).toContain("ON");

  await reactBtn.click();
  await window.waitForTimeout(200);
  await expect(reactBtn).toContainText("OFF");

  await reactBtn.click();
  await window.waitForTimeout(200);
  await expect(reactBtn).toContainText("ON");

  await app.close();
});

test("録画フォーマット選択が機能する", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window);

  const formatSelect = window.locator("select").filter({ hasText: /WebM/ });
  await expect(formatSelect).toBeVisible();

  await formatSelect.selectOption("mp4");
  await expect(formatSelect).toHaveValue("mp4");
  await formatSelect.selectOption("gif");
  await expect(formatSelect).toHaveValue("gif");
  await formatSelect.selectOption("webm");
  await expect(formatSelect).toHaveValue("webm");

  await app.close();
});

test("録画を開始・停止できる", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window);

  const recBtn = window.locator("button", { hasText: "⏺" });
  await recBtn.click();

  await window.waitForTimeout(1_500);
  const stopBtn = window.locator('[data-testid="viewer-recording-stop"]');
  await expect(stopBtn).toBeVisible({ timeout: 5_000 });

  await window.screenshot({ path: path.join(screenshotDir, "nf-07-recording.png") });

  await stopBtn.click();
  await expect(window.locator("button", { hasText: "⏺" })).toBeVisible({ timeout: 15_000 });

  expect(errors).toHaveLength(0);
  await app.close();
});

test("リップシンクモード切替(RMS/ビゼーム)", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window, "input-effects");

  const modeSelect = window.locator("select").filter({ hasText: /RMS/ });
  await expect(modeSelect).toBeVisible();
  await expect(modeSelect).toHaveValue("rms");

  await modeSelect.selectOption("viseme");
  await expect(modeSelect).toHaveValue("viseme");

  await app.close();
});

test("スクリプト入力欄に入力して実行ボタンが機能する", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window, "input-effects");

  const scriptInput = window.locator('input[type="text"]');
  await scriptInput.fill("Smile -> wait(200) -> reset");

  const runBtn = window.locator("button", { hasText: /スクリプト/ });
  await runBtn.click();
  await window.waitForTimeout(500);

  expect(errors).toHaveLength(0);
  await app.close();
});

test("スクリプト入力欄でEnterキーで実行される", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window, "input-effects");

  const scriptInput = window.locator('input[type="text"]');
  await scriptInput.fill("reset");
  await scriptInput.press("Enter");
  await window.waitForTimeout(300);

  expect(errors).toHaveLength(0);
  await app.close();
});

test("設定エクスポート/インポートボタンがクリック可能", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await openPanel(window);

  await window.locator("button", { hasText: /設定エクスポート/ }).click();
  await window.waitForTimeout(300);

  await window.locator("button", { hasText: /設定インポート/ }).click();
  await window.waitForTimeout(300);

  expect(errors).toHaveLength(0);
  await app.close();
});

test("サムネイル保存ボタンがクリック可能でエラーがない", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window);

  await window.locator("button", { hasText: "📷" }).click();
  await window.waitForTimeout(500);

  expect(errors).toHaveLength(0);
  await app.close();
});

test("ゲームパッドボタンがクリック可能でエラーがない", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window, "input-effects");

  const gpBtn = window.locator("button").filter({ hasText: /🎮 開始/ });
  await gpBtn.click();
  await window.waitForTimeout(500);

  const gpStopBtn = window.locator("button").filter({ hasText: /🎮 停止/ });
  await expect(gpStopBtn).toBeVisible({ timeout: 3_000 });
  await gpStopBtn.click();

  expect(errors).toHaveLength(0);
  await app.close();
});

test("MIDIボタンが表示される", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window, "input-effects");

  await expect(window.locator("button").filter({ hasText: /🎹/ })).toBeVisible();
  await app.close();
});

test("新機能ワークフロー: 起動→読込→パネル展開→各機能操作→パネル折りたたみ", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));

  await expect(window.locator("label", { hasText: /モデルを開く/ })).toBeVisible({ timeout: 10_000 });
  await expect(window.locator('[data-testid="settings-panel"]')).not.toBeVisible();
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-01-launch.png") });

  await loadModel(window);
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-02-loaded.png") });

  await openPanel(window);
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-03-panel-open.png") });

  const bgSelect = window.locator("select").filter({ hasText: /透明|グリーン/ });
  await bgSelect.selectOption("green");
  await window.waitForTimeout(200);
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-04-green.png") });

  const fmtSelect = window.locator("select").filter({ hasText: /WebM/ });
  await fmtSelect.selectOption("gif");

  await openPanel(window, "input-effects");
  const modeSelect = window.locator("select").filter({ hasText: /RMS/ });
  await modeSelect.selectOption("viseme");

  const scriptInput = window.locator('input[type="text"]');
  await scriptInput.fill("reset → wait(100)");
  await scriptInput.press("Enter");
  await window.waitForTimeout(300);
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-05-script.png") });

  await openPanel(window);
  await window.locator("button", { hasText: "📷" }).click();
  await window.waitForTimeout(300);

  await window.locator("button", { hasText: /設定エクスポート/ }).click();
  await window.waitForTimeout(300);

  await window.locator('[data-testid="session-toggle-hud"]').click();
  await window.waitForTimeout(1_000);
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-06-hud.png") });

  await openPanel(window, "input-effects");
  for (const effectLabel of ["紙吹雪", "ハート", "星", "きらめき"]) {
    await window.locator("button", { hasText: effectLabel }).click();
    await window.waitForTimeout(150);
  }
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-07-effects.png") });

  await openPanel(window);

  await window.locator("button", { hasText: /^EN$/ }).click();
  await expect(window.locator("label", { hasText: /Open Model/ })).toBeVisible({ timeout: 3_000 });
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-08-english.png") });

  const jaBtn = window.locator("button", { hasText: /^JA$/ });
  await jaBtn.click();
  await expect(window.locator("label", { hasText: /モデルを開く/ })).toBeVisible({ timeout: 3_000 });

  await window.locator('[data-testid="settings-toggle"]').click();
  await expect(window.locator('[data-testid="settings-panel"]')).not.toBeVisible();
  await window.screenshot({ path: path.join(screenshotDir, "nf-wf-09-panel-closed.png") });

  await window.locator('[data-testid="settings-toggle"]').click();
  await bgSelect.selectOption("transparent");

  expect(errors).toHaveLength(0);
  await app.close();
});

test("録画中にパネルを閉じても録画が継続する", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window);

  await window.locator("button", { hasText: "⏺" }).click();
  await window.waitForTimeout(500);

  await window.locator('[data-testid="settings-toggle"]').click();
  await expect(window.locator('[data-testid="settings-panel"]')).not.toBeVisible();
  await window.waitForTimeout(500);

  await openPanel(window);
  const stopBtn = window.locator('[data-testid="viewer-recording-stop"]');
  await expect(stopBtn).toBeVisible({ timeout: 5_000 });
  await stopBtn.click();
  await expect(window.locator("button", { hasText: "⏺" })).toBeVisible({ timeout: 15_000 });

  expect(errors).toHaveLength(0);
  await app.close();
});

test("コライダー反応OFF時にクリックしてもエラーがない", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window, "input-effects");

  const reactBtn = window.locator("button").filter({ hasText: /反応/ });
  await reactBtn.click();
  await expect(reactBtn).toContainText("OFF");

  await window.locator('[data-testid="settings-toggle"]').click();
  const canvas = window.locator("canvas");
  const box = await canvas.boundingBox();
  if (box) {
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  }
  await window.waitForTimeout(300);

  expect(errors).toHaveLength(0);
  await app.close();
});

test("エフェクト発動後にパネルを閉じても表示される", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window, "input-effects");

  await window.locator("button", { hasText: "紙吹雪" }).click();
  await window.locator('[data-testid="settings-toggle"]').click();
  await window.waitForTimeout(200);

  await window.screenshot({ path: path.join(screenshotDir, "nf-18-effect-panel-closed.png") });
  expect(errors).toHaveLength(0);
  await app.close();
});

test("HUDと録画を同時に使用してもエラーがない", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window);

  await window.locator('[data-testid="session-toggle-hud"]').click();
  await window.waitForTimeout(500);

  await window.locator("button", { hasText: "⏺" }).click();
  await window.waitForTimeout(1_000);

  await window.screenshot({ path: path.join(screenshotDir, "nf-19-hud-recording.png") });

  const stopBtn = window.locator('[data-testid="viewer-recording-stop"]');
  await stopBtn.click();
  await expect(window.locator("button", { hasText: "⏺" })).toBeVisible({ timeout: 15_000 });

  expect(errors).toHaveLength(0);
  await app.close();
});

test("スクリプト実行中に停止ボタンでキャンセルできる", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window, "input-effects");

  const scriptInput = window.locator('input[type="text"]');
  await scriptInput.fill("loop(100) { wait(100) }");

  const runBtn = window.locator("button").filter({ hasText: /スクリプト/ });
  await runBtn.click();

  await expect(window.locator("button").filter({ hasText: /停止/ })).toBeVisible({ timeout: 3_000 });
  await window.locator("button").filter({ hasText: /停止/ }).click();
  await window.waitForTimeout(300);

  await expect(window.locator("button").filter({ hasText: /スクリプト/ })).toBeVisible({ timeout: 3_000 });

  expect(errors).toHaveLength(0);
  await app.close();
});

test("全エフェクト4種をパネルから順に発動してエラーがない", async () => {
  const { app, window } = await launchViewer();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await loadModel(window);
  await openPanel(window, "input-effects");

  for (const effectLabel of ["紙吹雪", "ハート", "星", "きらめき"]) {
    await window.locator("button", { hasText: effectLabel }).click();
    await window.waitForTimeout(100);
  }

  await window.locator('[data-testid="settings-toggle"]').click();
  await window.waitForTimeout(300);

  await window.screenshot({ path: path.join(screenshotDir, "nf-21-all-effects.png") });
  expect(errors).toHaveLength(0);
  await app.close();
});

test("パネルでの設定変更がlocalStorageに保存される", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window);

  const bgSelect = window.locator("select").filter({ hasText: /透明|グリーン/ });
  await bgSelect.selectOption("green");

  const saved = await window.evaluate(() => localStorage.getItem("vivi-viewer-settings"));
  expect(saved).not.toBeNull();
  const parsed = JSON.parse(saved!);
  expect(parsed.bgMode).toBe("green");

  await app.close();
});
