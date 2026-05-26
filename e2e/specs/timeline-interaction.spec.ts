import { expect, test } from "../fixtures";
import {
  addBone,
  addParameter,
  addTrack,
  createClip,
  createSceneAndClip,
} from "../helpers/operations";

const PLAY_BUTTON_LABEL = /^(Play|\u518d\u751f)$/;
const PAUSE_BUTTON_LABEL = /^(Pause|\u4e00\u6642\u505c\u6b62)$/;
const STOP_BUTTON_LABEL = /^(Stop|\u505c\u6b62)$/;

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("play advances the current frame", async ({ window }) => {
  await createClip(window);

  await window.getByRole("button", { name: PLAY_BUTTON_LABEL }).click();
  await expect(window.getByRole("button", { name: PAUSE_BUTTON_LABEL })).toBeVisible();
  await window.waitForTimeout(500);
  await window.getByRole("button", { name: PAUSE_BUTTON_LABEL }).click();

  const frameText = await window.locator(".tl-frame-number").textContent();
  const currentFrame = Number.parseInt(frameText?.split("/")[0]?.trim() ?? "0", 10);
  expect(currentFrame).toBeGreaterThan(0);
});

test("stop resets the current frame to zero", async ({ window }) => {
  await createClip(window);

  await window.getByRole("button", { name: PLAY_BUTTON_LABEL }).click();
  await window.waitForTimeout(300);
  await window.getByRole("button", { name: STOP_BUTTON_LABEL }).click();

  await expect(window.locator(".tl-frame-number")).toHaveText(/^0\s*\//);
});

test("play stop can be repeated", async ({ window }) => {
  await createClip(window);

  for (let i = 0; i < 2; i += 1) {
    await window.getByRole("button", { name: PLAY_BUTTON_LABEL }).click();
    await expect(window.getByRole("button", { name: PAUSE_BUTTON_LABEL })).toBeVisible();
    await window.waitForTimeout(200);
    await window.getByRole("button", { name: STOP_BUTTON_LABEL }).click();
    await expect(window.locator(".tl-frame-number")).toHaveText(/^0\s*\//);
    await expect(window.getByRole("button", { name: PLAY_BUTTON_LABEL })).toBeVisible();
  }
});

test("clicking a track seeks the playhead", async ({ window }) => {
  await addParameter(window, "Param Track");
  await createClip(window);
  await addTrack(window, "Param Track");

  const trackContent = window.locator(".tl-track-content").first();
  await expect(trackContent).toBeVisible();

  const box = await trackContent.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  await trackContent.click({ position: { x: box.width * 0.5, y: box.height / 2 } });

  const frameText = await window.locator(".tl-frame-number").textContent();
  const currentFrame = Number.parseInt(frameText?.split("/")[0]?.trim() ?? "0", 10);
  expect(currentFrame).toBeGreaterThan(0);
});

test("frame display reflects clip duration changes", async ({ window }) => {
  await createClip(window);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const clipStore = v.useClipStore as any;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    const clip = project?.clips?.[0] ?? project?.scenes?.[0]?.clips?.[0];
    if (clip) {
      clipStore.getState().setClipDuration(clip.id, 120);
    }
  });

  await expect(window.locator(".tl-frame-number")).toHaveText(/\/\s*119/);
});

test("multiple track categories can coexist", async ({ window }) => {
  await addParameter(window, "Param A");
  await addBone(window, "Red Circle");
  await createSceneAndClip(window);

  await addTrack(window, "Param A");
  await expect(window.locator(".tl-track-name", { hasText: "Param A" })).toBeVisible();

  await addTrack(window, "Bone 1:Angle");
  await expect(window.locator(".tl-track-label-bone")).toBeVisible();

  const labels = window.locator(".tl-track-label");
  await expect(labels).toHaveCount(2);
});

test("add-track select remains usable after clip creation", async ({ window }) => {
  await addParameter(window, "Param Select");
  await createClip(window);

  const addTrackSelect = window.locator(".tl-add-track-select");
  await expect(addTrackSelect).toBeVisible();

  const options = addTrackSelect.locator("option");
  expect(await options.count()).toBeGreaterThan(1);
});
