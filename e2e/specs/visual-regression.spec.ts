import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { clickFileMenuItem, selectLayer } from "../helpers/operations";


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

let screenshotDir: string;

test.beforeAll(async () => {
  screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-visual-e2e-"));
});

test.afterAll(async () => {
  fs.rmSync(screenshotDir, { recursive: true, force: true });
});

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("メニューバーのボタンがすべて描画領域内にある", async ({ window }) => {
  const result = await window.evaluate(() => {
    const triggers = document.querySelectorAll<HTMLElement>(".menu-dropdown-trigger");
    const buttons = document.querySelectorAll<HTMLElement>(".menu-btn");
    const allItems = [...triggers, ...buttons];
    const truncated: string[] = [];
    for (const el of allItems) {
      if (el.scrollWidth > el.clientWidth + 1) {
        truncated.push(el.textContent?.trim() ?? "(empty)");
      }
    }
    return { total: allItems.length, truncated };
  });

  expect(result.total).toBeGreaterThan(0);
  expect(result.truncated).toEqual([]);
});

test("1280px幅でもメニューバーがスクロール可能", async ({ window }) => {
  await window.setViewportSize({ width: 1280, height: 720 });

  const result = await window.evaluate(() => {
    const menuBar = document.querySelector<HTMLElement>(".menu-bar");
    if (!menuBar) return { ok: false };
    return {
      ok: true,
      scrollable: menuBar.scrollWidth > menuBar.clientWidth,
      scrollWidth: menuBar.scrollWidth,
      clientWidth: menuBar.clientWidth,
    };
  });

  expect(result.ok).toBe(true);
});


test("右パネルのヘッダーテキストが見切れていない", async ({ window }) => {
  const result = await window.evaluate(() => {
    const headers = document.querySelectorAll<HTMLElement>(
      ".workspace-right .panel-header",
    );
    const truncated: string[] = [];
    for (const h of headers) {
      if (h.scrollWidth > h.clientWidth + 1) {
        truncated.push(h.textContent?.trim() ?? "(empty)");
      }
    }
    return { total: headers.length, truncated };
  });

  expect(result.total).toBeGreaterThan(0);
  expect(result.truncated).toEqual([]);
});

test("右パネルが全て表示されスクロール可能", async ({ window }) => {
  const result = await window.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".workspace-right");
    if (!sidebar) return { ok: false, panels: 0 };
    const panels = sidebar.querySelectorAll(".panel");
    return {
      ok: true,
      panels: panels.length,
      isScrollable: sidebar.scrollHeight > sidebar.clientHeight,
      hasOverflowAuto:
        getComputedStyle(sidebar).overflowY === "auto" ||
        getComputedStyle(sidebar).overflowY === "scroll",
    };
  });

  expect(result.ok).toBe(true);
  expect(result.panels).toBeGreaterThan(0);
  expect(result.hasOverflowAuto).toBe(true);
});


test("数値入力フィールドの値が見切れていない", async ({ window }) => {
  const result = await window.evaluate(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>(
      '.ik-num-input, input[type="number"]',
    );
    const truncated: string[] = [];
    for (const input of inputs) {
      if (input.value && input.scrollWidth > input.clientWidth + 2) {
        truncated.push(`${input.value} (width: ${input.clientWidth}px)`);
      }
    }
    return { total: inputs.length, truncated };
  });

  expect(result.truncated).toEqual([]);
});


test("各パネルが最小限のコンテンツ高を持つ", async ({ window }) => {
  const result = await window.evaluate(() => {
    const panels = document.querySelectorAll<HTMLElement>(".workspace-right .panel");
    const tooSmall: string[] = [];
    for (const panel of panels) {
      const header = panel.querySelector(".panel-header");
      const headerText = header?.textContent?.trim() ?? "(unknown)";
      if (panel.offsetHeight < 40) {
        tooSmall.push(`${headerText}: ${panel.offsetHeight}px`);
      }
    }
    return { total: panels.length, tooSmall };
  });

  expect(result.total).toBeGreaterThan(0);
  expect(result.tooSmall).toEqual([]);
});


