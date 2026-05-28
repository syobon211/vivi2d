import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ElectronApplication, Locator, Page } from "playwright";
import { expect, test } from "../fixtures";
import {
  clearPerfProbeEvents,
  expectDialogCentered,
  importPsdAndWait,
  resetDialogScroll,
  waitForAppReady,
  waitForViviRuntime,
} from "../helpers/app";
import { mockOpenPng, mockOpenPngFolder } from "../helpers/dialog-mock";
import {
  addParameter,
  addTrack,
  clickFileMenuItem,
  clickSettingsMenuItem,
  createClip,
} from "../helpers/operations";
import {
  ONE_BY_ONE_PNG_BASE64,
  TWO_BY_TWO_PNG_BASE64,
  writeBase64Png,
} from "../helpers/png-fixtures";
import { resolveCharacterPsdPath } from "../helpers/psd-fixtures";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUTPUT_ROOT = path.resolve(ROOT, "test-screenshots/screen-inventory");
const TEST_PSD = resolveCharacterPsdPath();
const CHARACTER_PSD = resolveCharacterPsdPath();
const CANVAS_MASK_COLOR = "#3a3d4f";

let tempAssetRoot = "";

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function outputPath(section: string, fileName: string): string {
  const dir = path.join(OUTPUT_ROOT, section);
  ensureDir(dir);
  return path.join(dir, fileName);
}

async function waitForStableFrame(window: Page, frameCount = 2): Promise<void> {
  await window.evaluate(
    (targetFrameCount) =>
      new Promise<void>((resolve) => {
        let remaining = Math.max(1, targetFrameCount);
        const step = () => {
          remaining -= 1;
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frameCount,
  );
}

async function waitForDialog(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await waitForStableFrame(dialog.page(), 2);
}

async function bootstrap(
  window: Page,
  options: {
    theme?: "light" | "dark";
    locale?: "ja" | "en";
    workspaceMode?: "default" | "rigging" | "animation";
  } = {},
): Promise<void> {
  const { theme = "light", locale = "ja", workspaceMode = "default" } = options;

  await window.setViewportSize({ width: 1920, height: 1080 });
  await window.route(/^https?:\/\//, (route) => route.abort());
  await window.evaluate(
    ({ nextTheme, nextLocale, nextWorkspaceMode }) => {
      try {
        localStorage.clear();
        localStorage.setItem("vivi2d-theme", nextTheme);
        localStorage.setItem("vivi2d-locale", nextLocale);
        localStorage.setItem("vivi2d-workspace-mode", nextWorkspaceMode);
      } catch {
        /* noop */
      }
    },
    { nextTheme: theme, nextLocale: locale, nextWorkspaceMode: workspaceMode },
  );
  await window.reload();
  await waitForAppReady(window);
  await waitForStableFrame(window, 3);
}

async function setTheme(window: Page, theme: "light" | "dark"): Promise<void> {
  await waitForViviRuntime(window, ["useThemeStore"]);
  await window.evaluate((nextTheme) => {
    const store = (window as any).__vivi2d.useThemeStore.getState();
    if (store.theme !== nextTheme) store.setTheme(nextTheme);
  }, theme);
  await waitForStableFrame(window, 3);
}

async function setLocale(window: Page, locale: "ja" | "en"): Promise<void> {
  await waitForViviRuntime(window, ["useI18nStore"]);
  await window.evaluate((nextLocale) => {
    const store = (window as any).__vivi2d.useI18nStore.getState();
    if (store.locale !== nextLocale) store.setLocale(nextLocale);
  }, locale);
  await waitForStableFrame(window, 3);
}

async function setDeviceScaleFactor(
  window: Page,
  deviceScaleFactor: number,
): Promise<void> {
  const cdp = await window.context().newCDPSession(window);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor,
    mobile: false,
  });
  await waitForStableFrame(window, 3);
}

async function withMaskedCanvas<T>(window: Page, action: () => Promise<T>): Promise<T> {
  await window.evaluate((color) => {
    const host = document.querySelector(".canvas-surface");
    if (!host) return;
    host.querySelector(".e2e-canvas-mask")?.remove();
    const mask = document.createElement("div");
    mask.className = "e2e-canvas-mask";
    Object.assign(mask.style, {
      position: "absolute",
      inset: "0",
      background: color,
      pointerEvents: "none",
      zIndex: "5",
    });
    host.appendChild(mask);
  }, CANVAS_MASK_COLOR);

  try {
    return await action();
  } finally {
    await window.evaluate(() => {
      document.querySelector(".e2e-canvas-mask")?.remove();
    });
  }
}

async function captureWorkspace(
  window: Page,
  section: string,
  fileName: string,
): Promise<void> {
  const target = window.locator(".app");
  await expect(target).toBeVisible();
  await withMaskedCanvas(window, async () => {
    await waitForStableFrame(window, 3);
    await target.screenshot({ path: outputPath(section, fileName) });
  });
}

async function capturePanel(
  panel: Locator,
  section: string,
  fileName: string,
): Promise<void> {
  await expect(panel).toBeVisible();
  await waitForStableFrame(panel.page(), 2);
  await panel.screenshot({ path: outputPath(section, fileName) });
}

async function captureDialog(
  dialog: Locator,
  section: string,
  fileName: string,
): Promise<void> {
  await waitForDialog(dialog);
  await expectDialogCentered(dialog.page(), dialog);
  await resetDialogScroll(dialog);
  await waitForStableFrame(dialog.page(), 2);
  await dialog.screenshot({ path: outputPath(section, fileName) });
}

async function captureDialogWindow(
  window: Page,
  dialog: Locator,
  section: string,
  fileName: string,
): Promise<void> {
  await waitForDialog(dialog);
  await expectDialogCentered(window, dialog);
  await resetDialogScroll(dialog);
  await waitForStableFrame(window, 2);
  await captureWorkspace(window, section, fileName);
}

async function closeTopDialog(window: Page): Promise<void> {
  const dialog = window.getByRole("dialog").last();
  if (!(await dialog.isVisible().catch(() => false))) return;

  const candidateNames = [
    /^\u9589\u3058\u308b$/,
    /^Close$/,
    /^\u30ad\u30e3\u30f3\u30bb\u30eb$/,
    /^Cancel$/,
  ];

  for (const name of candidateNames) {
    const button = dialog.getByRole("button", { name });
    if ((await button.count()) > 0) {
      await button.first().click();
      await expect(dialog).toBeHidden({ timeout: 5_000 });
      return;
    }
  }

  await window.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 5_000 });
}

