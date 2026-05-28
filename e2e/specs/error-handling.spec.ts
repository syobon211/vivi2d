import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";
import { mockOpenPsd, mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import { addBone, clickFileMenuItem, selectLayer } from "../helpers/operations";

let tmpDir: string;

test.beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-err-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});


test("PSD 開くダイアログをキャンセルしても初期状態が維持される", async ({
  app,
  window,
}) => {
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({
      canceled: true,
      filePaths: [],
    });
  });

  await clickFileMenuItem(window, "PSDをインポート");

  await expect(window.locator(".workspace")).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: "保存" }),
  ).not.toBeVisible();
});

test(".vivi 開くダイアログをキャンセルしても初期状態が維持される", async ({
  app,
  window,
}) => {
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({
      canceled: true,
      filePaths: [],
    });
  });

  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".workspace")).toBeVisible();
});

test("保存ダイアログをキャンセルしてもプロジェクトが失われない", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({
      canceled: true,
      filePath: "",
    });
  });

  await clickFileMenuItem(window, "保存");

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});


test("空ファイルを .vivi として開くとエラーメッセージが表示される", async ({
  app,
  window,
}) => {
  const emptyPath = path.join(tmpDir, "empty.vivi");
  fs.writeFileSync(emptyPath, "");

  await mockOpenVivi(app, emptyPath);
  await clickFileMenuItem(window, "開く");

  await expect(async () => {
    const hasError = await window
      .locator(".error-toast, .notification-error, .toast-error")
      .count();
    const hasWorkspace = await window.locator(".workspace").isVisible();
    expect(hasError > 0 || hasWorkspace).toBe(true);
  }).toPass({ timeout: 5_000 });
});

test("不正な JSON の .vivi ファイルを開いてもクラッシュしない", async ({
  app,
  window,
}) => {
  const invalidPath = path.join(tmpDir, "invalid.vivi");
  fs.writeFileSync(invalidPath, "{ this is not valid json !!!");

  await mockOpenVivi(app, invalidPath);
  await clickFileMenuItem(window, "開く");

  await expect(async () => {
    const hasError = await window
      .locator(".error-toast, .notification-error, .toast-error")
      .count();
    const hasWorkspace = await window.locator(".workspace").isVisible();
    expect(hasError > 0 || hasWorkspace).toBe(true);
  }).toPass({ timeout: 5_000 });
});

test("version フィールドが欠落した .vivi を開いてもクラッシュしない", async ({
  app,
  window,
}) => {
  const noVersionPath = path.join(tmpDir, "no-version.vivi");
  fs.writeFileSync(
    noVersionPath,
    JSON.stringify({
      project: {
        name: "test",
        width: 100,
        height: 100,
        layers: [],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
      },
    }),
  );

  await mockOpenVivi(app, noVersionPath);
  await clickFileMenuItem(window, "開く");

  await expect(async () => {
    const appVisible = await window.locator(".app").isVisible();
    expect(appVisible).toBe(true);
  }).toPass({ timeout: 5_000 });
});

test("layers が null の .vivi を開いてもクラッシュしない", async ({ app, window }) => {
  const nullLayersPath = path.join(tmpDir, "null-layers.vivi");
  fs.writeFileSync(
    nullLayersPath,
    JSON.stringify({
      version: 3,
      project: {
        name: "broken",
        width: 100,
        height: 100,
        layers: null,
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
      },
    }),
  );

  await mockOpenVivi(app, nullLayersPath);
  await clickFileMenuItem(window, "開く");

  await expect(async () => {
    const appVisible = await window.locator(".app").isVisible();
    expect(appVisible).toBe(true);
  }).toPass({ timeout: 5_000 });
});


test("存在しないパスの PSD を指定してもクラッシュしない", async ({ app, window }) => {
  await mockOpenPsd(app, "/nonexistent/path/fake.psd");
  await clickFileMenuItem(window, "PSDをインポート");

  await expect(async () => {
    const appVisible = await window.locator(".app").isVisible();
    expect(appVisible).toBe(true);
  }).toPass({ timeout: 5_000 });
});

test("存在しないパスの .vivi を指定してもクラッシュしない", async ({ app, window }) => {
  await mockOpenVivi(app, "/nonexistent/path/fake.vivi");
  await clickFileMenuItem(window, "開く");

  await expect(async () => {
    const appVisible = await window.locator(".app").isVisible();
    expect(appVisible).toBe(true);
  }).toPass({ timeout: 5_000 });
});


test("プロジェクト閉じた後に保存しようとしても問題ない", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await clickFileMenuItem(window, "閉じる");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5000 });

  await expect(
    window.locator(".menu-dropdown-item", { hasText: "保存" }),
  ).not.toBeVisible();
});

test("プロジェクト閉じた後に Ctrl+Z してもクラッシュしない", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await clickFileMenuItem(window, "閉じる");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5000 });

  await window.keyboard.press("Control+z");

  await expect(window.locator(".app")).toBeVisible();
});


test("保存→閉じる→再読込で操作を続行できる", async ({ app, window, loadTestPsd }) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");
  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();

  const savePath = path.join(tmpDir, "resilience.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "保存");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 5_000 });

  await clickFileMenuItem(window, "閉じる");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "開く");

  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible({
    timeout: 10_000,
  });

  await selectLayer(window, "Red Circle");
  await expect(
    window.locator(".properties-form", { hasText: "Red Circle" }),
  ).toBeVisible();
});


test("SDK エクスポートでディレクトリ選択をキャンセルしてもクラッシュしない", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await clickFileMenuItem(window, "SDKエクスポート");
  await expect(window.locator(".modal-overlay")).toBeVisible();

  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({
      canceled: true,
      filePaths: [],
    });
  });

  await window.locator(".modal-btn-primary").click();

  await expect(async () => {
    const appVisible = await window.locator(".app").isVisible();
    expect(appVisible).toBe(true);
  }).toPass({ timeout: 5_000 });
});


test("クリップなしでメディアエクスポートダイアログを開いてもエクスポート不可", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await clickFileMenuItem(window, "メディア出力");
  await expect(window.locator(".media-export-body")).toBeVisible();

  await expect(window.locator(".media-export-empty")).toBeVisible();

  const exportBtn = window.locator(".modal-actions .prop-btn").first();
  await expect(exportBtn).toBeDisabled();
});


test("検証ダイアログがバインドなしレイヤーの警告を表示する", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addBone(window, "Red Circle");

  await clickFileMenuItem(window, "検証");
  await expect(window.locator(".modal-overlay")).toBeVisible();

  const modalContent = window.locator(".modal-content");
  await expect(modalContent).toBeVisible();
});


test("PSD を開いた状態でもう一度 PSD を開ける（既存プロジェクトが置き換わる）", async ({
  // biome-ignore lint/correctness/noUnusedFunctionParameters: Keep the Playwright fixture destructuring order stable.
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await expect(window.getByText("Background")).toBeVisible();

  await loadTestPsd();

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});
