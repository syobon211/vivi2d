import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockSaveDialog } from "../helpers/dialog-mock";
import { clickViewMenuItem } from "../helpers/operations";

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("shows the canvas container", async ({ window }) => {
  await expect(window.locator(".canvas-container")).toBeVisible();
});

test("reset view keeps the zoom section visible", async ({ window }) => {
  const zoomSection = window.locator(".properties-panel .properties-section", {
    hasText: /Zoom|ズーム/,
  });
  await expect(zoomSection).toBeVisible();

  await clickViewMenuItem(window, "Reset");

  await expect(zoomSection).toContainText(/%/);
});

test("Ctrl+S saves the project through the shortcut", async ({ app, window }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-viewport-"));
  const savePath = path.join(tmpDir, "shortcut-test.vivi");

  await mockSaveDialog(app, savePath);
  await window.locator(".app").click();
  await window.keyboard.press("Control+s");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 5_000 });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
