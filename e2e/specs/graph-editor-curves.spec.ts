import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { addParameter, addTrack, createClip } from "../helpers/operations";

async function setupTimeline(window: Page) {
  await addParameter(window, "Param X");
  await createClip(window);
  await addTrack(window, "Param X");
  await expect(window.locator(".tl-track-name", { hasText: "Param X" })).toBeVisible();
}

async function addTwoKeyframes(window: Page) {
  const addKeyframeButton = window.locator(".tl-kf-btn").first();
  await addKeyframeButton.click();
  await expect(window.locator(".tl-keyframe")).toHaveCount(1);

  const trackContent = window.locator(".tl-track-content").first();
  const box = await trackContent.boundingBox();
  expect(box).toBeTruthy();
  await trackContent.click({
    position: { x: box!.width * 0.9, y: box!.height / 2 },
  });

  await addKeyframeButton.click();
  await expect(window.locator(".tl-keyframe")).toHaveCount(2);
}

async function addThreeKeyframes(window: Page) {
  const addKeyframeButton = window.locator(".tl-kf-btn").first();
  await addKeyframeButton.click();
  await expect(window.locator(".tl-keyframe")).toHaveCount(1);

  const trackContent = window.locator(".tl-track-content").first();
  const box = await trackContent.boundingBox();
  expect(box).toBeTruthy();

  await trackContent.click({
    position: { x: box!.width * 0.5, y: box!.height / 2 },
  });
  await addKeyframeButton.click();
  await expect(window.locator(".tl-keyframe")).toHaveCount(2);

  await trackContent.click({
    position: { x: box!.width * 0.9, y: box!.height / 2 },
  });
  await addKeyframeButton.click();
  await expect(window.locator(".tl-keyframe")).toHaveCount(3);
}

async function switchToGraphEditor(window: Page) {
  await window.getByTitle(/Switch to graph editor|グラフエディタに切替/).click();
  await expect(window.locator(".graph-editor-container")).toBeVisible();
}

async function setInterpolationType(window: Page, type: string) {
  await window.evaluate((interpType) => {
    const vivi = window.__vivi2d as any;
    const editorStore = vivi.useEditorStore as any;
    const clipStore = vivi.useClipStore as any;
    const project = editorStore.getState().project;
    const clip = project?.clips?.[0] ?? project?.scenes?.[0]?.clips?.[0];
    if (!clip?.tracks || clip.tracks.length === 0) return;

    const track = clip.tracks[0];
    if (!track.keyframes || track.keyframes.length === 0) return;

    const frame = track.keyframes[0].frame;
    clipStore
      .getState()
      .updateKeyframe(clip.id, track.parameterId, frame, { interpolation: interpType });
  }, type);
}

async function getFirstTrackInterpolation(window: Page) {
  return window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const editorStore = vivi.useEditorStore as any;
    const project = editorStore.getState().project;
    const clip = project?.clips?.[0] ?? project?.scenes?.[0]?.clips?.[0];
    if (!clip?.tracks || clip.tracks.length === 0) return null;
    return clip.tracks[0].keyframes?.[0]?.interpolation ?? null;
  });
}

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("renders a straight graph curve for linear interpolation", async ({ window }) => {
  await setupTimeline(window);
  await addTwoKeyframes(window);
  await setInterpolationType(window, "linear");
  await switchToGraphEditor(window);

  const paths = window.locator(".graph-editor-container path");
  expect(await paths.count()).toBeGreaterThanOrEqual(1);
  expect(await paths.first().getAttribute("d")).toBeTruthy();
  expect(await getFirstTrackInterpolation(window)).toBe("linear");
});

test("renders step interpolation with line segments", async ({ window }) => {
  await setupTimeline(window);
  await addTwoKeyframes(window);
  await setInterpolationType(window, "step");
  await switchToGraphEditor(window);

  const path = window.locator(".graph-editor-container path").first();
  const pathD = await path.getAttribute("d");
  expect(pathD).toBeTruthy();
  expect(pathD!.match(/L /g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  expect(await getFirstTrackInterpolation(window)).toBe("step");
});

test("renders bezier interpolation with cubic commands", async ({ window }) => {
  await setupTimeline(window);
  await addTwoKeyframes(window);
  await setInterpolationType(window, "bezier");
  await switchToGraphEditor(window);

  const path = window.locator(".graph-editor-container path").first();
  const pathD = await path.getAttribute("d");
  expect(pathD).toBeTruthy();
  expect(pathD).toContain("C ");
  expect(await getFirstTrackInterpolation(window)).toBe("bezier");
});

test("updates the graph path when interpolation changes", async ({ window }) => {
  await setupTimeline(window);
  await addTwoKeyframes(window);
  await switchToGraphEditor(window);

  await setInterpolationType(window, "linear");
  await window.waitForTimeout(300);
  const path = window.locator(".graph-editor-container path").first();
  const linearPath = await path.getAttribute("d");
  expect(linearPath).toBeTruthy();

  await setInterpolationType(window, "bezier");
  await window.waitForTimeout(300);
  const bezierPath = await path.getAttribute("d");
  expect(bezierPath).toBeTruthy();
  expect(bezierPath).not.toBe(linearPath);
  expect(bezierPath).toContain("C ");
});

test("shows graph keyframe dots for three keyframes", async ({ window }) => {
  await setupTimeline(window);
  await addThreeKeyframes(window);
  await switchToGraphEditor(window);

  await expect(window.locator(".graph-keyframe-dot")).toHaveCount(3);
  const path = window.locator(".graph-editor-container path").first();
  const pathD = await path.getAttribute("d");
  expect(pathD).toBeTruthy();
  expect(pathD!.match(/M /g)).toHaveLength(1);
});