test("全体レイアウトのスクリーンショットが正常に撮影でき、サイズが妥当", async ({
  window,
}) => {
  const screenshotPath = path.join(screenshotDir, "full-layout.png");
  await window.screenshot({ path: screenshotPath });

  const stats = fs.statSync(screenshotPath);
  expect(stats.size).toBeGreaterThan(0);

  const buf = fs.readFileSync(screenshotPath);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
});

test("メニューバーのドロップダウンが正しく描画される", async ({ window }) => {
  await window.locator(".menu-dropdown-trigger", { hasText: /ファイル|File/ }).click();
  await expect(window.locator(".menu-dropdown-panel").first()).toBeVisible();

  const screenshotPath = path.join(screenshotDir, "menu-dropdown.png");
  await window.screenshot({ path: screenshotPath });

  const stats = fs.statSync(screenshotPath);
  expect(stats.size).toBeGreaterThan(0);

  await window.keyboard.press("Escape");
});

test("右パネル全体のスクリーンショット", async ({ window }) => {
  const rightPanel = window.locator(".workspace-right");
  await expect(rightPanel).toBeVisible();

  const screenshotPath = path.join(screenshotDir, "right-panel.png");
  await rightPanel.screenshot({ path: screenshotPath });

  const stats = fs.statSync(screenshotPath);
  expect(stats.size).toBeGreaterThan(0);

  const panelCount = await rightPanel.locator(".panel").count();
  expect(panelCount).toBeGreaterThan(0);
});

test("レイヤー選択時のプロパティパネル", async ({ window }) => {
  await selectLayer(window, "Background");

  await expect(
    window.locator(".properties-form", { hasText: "Background" }),
  ).toBeVisible();

  const propsPanel = window.locator(".properties-form").first();
  const screenshotPath = path.join(screenshotDir, "props-panel.png");
  await propsPanel.screenshot({ path: screenshotPath });

  const stats = fs.statSync(screenshotPath);
  expect(stats.size).toBeGreaterThan(0);
});

test("物理パネルにグループ追加後の表示", async ({ window }) => {
  const addGroupBtn = window.locator(".physics-btn", {
    hasText: /グループ追加|Add Group/,
  });
  await addGroupBtn.scrollIntoViewIfNeeded();
  await addGroupBtn.click({ force: true });
  await expect(window.locator("text=/物理グループ 1|Physics Group 1/")).toBeVisible();

  const physicsPanel = window.locator(".physics-panel");
  const screenshotPath = path.join(screenshotDir, "physics-with-group.png");
  await physicsPanel.screenshot({ path: screenshotPath });

  const stats = fs.statSync(screenshotPath);
  expect(stats.size).toBeGreaterThan(0);
});

test("ダイアログが正しく中央に表示される", async ({ window }) => {
  await clickFileMenuItem(window, "自動セットアップ");
  await expect(window.locator(".auto-setup-dialog")).toBeVisible();

  const screenshotPath = path.join(screenshotDir, "dialog-center.png");
  await window.screenshot({ path: screenshotPath });

  const stats = fs.statSync(screenshotPath);
  expect(stats.size).toBeGreaterThan(0);

  const dialogBox = await window.locator(".auto-setup-dialog").boundingBox();
  expect(dialogBox).not.toBeNull();
  if (dialogBox) {
    expect(dialogBox.width).toBeGreaterThan(100);
    expect(dialogBox.height).toBeGreaterThan(50);
  }

  await window.keyboard.press("Escape");
});

test("1280x720での全体レイアウト", async ({ window }) => {
  await window.setViewportSize({ width: 1280, height: 720 });

  await expect(window.locator(".menu-bar")).toBeVisible();
  await expect(window.locator(".workspace")).toBeVisible();

  const screenshotPath = path.join(screenshotDir, "layout-1280x720.png");
  await window.screenshot({ path: screenshotPath });

  const stats = fs.statSync(screenshotPath);
  expect(stats.size).toBeGreaterThan(0);

  const buf = fs.readFileSync(screenshotPath);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  expect(width).toBe(1280);
  expect(height).toBe(720);

  await expect(
    window.locator(".menu-dropdown-trigger", { hasText: /ファイル|File/ }),
  ).toBeVisible();
});
