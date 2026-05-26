import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ElectronApplication, Page } from "playwright";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import { addParameter, clickFileMenuItem } from "../helpers/operations";


let tmpDir: string;

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-vivid-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});


async function fillExportDialogAndSubmit(
  window: Page,
  password: string,
  confirmPassword: string = password,
) {
  const dialog = window.locator(".vivid-dialog");
  await expect(dialog).toBeVisible();

  const pwFields = dialog.locator("input[type='password']");
  await expect(pwFields.nth(0)).toBeVisible();
  await expect(pwFields.nth(1)).toBeVisible();

  await pwFields.nth(0).fill(password);
  await pwFields.nth(1).fill(confirmPassword);

  await dialog.getByRole("button", { name: "エクスポート", exact: true }).click();
}

async function fillImportDialogAndSubmit(window: Page, password: string) {
  const dialog = window.locator(".vivid-dialog");
  await expect(dialog).toBeVisible();

  const pwField = dialog.locator("input[type='password']").first();
  await expect(pwField).toBeVisible();
  await pwField.fill(password);

  await dialog.getByRole("button", { name: "インポート", exact: true }).click();
}

async function exportVivid(
  app: ElectronApplication,
  window: Page,
  savePath: string,
  password: string,
  confirmPassword: string = password,
): Promise<void> {
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, ".vivid でエクスポート");
  await fillExportDialogAndSubmit(window, password, confirmPassword);

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function importVivid(
  app: ElectronApplication,
  window: Page,
  loadPath: string,
  password: string,
): Promise<void> {
  await mockOpenVivi(app, loadPath);
  await clickFileMenuItem(window, ".vivid をインポート");
  await fillImportDialogAndSubmit(window, password);
}


test(".vivid エクスポート → インポートでプロジェクトが復元される", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await addParameter(window, "暗号化マーカー");

  const vividPath = path.join(tmpDir, "roundtrip.vivid");
  await exportVivid(app, window, vividPath, "correctPass123");

  await expect(window.locator(".notification-info")).toContainText(
    ".vivid ファイルとしてエクスポートしました",
  );

  const buf = fs.readFileSync(vividPath);
  expect(buf.length).toBeGreaterThan(0);
  expect(buf[0]).toBe(0x56); // V
  expect(buf[1]).toBe(0x49); // I
  expect(buf[2]).toBe(0x56); // V
  expect(buf[3]).toBe(0x44); // D

  expect(() => JSON.parse(buf.toString("utf-8"))).toThrow();

  await window.keyboard.press("Escape");

  await importVivid(app, window, vividPath, "correctPass123");

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "暗号化マーカー" }),
  ).toBeVisible();
});

test(".vivid インポートで誤ったパスワードはエラー通知を表示する", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const vividPath = path.join(tmpDir, "wrong-password.vivid");
  await exportVivid(app, window, vividPath, "rightPassword");

  await expect(window.locator(".notification-info")).toBeVisible();
  await window.locator(".notification-close").first().click();

  await window.keyboard.press("Escape");

  await mockOpenVivi(app, vividPath);
  await clickFileMenuItem(window, ".vivid をインポート");
  await fillImportDialogAndSubmit(window, "wrongPassword");

  await expect(window.locator(".notification-error")).toContainText(
    /\.vivid\s*(\u30a4\u30f3\u30dd\u30fc\u30c8\u5931\u6557|\u30a4\u30f3\u30dd\u30fc\u30c8\u306b\u5931\u6557\u3057\u307e\u3057\u305f)/,
  );
});

test(".vivid エクスポート時に確認用パスワードが不一致だとダイアログ内エラー", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await clickFileMenuItem(window, ".vivid でエクスポート");

  const dialog = window.locator(".vivid-dialog");
  await expect(dialog).toBeVisible();

  const pwFields = dialog.locator("input[type='password']");
  await pwFields.nth(0).fill("hello");
  await pwFields.nth(1).fill("different");

  await dialog.getByRole("button", { name: "エクスポート", exact: true }).click();

  await expect(dialog.locator(".vivid-error")).toHaveText(
    "確認用パスワードが一致しません",
  );

  await expect(dialog).toBeVisible();
});

test(".vivid エクスポートダイアログはパスワードが空だとボタン無効", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await clickFileMenuItem(window, ".vivid でエクスポート");

  const dialog = window.locator(".vivid-dialog");
  await expect(dialog).toBeVisible();

  const submitBtn = dialog.getByRole("button", { name: "エクスポート", exact: true });
  await expect(submitBtn).toBeDisabled();

  const pwFields = dialog.locator("input[type='password']");
  await pwFields.nth(1).fill("only-confirm");
  await expect(submitBtn).toBeDisabled();

  await pwFields.nth(0).fill("realPass");
  await expect(submitBtn).toBeEnabled();

  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test(".vivid インポートダイアログはパスワードが空だとボタン無効", async ({ window }) => {
  await clickFileMenuItem(window, ".vivid をインポート");

  const dialog = window.locator(".vivid-dialog");
  await expect(dialog).toBeVisible();

  const submitBtn = dialog.getByRole("button", { name: "インポート", exact: true });
  await expect(submitBtn).toBeDisabled();

  const pwField = dialog.locator("input[type='password']").first();
  await pwField.fill("something");
  await expect(submitBtn).toBeEnabled();

  await pwField.fill("");
  await expect(submitBtn).toBeDisabled();

  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test(".vivid 特殊文字を含むパスワードでもラウンドトリップできる", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const pwd = "パス 🔐!@#$%^&*()_+-=[]{}|;:',.<>/?~`\"\\";

  const vividPath = path.join(tmpDir, "unicode-password.vivid");
  await exportVivid(app, window, vividPath, pwd);

  await expect(window.locator(".notification-info")).toBeVisible();
  await window.locator(".notification-close").first().click();
  await window.keyboard.press("Escape");

  await importVivid(app, window, vividPath, pwd);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test(".vivid ダイアログをキャンセルしたらファイルが作成されない", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const savePath = path.join(tmpDir, "should-not-exist.vivid");

  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: "" });
  });

  await clickFileMenuItem(window, ".vivid でエクスポート");
  await fillExportDialogAndSubmit(window, "abc123");

  expect(fs.existsSync(savePath)).toBe(false);

  await expect(window.getByText("Background")).toBeVisible();
});

test(".vivid エクスポートダイアログはキャンセルボタンで閉じる", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await clickFileMenuItem(window, ".vivid でエクスポート");
  const dialog = window.locator(".vivid-dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await expect(window.locator(".notification-info")).not.toBeVisible();
});

test(".vivid エクスポートは `.vivi` / `.vivb` と異なるマジックバイトを持つ", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const vividPath = path.join(tmpDir, "magic-check.vivid");
  await exportVivid(app, window, vividPath, "myKey");

  const buf = fs.readFileSync(vividPath);

  expect(buf[0]).not.toBe(0x7b);
  expect(buf[3]).toBe(0x44);
});
