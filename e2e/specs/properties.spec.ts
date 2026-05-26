import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("レイヤー未選択時は案内メッセージ", async ({ window }) => {
  await expect(window.getByText("レイヤーを選択してください")).toBeVisible();
});

test("レイヤー選択でプロパティが表示される", async ({ window }) => {
  await selectLayer(window, "Background");

  await expect(
    window.locator(".properties-form", { hasText: "Background" }),
  ).toBeVisible();
  await expect(window.locator(".properties-form", { hasText: "ViviMesh" })).toBeVisible();
});

test("不透明度スライダーが操作可能", async ({ window }) => {
  await selectLayer(window, "Background");
  await expect(
    window.locator(".properties-form", { hasText: "Background" }),
  ).toBeVisible();

  const opacitySlider = window.locator(".prop-slider").first();
  await expect(opacitySlider).toBeVisible();

  await expect(window.locator(".prop-field-sm")).toHaveText(/%$/);
});

test("キャンバスサイズが表示される", async ({ window }) => {
  await expect(window.getByText("64 x 64")).toBeVisible();
});

test("ズーム率が表示される", async ({ window }) => {
  const zoomSection = window.locator(".properties-section", { hasText: "ズーム" });
  await expect(zoomSection).toBeVisible();
  await expect(zoomSection).toContainText(/%/);
});
