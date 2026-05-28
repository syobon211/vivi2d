import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import {
  addBone,
  addParameter,
  addTrack,
  bindAllBones,
  clickFileMenuItem,
  createSceneAndClip,
  selectLayer,
} from "../helpers/operations";


let tmpDir: string;

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-saveload-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});


async function saveAndVerify(
  app: import("playwright").ElectronApplication,
  window: import("playwright").Page,
  savePath: string,
) {
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "保存");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function closeAndVerify(window: import("playwright").Page) {
  await clickFileMenuItem(window, "閉じる");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });
}

async function openAndVerify(
  app: import("playwright").ElectronApplication,
  window: import("playwright").Page,
  viviPath: string,
) {
  await mockOpenVivi(app, viviPath);
  await clickFileMenuItem(window, "開く");

  await expect(window.getByText("Background")).toBeVisible({
    timeout: 10_000,
  });
}


test("PSDインポート -> .vivi保存 -> 読み込みで状態が復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  const savePath = path.join(tmpDir, "roundtrip-full.vivi");
  await saveAndVerify(app, window, savePath);

  const content = fs.readFileSync(savePath, "utf-8");
  const data = JSON.parse(content);
  expect(data.version).toBeDefined();
  expect(data.project).toBeDefined();
  expect(data.project.layers.length).toBeGreaterThan(0);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("保存後にプロジェクト名がUIに反映される", async ({ app, window, loadTestPsd }) => {
  await loadTestPsd();

  await expect(window.locator(".project-name")).toHaveText("test");

  const savePath = path.join(tmpDir, "my-project.vivi");
  await saveAndVerify(app, window, savePath);

  await expect(window.locator(".project-name")).toHaveText("test");
});

test("保存キャンセル時にファイルが作成されない", async ({ app, window, loadTestPsd }) => {
  await loadTestPsd();

  const savePath = path.join(tmpDir, "should-not-exist.vivi");

  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({
      canceled: true,
      filePath: "",
    });
  });

  await clickFileMenuItem(window, "保存");

  expect(fs.existsSync(savePath)).toBe(false);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("パラメータ追加後の保存 -> 読み込みでパラメータが復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addParameter(window, "角度X");
  await addParameter(window, "開閉Y");

  await expect(window.locator(".parameter-name", { hasText: "角度X" })).toBeVisible();
  await expect(window.locator(".parameter-name", { hasText: "開閉Y" })).toBeVisible();

  const savePath = path.join(tmpDir, "param-roundtrip.vivi");
  await saveAndVerify(app, window, savePath);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.locator(".parameter-name", { hasText: "角度X" })).toBeVisible();
  await expect(window.locator(".parameter-name", { hasText: "開閉Y" })).toBeVisible();
});

test("ボーン+スキンバインド後の保存 -> 読み込みで復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");
  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();

  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  const skinSection = window.locator(".properties-section").filter({ hasText: "スキン" });
  await expect(skinSection.getByText("ボーン数")).toBeVisible();

  const savePath = path.join(tmpDir, "bone-skin-roundtrip.vivi");
  await saveAndVerify(app, window, savePath);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();

  await selectLayer(window, "Red Circle");
  const skinSectionAfter = window
    .locator(".properties-section")
    .filter({ hasText: "スキン" });
  await expect(skinSectionAfter.getByText("ボーン数")).toBeVisible();
});

