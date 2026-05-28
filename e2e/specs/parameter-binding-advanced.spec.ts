import { expect, test } from "../fixtures";
import {
  addBone,
  addParameter,
  selectLayer,
} from "../helpers/operations";


test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});


test("パラメータバインディングの追加と表示", async ({ window }) => {
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

  await expect(
    window.locator(".binding-point-count", { hasText: "(0点)" }),
  ).toBeVisible();
});


test("バインディングのバインディングポイント追加", async ({ window }) => {
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

  await expect(
    window.locator(".binding-point-count", { hasText: "(1点)" }),
  ).toBeVisible();

  await expect(window.locator(".binding-point-param").first()).toBeVisible();
  await expect(window.locator(".binding-point-value").first()).toBeVisible();
});


test("バインディングの削除", async ({ window }) => {
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

  await expect(
    window.locator(".binding-empty", { hasText: "バインディングなし" }).first(),
  ).toBeVisible();
});


test("複数パラメータのバインディング", async ({ window }) => {
  await addParameter(window, "角度X");
  await addParameter(window, "角度Y");

  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const addBindBtn = window.locator(".binding-section .prop-btn", {
    hasText: "+ バインド追加",
  });
  await addBindBtn.first().click();
  await window.locator(".binding-param-option", { hasText: "角度X" }).click();
  await expect(window.locator(".binding-param-name", { hasText: "角度X" })).toBeVisible();

  await addBindBtn.first().click();
  await window.locator(".binding-param-option", { hasText: "角度Y" }).click();
  await expect(window.locator(".binding-param-name", { hasText: "角度Y" })).toBeVisible();

  await expect(window.locator(".binding-item")).toHaveCount(2);
});


test("バインディング後の値変更でメッシュが変形する", async ({ window }) => {
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

  const slider = window.locator(".parameter-slider").first();
  await expect(slider).toBeVisible();
  const box = await slider.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  await slider.click({ position: { x: box.width * 0.8, y: box.height / 2 } });

  const paramValue = await window.locator(".parameter-value").first().textContent();
  expect(paramValue).toBeTruthy();
  expect(paramValue).not.toBe("0.00");

  const bindingState = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project?.parameterBindings) return { hasBindings: false };
    return {
      hasBindings: project.parameterBindings.length > 0,
      bindingPointCount: project.parameterBindings[0]?.bindingPoints?.length ?? 0,
    };
  });
  expect(bindingState.hasBindings).toBe(true);
  expect(bindingState.bindingPointCount).toBeGreaterThanOrEqual(1);
});


test("公開プロファイルでは非公開の変形ターゲットへ切り替わらない", async ({
  window,
}) => {
  await addParameter(window, "テストバインド");

  await addBone(window, "Red Circle");
  await selectLayer(window, "ボーン");

  const addBindBtn = window.locator(".binding-section .prop-btn", {
    hasText: "+ バインド追加",
  });
  await addBindBtn.first().click();
  await window.locator(".binding-param-option", { hasText: "テストバインド" }).click();
  await expect(window.locator(".binding-item")).toBeVisible();

  const boneBindingCount = await window.locator(".binding-item").count();
  expect(boneBindingCount).toBe(1);

  await selectLayer(window, "Red Circle");
  await expect(
    window
      .locator(".properties-section")
      .filter({
        has: window.locator(".prop-section-title", { hasText: /^Blend Shapes$/ }),
      }),
  ).toHaveCount(0);

  const publicState = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const project = (v.useEditorStore as any).getState().project;
    const legacyDeformationKey = ["blend", "Shapes"].join("");
    return {
      hasLegacyDeformationField: project
        ? legacyDeformationKey in project
        : false,
      privateBindings: (project?.parameterBindings ?? []).filter(
        (binding: any) =>
          binding.target?.type !== "bone" && binding.target?.type !== "ikController",
      ).length,
    };
  });
  expect(publicState).toEqual({
    hasLegacyDeformationField: false,
    privateBindings: 0,
  });
});
