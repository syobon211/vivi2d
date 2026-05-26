import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(
  import.meta.dirname,
  "../fixtures/test.vivi",
);

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

test("モデル読み込み後にマッピングバッジが表示される", async () => {
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

  await expect(
    window.locator("span", { hasText: /Test Model/ }),
  ).toBeVisible({ timeout: 5_000 });

  await app.close();
});

test("キャンバスクリックでヒットテストが動作する", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  const errors: string[] = [];
  window.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await loadModel(window);
  await window.waitForTimeout(500);

  const canvas = window.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.width * 75 / 200;
  const cy = box!.height * 75 / 200;
  await canvas.click({ position: { x: cx, y: cy } });

  await expect(
    window.locator('[data-testid="hit-overlay"]'),
  ).toBeVisible({ timeout: 3_000 });

  const hitText = await window
    .locator('[data-testid="hit-overlay"]')
    .textContent();
  expect(hitText).toContain("Head");

  expect(errors).toHaveLength(0);
  await app.close();
});

test("コライダー外のクリックではヒットラベルが表示されない", async () => {
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

  const canvas = window.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const scaleX = box!.width / 200;
  const scaleY = box!.height / 200;
  await window.mouse.click(box!.x + 10 * scaleX, box!.y + 10 * scaleY);

  await window.waitForTimeout(500);
  const hitLabel = window.locator("div").filter({
    hasText: /Head|Body/,
  });
  const count = await hitLabel.count();
  const floatingHit = window.locator(
    '[data-testid="hit-overlay"]',
  );
  await expect(floatingHit).not.toBeVisible();

  await app.close();
});

test("スムージングスライダーの操作で値が更新される", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await openSettingsPanel(window);

  const slider = window.locator('input[type="range"]');
  await expect(slider).toBeVisible({ timeout: 5_000 });

  await slider.fill("0.3");

  await expect(
    window.locator("span", { hasText: "30%" }),
  ).toBeVisible({ timeout: 2_000 });

  await slider.fill("0.9");
  await expect(
    window.locator("span", { hasText: "90%" }),
  ).toBeVisible({ timeout: 2_000 });

  await app.close();
});

test("モデル読み込み前後でトラッキングボタン状態が変わる", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await openSettingsPanel(window, "input-effects");
  const trackBtn = window.locator('[data-testid="viewer-toggle-face-tracking"]');

  await expect(trackBtn).toBeDisabled();

  await loadModel(window);

  await expect(trackBtn).toBeEnabled({ timeout: 5_000 });

  await app.close();
});

test("円コライダーのヒットテストが動作する", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  const errors: string[] = [];
  window.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await loadModel(window);
  await window.waitForTimeout(500);

  const canvas = window.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.width * 100 / 200;
  const cy = box!.height * 150 / 200;
  await canvas.click({ position: { x: cx, y: cy } });

  await expect(
    window.locator('[data-testid="hit-overlay"]'),
  ).toBeVisible({ timeout: 3_000 });

  const hitText = await window
    .locator('[data-testid="hit-overlay"]')
    .textContent();
  expect(hitText).toContain("Body");

  expect(errors).toHaveLength(0);
  await app.close();
});

test("ホットキー(1-9)で表情プリセットが切り替わる", async () => {
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

  await window.keyboard.press("2");
  await expect(toast).toContainText("2: Angry");

  await app.close();
});

test("ホットキー未割り当てのキーではプリセットトーストが表示されない", async () => {
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

  await window.keyboard.press("9");
  await window.waitForTimeout(500);

  const presetToast = window.locator('[data-testid="preset-indicator"]');
  await expect(presetToast).not.toBeVisible();

  await app.close();
});

test("修飾キー付きではホットキーが発火しない", async () => {
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

  await window.keyboard.press("Control+1");
  await window.waitForTimeout(500);

  const presetToast = window.locator('[data-testid="preset-indicator"]');
  await expect(presetToast).not.toBeVisible();

  await app.close();
});

