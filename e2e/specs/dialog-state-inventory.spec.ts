import fs from "node:fs";
import path from "node:path";
import type { ElectronApplication, Locator, Page } from "playwright";
import { expect, test } from "../fixtures";
import {
  clearPerfProbeEvents,
  expectDialogCentered,
  importPsdAndWait,
  resetDialogScroll,
  waitForAppReady,
  waitForStableFrame,
  waitForViviRuntime,
} from "../helpers/app";
import { mockOpenPsd } from "../helpers/dialog-mock";
import {
  clickFileMenuItem,
  clickSettingsMenuItem,
  createClip,
} from "../helpers/operations";
import { resolveCharacterPsdPath } from "../helpers/psd-fixtures";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUTPUT_ROOT = path.resolve(ROOT, "test-screenshots/dialog-state-inventory");
const INVENTORY_LOCALE =
  process.env.VIVI2D_DIALOG_INVENTORY_LOCALE === "en" ? "en" : "ja";
const TEST_PSD = resolveCharacterPsdPath();
const CHARACTER_PSD = resolveCharacterPsdPath();

type ManifestEntry = {
  dialog: string;
  state: string;
  path: string;
};

const manifest: ManifestEntry[] = [];

function outputPath(dialogName: string, fileName: string): string {
  const dir = path.join(OUTPUT_ROOT, dialogName);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, fileName);
}

