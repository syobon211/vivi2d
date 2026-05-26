import type { ElectronApplication, Locator, Page } from "playwright";
import { expect, test } from "../fixtures";
import {
  clearPerfProbeEvents,
  expectDialogLayout,
  importPsdAndWait,
  resetDialogScroll,
  waitForAppReady,
  waitForViviRuntime,
} from "../helpers/app";
import {
  clickFileMenuItem,
  clickSettingsMenuItem,
  createClip,
} from "../helpers/operations";
import { resolveCharacterPsdPath } from "../helpers/psd-fixtures";
import { expectVisualSnapshot } from "../helpers/visual-capture";

const TEST_PSD = resolveCharacterPsdPath();
const CHARACTER_PSD = resolveCharacterPsdPath();

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

async function bootstrap(window: Page): Promise<void> {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await window.route(/^https?:\/\//, (route) => route.abort());
  await window.evaluate(() => {
    try {
      localStorage.clear();
      localStorage.setItem("vivi2d-theme", "light");
      localStorage.setItem("vivi2d-locale", "ja");
      localStorage.setItem("vivi2d-workspace-mode", "default");
    } catch {
      /* noop */
    }
  });
  await window.reload();
  await waitForAppReady(window);
  await waitForStableFrame(window);
  await waitForStableFrame(window);
}

async function importPsd(
  app: ElectronApplication,
  window: Page,
  psdPath: string,
): Promise<void> {
  await clearPerfProbeEvents(window);
  await importPsdAndWait(app, window, psdPath, "");
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
  return window.getByRole("dialog");
}

async function openQuickActions(window: Page): Promise<Locator> {
  await waitForViviRuntime(window, ["useQuickActionsStore"]);
  await window.evaluate(() => {
    const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
    runtime?.useQuickActionsStore?.getState().openPalette();
  });
  const dialog = window.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await waitForStableFrame(window);
  await waitForStableFrame(window);
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
  await waitForStableFrame(window);
  await waitForStableFrame(window);
  return opened;
}

async function openDialogScreenshot(
  window: Page,
  name: string,
  dialog?: Locator,
  options: {
    requireFooter?: boolean;
  } = {},
): Promise<void> {
  const target = dialog ?? window.getByRole("dialog").last();
  await expect(target).toBeVisible({ timeout: 5_000 });
  await waitForStableFrame(window);
  await waitForStableFrame(window);
  await expectDialogLayout(window, target, {
    requireFooter: options.requireFooter,
  });
  await resetDialogScroll(target);
  await waitForStableFrame(window);
  await expectVisualSnapshot(target, name, { timeout: 15_000 });
}

async function readBoxes(
  locators: Locator,
): Promise<Array<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>>> {
  const count = await locators.count();
  const boxes: Array<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> = [];
  for (let index = 0; index < count; index += 1) {
    const box = await locators.nth(index).boundingBox();
    if (!box) {
      throw new Error(`Bounding box unavailable for locator index ${index}`);
    }
    boxes.push(box);
  }
  return boxes;
}

async function expectVerticalStack(
  locators: Locator,
  options: {
    minimumGap?: number;
    leftTolerance?: number;
  } = {},
): Promise<void> {
  const { minimumGap = 0, leftTolerance = 24 } = options;
  const boxes = await readBoxes(locators);
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1]!;
    const current = boxes[index]!;
    const gap = current.y - (previous.y + previous.height);
    if (gap < minimumGap - 1) {
      throw new Error(
        `Expected vertical stack gap >= ${minimumGap}, got ${gap.toFixed(2)} at index ${index}`,
      );
    }
    if (Math.abs(current.x - previous.x) > leftTolerance) {
      throw new Error(
        `Expected stacked items to align on the left edge within ${leftTolerance}px, got ${Math.abs(current.x - previous.x).toFixed(2)}px`,
      );
    }
  }
}

async function expectButtonsOnSameRow(buttons: Locator): Promise<void> {
  const boxes = await readBoxes(buttons);
  if (boxes.length < 2) return;
  const baselineY = boxes[0]!.y;
  for (const box of boxes.slice(1)) {
    if (Math.abs(box.y - baselineY) > 2) {
      throw new Error("Expected footer buttons to stay on the same row");
    }
  }
}

