import path from "node:path";
import { expect, test } from "../fixtures";

const SCREENSHOT_DIR = path.resolve(import.meta.dirname, "../screenshots");

async function waitForViviGlobal(window: import("playwright").Page) {
  await window.waitForFunction(
    () => Boolean((window as any).__vivi2d?.useI18nStore),
    undefined,
    { timeout: 10_000 },
  );
}

async function setLocale(window: import("playwright").Page, locale: "ja" | "en") {
  await waitForViviGlobal(window);
  await window.evaluate((loc) => {
    (window as any).__vivi2d.useI18nStore.getState().setLocale(loc);
  }, locale);
  await window.waitForFunction(
    (loc) => (window as any).__vivi2d?.useI18nStore?.getState()?.locale === loc,
    locale,
    { timeout: 3_000 },
  );
  await window.waitForTimeout(200);
}

async function setTheme(window: import("playwright").Page, theme: "light" | "dark") {
  await waitForViviGlobal(window);
  await window.evaluate((nextTheme) => {
    const store = (window as any).__vivi2d?.useThemeStore?.getState();
    if (store?.theme !== nextTheme) store?.toggleTheme();
  }, theme);
  await window.waitForTimeout(300);
}

async function openIntegrationsMenu(window: import("playwright").Page) {
  const trigger = window.locator(".menu-dropdown-trigger").nth(3);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(window.locator(".menu-dropdown-panel")).toBeVisible();
}

async function openGenerateModelDialog(window: import("playwright").Page) {
  await openIntegrationsMenu(window);
  await window.locator(".menu-dropdown-panel .menu-dropdown-item").first().click();
  await expect(window.locator(".modal-title")).toBeVisible();
}

async function openIntegrationSettingsDialog(
  window: import("playwright").Page,
  index: 0 | 1 | 2,
) {
  await openIntegrationsMenu(window);
  await window
    .locator(".menu-dropdown-panel .menu-dropdown-item")
    .nth(index + 1)
    .click();
  await expect(window.locator(".modal-title")).toBeVisible();
}

async function closeModal(window: import("playwright").Page) {
  await window.locator(".modal-actions .prop-btn").last().click();
  await expect(window.locator(".modal-title")).not.toBeVisible();
}

test("日本語: メニューバー", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await window.screenshot({ path: path.join(SCREENSHOT_DIR, "01-menubar-ja.png") });
});

test("日本語: 統合メニュー", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await openIntegrationsMenu(window);
  await window.waitForTimeout(300);
  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "02-integrations-menu-ja.png"),
  });

  await expect(
    window.locator(".menu-dropdown-section", { hasText: "ComfyUI" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-section", { hasText: "OBS Studio" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-section", { hasText: "VTube Studio" }),
  ).toBeVisible();
  await window.keyboard.press("Escape");
});

test("日本語: 自動モデル生成ダイアログ（画像タブ）", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await openGenerateModelDialog(window);
  await window.waitForTimeout(200);
  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "03-ai-dialog-image-ja.png"),
  });

  await expect(
    window.locator(".modal-title", { hasText: /自動モデル生成|AI/ }),
  ).toBeVisible();
  await expect(window.locator(".ai-gen-tab")).toHaveCount(2);
  await closeModal(window);
});

test("日本語: 自動モデル生成ダイアログ（プロンプトタブ）", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await openGenerateModelDialog(window);
  await window.locator(".ai-gen-tab").nth(1).click();
  await window.waitForTimeout(200);
  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "04-ai-dialog-prompt-ja.png"),
  });

  await expect(window.locator(".ai-gen-textarea").first()).toBeVisible();
  await closeModal(window);
});

test("日本語: ComfyUI接続設定ダイアログ", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await openIntegrationSettingsDialog(window, 0);
  await window.waitForTimeout(200);
  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "05-comfyui-settings-ja.png"),
  });

  await expect(window.locator(".modal-title", { hasText: /ComfyUI/ })).toBeVisible();
  await closeModal(window);
});

test("日本語: OBS Studio接続設定ダイアログ", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await openIntegrationSettingsDialog(window, 1);
  await window.waitForTimeout(200);
  await window.screenshot({ path: path.join(SCREENSHOT_DIR, "06-obs-settings-ja.png") });

  await expect(window.locator(".modal-title", { hasText: /OBS Studio/ })).toBeVisible();
  await closeModal(window);
});

test("日本語: VTube Studio接続設定ダイアログ", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await openIntegrationSettingsDialog(window, 2);
  await window.waitForTimeout(200);
  await window.screenshot({ path: path.join(SCREENSHOT_DIR, "07-vts-settings-ja.png") });

  await expect(window.locator(".modal-title", { hasText: /VTube Studio/ })).toBeVisible();
  await closeModal(window);
});

test("日本語: ファイルメニューに GLB 書き出しが見える", async ({
  window,
  loadTestPsd,
}) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();

  await window.locator(".menu-dropdown-trigger").first().click();
  await window.waitForTimeout(200);
  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "08-file-menu-with-glb-ja.png"),
  });

  await expect(
    window.locator(".menu-dropdown-item", { hasText: /Blender.*\.glb/ }),
  ).toBeVisible();
  await window.keyboard.press("Escape");
});

test("英語: メニューバー", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await setLocale(window, "en");
  await window.screenshot({ path: path.join(SCREENSHOT_DIR, "09-menubar-en.png") });
  await expect(
    window.locator(".menu-dropdown-trigger", { hasText: "Integrations" }),
  ).toBeVisible();
  await setLocale(window, "ja");
});

test("英語: 統合メニュー", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await setLocale(window, "en");
  await openIntegrationsMenu(window);
  await window.waitForTimeout(300);
  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "10-integrations-menu-en.png"),
  });

  await expect(
    window.locator(".menu-dropdown-item", { hasText: "Generate Model..." }),
  ).toBeVisible();
  await window.keyboard.press("Escape");
  await setLocale(window, "ja");
});

test("英語: 自動モデル生成ダイアログ", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await setLocale(window, "en");
  await openGenerateModelDialog(window);
  await window.waitForTimeout(200);
  await window.screenshot({ path: path.join(SCREENSHOT_DIR, "11-ai-dialog-en.png") });

  await expect(
    window.locator(".modal-title", { hasText: "Automatic Model Generation" }),
  ).toBeVisible();
  await closeModal(window);
  await setLocale(window, "ja");
});

test("ダークテーマ: メニューバー", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await setTheme(window, "dark");
  await window.screenshot({ path: path.join(SCREENSHOT_DIR, "12-menubar-dark.png") });
  await setTheme(window, "light");
});

test("ダークテーマ: 自動モデル生成ダイアログ", async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await setTheme(window, "dark");
  await openGenerateModelDialog(window);
  await window.waitForTimeout(200);
  await window.screenshot({ path: path.join(SCREENSHOT_DIR, "13-ai-dialog-dark.png") });
  await closeModal(window);
  await setTheme(window, "light");
});