test("キーフレームアニメーション後の保存 -> 読み込みで復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addParameter(window, "回転Z");

  await createSceneAndClip(window);

  await addTrack(window, "回転Z");
  await expect(window.locator(".tl-track-name", { hasText: "回転Z" })).toBeVisible();

  const addKfBtn = window.locator(".tl-kf-btn").first();
  await addKfBtn.click();

  await expect(window.locator(".tl-keyframe")).toBeVisible();

  const savePath = path.join(tmpDir, "anim-roundtrip.vivi");
  await saveAndVerify(app, window, savePath);

  const content = fs.readFileSync(savePath, "utf-8");
  const data = JSON.parse(content);
  expect(data.project.scenes.length).toBeGreaterThan(0);
  expect(data.project.scenes[0].clips.length).toBeGreaterThan(0);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.locator(".parameter-name", { hasText: "回転Z" })).toBeVisible();

  const restored = fs.readFileSync(savePath, "utf-8");
  const restoredData = JSON.parse(restored);
  const scenes = restoredData.project.scenes;
  expect(scenes.length).toBeGreaterThan(0);
  const clips = scenes[0].clips;
  expect(clips.length).toBeGreaterThan(0);
  const tracks = clips[0].tracks ?? [];
  expect(tracks.length).toBeGreaterThan(0);
  const keyframes = tracks[0].keyframes ?? [];
  expect(keyframes.length).toBeGreaterThan(0);

  const sceneSelect = window.locator(".tl-scene-select");
  const sceneOptions = sceneSelect.locator("option");
  const sceneOptionCount = await sceneOptions.count();
  expect(sceneOptionCount).toBeGreaterThan(0);

  const firstSceneValue = await sceneOptions.last().getAttribute("value");
  if (firstSceneValue) {
    await sceneSelect.selectOption(firstSceneValue);

    const clipSelect = window.locator(".tl-clip-select");
    await expect(clipSelect).toBeVisible();
    const clipOptions = clipSelect.locator("option");
    const lastClipValue = await clipOptions.last().getAttribute("value");
    if (lastClipValue) {
      await clipSelect.selectOption(lastClipValue);

      await expect(window.locator(".tl-track-name", { hasText: "回転Z" })).toBeVisible({
        timeout: 5_000,
      });

      await expect(window.locator(".tl-keyframe")).toBeVisible();
    }
  }
});

test(".vivb バイナリ形式で保存 -> 読み込みで状態が復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  await addParameter(window, "バイナリテスト");

  const savePath = path.join(tmpDir, "roundtrip.vivb");
  await saveAndVerify(app, window, savePath);

  const buf = fs.readFileSync(savePath);
  expect(buf[0]).toBe(0x56); // V
  expect(buf[1]).toBe(0x49); // I
  expect(buf[2]).toBe(0x56); // V
  expect(buf[3]).toBe(0x42); // B

  expect(buf[0]).not.toBe(0x7b);

  await closeAndVerify(window);

  await openAndVerify(app, window, savePath);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();

  await expect(
    window.locator(".parameter-name", { hasText: "バイナリテスト" }),
  ).toBeVisible();
});

test(".vivb は .vivi より小さいファイルサイズになる", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const viviPath = path.join(tmpDir, "compare.vivi");
  await saveAndVerify(app, window, viviPath);

  const vivbPath = path.join(tmpDir, "compare.vivb");
  await mockSaveDialog(app, vivbPath);
  await clickFileMenuItem(window, "別名で保存");
  await expect(async () => {
    expect(fs.existsSync(vivbPath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  const viviSize = fs.statSync(viviPath).size;
  const vivbSize = fs.statSync(vivbPath).size;

  expect(vivbSize).toBeLessThan(viviSize);
});

test("大きなプロジェクト(多レイヤー)でも保存/読み込みが正常", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");

  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await addParameter(window, "パラメータ1");
  await addParameter(window, "パラメータ2");
  await addParameter(window, "パラメータ3");
  await addParameter(window, "パラメータ4");
  await addParameter(window, "パラメータ5");

  await createSceneAndClip(window);

  await addTrack(window, "パラメータ1");
  await addTrack(window, "パラメータ2");
  await addTrack(window, "パラメータ3");

  const savePath = path.join(tmpDir, "large-project.vivi");
  const startTime = Date.now();
  await saveAndVerify(app, window, savePath);
  const saveTime = Date.now() - startTime;

  expect(saveTime).toBeLessThan(5_000);

  const stat = fs.statSync(savePath);
  expect(stat.size).toBeGreaterThan(0);

  await closeAndVerify(window);

  const loadStartTime = Date.now();
  await openAndVerify(app, window, savePath);
  const loadTime = Date.now() - loadStartTime;

  expect(loadTime).toBeLessThan(10_000);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ1" }),
  ).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ2" }),
  ).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ3" }),
  ).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ4" }),
  ).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "パラメータ5" }),
  ).toBeVisible();
});