test("ハンドトラッキングボタンが読み込み前はdisabled、読み込み後はenabled", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await openSettingsPanel(window, "input-effects");
  const handBtn = window.locator('[data-testid="viewer-toggle-hand-tracking"]');
  await expect(handBtn).toBeDisabled();

  await loadModel(window);
  await expect(handBtn).toBeEnabled({ timeout: 5_000 });

  await app.close();
});

test("ポーズボタンが読み込み前はdisabled、読み込み後はenabled", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await openSettingsPanel(window, "input-effects");
  const poseBtn = window.locator('[data-testid="viewer-toggle-pose-tracking"]');
  await expect(poseBtn).toBeDisabled();

  await loadModel(window);
  await expect(poseBtn).toBeEnabled({ timeout: 5_000 });

  await app.close();
});

test("リップシンクボタンが読み込み前はdisabled、読み込み後はenabled", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await openSettingsPanel(window, "input-effects");
  const lipBtn = window.locator('[data-testid="viewer-toggle-lip-sync"]');
  await expect(lipBtn).toBeDisabled();

  await loadModel(window);
  await expect(lipBtn).toBeEnabled({ timeout: 5_000 });

  await app.close();
});

test("モデル読み込み後にエフェクトボタンが表示される", async () => {
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

  await openSettingsPanel(window, "input-effects");

  await expect(window.locator("button", { hasText: "紙吹雪" })).toBeVisible({ timeout: 3_000 });
  await expect(window.locator("button", { hasText: "ハート" })).toBeVisible();
  await expect(window.locator("button", { hasText: "星" })).toBeVisible();
  await expect(window.locator("button", { hasText: "きらめき" })).toBeVisible();

  await app.close();
});

test("エフェクトボタンをクリックしてもクラッシュしない", async () => {
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
  await window.waitForTimeout(200);
  await window.locator("button", { hasText: "ハート" }).click();
  await window.waitForTimeout(200);
  await window.locator("button", { hasText: "星" }).click();
  await window.waitForTimeout(200);
  await window.locator("button", { hasText: "きらめき" }).click();
  await window.waitForTimeout(500);

  expect(errors).toHaveLength(0);
  await app.close();
});

test("HUDボタンのトグルで統計オーバーレイが表示/非表示される", async () => {
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
  await expect(hudBtn).toBeVisible();

  await hudBtn.click();
  const hudOverlay = window.locator('[data-testid="hud-overlay"]');
  await expect(hudOverlay).toBeVisible({ timeout: 3_000 });
  const hudText = await hudOverlay.textContent();
  expect(hudText).toContain("FPS");
  expect(hudText).toContain("メッシュ");
  expect(hudText).toContain("頂点");

  await hudBtn.click();
  await window.waitForTimeout(300);
  await expect(hudOverlay).not.toBeVisible();

  await app.close();
});


test(".vivi以外の拡張子ファイルをドロップするとエラーが表示される", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await window.evaluate(() => {
    const dt = new DataTransfer();
    const file = new File(["dummy content"], "test.txt", { type: "text/plain" });
    dt.items.add(file);
    const dropEvent = new DragEvent("drop", {
      dataTransfer: dt,
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('[style*="flex: 1"]')?.dispatchEvent(dropEvent);
  });

  const errorSpan = window.locator('[data-testid="viewer-error"]').filter({ hasText: /.viviファイル/ });
  await expect(errorSpan).toBeVisible({ timeout: 3_000 });

  await app.close();
});

test("不正JSONの.viviファイルを読み込むとエラーが表示される", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "broken.vivi",
    mimeType: "application/json",
    buffer: Buffer.from("{ invalid json content !!!"),
  });

  const errorSpan = window.locator('[data-testid="viewer-error"]');
  await expect(errorSpan).toBeVisible({ timeout: 5_000 });

  await expect(window.locator("canvas")).not.toBeVisible();

  await app.close();
});