async function openIntegrationsMenu(window: Page): Promise<Locator> {
  const trigger = window.locator(".menu-dropdown-trigger").nth(3);
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel = window.locator(".menu-dropdown-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function openIntegrationDialogByIndex(
  window: Page,
  index: number,
): Promise<Locator> {
  const panel = await openIntegrationsMenu(window);
  await panel.locator(".menu-dropdown-item").nth(index).click();
  return window.getByRole("dialog").last();
}

async function openQuickActions(window: Page): Promise<Locator> {
  await waitForViviRuntime(window, ["useQuickActionsStore"]);
  await window.evaluate(() => {
    const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
    runtime?.useQuickActionsStore?.getState().openPalette();
  });
  const dialog = window.getByRole("dialog").last();
  await waitForDialog(dialog);
  return dialog;
}

async function openProjectDialog(
  window: Page,
  dialog: "validation" | "depthInspector",
): Promise<Locator> {
  await waitForViviRuntime(window, ["useProjectDialogsStore"]);
  await window.evaluate((targetDialog) => {
    const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
    const store = runtime?.useProjectDialogsStore?.getState();
    if (!store) throw new Error("Project dialogs store is unavailable");
    switch (targetDialog) {
      case "validation":
        store.openValidationDialog();
        break;
      case "depthInspector":
        store.openDepthInspector();
        break;
    }
  }, dialog);
  return window.getByRole("dialog").last();
}

async function importPsd(
  app: ElectronApplication,
  window: Page,
  psdPath: string,
  firstLayerText = "",
): Promise<void> {
  await clearPerfProbeEvents(window);
  await importPsdAndWait(app, window, psdPath, firstLayerText);
  await expect(window.locator(".layer-item").first()).toBeVisible({ timeout: 15_000 });
}

async function confirmImageImportOptions(window: Page): Promise<void> {
  await window.locator(".image-import-options-dialog .modal-btn-primary").click();
}

async function waitForLayer(window: Page, layerName: string): Promise<void> {
  await expect(window.locator(".layer-name", { hasText: layerName })).toBeVisible({
    timeout: 10_000,
  });
}

// Screenshot inventory specs intentionally capture many full-window states.
// Keep them serial for deterministic output, but give each test enough room to
// finish the capture set instead of racing Playwright's default 30s timeout.
test.describe.configure({ mode: "serial", timeout: 180_000 });

test.beforeAll(() => {
  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  ensureDir(OUTPUT_ROOT);
  tempAssetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-screen-inventory-"));
});

test.afterAll(() => {
  if (tempAssetRoot) {
    fs.rmSync(tempAssetRoot, { recursive: true, force: true });
  }
});

test("capture workspace and menu inventory", async ({ app, window }) => {
  await bootstrap(window);
  await captureWorkspace(window, "workspace", "01-initial-light.png");

  await window.locator(".menu-dropdown-trigger").first().click();
  await expect(window.locator(".menu-dropdown-panel")).toBeVisible();
  await captureWorkspace(window, "workspace", "02-menu-file-open.png");

  await closeTopDialog(window).catch(() => {});
  await window.locator(".menu-dropdown-trigger").nth(2).click();
  await expect(window.locator(".menu-dropdown-panel")).toBeVisible();
  await captureWorkspace(window, "workspace", "03-menu-settings-open.png");

  await window.locator(".menu-dropdown-trigger").nth(3).click();
  await expect(window.locator(".menu-dropdown-panel")).toBeVisible();
  await captureWorkspace(window, "workspace", "04-menu-integrations-open.png");

  await importPsd(app, window, TEST_PSD);
  await captureWorkspace(window, "workspace", "05-psd-loaded-light.png");

  await setTheme(window, "dark");
  await captureWorkspace(window, "workspace", "06-psd-loaded-dark.png");
});

test("capture focused panel inventory", async ({ app, window }) => {
  await bootstrap(window);
  await importPsd(app, window, TEST_PSD);

  const rightPane = window.locator(".workspace-right");
  await capturePanel(rightPane, "panels", "01-workspace-right.png");

  const physicsPanel = window
    .locator('.workspace-panel-shell[data-panel-name="PhysicsPanel"] .physics-panel')
    .first();
  await physicsPanel.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  await capturePanel(physicsPanel, "panels", "02-physics-panel.png");

  await importPsd(app, window, CHARACTER_PSD, "");
  const rigHealthSection = window
    .locator(".properties-panel .properties-section")
    .filter({ has: window.getByText("\u30ea\u30b0\u30d8\u30eb\u30b9", { exact: true }) })
    .first();
  await capturePanel(rigHealthSection, "panels", "03-rig-health.png");
});

test("capture dialog inventory", async ({ app, window }) => {
  await bootstrap(window);

  await clickFileMenuItem(window, "Open Image...");
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "01-image-open-options.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "01-image-open-options.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Import .vivid");
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "02-vivid-import.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "02-vivid-import.png",
  );
  await closeTopDialog(window);

  await clickSettingsMenuItem(window, "Shortcuts");
  await captureDialog(window.getByRole("dialog").last(), "dialogs", "03-shortcuts.png");
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "03-shortcuts.png",
  );
  await closeTopDialog(window);

  await captureDialog(
    await openIntegrationDialogByIndex(window, 0),
    "dialogs",
    "04-ai-generate.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "04-ai-generate.png",
  );
  await closeTopDialog(window);
  await captureDialog(
    await openIntegrationDialogByIndex(window, 1),
    "dialogs",
    "05-comfyui-settings.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "05-comfyui-settings.png",
  );
  await closeTopDialog(window);
  await captureDialog(
    await openIntegrationDialogByIndex(window, 2),
    "dialogs",
    "06-obs-settings.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "06-obs-settings.png",
  );
  await closeTopDialog(window);
  await captureDialog(
    await openIntegrationDialogByIndex(window, 3),
    "dialogs",
    "07-vts-settings.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "07-vts-settings.png",
  );
  await closeTopDialog(window);

  await importPsd(app, window, TEST_PSD);

  await clickFileMenuItem(window, "Import Image As Layer...");
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "08-image-import-layer-options.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "08-image-import-layer-options.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Import Images As Layers...");
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "09-image-import-layers-options.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "09-image-import-layers-options.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Import Folder As Layers...");
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "10-image-import-folder-options.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "10-image-import-folder-options.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "SDK Export");
  await captureDialog(window.getByRole("dialog").last(), "dialogs", "11-sdk-export.png");
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "11-sdk-export.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Media Output");
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "12-media-export.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "12-media-export.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Reimport PSD");
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "13-reimport-psd.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "13-reimport-psd.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Validate");
  await captureDialog(window.getByRole("dialog").last(), "dialogs", "14-validation.png");
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "14-validation.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Auto Setup");
  await captureDialog(window.getByRole("dialog").last(), "dialogs", "15-auto-setup.png");
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "15-auto-setup.png",
  );
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Export as .vivid");
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "16-vivid-export.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "16-vivid-export.png",
  );
  await closeTopDialog(window);

  await captureDialog(await openQuickActions(window), "dialogs", "17-quick-actions.png");
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "17-quick-actions.png",
  );
  await closeTopDialog(window);

  await createClip(window);
  const timelineButtons = window.locator(".timeline-clip-selector .tl-btn");

  await timelineButtons.nth(0).click();
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "18-first-motion.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "18-first-motion.png",
  );
  await closeTopDialog(window);

  await timelineButtons.nth(1).click();
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "19-motion-preset.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "19-motion-preset.png",
  );
  await closeTopDialog(window);

  await timelineButtons.nth(2).click();
  await captureDialog(window.getByRole("dialog").last(), "dialogs", "20-idle-synth.png");
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "20-idle-synth.png",
  );
  await closeTopDialog(window);

  await timelineButtons.nth(3).click();
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "21-motion-assist.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "21-motion-assist.png",
  );
  await closeTopDialog(window);

  await createClip(window);
  await timelineButtons.nth(4).click();
  await captureDialog(
    window.getByRole("dialog").last(),
    "dialogs",
    "22-animation-retarget.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "22-animation-retarget.png",
  );
  await closeTopDialog(window);

  await importPsd(app, window, CHARACTER_PSD, "");
  await captureDialog(
    await openProjectDialog(window, "depthInspector"),
    "dialogs",
    "23-depth-inspector.png",
  );
  await captureDialogWindow(
    window,
    window.getByRole("dialog").last(),
    "dialogs-window",
    "23-depth-inspector.png",
  );
  await closeTopDialog(window);
});

