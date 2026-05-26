import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { mockOpenPsd } from "../helpers/dialog-mock";
import { addBone, bindAllBones, selectLayer } from "../helpers/operations";

const TEST_PSD = path.resolve(import.meta.dirname, "../fixtures/test.psd");

const FILE_MENU_PATTERN = /ファイル|File/;
const REIMPORT_MENU_ITEM_PATTERN = /PSD再読込|Reimport PSD/;
const REIMPORT_TITLE_PATTERN = /PSD ?再読み込み|PSD Reimport/;
const SELECT_PSD_BUTTON_PATTERN = /PSD ?ファイルを選択|Select PSD File/;
const APPLY_BUTTON_PATTERN = /適用|Apply/;
const CANCEL_BUTTON_PATTERN = /キャンセル|Cancel/;

async function openFileMenu(window: Page) {
  const trigger = window.locator(".menu-dropdown-trigger", {
    hasText: FILE_MENU_PATTERN,
  });
  await trigger.click();
  const panel = trigger.locator("..").locator(".menu-dropdown-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function openReimportDialog(window: Page) {
  const panel = await openFileMenu(window);
  await panel
    .locator(".menu-dropdown-item", { hasText: REIMPORT_MENU_ITEM_PATTERN })
    .click();
  await expect(window.locator(".modal-overlay")).toBeVisible();
  await expect(window.locator(".modal-title")).toHaveText(REIMPORT_TITLE_PATTERN);
  await expect(window.locator(".reimport-dialog")).toBeVisible();
}

async function closeReimportDialog(window: Page) {
  const applyBtn = window.getByRole("button", { name: APPLY_BUTTON_PATTERN });
  const cancelBtn = window.getByRole("button", { name: CANCEL_BUTTON_PATTERN });

  if (await applyBtn.isVisible().catch(() => false)) {
    await applyBtn.click();
  } else {
    await cancelBtn.click();
  }

  try {
    await expect(window.locator(".modal-overlay")).not.toBeVisible({
      timeout: 5_000,
    });
  } catch {
    const overlay = window.locator(".modal-overlay");
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ position: { x: 5, y: 5 }, force: true });
      await expect(window.locator(".modal-overlay")).not.toBeVisible({
        timeout: 5_000,
      });
    }
  }
}

test("reimport menu item stays hidden before a project exists", async ({ window }) => {
  const panel = await openFileMenu(window);
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: REIMPORT_MENU_ITEM_PATTERN }),
  ).not.toBeVisible();
  await window.keyboard.press("Escape");
});

test("reimport menu item appears after loading a PSD-backed project", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const panel = await openFileMenu(window);
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: REIMPORT_MENU_ITEM_PATTERN }),
  ).toBeVisible();
  await window.keyboard.press("Escape");
});

test("opening PSD reimport shows the dialog shell", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await openReimportDialog(window);
});

test("initial reimport state shows the select-PSD button", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await openReimportDialog(window);
  await expect(
    window.getByRole("button", { name: SELECT_PSD_BUTTON_PATTERN }),
  ).toBeVisible();
});

test("cancel closes the reimport dialog", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await openReimportDialog(window);
  await window.getByRole("button", { name: CANCEL_BUTTON_PATTERN }).click();
  await expect(window.locator(".modal-overlay")).not.toBeVisible();
});

test("reimporting the same PSD shows a diff or no-change summary and closes cleanly", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  await openReimportDialog(window);
  await mockOpenPsd(app, TEST_PSD);
  await window.getByRole("button", { name: SELECT_PSD_BUTTON_PATTERN }).click();

  await expect(async () => {
    const diffVisible = await window
      .locator(".reimport-diff")
      .isVisible()
      .catch(() => false);
    const noDiffVisible = await window
      .locator(".reimport-info")
      .isVisible()
      .catch(() => false);
    expect(diffVisible || noDiffVisible).toBe(true);
  }).toPass({ timeout: 10_000 });

  await closeReimportDialog(window);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("reimport preserves existing bones and skin bindings", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");
  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  const skinSection = window
    .locator(".properties-section")
    .filter({ hasText: /スキン|Skin/ });
  await expect(skinSection.locator(".prop-bone-tag").first()).toBeVisible();

  await openReimportDialog(window);
  await mockOpenPsd(app, TEST_PSD);
  await window.getByRole("button", { name: SELECT_PSD_BUTTON_PATTERN }).click();

  await expect(async () => {
    const diffVisible = await window
      .locator(".reimport-diff")
      .isVisible()
      .catch(() => false);
    const noDiffVisible = await window
      .locator(".reimport-info")
      .isVisible()
      .catch(() => false);
    expect(diffVisible || noDiffVisible).toBe(true);
  }).toPass({ timeout: 10_000 });

  await closeReimportDialog(window);

  await expect(window.locator(".layer-item", { hasText: /ボーン|Bone/ })).toBeVisible();

  await selectLayer(window, "Red Circle");
  const skinSectionAfter = window
    .locator(".properties-section")
    .filter({ hasText: /スキン|Skin/ });
  await expect(skinSectionAfter.locator(".prop-bone-tag").first()).toBeVisible();
});

test("reimport can be undone without destabilizing the app", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");
  await expect(window.locator(".layer-item", { hasText: /ボーン|Bone/ })).toBeVisible();

  await openReimportDialog(window);
  await mockOpenPsd(app, TEST_PSD);
  await window.getByRole("button", { name: SELECT_PSD_BUTTON_PATTERN }).click();

  await expect(async () => {
    const diffVisible = await window
      .locator(".reimport-diff")
      .isVisible()
      .catch(() => false);
    const noDiffVisible = await window
      .locator(".reimport-info")
      .isVisible()
      .catch(() => false);
    expect(diffVisible || noDiffVisible).toBe(true);
  }).toPass({ timeout: 10_000 });

  await closeReimportDialog(window);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  await window.keyboard.press("Control+z");
  await expect(window.locator(".app")).toBeVisible();
});