test("モデル読み込み後にモデル名がツールバーに表示される", async () => {
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

  await expect(
    window.locator("span", { hasText: "Test Model" }),
  ).toBeVisible({ timeout: 5_000 });

  await app.close();
});

test("モデル読込前にプレースホルダーが表示され、読込後に消失する", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  const placeholder = window.locator("p", { hasText: /.viviファイルをドロップ/ });
  await expect(placeholder).toBeVisible({ timeout: 5_000 });

  await loadModel(window);

  await expect(placeholder).not.toBeVisible({ timeout: 3_000 });

  await app.close();
});

test("背景色greenを選択するとcanvasのbackgroundColorが#00ff00になる", async () => {
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

  const bgColor = await window.locator("canvas").evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  // #00ff00 = rgb(0, 255, 0)
  expect(bgColor).toBe("rgb(0, 255, 0)");

  await app.close();
});

test("スムージングスライダーを0に設定すると0%が表示される", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await openSettingsPanel(window);

  const slider = window.locator('input[type="range"]');
  await expect(slider).toBeVisible({ timeout: 5_000 });

  await slider.fill("0");

  await expect(
    window.locator("span", { hasText: "0%" }),
  ).toBeVisible({ timeout: 2_000 });

  await app.close();
});

test("スムージングスライダーを0.95に設定すると95%が表示される", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await openSettingsPanel(window);

  const slider = window.locator('input[type="range"]');
  await expect(slider).toBeVisible({ timeout: 5_000 });

  await slider.fill("0.95");

  await expect(
    window.locator("span", { hasText: "95%" }),
  ).toBeVisible({ timeout: 2_000 });

  await app.close();
});

test("ホットキー3-9（未割当）を押してもプリセットトーストが表示されない", async () => {
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

  for (const key of ["3", "4", "5", "6", "7", "8", "9"]) {
    await window.keyboard.press(key);
    await window.waitForTimeout(200);
  }

  const presetToast = window.locator('[data-testid="preset-indicator"]');
  await expect(presetToast).not.toBeVisible();

  await app.close();
});

test("エフェクトボタンを素早く5回連打してもクラッシュしない", async () => {
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

  const confettiBtn = window.locator("button", { hasText: "紙吹雪" });
  for (let i = 0; i < 5; i++) {
    await confettiBtn.click();
  }
  await window.waitForTimeout(500);

  expect(errors).toHaveLength(0);

  await app.close();
});

test("HUDオン後にFPS値が0以上である", async () => {
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

  const hudOverlay = window.locator('[data-testid="hud-overlay"]');
  await expect(hudOverlay).toBeVisible({ timeout: 3_000 });

  await window.waitForTimeout(1_000);

  const fpsText = await hudOverlay.locator("div").first().textContent();
  const fpsValue = parseInt(fpsText?.replace(/\D/g, "") || "0", 10);
  expect(fpsValue).toBeGreaterThan(0);

  await app.close();
});

test("モデルを2回読み込んでもクラッシュしない", async () => {
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
  await window.waitForTimeout(500);

  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  window.on("pageerror", (error) => errors.push(error.message));

  await loadModel(window);
  await window.waitForTimeout(500);

  await expect(window.locator("canvas")).toBeVisible();
  expect(errors).toHaveLength(0);

  await app.close();
});

test("読込前に顔/手/ポーズ/リップシンク全ボタンがdisabledである", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await openSettingsPanel(window, "input-effects");
  await expect(window.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeDisabled();
  await expect(window.locator('[data-testid="viewer-toggle-hand-tracking"]')).toBeDisabled();
  await expect(window.locator('[data-testid="viewer-toggle-pose-tracking"]')).toBeDisabled();
  await expect(window.locator('[data-testid="viewer-toggle-lip-sync"]')).toBeDisabled();

  await app.close();
});

