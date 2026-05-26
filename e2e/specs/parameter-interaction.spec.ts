import { expect, test } from "../fixtures";
import { addBone, addParameter, selectLayer } from "../helpers/operations";


test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});


test("パラメータスライダーをドラッグして値が変わる", async ({ window }) => {
  await addParameter(window, "テストスライダー");

  const slider = window.locator(".parameter-slider").first();
  await expect(slider).toBeVisible();

  const initialValue = await window.locator(".parameter-value").first().textContent();

  const box = await slider.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  await slider.click({ position: { x: box.width * 0.8, y: box.height / 2 } });

  const newValue = await window.locator(".parameter-value").first().textContent();
  expect(newValue).not.toBe(initialValue);
});

test("パラメータスライダーをクリックして値が設定される", async ({ window }) => {
  await addParameter(window, "クリックテスト");

  const slider = window.locator(".parameter-slider").first();
  await expect(slider).toBeVisible();

  const box = await slider.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  await slider.click({ position: { x: box.width * 0.5, y: box.height / 2 } });

  const value = await window.locator(".parameter-value").first().textContent();
  expect(value).toBeTruthy();
  expect(value).not.toBe("0.00");
});


test("パラメータのデフォルト値リセットボタン", async ({ window }) => {
  await addParameter(window, "リセットテスト");

  const slider = window.locator(".parameter-slider").first();
  const box = await slider.boundingBox();
  if (box) {
    await slider.click({ position: { x: box.width * 0.8, y: box.height / 2 } });
  }

  const changedValue = await window.locator(".parameter-value").first().textContent();
  expect(changedValue).not.toBe("0.00");

  const paramName = window.locator(".parameter-name", { hasText: "リセットテスト" });
  await paramName.dblclick();

  await expect(window.locator(".parameter-value").first()).toHaveText(/^0(\.\d+)?$/);
});


test("パラメータの最小値/最大値変更", async ({ window }) => {
  await addParameter(window, "範囲テスト");

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    editorStore.setState((s: any) => {
      if (!s.project?.parameters || s.project.parameters.length === 0) return;
      const param = s.project.parameters[0];
      param.minValue = -10;
      param.maxValue = 10;
    });
  });

  const slider = window.locator(".parameter-slider").first();
  await expect(slider).toHaveAttribute("min", "-10");
  await expect(slider).toHaveAttribute("max", "10");
});


test("パラメータのグループ設定", async ({ window }) => {
  await addParameter(window, "グループテスト");

  await window.locator("[title='グループ変更']").first().click();

  await expect(window.locator(".param-group-edit")).toBeVisible();

  const groupInput = window.locator(".param-group-edit input");
  await groupInput.fill("表情");

  await window.locator(".param-group-edit .param-action-btn").click();

  await expect(window.locator(".param-group-edit")).not.toBeVisible();
});


test("パラメータの削除", async ({ window }) => {
  await addParameter(window, "削除テスト");
  await expect(
    window.locator(".parameter-name", { hasText: "削除テスト" }),
  ).toBeVisible();

  await window.locator("[title='パラメータを削除']").click();

  await expect(
    window.locator(".parameter-name", { hasText: "削除テスト" }),
  ).not.toBeVisible();
  const parameterCount = await window.evaluate(() => {
    const vivi2d = window.__vivi2d!;
    const editorStore = vivi2d.useEditorStore as any;
    return editorStore.getState().project?.parameters?.length ?? 0;
  });
  expect(parameterCount).toBe(0);
});


test("パラメータバインディングの追加", async ({ window }) => {
  await addParameter(window, "バインドテスト");

  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const bindingHeaders = window.locator(".binding-header");
  await expect(bindingHeaders.first()).toBeVisible();

  const addBindBtn = window.locator(".binding-section .prop-btn", {
    hasText: "+ バインド追加",
  });
  await addBindBtn.first().click();

  await window.locator(".binding-param-option", { hasText: "バインドテスト" }).click();

  await expect(window.locator(".binding-item")).toBeVisible();
  await expect(
    window.locator(".binding-param-name", { hasText: "バインドテスト" }),
  ).toBeVisible();
});


test("2Dパラメータスライダーの表示", async ({ window }) => {
  await addParameter(window, "角度X");
  await addParameter(window, "角度Y");

  await expect(window.locator(".parameter-slider")).toHaveCount(2);

  const pairBtns = window.locator("[title='パラメータを結合']");
  await pairBtns.first().click();

  await window.locator(".param-pair-option", { hasText: "角度Y" }).click();

  await expect(window.locator(".parameter-2d-pad")).toBeVisible();
  await expect(window.getByText("角度X / 角度Y")).toBeVisible();

  await expect(window.locator(".parameter-slider")).toHaveCount(0);
});
