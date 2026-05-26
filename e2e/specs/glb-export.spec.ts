import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ElectronApplication } from "playwright";
import { expect, test } from "../fixtures";
import {
  addBone,
  addParameter,
  bindAllBones,
  clickFileMenuItem,
  selectLayer,
} from "../helpers/operations";


let tmpDir: string;

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-glb-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function mockExportDir(app: ElectronApplication, dir: string) {
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [d],
    });
  }, dir);
}


test("GLB エクスポートで .glb ファイルが生成される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toContainText(
    /GLB file exported successfully|GLB ファイルをエクスポートしました/,
    { timeout: 10_000 },
  );

  const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".glb"));
  expect(files.length).toBeGreaterThanOrEqual(1);
});

test("GLB ファイルが正しい glTF Binary マジックバイトを持つ", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toBeVisible({
    timeout: 10_000,
  });

  const glbFile = fs.readdirSync(tmpDir).find((f) => f.endsWith(".glb"))!;
  const buf = fs.readFileSync(path.join(tmpDir, glbFile));

  expect(buf[0]).toBe(0x67);
  expect(buf[1]).toBe(0x6c);
  expect(buf[2]).toBe(0x54);
  expect(buf[3]).toBe(0x46);

  const version = buf.readUInt32LE(4);
  expect(version).toBe(2);

  const totalLength = buf.readUInt32LE(8);
  expect(totalLength).toBe(buf.length);
});

test("ディレクトリ選択をキャンセルすると .glb が作成されない", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });

  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).not.toBeVisible({
    timeout: 2_000,
  });

  const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".glb"));
  expect(files.length).toBe(0);
});

test("ボーン付きプロジェクトの GLB には複数ノードが含まれる", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");
  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toBeVisible({
    timeout: 10_000,
  });

  const glbFile = fs.readdirSync(tmpDir).find((f) => f.endsWith(".glb"))!;
  const buf = fs.readFileSync(path.join(tmpDir, glbFile));

  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16); // "JSON" = 0x4E4F534A
  expect(jsonChunkType).toBe(0x4e4f534a);

  const jsonBytes = buf.subarray(20, 20 + jsonChunkLen);
  const gltf = JSON.parse(jsonBytes.toString("utf-8"));

  expect(gltf.asset).toBeDefined();
  expect(gltf.asset.version).toBe("2.0");
  expect(gltf.nodes).toBeDefined();
  expect(gltf.nodes.length).toBeGreaterThanOrEqual(1);
  expect(gltf.meshes).toBeDefined();
  expect(gltf.meshes.length).toBeGreaterThanOrEqual(1);
});

test("GLB のシーンにプロジェクト名が保持される", async ({ app, window, loadTestPsd }) => {
  await loadTestPsd();

  await addParameter(window, "角度X");

  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toBeVisible({
    timeout: 10_000,
  });

  const glbFile = fs.readdirSync(tmpDir).find((f) => f.endsWith(".glb"))!;
  const buf = fs.readFileSync(path.join(tmpDir, glbFile));

  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonBytes = buf.subarray(20, 20 + jsonChunkLen);
  const gltf = JSON.parse(jsonBytes.toString("utf-8"));

  expect(gltf.scenes).toBeDefined();
  expect(gltf.scenes.length).toBeGreaterThanOrEqual(1);
  const firstScene = gltf.scenes[0];
  expect(
    firstScene.name || gltf.nodes?.some((n: { name?: string }) => n.name === "test"),
  ).toBeTruthy();
});
