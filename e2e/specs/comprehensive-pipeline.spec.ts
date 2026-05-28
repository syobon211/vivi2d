import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import {
  addBone,
  addParameter,
  bindAllBones,
  clickFileMenuItem,
  createSceneAndClip,
  selectLayer,
} from "../helpers/operations";


let tmpDir: string;

test.beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-pipeline-"));
});

test.afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("PSDロード→ボーン/パラメータ/シーン作成→保存→再読込で状態が復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  await selectLayer(window, "Red Circle");
  await addBone(window, "Red Circle");
  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await addParameter(window, "AngleX");

  await createSceneAndClip(window);

  const savePath = path.join(tmpDir, "pipeline.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "保存");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 5_000 });

  await clickFileMenuItem(window, "閉じる");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "開く");

  await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
  await expect(window.getByText("Red Circle")).toBeVisible();
  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();
  await expect(window.locator(".parameter-name", { hasText: "AngleX" })).toBeVisible();

  await window.screenshot({
    path: path.join("e2e/screenshots", "comprehensive-pipeline-restored.png"),
    fullPage: true,
  });
});

test("連続 PSD ロード時に古い結果が新しい結果を上書きしない", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await expect(window.getByText("Background")).toBeVisible();

  await loadTestPsd();
  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});