function writeManifest(): void {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  fs.writeFileSync(
    path.join(OUTPUT_ROOT, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

async function bootstrap(window: Page): Promise<void> {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await window.route(/^https?:\/\//, (route) => route.abort());
  await window.evaluate((locale) => {
    try {
      localStorage.clear();
      localStorage.setItem("vivi2d-theme", "light");
      localStorage.setItem("vivi2d-locale", locale);
      localStorage.setItem("vivi2d-workspace-mode", "default");
    } catch {
      /* noop */
    }
  }, INVENTORY_LOCALE);
  await window.reload();
  await waitForAppReady(window);
  await waitForStableFrame(window, 3);
}

async function importPsd(
  app: ElectronApplication,
  window: Page,
  psdPath: string,
): Promise<void> {
  await clearPerfProbeEvents(window);
  await importPsdAndWait(app, window, psdPath, "");
  await expect(window.locator(".layer-item").first()).toBeVisible({
    timeout: 15_000,
  });
}

async function captureDialogState(
  window: Page,
  dialogName: string,
  stateName: string,
  dialog: Locator = window.getByRole("dialog").last(),
): Promise<void> {
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expectDialogCentered(window, dialog);
  await resetDialogScroll(dialog);
  await waitForStableFrame(window, 2);
  const filePath = outputPath(dialogName, `${stateName}.png`);
  await dialog.screenshot({ path: filePath });
  manifest.push({
    dialog: dialogName,
    state: stateName,
    path: filePath,
  });
  writeManifest();
}

async function closeTopDialog(window: Page): Promise<void> {
  const dialog = window.getByRole("dialog").last();
  if (!(await dialog.isVisible().catch(() => false))) return;

  const closeLike = dialog
    .locator(".modal-btn, .prop-btn, .panel-btn")
    .filter({ hasText: /閉じる|Close|キャンセル|Cancel/i });
  if ((await closeLike.count()) > 0) {
    await closeLike.first().click();
  } else {
    await window.keyboard.press("Escape");
  }
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
  const dialog = window.getByRole("dialog").last();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  return dialog;
}

async function openQuickActions(window: Page): Promise<Locator> {
  await waitForViviRuntime(window, ["useQuickActionsStore"]);
  await window.evaluate(() => {
    const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
    runtime?.useQuickActionsStore?.getState().openPalette();
  });
  const dialog = window.getByRole("dialog").last();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await waitForStableFrame(window, 2);
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
  const opened = window.getByRole("dialog").last();
  await expect(opened).toBeVisible({ timeout: 5_000 });
  await waitForStableFrame(window, 2);
  return opened;
}

async function corruptFirstViviMeshForValidation(window: Page): Promise<void> {
  await waitForViviRuntime(window, ["useEditorStore"]);
  await window.evaluate(() => {
    const runtime = (window as Window & typeof globalThis).__vivi2d as any;
    const editorStore = runtime.useEditorStore;
    const project = editorStore.getState().project;
    if (!project) throw new Error("Project is unavailable");
    const next = structuredClone(project);
    const stack = [...next.layers];
    const target = stack.find((layer: any) => {
      if (layer.children?.length) stack.push(...layer.children);
      return layer.kind === "viviMesh";
    });
    if (!target) throw new Error("ViviMesh is unavailable");
    target.mesh = {
      ...target.mesh,
      vertices: [],
      indices: [],
      uvs: [],
    };
    editorStore.setState({ project: next });
  });
  await waitForStableFrame(window, 2);
}

async function seedSceneClip(window: Page): Promise<void> {
  await waitForViviRuntime(window, ["useEditorStore"]);
  await window.evaluate(() => {
    const runtime = (window as Window & typeof globalThis).__vivi2d as any;
    const editorStore = runtime.useEditorStore;
    const project = editorStore.getState().project;
    if (!project) throw new Error("Project is unavailable");

    const next = structuredClone(project);
    next.scenes ??= [];
    if (next.scenes.length === 0) {
      next.scenes.push({
        id: "dialog-inventory-scene",
        name: "Dialog Inventory Scene",
        clips: [],
      });
    }

    const scene = next.scenes[0];
    scene.clips ??= [];
    if (!scene.clips.some((clip: any) => clip.id === "dialog-inventory-clip")) {
      scene.clips.push({
        id: "dialog-inventory-clip",
        name: "Dialog Inventory Clip",
        duration: 90,
        fps: 30,
        tracks: [],
      });
    }

    editorStore.setState({ project: next });
  });
  await waitForStableFrame(window, 2);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test.afterAll(() => {
  writeManifest();
});

test("capture all reachable dialog states", async ({ app, window }) => {
  manifest.length = 0;
  writeManifest();
  await bootstrap(window);

  await clickFileMenuItem(window, "Open Image...");
  await captureDialogState(window, "image-import-options", "open-project-default");
  await window.locator(".image-import-options-row input").first().uncheck();
  await captureDialogState(window, "image-import-options", "open-project-toggled");
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Import .vivid");
  await captureDialogState(window, "vivid-import", "empty-disabled");
  await window.locator(".vivid-field input").first().fill("sample-password");
  await captureDialogState(window, "vivid-import", "password-filled");
  await closeTopDialog(window);

  await clickSettingsMenuItem(window, "Shortcuts");
  await captureDialogState(window, "shortcut-settings", "default");
  await window.locator(".shortcut-key-btn").first().click();
  await captureDialogState(window, "shortcut-settings", "capturing");
  await window.keyboard.press("Escape");
  await window.locator(".shortcut-key-btn").nth(1).click();
  await window.keyboard.press("Control+Z");
  await expect(window.locator(".shortcut-key-btn.conflict")).toHaveCount(2);
  await captureDialogState(window, "shortcut-settings", "conflict");
  await closeTopDialog(window);

  await captureDialogState(
    window,
    "automatic-model-generation",
    "image-tab",
    await openIntegrationDialogByIndex(window, 0),
  );
  await window.locator(".ai-gen-tab").nth(1).click();
  await captureDialogState(window, "automatic-model-generation", "prompt-empty");
  await window.locator(".ai-gen-textarea").first().fill("anime character, full body");
  await window.locator(".ai-gen-textarea").nth(1).fill("low quality");
  await captureDialogState(window, "automatic-model-generation", "prompt-filled");
  await closeTopDialog(window);

  await captureDialogState(
    window,
    "comfyui-settings",
    "default",
    await openIntegrationDialogByIndex(window, 1),
  );
  await window.locator(".modal-content .prop-btn", { hasText: /接続|Test/i }).click();
  await expect(
    window.locator(".modal-content .prop-btn", { hasText: /接続|Test/i }),
  ).toBeEnabled({
    timeout: 8_000,
  });
  await captureDialogState(window, "comfyui-settings", "connection-result");
  await closeTopDialog(window);

  await captureDialogState(
    window,
    "obs-settings",
    "default",
    await openIntegrationDialogByIndex(window, 2),
  );
  await window.locator(".ai-gen-input").first().fill("ws://127.0.0.1:4455");
  await window.locator(".ai-gen-input").nth(1).fill("password");
  await captureDialogState(window, "obs-settings", "filled");
  await closeTopDialog(window);

  await captureDialogState(
    window,
    "vts-settings",
    "default",
    await openIntegrationDialogByIndex(window, 3),
  );
  await window.locator(".ai-gen-input").first().fill("ws://127.0.0.1:8001");
  await captureDialogState(window, "vts-settings", "filled");
  await closeTopDialog(window);

  await importPsd(app, window, TEST_PSD);

  await clickFileMenuItem(window, "Import Image As Layer...");
  await captureDialogState(window, "image-import-options", "import-layer-default");
  await window.locator(".image-import-options-row input").last().check();
  await captureDialogState(window, "image-import-options", "import-layer-mesh-enabled");
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Import Images As Layers...");
  await captureDialogState(window, "image-import-options", "import-layers-default");
  await window.locator(".image-import-options-row input").nth(2).uncheck();
  await captureDialogState(window, "image-import-options", "import-layers-no-group");
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Import Folder As Layers...");
  await captureDialogState(window, "image-import-options", "import-folder-default");
  await closeTopDialog(window);

  await clickFileMenuItem(window, "SDK Export");
  await captureDialogState(window, "sdk-export", "all-selected");
  await window.locator(".export-toggle-btn").first().click();
  await captureDialogState(window, "sdk-export", "no-layers-selected-disabled");
  await closeTopDialog(window);

  await seedSceneClip(window);
  await clickFileMenuItem(window, "SDK Export");
  await captureDialogState(window, "sdk-export", "with-animation-section");
  await expect(window.locator('[data-testid="clip-select-list"]')).toBeVisible();
  await window.locator(".export-toggle-btn").nth(1).click();
  await captureDialogState(window, "sdk-export", "animations-deselected");
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Media Output");
  await captureDialogState(window, "media-export", "clip-png-sequence");
  await window.locator(".media-export-select").nth(1).selectOption("mp4");
  await captureDialogState(window, "media-export", "clip-mp4");
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Reimport PSD");
  await captureDialogState(window, "psd-reimport", "initial");
  await mockOpenPsd(app, TEST_PSD);
  await window.locator(".modal-btn-primary").click();
  await expect(window.locator(".reimport-diff, .reimport-info").last()).toBeVisible({
    timeout: 15_000,
  });
  await captureDialogState(window, "psd-reimport", "same-file-no-changes");
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Validate");
  await captureDialogState(window, "validation", "no-issues");
  await closeTopDialog(window);

  await corruptFirstViviMeshForValidation(window);
  await captureDialogState(
    window,
    "validation",
    "errors-and-warnings",
    await openProjectDialog(window, "validation"),
  );
  await closeTopDialog(window);

  await importPsd(app, window, TEST_PSD);
  await clickFileMenuItem(window, "Auto Setup");
  await captureDialogState(window, "auto-setup", "beginner-default");
  await window.locator(".auto-setup-mode-switch button").nth(1).click();
  await captureDialogState(window, "auto-setup", "advanced");
  await window.locator(".auto-setup-footer-cta button").click();
  await expect(
    window.locator(".auto-setup-table, .auto-setup-empty, .auto-setup-error").first(),
  ).toBeVisible({ timeout: 30_000 });
  await captureDialogState(window, "auto-setup", "detected-results");
  const previewButton = window.locator(".auto-setup-actions .modal-btn-primary");
  if ((await previewButton.count()) > 0 && (await previewButton.isEnabled())) {
    await previewButton.click();
    await captureDialogState(window, "auto-setup", "preview");
  }
  await closeTopDialog(window);

  await clickFileMenuItem(window, "Export as .vivid");
  await captureDialogState(window, "vivid-export", "empty-disabled");
  await window.locator(".vivid-field input").first().fill("one");
  await window.locator(".vivid-field input").nth(1).fill("two");
  await window.locator(".modal-footer .modal-btn-primary").click();
  await captureDialogState(window, "vivid-export", "password-mismatch-error");
  await window.locator(".vivid-field input").nth(1).fill("one");
  await captureDialogState(window, "vivid-export", "passwords-match-ready");
  await closeTopDialog(window);

  const quickActions = await openQuickActions(window);
  await captureDialogState(window, "quick-actions", "empty-query", quickActions);
  await quickActions.locator(".quick-actions-search-input").fill("setup");
  await captureDialogState(window, "quick-actions", "search-results");
  await quickActions.locator(".quick-actions-search-input").fill("zzzz-no-match");
  await captureDialogState(window, "quick-actions", "no-results");
  await closeTopDialog(window);

  await importPsd(app, window, CHARACTER_PSD);
  await captureDialogState(
    window,
    "depth-inspector",
    "imported-depth-sort",
    await openProjectDialog(window, "depthInspector"),
  );
  await window.locator(".media-export-select").first().selectOption("name");
  await captureDialogState(window, "depth-inspector", "name-sort");
  await closeTopDialog(window);

  await importPsd(app, window, TEST_PSD);
  await createClip(window);
  const timelineButtons = window.locator(".timeline-clip-selector .tl-btn");
  await timelineButtons.nth(0).click();
  await captureDialogState(window, "timeline-first-motion", "default");
  await closeTopDialog(window);
  await timelineButtons.nth(1).click();
  await captureDialogState(window, "timeline-motion-preset", "default");
  await closeTopDialog(window);
  await timelineButtons.nth(2).click();
  await captureDialogState(window, "timeline-idle-synth", "default");
  await closeTopDialog(window);
  await timelineButtons.nth(3).click();
  await captureDialogState(window, "timeline-motion-assist", "default");
  await closeTopDialog(window);
  await createClip(window);
  await timelineButtons.nth(4).click();
  await captureDialogState(window, "timeline-retarget", "default");
  await closeTopDialog(window);
});
