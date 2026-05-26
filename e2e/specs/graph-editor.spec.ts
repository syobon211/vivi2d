import { expect, test } from "../fixtures";
import { addParameter, addTrack, createClip } from "../helpers/operations";

async function setupTimeline(window: import("playwright").Page) {
  await addParameter(window, "Param X");
  await createClip(window);
  await addTrack(window, "Param X");
  await expect(window.locator(".tl-track-name", { hasText: "Param X" })).toBeVisible();
}

async function graphEditorButton(window: import("playwright").Page) {
  return window.getByTitle(/Switch to graph editor|グラフエディタに切替/);
}

async function dopeSheetButton(window: import("playwright").Page) {
  return window.getByTitle(/Switch to dope sheet|ドープシートに切替/);
}

test("クリップ未選択時はグラフエディタ切替ボタンが無効", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await addParameter(window, "Param X");

  await expect(await graphEditorButton(window)).toBeDisabled();
});

test("グラフエディタ切替ボタンが表示される", async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await setupTimeline(window);

  await expect(await graphEditorButton(window)).toBeVisible();
  await expect(await graphEditorButton(window)).toBeEnabled();
});

test("切替後にグラフエディタが表示される", async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await setupTimeline(window);

  await (await graphEditorButton(window)).click();
  await expect(window.locator(".graph-editor-container")).toBeVisible();
});

test("ドープシートに戻せる", async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await setupTimeline(window);

  await (await graphEditorButton(window)).click();
  await expect(window.locator(".graph-editor-container")).toBeVisible();

  await (await dopeSheetButton(window)).click();
  await expect(window.locator(".graph-editor-container")).not.toBeVisible();
});