test("capture locale inventory", async ({ app, window }) => {
  await bootstrap(window, { locale: "en", theme: "light" });
  await captureWorkspace(window, "locale", "01-initial-en-light.png");

  await importPsd(app, window, TEST_PSD);
  await captureWorkspace(window, "locale", "02-psd-loaded-en-light.png");

  await setTheme(window, "dark");
  await captureWorkspace(window, "locale", "03-psd-loaded-en-dark.png");

  await setLocale(window, "ja");
  await captureWorkspace(window, "locale", "04-psd-loaded-ja-dark.png");
});

test("capture hidpi inventory", async ({ app, window }) => {
  await bootstrap(window, { locale: "ja", theme: "light" });
  await setDeviceScaleFactor(window, 2);
  await captureWorkspace(window, "hidpi", "01-initial-ja-light-dpr2.png");

  await importPsd(app, window, TEST_PSD);
  await captureWorkspace(window, "hidpi", "02-psd-loaded-ja-light-dpr2.png");

  await setTheme(window, "dark");
  await captureWorkspace(window, "hidpi", "03-psd-loaded-ja-dark-dpr2.png");
});

test("capture manual png inventory", async ({ app, window }) => {
  await bootstrap(window);

  const openImagePath = path.join(tempAssetRoot, "inventory-open.png");
  const importLayerPath = path.join(tempAssetRoot, "inventory-layer.png");
  const folderPath = path.join(tempAssetRoot, "inventory-folder");
  const folderAlphaPath = path.join(folderPath, "alpha-folder.png");
  const folderZetaPath = path.join(folderPath, "zeta-folder.png");

  writeBase64Png(openImagePath, ONE_BY_ONE_PNG_BASE64);
  writeBase64Png(importLayerPath, TWO_BY_TWO_PNG_BASE64);
  writeBase64Png(folderAlphaPath, ONE_BY_ONE_PNG_BASE64);
  writeBase64Png(folderZetaPath, TWO_BY_TWO_PNG_BASE64);

  await mockOpenPng(app, openImagePath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);
  await waitForLayer(window, "inventory-open");
  await captureWorkspace(window, "manual-png", "01-open-image-project.png");

  await mockOpenPng(app, importLayerPath);
  await clickFileMenuItem(window, "Import Image As Layer...");
  await confirmImageImportOptions(window);
  await waitForLayer(window, "inventory-layer");
  await captureWorkspace(window, "manual-png", "02-import-image-as-layer.png");

  await mockOpenPngFolder(app, folderPath);
  await clickFileMenuItem(window, "Import Folder As Layers...");
  await confirmImageImportOptions(window);
  await waitForLayer(window, "alpha-folder");
  await waitForLayer(window, "zeta-folder");
  await captureWorkspace(window, "manual-png", "03-import-folder-as-layers.png");
});

test("capture workflow state inventory", async ({ app, window }) => {
  await bootstrap(window);
  await importPsd(app, window, TEST_PSD);

  await clickFileMenuItem(window, "Auto Setup");
  await captureDialog(
    window.getByRole("dialog").last(),
    "workflows",
    "01-auto-setup-open.png",
  );
  await closeTopDialog(window);

  const quickActions = await openQuickActions(window);
  const searchInput = quickActions.locator(".quick-actions-search-input");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("setup");
  await captureDialog(quickActions, "workflows", "02-quick-actions-search-setup.png");
  await closeTopDialog(window);

  await addParameter(window, "Param X");
  await createClip(window);
  await addTrack(window, "Param X");
  await window
    .getByTitle(
      /Switch to graph editor|\u30b0\u30e9\u30d5\u30a8\u30c7\u30a3\u30bf\u306b\u5207\u66ff/,
    )
    .click();
  await expect(window.locator(".graph-editor-container")).toBeVisible();
  await captureWorkspace(window, "workflows", "03-graph-editor-workspace.png");
});