test.describe("all dialog focused screenshots", () => {
  test.beforeEach(async ({ window }) => {
    await bootstrap(window);
  });

  test("open image options dialog", async ({ window }) => {
    await clickFileMenuItem(window, "Open Image...");
    const dialog = window.getByRole("dialog").last();
    await expectVerticalStack(dialog.locator(".image-import-options-row"), {
      minimumGap: 4,
      leftTolerance: 18,
    });
    await openDialogScreenshot(window, "dialog-image-open-options-ja.png");
  });

  test("automatic model generation dialog", async ({ window }) => {
    const dialog = await openIntegrationDialogByIndex(window, 0);
    await openDialogScreenshot(window, "dialog-ai-generate-ja.png", dialog);
  });

  test("ComfyUI settings dialog", async ({ window }) => {
    const dialog = await openIntegrationDialogByIndex(window, 1);
    await openDialogScreenshot(window, "dialog-comfyui-settings-ja.png", dialog);
  });

  test("OBS settings dialog", async ({ window }) => {
    const dialog = await openIntegrationDialogByIndex(window, 2);
    await openDialogScreenshot(window, "dialog-obs-settings-ja.png", dialog);
  });

  test("VTS settings dialog", async ({ window }) => {
    const dialog = await openIntegrationDialogByIndex(window, 3);
    await openDialogScreenshot(window, "dialog-vts-settings-ja.png", dialog);
  });

  test("shortcut settings dialog", async ({ window }) => {
    await clickSettingsMenuItem(window, "Shortcuts");
    await openDialogScreenshot(window, "dialog-shortcuts-ja.png", undefined, {
      requireFooter: false,
    });
  });

  test("vivid import dialog", async ({ window }) => {
    await clickFileMenuItem(window, "Import .vivid");
    const dialog = window.getByRole("dialog").last();
    await expectVerticalStack(dialog.locator(".vivid-field"), {
      minimumGap: 4,
      leftTolerance: 24,
    });
    await openDialogScreenshot(window, "dialog-vivid-import-ja.png");
  });

  test("image import as layer options dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "Import Image As Layer...");
    const dialog = window.getByRole("dialog").last();
    await expectVerticalStack(dialog.locator(".image-import-options-row"), {
      minimumGap: 4,
      leftTolerance: 18,
    });
    await openDialogScreenshot(window, "dialog-image-import-layer-options-ja.png");
  });

  test("image import as layers options dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "Import Images As Layers...");
    const dialog = window.getByRole("dialog").last();
    await expectVerticalStack(dialog.locator(".image-import-options-row"), {
      minimumGap: 4,
      leftTolerance: 18,
    });
    await openDialogScreenshot(window, "dialog-image-import-layers-options-ja.png");
  });

  test("image import folder options dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "Import Folder As Layers...");
    const dialog = window.getByRole("dialog").last();
    await expectVerticalStack(dialog.locator(".image-import-options-row"), {
      minimumGap: 4,
      leftTolerance: 18,
    });
    await openDialogScreenshot(window, "dialog-image-import-folder-options-ja.png");
  });

  test("SDK export dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "SDK Export");
    await openDialogScreenshot(window, "dialog-sdk-export-ja.png");
  });

  test("media export dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "Media Output");
    await openDialogScreenshot(window, "dialog-media-export-ja.png");
  });

  test("PSD reimport dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "Reimport PSD");
    const dialog = window.getByRole("dialog").last();
    await expectButtonsOnSameRow(dialog.locator(".modal-actions .modal-btn"));
    await openDialogScreenshot(window, "dialog-reimport-ja.png");
  });

  test("validation dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "Validate");
    await openDialogScreenshot(window, "dialog-validation-ja.png");
  });

  test("auto setup dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "Auto Setup");
    await openDialogScreenshot(window, "dialog-auto-setup-ja.png", undefined, {
      requireFooter: false,
    });
  });

  test("vivid export dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await clickFileMenuItem(window, "Export as .vivid");
    const dialog = window.getByRole("dialog").last();
    await expectVerticalStack(dialog.locator(".vivid-field"), {
      minimumGap: 4,
      leftTolerance: 24,
    });
    await openDialogScreenshot(window, "dialog-vivid-export-ja.png");
  });

  test("quick actions dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    const dialog = await openQuickActions(window);
    await openDialogScreenshot(window, "dialog-quick-actions-ja.png", dialog);
  });

  test("depth inspector dialog", async ({ app, window }) => {
    await importPsd(app, window, CHARACTER_PSD);
    const dialog = await openProjectDialog(window, "depthInspector");
    await openDialogScreenshot(window, "dialog-depth-inspector-ja.png", dialog);
  });

  test("first motion dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await createClip(window);
    await window.getByRole("button", { name: "ファーストモーション..." }).click();
    const dialog = window.getByRole("dialog").last();
    await expect(dialog).toContainText(
      "アイドルシンセを適用する前に、まばたきまたは呼吸を有効にしてください。",
    );
    await expect(dialog.getByRole("button", { name: "閉じる" })).toBeVisible();
    await openDialogScreenshot(window, "dialog-first-motion-ja.png", dialog);
  });

  test("motion preset dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await createClip(window);
    await window.getByRole("button", { name: "プリセット..." }).click();
    await openDialogScreenshot(window, "dialog-motion-preset-ja.png");
  });

  test("idle synth dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await createClip(window);
    await window.getByRole("button", { name: "アイドルシンセ..." }).click();
    const dialog = window.getByRole("dialog").last();
    await expect(dialog).toContainText(
      "アイドルシンセを適用する前に、まばたきまたは呼吸を有効にしてください。",
    );
    await expect(dialog.getByRole("button", { name: "閉じる" })).toBeVisible();
    await openDialogScreenshot(window, "dialog-idle-synth-ja.png", dialog);
  });

  test("motion assist dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await createClip(window);
    await window.getByRole("button", { name: "モーションアシスト..." }).click();
    await openDialogScreenshot(window, "dialog-motion-assist-ja.png");
  });

  test("retarget dialog", async ({ app, window }) => {
    await importPsd(app, window, TEST_PSD);
    await createClip(window);
    await createClip(window);
    await window.getByRole("button", { name: "リターゲット..." }).click();
    await openDialogScreenshot(window, "dialog-retarget-ja.png");
  });
});
