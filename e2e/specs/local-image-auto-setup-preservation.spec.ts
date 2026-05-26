import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "../fixtures";
import { waitForCanvasOpenReady } from "../helpers/app";
import { mockOpenPng } from "../helpers/dialog-mock";
import { clickFileMenuItem } from "../helpers/operations";

const LOCAL_IMAGE_PATH = process.env.VIVI2D_LOCAL_IMAGE_PATH;

function localImageName(imagePath: string): string {
  return path.basename(imagePath, path.extname(imagePath));
}

async function confirmImageImportOptions(window: Page) {
  await window.locator(".image-import-options-dialog .modal-btn-primary").click();
}

async function openLocalImage(
  window: Page,
  app: Parameters<typeof mockOpenPng>[0],
  imagePath: string,
) {
  await mockOpenPng(app, imagePath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);
  await waitForCanvasOpenReady(window);
  await expect(
    window.locator(".layer-name", { hasText: localImageName(imagePath) }),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("local image Auto Setup availability", () => {
  test.skip(!LOCAL_IMAGE_PATH, "Set VIVI2D_LOCAL_IMAGE_PATH to verify a local PNG.");

  test("disables Auto Setup for a single manual PNG project", async ({
    app,
    window,
  }) => {
    const imagePath = LOCAL_IMAGE_PATH!;
    expect(existsSync(imagePath)).toBe(true);

    await window.setViewportSize({ width: 1920, height: 1080 });
    await openLocalImage(window, app, imagePath);

    const fileMenu = window.locator(".menu-dropdown-trigger").first();
    await expect(fileMenu).toBeVisible();
    await fileMenu.click();
    const autoSetupItem = window.locator(".menu-dropdown-item", {
      hasText: /Auto Setup|自動セットアップ/,
    });
    await expect(autoSetupItem).toBeVisible();
    await expect(autoSetupItem).toBeDisabled();
    await expect(autoSetupItem).toHaveAttribute(
      "title",
      /single PNG|単一PNG|PSD|See-through/,
    );

    await autoSetupItem.click({ force: true });
    await expect(window.locator(".auto-setup-dialog")).not.toBeVisible();
  });
});
