import { expect, test } from "../fixtures";
import { addParameter, addTrack, createClip } from "../helpers/operations";

async function setupTimelineWithKeyframes(window: import("playwright").Page) {
  await addParameter(window, "Param X");
  await createClip(window);
  await addTrack(window, "Param X");
  await expect(window.locator(".tl-track-name", { hasText: "Param X" })).toBeVisible();

  await window.locator(".tl-kf-btn").first().click();
  await expect(window.locator(".tl-keyframe")).toHaveCount(1);

  const trackContent = window.locator(".tl-track-content").first();
  const box = await trackContent.boundingBox();
  if (box) {
    await trackContent.click({
      position: { x: Math.max(12, box.width * 0.85), y: box.height / 2 },
    });
  }

  await window.locator(".tl-kf-btn").first().click();
  await expect(window.locator(".tl-keyframe")).toHaveCount(2);
}

async function switchToGraphEditor(window: import("playwright").Page) {
  await window.getByTitle(/Switch to graph editor|グラフエディタに切替/).click();
  await expect(window.locator(".graph-editor-container")).toBeVisible();
}

async function switchToDopeSheet(window: import("playwright").Page) {
  await window.getByTitle(/Switch to dope sheet|ドープシートに切替/).click();
  await expect(window.locator(".graph-editor-container")).not.toBeVisible();
}

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("グラフエディタでキーフレームが表示される", async ({ window }) => {
  await setupTimelineWithKeyframes(window);
  await switchToGraphEditor(window);
  await expect(window.locator(".graph-keyframe-dot")).toHaveCount(2);
});

test("トラック選択をグラフエディタでも切り替えられる", async ({ window }) => {
  await addParameter(window, "Param X");
  await addParameter(window, "Param Y");
  await createClip(window);
  await addTrack(window, "Param X");
  await addTrack(window, "Param Y");

  await switchToGraphEditor(window);

  const trackX = window.locator(".tl-track-label", { hasText: "Param X" });
  const trackY = window.locator(".tl-track-label", { hasText: "Param Y" });
  await trackX.click();
  await expect(trackX).toHaveClass(/tl-track-label-selected/);

  await trackY.click();
  await expect(trackY).toHaveClass(/tl-track-label-selected/);
  await expect(trackX).not.toHaveClass(/tl-track-label-selected/);
});

test("easing preset の適用結果が project state に反映される", async ({ window }) => {
  await setupTimelineWithKeyframes(window);

  const result = await window.evaluate(() => {
    const vivi2d = window.__vivi2d!;
    const clipStore = vivi2d.useClipStore as any;
    const editorStore = vivi2d.useEditorStore as any;
    const project = editorStore.getState().project;
    const clip = project?.clips?.[0] ?? project?.scenes?.[0]?.clips?.[0];
    if (!clip?.tracks?.length) return { ok: false };

    const track = clip.tracks[0];
    const frame = track.keyframes?.[0]?.frame;
    if (frame == null) return { ok: false };

    clipStore
      .getState()
      .applyEasingPreset(clip.id, track.parameterId, frame, "easeInOut");

    const updatedProject = editorStore.getState().project;
    const updatedClip =
      updatedProject?.clips?.[0] ?? updatedProject?.scenes?.[0]?.clips?.[0];
    const updatedTrack = updatedClip?.tracks?.find(
      (candidate: any) => candidate.parameterId === track.parameterId,
    );
    const updatedKeyframe = updatedTrack?.keyframes?.find(
      (candidate: any) => candidate.frame === frame,
    );

    return {
      ok: true,
      interpolation: updatedKeyframe?.interpolation,
    };
  });

  expect(result.ok).toBe(true);
  expect(result.interpolation).toBe("bezier");
});

test("グラフエディタとドープシートを行き来できる", async ({ window }) => {
  await addParameter(window, "Param X");
  await createClip(window);
  await addTrack(window, "Param X");

  await switchToGraphEditor(window);
  await expect(window.locator(".graph-editor-container")).toBeVisible();

  await switchToDopeSheet(window);
  await expect(window.locator(".tl-ruler")).toBeVisible();
});
