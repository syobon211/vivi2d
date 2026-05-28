import { expect, test } from "../fixtures";

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("リップシンクパネルが表示される", async ({ window }) => {
  await expect(window.getByText("リップシンク")).toBeVisible();
});

test("リップシンクの有効/無効を切り替えられる", async ({ window }) => {
  const toggle = window.locator(".lipsync-panel .physics-toggle input[type='checkbox']");

  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
});

test("初期状態は未接続", async ({ window }) => {
  await expect(window.getByText("未接続")).toBeVisible();
});

test("ソース選択をファイルに切り替えられる", async ({ window }) => {
  const sourceSelect = window
    .locator(".lipsync-field", { hasText: "ソース" })
    .locator(".lipsync-select");
  await sourceSelect.selectOption("file");
  await expect(sourceSelect).toHaveValue("file");
});

test("感度スライダーが操作可能", async ({ window }) => {
  const gainSlider = window
    .locator(".lipsync-field", { hasText: "感度" })
    .locator(".lipsync-slider");
  await expect(gainSlider).toBeVisible();

  const gainValue = window
    .locator(".lipsync-field", { hasText: "感度" })
    .locator(".lipsync-value");
  await expect(gainValue).toHaveText(/\d+\.\d/);
});


test("ターゲットパラメータを選択できる", async ({ window }) => {
  const { addParameter } = await import("../helpers/operations");
  await addParameter(window, "口開き");

  const targetSelect = window
    .locator(".lipsync-field", { hasText: /対象パラメータ|Target Parameter/ })
    .locator(".lipsync-select");
  await expect(targetSelect).toBeVisible();

  await expect(targetSelect).toHaveValue("");

  await targetSelect.selectOption({ label: "口開き" });
  await expect(targetSelect).not.toHaveValue("");
});

test("公開プロファイルでは非公開のリップシンクターゲットを表示しない", async ({
  window,
}) => {
  const targetBsSelect = window
    .locator(".lipsync-field", { hasText: /対象ブレンドシェイプ|Target Blend Shape/ })
    .locator(".lipsync-select");
  await expect(targetBsSelect).toHaveCount(0);
});


test("平滑化スライダーが操作可能", async ({ window }) => {
  const field = window.locator(".lipsync-field", { hasText: /スムージング|Smoothing/ });
  const slider = field.locator(".lipsync-slider");
  await expect(slider).toBeVisible();

  const valueText = field.locator(".lipsync-value");
  await expect(valueText).toHaveText(/\d+\.\d/);
});

test("閾値スライダーが操作可能", async ({ window }) => {
  const field = window.locator(".lipsync-field", { hasText: /閾値|Threshold|threshold/ });
  const slider = field.locator(".lipsync-slider");
  await expect(slider).toBeVisible();

  const valueText = field.locator(".lipsync-value");
  await expect(valueText).toHaveText(/\d+\.\d/);
});
