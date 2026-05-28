import type { ElectronApplication, Locator, Page } from "playwright";
import { expect, test } from "../fixtures";
import {
  clearPerfProbeEvents,
  expectDialogFocusTrap,
  expectDialogLayout,
  expectElementWithinViewport,
  expectNoHorizontalOverflow,
  expectVerticalStack,
  importPsdAndWait,
  waitForAppReady,
  waitForStableFrame,
  waitForViviRuntime,
} from "../helpers/app";
import { clickFileMenuItem } from "../helpers/operations";
import { resolveCharacterPsdPath } from "../helpers/psd-fixtures";

const TEST_PSD = resolveCharacterPsdPath();
const CHARACTER_PSD = resolveCharacterPsdPath();

async function bootstrap(
  window: Page,
  options: {
    theme?: "light" | "dark";
    locale?: "ja" | "en";
    width?: number;
    height?: number;
  } = {},
): Promise<void> {
  const { theme = "light", locale = "ja", width = 1920, height = 1080 } = options;
  await window.setViewportSize({ width, height });
  await window.evaluate(
    ({ nextTheme, nextLocale }) => {
      try {
        localStorage.clear();
        localStorage.setItem("vivi2d-theme", nextTheme);
        localStorage.setItem("vivi2d-locale", nextLocale);
        localStorage.setItem("vivi2d-workspace-mode", "default");
      } catch {
        /* noop */
      }
    },
    { nextTheme: theme, nextLocale: locale },
  );
  await window.reload();
  await waitForAppReady(window);
  await waitForStableFrame(window, 3);
}

async function importPsd(
  app: ElectronApplication,
  window: Page,
  psdPath: string,
  firstLayerText = "",
): Promise<void> {
  await clearPerfProbeEvents(window);
  await importPsdAndWait(app, window, psdPath, firstLayerText);
}

async function openSettingsPanel(window: Page): Promise<{
  trigger: Locator;
  panel: Locator;
}> {
  const trigger = window.locator(".menu-dropdown-trigger").nth(2);
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel = window.locator(".menu-dropdown-panel").last();
  await expect(panel).toBeVisible();
  return { trigger, panel };
}

async function openIntegrationsPanel(window: Page): Promise<{
  trigger: Locator;
  panel: Locator;
}> {
  const trigger = window.locator(".menu-dropdown-trigger").nth(3);
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel = window.locator(".menu-dropdown-panel").last();
  await expect(panel).toBeVisible();
  return { trigger, panel };
}