test("読込後に顔/手/ポーズ/リップシンク全ボタンがenabledになる", async () => {
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

  await openSettingsPanel(window, "input-effects");
  await expect(window.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeEnabled({ timeout: 5_000 });
  await expect(window.locator('[data-testid="viewer-toggle-hand-tracking"]')).toBeEnabled();
  await expect(window.locator('[data-testid="viewer-toggle-pose-tracking"]')).toBeEnabled();
  await expect(window.locator('[data-testid="viewer-toggle-lip-sync"]')).toBeEnabled();

  await app.close();
});

test("背景モードをtransparent→green→blue→transparentの順に切替えてエラーなし", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));

  await window.waitForLoadState("domcontentloaded");

  await window.evaluate(() => {
    localStorage.removeItem("vivi-viewer-settings");
    localStorage.setItem("vivi-viewer-locale", "ja");
  });
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await loadModel(window);

  await openSettingsPanel(window);

  const bgSelect = window.locator("select").filter({ hasText: /透明|グリーン/ });

  expect(await bgSelect.inputValue()).toBe("transparent");

  // green
  await bgSelect.selectOption("green");
  await window.waitForTimeout(200);
  expect(await bgSelect.inputValue()).toBe("green");

  // blue
  await bgSelect.selectOption("blue");
  await window.waitForTimeout(200);
  expect(await bgSelect.inputValue()).toBe("blue");

  // transparent
  await bgSelect.selectOption("transparent");
  await window.waitForTimeout(200);
  expect(await bgSelect.inputValue()).toBe("transparent");

  expect(errors).toHaveLength(0);

  await app.close();
});


test("ドラッグ&ドロップで.viviファイルを読み込める", async () => {
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

  await expect(window.locator("canvas")).not.toBeVisible({ timeout: 3_000 });

  const viviContent = fs.readFileSync(testViviPath, "utf-8");
  const viviBase64 = Buffer.from(viviContent).toString("base64");

  await window.evaluate(() => {
    const dropZone = document.querySelector('div[style*="flex: 1"]');
    if (!dropZone) return;
    const dragOverEvent = new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    dropZone.dispatchEvent(dragOverEvent);
  });

  await window.waitForTimeout(200);

  await window.evaluate((base64) => {
    const dropZone = document.querySelector('div[style*="flex: 1"]');
    if (!dropZone) return;

    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const file = new File([bytes], "test.vivi", { type: "application/json" });
    const dt = new DataTransfer();
    dt.items.add(file);

    const dropEvent = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    });
    dropZone.dispatchEvent(dropEvent);
  }, viviBase64);

  await expect(window.locator("canvas")).toBeVisible({ timeout: 10_000 });

  await expect(
    window.locator("span", { hasText: "Test Model" }),
  ).toBeVisible({ timeout: 5_000 });

  expect(errors).toHaveLength(0);

  await app.close();
});

test("不正.viviファイルでエラー表示後、正しいファイルで回復する", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  const fileInput = window.locator('input[accept=".vivi"]');

  await fileInput.setInputFiles({
    name: "broken.vivi",
    mimeType: "application/json",
    buffer: Buffer.from("{ invalid json !!!"),
  });

  const errorSpan = window.locator('[data-testid="viewer-error"]');
  await expect(errorSpan).toBeVisible({ timeout: 5_000 });

  await expect(window.locator("canvas")).not.toBeVisible();

  const viviContent = fs.readFileSync(testViviPath, "utf-8");
  await fileInput.setInputFiles({
    name: "test.vivi",
    mimeType: "application/json",
    buffer: Buffer.from(viviContent),
  });

  await expect(window.locator("canvas")).toBeVisible({ timeout: 10_000 });

  await expect(errorSpan).not.toBeVisible({ timeout: 3_000 });

  await expect(
    window.locator("span", { hasText: "Test Model" }),
  ).toBeVisible({ timeout: 5_000 });

  await app.close();
});
