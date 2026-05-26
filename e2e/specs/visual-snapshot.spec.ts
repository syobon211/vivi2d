import type { Page } from "playwright";
import { expect, test } from "../fixtures";
import { waitForAppReady } from "../helpers/app";
import { addParameter } from "../helpers/operations";
import { expectVisualSnapshot } from "../helpers/visual-capture";

const CANVAS_MASK_COLOR = "#3a3d4f";

async function waitForVivi2D(window: Page): Promise<void> {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 20_000 });
}

async function waitForStableFrame(window: Page): Promise<void> {
  await window.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function setTheme(window: Page, theme: "light" | "dark") {
  await waitForVivi2D(window);
  await window.evaluate((nextTheme) => {
    const store = (window as any).__vivi2d.useThemeStore.getState();
    if (store.theme !== nextTheme) store.setTheme(nextTheme);
  }, theme);
  await waitForStableFrame(window);
  await waitForStableFrame(window);
}

async function setLocale(window: Page, locale: "ja" | "en") {
  await waitForVivi2D(window);
  await window.evaluate((nextLocale) => {
    const store = (window as any).__vivi2d.useI18nStore.getState();
    if (store.locale !== nextLocale) store.setLocale(nextLocale);
  }, locale);
  await waitForStableFrame(window);
  await waitForStableFrame(window);
}

async function maskedSnapshot(window: Page, name: string): Promise<void> {
  await waitForAppReady(window);
  await setLocale(window, "ja");
  await waitForStableFrame(window);
  await expectVisualSnapshot(window, name, {
    mask: [window.locator("canvas")],
    maskColor: CANVAS_MASK_COLOR,
  });
}

async function openFileMenu(window: Page) {
  await window.locator(".menu-dropdown-trigger").first().click();
  await expect(window.locator(".menu-dropdown-panel")).toBeVisible();
}

async function openSettingsMenu(window: Page) {
  await window.locator(".menu-dropdown-trigger").nth(2).click();
  await expect(window.locator(".menu-dropdown-panel")).toBeVisible();
}

async function openIntegrationsMenu(window: Page) {
  await window.locator(".menu-dropdown-trigger").nth(3).click();
  await expect(window.locator(".menu-dropdown-panel")).toBeVisible();
}

async function openDialogFromMenu(
  window: Page,
  openMenu: (window: Page) => Promise<void>,
  itemPattern: RegExp,
  snapshotName: string,
) {
  await openMenu(window);
  await window
    .locator(".menu-dropdown-panel .menu-dropdown-item", { hasText: itemPattern })
    .first()
    .click();
  const dialog = window.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible" });
  await waitForStableFrame(window);
  await waitForStableFrame(window);
  await expectVisualSnapshot(dialog, snapshotName);
}

async function openIntegrationSettingsAt(
  window: Page,
  index: 0 | 1 | 2,
  snapshotName: string,
) {
  await window.route(/^https?:\/\//, (route) => route.abort());
  await openIntegrationsMenu(window);
  await window
    .locator(".menu-dropdown-panel .menu-dropdown-item")
    .nth(index + 1)
    .click();
  const dialog = window.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible" });
  await waitForStableFrame(window);
  await waitForStableFrame(window);
  await expectVisualSnapshot(dialog, snapshotName);
}

test.describe("visual snapshots", () => {
  test.beforeEach(async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await window.evaluate(() => {
      try {
        localStorage.clear();
        localStorage.setItem("vivi2d-theme", "dark");
        localStorage.setItem("vivi2d-locale", "ja");
      } catch {
        /* noop */
      }
    });
    await window.reload();
    await waitForAppReady(window);
    await setLocale(window, "ja");
    await waitForStableFrame(window);
    await waitForStableFrame(window);
  });

  test("initial launch layout", async ({ window }) => {
    await waitForStableFrame(window);
    await maskedSnapshot(window, "initial-launch.png");
  });

  test("layout after character PSD load", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await expect(window.getByText("リグヘルス", { exact: true })).toBeVisible();
    await maskedSnapshot(window, "after-psd-load.png");
  });

  test("layout after adding a parameter", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await addParameter(window, "AngleX");
    await waitForStableFrame(window);
    await maskedSnapshot(window, "after-add-parameter.png");
  });

  test("theme switch layout", async ({ window }) => {
    await setTheme(window, "light");
    await maskedSnapshot(window, "theme-light.png");
  });

  test("file menu open state", async ({ window }) => {
    await openFileMenu(window);
    await maskedSnapshot(window, "menu-file-open.png");
  });

  test("settings menu open state", async ({ window }) => {
    await openSettingsMenu(window);
    await maskedSnapshot(window, "menu-settings-open.png");
  });

  test("integrations menu open state", async ({ window }) => {
    await openIntegrationsMenu(window);
    await maskedSnapshot(window, "menu-integrations-open.png");
  });

  test("shortcuts dialog", async ({ window }) => {
    await openDialogFromMenu(
      window,
      openSettingsMenu,
      /Shortcuts|ショートカット/,
      "dialog-shortcuts-open.png",
    );
  });

  test("ComfyUI settings dialog", async ({ window }) => {
    await openIntegrationSettingsAt(window, 0, "dialog-comfyui-settings-open.png");
  });

  test("validation dialog", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await openDialogFromMenu(
      window,
      openFileMenu,
      /Model Validation|Validate|検証/,
      "dialog-validation-open.png",
    );
  });

  test("vivid import dialog", async ({ window }) => {
    await openDialogFromMenu(
      window,
      openFileMenu,
      /Import \.vivid|\.vivid をインポート/,
      "dialog-vivid-import-open.png",
    );
  });

  test("PSD reimport dialog", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await openDialogFromMenu(
      window,
      openFileMenu,
      /Reimport PSD|PSD再読込/,
      "dialog-reimport-open.png",
    );
  });

  test("SDK export dialog", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await openDialogFromMenu(
      window,
      openFileMenu,
      /SDK Export|SDKエクスポート/,
      "dialog-sdk-export-open.png",
    );
  });

  test("media export dialog", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await openDialogFromMenu(
      window,
      openFileMenu,
      /Media Output|メディア出力/,
      "dialog-media-export-open.png",
    );
  });

  test("auto setup dialog", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await openDialogFromMenu(
      window,
      openFileMenu,
      /Auto Setup|自動セットアップ/,
      "dialog-auto-setup-open.png",
    );
  });

  test("vivid export dialog", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await openDialogFromMenu(
      window,
      openFileMenu,
      /Export as \.vivid|\.vivid でエクスポート/,
      "dialog-vivid-export-open.png",
    );
  });

  test("AI generate dialog", async ({ window }) => {
    await window.route(/^https?:\/\//, (route) => route.abort());
    await openDialogFromMenu(
      window,
      openIntegrationsMenu,
      /Generate Model|モデル生成/,
      "dialog-ai-generate-open.png",
    );
  });

  test("OBS settings dialog", async ({ window }) => {
    await openIntegrationSettingsAt(window, 1, "dialog-obs-settings-open.png");
  });

  test("VTS settings dialog", async ({ window }) => {
    await openIntegrationSettingsAt(window, 2, "dialog-vts-settings-open.png");
  });
});