async function expectDropdownBelowTrigger(
  trigger: Locator,
  panel: Locator,
): Promise<void> {
  const triggerBox = await trigger.boundingBox();
  const panelBox = await panel.boundingBox();
  if (!triggerBox || !panelBox) {
    throw new Error("Menu trigger or panel bounding box is unavailable");
  }
  if (panelBox.y + 1 < triggerBox.y + triggerBox.height) {
    throw new Error(
      `Expected dropdown to open below the trigger, got trigger bottom=${(triggerBox.y + triggerBox.height).toFixed(2)} panel top=${panelBox.y.toFixed(2)}`,
    );
  }
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

async function seedSeeThroughDepthInspectorRows(window: Page): Promise<void> {
  await waitForViviRuntime(window, ["useEditorStore"]);
  await window.evaluate(() => {
    const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
    const editorStore = runtime?.useEditorStore;
    const project = editorStore?.getState().project;
    if (!project) throw new Error("Project is unavailable");

    const next = structuredClone(project);
    const stack = [...next.layers];
    const viviMeshes: any[] = [];
    while (stack.length > 0) {
      const layer = stack.shift();
      if (!layer) continue;
      if (layer.children?.length) stack.push(...layer.children);
      if (layer.kind === "viviMesh") viviMeshes.push(layer);
    }
    if (viviMeshes.length === 0) {
      throw new Error("Expected at least one ViviMesh for depth inspector layout.");
    }

    const rows = [
      { label: "hair_back", lr: "center", fb: "back" },
      { label: "hair_middle", lr: "center", fb: "middle" },
      { label: "hair_front", lr: "center", fb: "front" },
      { label: "eye_white_left", lr: "left", fb: "middle" },
      { label: "eye_white_right", lr: "right", fb: "middle" },
      { label: "mouth", lr: "center", fb: "middle" },
      { label: "body", lr: "center", fb: "middle" },
      { label: "accessory", lr: "center", fb: "unknown" },
    ];

    for (const [index, layer] of viviMeshes.slice(0, rows.length).entries()) {
      const row = rows[index]!;
      layer.importMetadata = {
        source: "seeThrough",
        seeThrough: {
          label: row.label,
          order: index + 1,
          confidence: 0.95,
          leftRightSplit: row.lr,
          frontBackSplit: row.fb,
          bbox: [0, 0, 64, 64],
          depthStats: {
            min: index,
            max: index + 1,
            mean: index + 0.5,
          },
        },
      };
    }

    editorStore.setState({ project: next });
  });
  await waitForStableFrame(window, 2);
}

async function closeDialog(dialog: Locator): Promise<void> {
  const closeButton = dialog
    .getByRole("button", { name: /閉じる|close|cancel|キャンセル/i })
    .last();
  const closeButtonCount = await closeButton.count();
  if (closeButtonCount > 0) {
    await closeButton.click();
  } else {
    await dialog.page().keyboard.press("Escape");
  }
  await expect(dialog).toBeHidden({ timeout: 5_000 });
}

async function addNotification(
  window: Page,
  type: "info" | "warning" | "error",
  message: string,
): Promise<void> {
  await waitForViviRuntime(window, ["useNotificationStore"]);
  await window.evaluate(
    ({ notificationType, notificationMessage }) => {
      const runtime = (window as Window & typeof globalThis).__vivi2d as any;
      runtime.useNotificationStore
        .getState()
        .addNotification(notificationType, notificationMessage);
    },
    { notificationType: type, notificationMessage: message },
  );
}

async function setTheme(window: Page, theme: "light" | "dark"): Promise<void> {
  await waitForViviRuntime(window, ["useThemeStore"]);
  await window.evaluate((nextTheme) => {
    const runtime = (window as Window & typeof globalThis).__vivi2d as any;
    const store = runtime.useThemeStore.getState();
    if (store.theme !== nextTheme) store.setTheme(nextTheme);
  }, theme);
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
  await cdp.detach();
}

test.describe("design layout contracts", () => {
  test("validation dialog returns focus to the opener", async ({ app, window }) => {
    await bootstrap(window);
    await importPsd(app, window, CHARACTER_PSD);

    const opener = window
      .getByRole("button", { name: /検証|validate|validation/i })
      .first();
    await opener.scrollIntoViewIfNeeded();
    await opener.focus();
    await expect(opener).toBeFocused();

    await opener.click();
    const dialog = window.getByRole("dialog").last();
    await expectDialogLayout(window, dialog);

    await window.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    await expect(opener).toBeFocused();
  });

  test("auto setup dialog traps focus inside the modal", async ({ app, window }) => {
    await bootstrap(window);
    await importPsd(app, window, TEST_PSD);

    await clickFileMenuItem(window, "Auto Setup");
    const dialog = window.getByRole("dialog").last();
    await expectDialogLayout(window, dialog, { requireFooter: false });
    await expectDialogFocusTrap(window, dialog);
  });

  test("dialogs stay above menus and keep their layout after theme changes", async ({
    app,
    window,
  }) => {
    await bootstrap(window);
    await importPsd(app, window, CHARACTER_PSD);

    const { panel } = await openSettingsPanel(window);
    const panelBox = await panel.boundingBox();
    if (!panelBox) throw new Error("Settings panel bounding box is unavailable");

    const dialog = await openProjectDialog(window, "validation");
    const initialLayout = await expectDialogLayout(window, dialog);

    const overlayProbe = await window.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y) as HTMLElement | null;
        return {
          inOverlay: Boolean(element?.closest(".modal-overlay")),
          inMenu: Boolean(element?.closest(".menu-dropdown-panel")),
        };
      },
      {
        x: Math.floor(panelBox.x + Math.min(panelBox.width / 2, 24)),
        y: Math.floor(panelBox.y + Math.min(panelBox.height / 2, 24)),
      },
    );
    expect(overlayProbe.inOverlay).toBe(true);
    expect(overlayProbe.inMenu).toBe(false);

    await setTheme(window, "dark");
    const afterDarkLayout = await expectDialogLayout(window, dialog);
    expect(
      Math.abs(afterDarkLayout.dialogBox.width - initialLayout.dialogBox.width),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(afterDarkLayout.dialogBox.height - initialLayout.dialogBox.height),
    ).toBeLessThanOrEqual(2);

    await setTheme(window, "light");
    const afterLightLayout = await expectDialogLayout(window, dialog);
    expect(
      Math.abs(afterLightLayout.dialogBox.width - initialLayout.dialogBox.width),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(afterLightLayout.dialogBox.height - initialLayout.dialogBox.height),
    ).toBeLessThanOrEqual(2);
  });

  test("critical dialogs stay unclipped in Japanese and English", async ({
    app,
    window,
  }) => {
    for (const locale of ["ja", "en"] as const) {
      await bootstrap(window, { locale });
      await importPsd(app, window, TEST_PSD);

      const quickActions = await openQuickActions(window);
      await expectDialogLayout(window, quickActions);
      await closeDialog(quickActions);

      await clickFileMenuItem(window, "Reimport PSD");
      const reimportDialog = window.getByRole("dialog").last();
      await expectDialogLayout(window, reimportDialog);
      await closeDialog(reimportDialog);

      await clickFileMenuItem(window, "Auto Setup");
      const autoSetupDialog = window.getByRole("dialog").last();
      await expectDialogLayout(window, autoSetupDialog, { requireFooter: false });
      await closeDialog(autoSetupDialog);

      await bootstrap(window, { locale });
      await importPsd(app, window, CHARACTER_PSD);
      const depthInspectorDialog = await openProjectDialog(window, "depthInspector");
      await expectDialogLayout(window, depthInspectorDialog);
      await closeDialog(depthInspectorDialog);
    }
  });

  test("private correction wizard stays unreachable in the public profile", async ({
    app,
    window,
  }) => {
    await bootstrap(window, { width: 1280, height: 720 });
    await importPsd(app, window, CHARACTER_PSD);

    await waitForViviRuntime(window, ["useProjectDialogsStore"]);
    const beforeCount = await window.getByRole("dialog").count();
    const hasPrivateOpener = await window.evaluate(() => {
      const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
      const blockedOpenerName = ["open", "Correct", "ive", "Wizard"].join("");
      return typeof runtime?.useProjectDialogsStore?.getState()[blockedOpenerName] ===
        "function";
    });
    expect(hasPrivateOpener).toBe(false);
    await expect(window.getByRole("dialog")).toHaveCount(beforeCount);
  });

  test("dialog centering and clipping hold at deviceScaleFactor=2", async ({
    app,
    window,
  }) => {
    await bootstrap(window);
    await setDeviceScaleFactor(window, 2);
    await importPsd(app, window, TEST_PSD);

    await clickFileMenuItem(window, "Auto Setup");
    const dialog = window.getByRole("dialog").last();
    await expectDialogLayout(window, dialog, { requireFooter: false });
  });

  test("settings and integrations menus stay inside the viewport with full labels", async ({
    window,
  }) => {
    await bootstrap(window, { width: 1280, height: 720, locale: "ja" });

    const settings = await openSettingsPanel(window);
    await expectDropdownBelowTrigger(settings.trigger, settings.panel);
    await expectElementWithinViewport(window, settings.panel);
    await expect(
      settings.panel.locator(".menu-dropdown-section", { hasText: /言語|Language/ }),
    ).toBeVisible();
    await expect(
      settings.panel.locator(".menu-dropdown-item", {
        hasText: /ダークモード|Dark Mode/,
      }),
    ).toBeVisible();
    await expect(
      settings.panel.locator(".menu-dropdown-item", { hasText: /英語|English/ }),
    ).toBeVisible();
    await expect(
      settings.panel.locator(".menu-dropdown-item", { hasText: /日本語|Japanese/ }),
    ).toBeVisible();
    expect(
      await settings.panel.locator(".menu-dropdown-item.active").count(),
    ).toBeGreaterThanOrEqual(1);

    const integrations = await openIntegrationsPanel(window);
    await expectDropdownBelowTrigger(integrations.trigger, integrations.panel);
    await expectElementWithinViewport(window, integrations.panel);
    await expect(integrations.panel.locator(".menu-dropdown-item").first()).toBeVisible();
  });

  test("right panel sections and physics actions stay aligned without horizontal overflow", async ({
    app,
    window,
  }) => {
    await bootstrap(window);
    await importPsd(app, window, CHARACTER_PSD);

    const rightPane = window.locator(".workspace-right");
    await expect(rightPane.locator(".panel-header").first()).toBeVisible();
    await expectElementWithinViewport(window, rightPane);
    await expectNoHorizontalOverflow(rightPane);

    const physicsPanel = window
      .locator('.workspace-panel-shell[data-panel-name="PhysicsPanel"] .physics-panel')
      .first();
    await expect(physicsPanel).toBeVisible();
    await expectNoHorizontalOverflow(physicsPanel);
    await expectVerticalStack(
      physicsPanel.locator(".physics-panel-primary-actions > *"),
      {
        minimumGap: 4,
        leftTolerance: 12,
      },
    );

    const rigHealthSection = rightPane.locator(".properties-section");
    await expect(rightPane.getByText(/リグヘルス|Rig Health/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(rigHealthSection.last());
    await expect(
      rightPane.getByRole("button", { name: /検証|validate|validation/i }).first(),
    ).toBeVisible();
  });

  test("quick actions cards and disabled reasons stack cleanly", async ({
    app,
    window,
  }) => {
    await bootstrap(window);
    await importPsd(app, window, TEST_PSD);

    const dialog = await openQuickActions(window);
    await expectDialogLayout(window, dialog);
    const results = dialog.locator(".quick-actions-results");
    await expect(results).toBeVisible();
    await expectNoHorizontalOverflow(results);
    await expectVerticalStack(dialog.locator(".quick-actions-item"), {
      minimumGap: 4,
      leftTolerance: 16,
    });

    await dialog.locator(".quick-actions-search-input").fill("rig");
    await waitForStableFrame(window, 2);
    const disabledReason = dialog.locator(".quick-actions-item-disabled-reason").first();
    await expect(disabledReason).toBeVisible();
    await expectNoHorizontalOverflow(disabledReason);
  });

  test("depth inspector table headers stay visible without horizontal overflow", async ({
    app,
    window,
  }) => {
    await bootstrap(window);
    await importPsd(app, window, CHARACTER_PSD);
    await seedSeeThroughDepthInspectorRows(window);

    const dialog = await openProjectDialog(window, "depthInspector");
    await expectDialogLayout(window, dialog);

    const table = dialog.locator(".depth-inspector-table");
    await expect(table).toBeVisible();
    await expectNoHorizontalOverflow(table);

    const headers = table.locator("thead th");
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(0);
    for (let index = 0; index < headerCount; index += 1) {
      await expectElementWithinViewport(window, headers.nth(index));
    }
  });

  test("reduced motion keeps dialog and notifications functional", async ({
    app,
    window,
  }) => {
    await bootstrap(window);
    await window.emulateMedia({ reducedMotion: "reduce" });
    await importPsd(app, window, TEST_PSD);

    const dialog = await openQuickActions(window);
    await expectDialogLayout(window, dialog);
    await closeDialog(dialog);

    await addNotification(window, "warning", "Reduced motion layout smoke");
    const notification = window.locator(".notification-warning").first();
    await expect(notification).toBeVisible();
    await expect(notification.locator(".notification-close")).toBeVisible();
    await notification.locator(".notification-close").click();
    await expect(notification).not.toBeVisible();
  });
});
