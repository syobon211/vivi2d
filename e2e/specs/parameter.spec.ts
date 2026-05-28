import { expect, test } from "../fixtures";
import { addParameter } from "../helpers/operations";

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("初期状態はパラメータなし", async ({ window }) => {
  await expect(window.getByText("パラメータなし")).toBeVisible();
});

test("パラメータを追加できる", async ({ window }) => {
  await addParameter(window, "角度 X");

  await expect(window.locator(".parameter-name", { hasText: "角度 X" })).toBeVisible();
  await expect(window.getByText("パラメータなし")).not.toBeVisible();
});

test("パラメータを削除できる", async ({ window }) => {
  await addParameter(window, "テスト");

  await window.locator("[title='パラメータを削除']").click();
  await expect(window.getByText("パラメータなし")).toBeVisible();
});

test("パラメータ追加フォームを取り消せる", async ({ window }) => {
  await window.getByText("+ 追加").click();
  await expect(window.locator(".param-add-form")).toBeVisible();

  await window.getByText("キャンセル").click();
  await expect(window.locator(".param-add-form")).not.toBeVisible();
});

test("2つのパラメータを結合して2Dスライダーを表示できる", async ({ window }) => {
  await addParameter(window, "角度X");
  await addParameter(window, "角度Y");

  const pairBtns = window.locator("[title='パラメータを結合']");
  await pairBtns.first().click();

  await window.locator(".param-pair-option", { hasText: "角度Y" }).click();

  await expect(window.locator(".parameter-2d-pad")).toBeVisible();
  await expect(window.getByText("角度X / 角度Y")).toBeVisible();
});

test("結合を解除すると1Dスライダーに戻る", async ({ window }) => {
  await addParameter(window, "角度X");
  await addParameter(window, "角度Y");

  await window.locator("[title='パラメータを結合']").first().click();
  await window.locator(".param-pair-option", { hasText: "角度Y" }).click();
  await expect(window.locator(".parameter-2d-pad")).toBeVisible();

  await window.locator("[title='結合を解除']").click();

  await expect(window.locator(".parameter-2d-pad")).not.toBeVisible();
  await expect(window.locator(".parameter-slider")).toHaveCount(2);
});
