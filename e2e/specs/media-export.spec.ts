import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { createSceneAndClip } from "../helpers/operations";

const FILE_MENU_PATTERN = /ファイル|File/;
const MEDIA_EXPORT_MENU_ITEM_PATTERN = /メディア出力|Media Output/;
const MEDIA_EXPORT_TITLE_PATTERN = /メディア書き出し|Media Export/;

async function openFileMenu(window: Page) {
  const trigger = window.locator(".menu-dropdown-trigger", {
    hasText: FILE_MENU_PATTERN,
  });
  await trigger.click();
  const panel = trigger.locator("..").locator(".menu-dropdown-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function openMediaExportDialog(window: Page) {
  const panel = await openFileMenu(window);
  await panel
    .locator(".menu-dropdown-item", { hasText: MEDIA_EXPORT_MENU_ITEM_PATTERN })
    .click();
  await expect(window.locator(".modal-title")).toHaveText(MEDIA_EXPORT_TITLE_PATTERN);
  await expect(window.locator(".modal-content")).toBeVisible();
}

function exportButton(window: Page) {
  return window.locator(".modal-actions .prop-btn").first();
}

function closeButton(window: Page) {
  return window.locator(".modal-actions .prop-btn").nth(1);
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});

test("when no clips exist the dialog shows the empty state and disables export", async ({
  window,
}) => {
  await openMediaExportDialog(window);

  await expect(window.locator(".media-export-empty")).toBeVisible();
  await expect(exportButton(window)).toBeDisabled();
  await closeButton(window).click();
  await expect(
    window.locator(".modal-title", { hasText: MEDIA_EXPORT_TITLE_PATTERN }),
  ).not.toBeVisible();
});

test("format selection defaults to PNG sequence and can switch to MP4", async ({
  window,
}) => {
  await createSceneAndClip(window);
  await openMediaExportDialog(window);

  const clipSelect = window.locator(".media-export-select").first();
  await expect(clipSelect).toBeVisible();
  await expect(window.locator(".media-export-empty")).not.toBeVisible();
  await expect(exportButton(window)).toBeEnabled();
  const info = window.locator(".media-export-info");
  await expect(info).toBeVisible();
  await expect(info.locator("div")).toHaveCount(3);
  await expect(info).toContainText(/PNG/i);
  const formatSelect = window.locator(".media-export-select").nth(1);
  await expect(formatSelect).toBeVisible();
  await expect(formatSelect).toHaveValue("png-sequence");

  await formatSelect.selectOption("mp4");
  await expect(formatSelect).toHaveValue("mp4");
  await expect(info).toContainText(/WebM|MP4/i);
});
