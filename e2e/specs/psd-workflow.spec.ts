import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";

test("PSD を読み込むとレイヤーツリーが表示される", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("PSD 読み込み後にプロジェクト名が表示される", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await expect(window.getByText("test")).toBeVisible();
});

test("PSD 読み込み後に保存ボタンが出現する", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await window.locator(".menu-dropdown-trigger", { hasText: /ファイル|File/ }).click();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: /保存|Save/ }).first(),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: /別名で保存|Save As/ }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-item", { hasText: /閉じる|Close/ }),
  ).toBeVisible();
  await window.keyboard.press("Escape");
});

test("レイヤーをクリックすると選択される", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  const bgLayer = await selectLayer(window, "Background");

  await expect(bgLayer).toHaveClass(/selected/);

  await expect(
    window.locator(".properties-form", { hasText: "Background" }),
  ).toBeVisible();
});

test("表示/非表示ボタンでレイヤーの可視性を切り替えられる", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const bgItem = window.locator(".layer-item", { hasText: "Background" });
  const visBtn = bgItem.locator(".layer-visibility-btn");
  await visBtn.click();

  await expect(bgItem).toHaveClass(/hidden-layer/);

  await visBtn.click();
  await expect(bgItem).not.toHaveClass(/hidden-layer/);
});

test("キャンバス情報にPSDのサイズが表示される", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await expect(window.getByText("64 x 64")).toBeVisible();
});
