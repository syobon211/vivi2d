import { expect, test } from "../fixtures";
import { addParameter, createClip, createScene } from "../helpers/operations";

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("creates a scene from the timeline header", async ({ window }) => {
  await createScene(window);

  const sceneSelect = window.locator(".tl-scene-select");
  await expect(sceneSelect).toBeVisible();
  await expect(sceneSelect).toHaveValue(/.+/);
  await expect(sceneSelect.locator("option")).toHaveCount(2);
});

test("duplicates the active scene", async ({ window }) => {
  await createScene(window);

  const sceneSelect = window.locator(".tl-scene-select");
  const optionCountBefore = await sceneSelect.locator("option").count();

  await window.getByTitle(/Duplicate scene|シーン複製/).click();

  await expect(sceneSelect.locator("option")).toHaveCount(optionCountBefore + 1);
  await expect(sceneSelect).toHaveValue(/.+/);
});

test("deletes the active scene", async ({ window }) => {
  await createScene(window);
  await expect(window.locator(".tl-scene-select")).toHaveValue(/.+/);

  await window.getByTitle(/Delete scene|シーン削除/).click();

  await expect(window.locator(".tl-scene-select")).toHaveValue("");
});

test("creates a clip inside the active scene", async ({ window }) => {
  await createScene(window);
  await createClip(window);

  await expect(window.locator(".tl-clip-select")).toHaveValue(/.+/);
});

test("keeps scene management usable after project edits", async ({ window }) => {
  await addParameter(window, "Scene X");
  await createScene(window);
  await createScene(window);
  await createClip(window);

  await expect(window.locator(".tl-scene-select")).toHaveValue(/.+/);
  await expect(window.locator(".tl-clip-select")).toHaveValue(/.+/);
});
