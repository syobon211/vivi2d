import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import {
  addBone,
  bindAllBones,
  clickFileMenuItem,
  selectLayer,
} from "../helpers/operations";

let tmpDir: string;

test.beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-sdk-export-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function mockExportDir(app: import("playwright").ElectronApplication, dir: string) {
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [d],
    });
  }, dir);
}

async function openSdkExport(window: import("playwright").Page) {
  await clickFileMenuItem(window, "SDK Export");
  await expect(window.locator(".modal-overlay")).toBeVisible();
  await expect(window.locator(".modal-content")).toContainText(/Spine JSON|SDK Export/i);
}

test("shows the SDK export menu item when a project is loaded", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await clickFileMenuItem(window, "SDK Export");
  await expect(window.locator(".modal-overlay")).toBeVisible();
  await expect(window.locator(".modal-content")).toContainText(/Spine JSON|SDK Export/i);
});

test("opens the SDK export dialog", async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await openSdkExport(window);
});

test("lists output files in the export dialog", async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await openSdkExport(window);

  await expect(window.locator(".export-file-list")).toBeVisible();
  await expect(window.locator(".export-file-list")).toContainText("spine.json");
  await expect(window.locator(".export-file-list")).toContainText("texture_00.png");
});

test("exports Spine JSON and texture atlas files", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await openSdkExport(window);

  await mockExportDir(app, tmpDir);
  await window.locator(".modal-btn-primary").click();
  await expect(window.locator(".modal-overlay")).not.toBeVisible({ timeout: 10_000 });

  const files = fs.readdirSync(tmpDir);
  const jsonFile = files.find((file) => file.endsWith(".spine.json"));
  expect(jsonFile).toBeDefined();
  expect(files.some((file) => file.endsWith(".png"))).toBe(true);

  const json = JSON.parse(fs.readFileSync(path.join(tmpDir, jsonFile!), "utf-8"));
  expect(json.skeleton).toBeDefined();
  expect(json.bones?.[0]?.name).toBe("root");
  expect(Array.isArray(json.skins)).toBe(true);
});

test("includes bound bones in the exported Spine JSON", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await addBone(window, "Red Circle");
  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await openSdkExport(window);
  await mockExportDir(app, tmpDir);
  await window.locator(".modal-btn-primary").click();
  await expect(window.locator(".modal-overlay")).not.toBeVisible({ timeout: 10_000 });

  const jsonFile = fs.readdirSync(tmpDir).find((file) => file.endsWith(".spine.json"));
  expect(jsonFile).toBeDefined();

  const json = JSON.parse(fs.readFileSync(path.join(tmpDir, jsonFile!), "utf-8"));
  expect(Array.isArray(json.bones)).toBe(true);
  expect(json.bones.length).toBeGreaterThan(1);
});
