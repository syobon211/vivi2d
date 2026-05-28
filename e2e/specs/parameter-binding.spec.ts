import { expect, test } from "../fixtures";
import { addBone, addParameter, selectLayer } from "../helpers/operations";

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("ボーンプロパティにバインディングセクションが表示される", async ({ window }) => {
  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const bindingHeaders = window.locator(".binding-header");
  await expect(bindingHeaders.first()).toBeVisible();
});

test("パラメータバインディングを追加できる", async ({ window }) => {
  await addParameter(window, "角度X");

  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const addBindBtn = window.locator(".binding-section .prop-btn", {
    hasText: "+ バインド追加",
  });
  await addBindBtn.first().click();

  await window.locator(".binding-param-option", { hasText: "角度X" }).click();

  await expect(window.locator(".binding-item")).toBeVisible();
  await expect(window.locator(".binding-param-name", { hasText: "角度X" })).toBeVisible();
});

test("バインディングポイントを記録できる", async ({ window }) => {
  await addParameter(window, "角度X");
  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const addBindBtn = window.locator(".binding-section .prop-btn", {
    hasText: "+ バインド追加",
  });
  await addBindBtn.first().click();
  await window.locator(".binding-param-option", { hasText: "角度X" }).click();

  await window.locator(".binding-toggle").click();

  await window.locator(".binding-record-btn").click();

  await expect(window.locator(".binding-point-row")).toBeVisible();
});

test("バインディングを削除できる", async ({ window }) => {
  await addParameter(window, "角度X");
  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const addBindBtn = window.locator(".binding-section .prop-btn", {
    hasText: "+ バインド追加",
  });
  await addBindBtn.first().click();
  await window.locator(".binding-param-option", { hasText: "角度X" }).click();
  await expect(window.locator(".binding-item")).toBeVisible();

  await window.locator("[title='バインディング削除']").click();

  await expect(window.locator(".binding-item")).not.toBeVisible();
});
