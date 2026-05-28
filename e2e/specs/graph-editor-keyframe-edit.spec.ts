import { expect, test } from "../fixtures";
import { addParameter, addTrack, createClip } from "../helpers/operations";

async function setupGraphWithKeyframes(window: import("playwright").Page) {
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

  await window.getByTitle(/Switch to graph editor|グラフエディタに切替/).click();
  await expect(window.locator(".graph-editor-container")).toBeVisible();
  await expect(window.locator(".graph-keyframe-dot")).toHaveCount(2);
}

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("右クリックで値編集 popup が開く", async ({ window }) => {
  await setupGraphWithKeyframes(window);

  const dot = window.locator(".graph-keyframe-dot").first();
  await dot.click({ button: "right" });

  const popup = window.locator(".graph-keyframe-edit-popup");
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute("role", "dialog");
  await expect(popup.locator("input[type=number]")).toBeFocused();
});

test("Enter で値編集 popup が開く", async ({ window }) => {
  await setupGraphWithKeyframes(window);

  const dot = window.locator(".graph-keyframe-dot").first();
  await dot.focus();
  await window.keyboard.press("Enter");

  await expect(window.locator(".graph-keyframe-edit-popup")).toBeVisible();
});

test("Space で値編集 popup が開く", async ({ window }) => {
  await setupGraphWithKeyframes(window);

  const dot = window.locator(".graph-keyframe-dot").first();
  await dot.focus();
  await window.keyboard.press("Space");

  await expect(window.locator(".graph-keyframe-edit-popup")).toBeVisible();
});

test("popup で値を確定すると keyframe value が更新される", async ({ window }) => {
  await setupGraphWithKeyframes(window);

  await window.locator(".graph-keyframe-dot").first().click({ button: "right" });

  const input = window.locator(".graph-keyframe-edit-popup input[type=number]");
  await expect(input).toBeVisible();
  await input.fill("0.42");
  await input.press("Enter");

  await expect(window.locator(".graph-keyframe-edit-popup")).toHaveCount(0);

  const updatedValue = await window.evaluate(() => {
    const vivi2d = window.__vivi2d!;
    const editorStore = vivi2d.useEditorStore as any;
    const project = editorStore.getState().project;
    const clip = project?.clips?.[0] ?? project?.scenes?.[0]?.clips?.[0];
    return clip?.tracks?.[0]?.keyframes?.[0]?.value;
  });
  expect(updatedValue).toBeCloseTo(0.42, 2);
});

test("Escape で popup を閉じても値は変わらない", async ({ window }) => {
  await setupGraphWithKeyframes(window);

  const before = await window.evaluate(() => {
    const vivi2d = window.__vivi2d!;
    const editorStore = vivi2d.useEditorStore as any;
    const project = editorStore.getState().project;
    const clip = project?.clips?.[0] ?? project?.scenes?.[0]?.clips?.[0];
    return clip?.tracks?.[0]?.keyframes?.[0]?.value;
  });

  await window.locator(".graph-keyframe-dot").first().click({ button: "right" });
  const input = window.locator(".graph-keyframe-edit-popup input[type=number]");
  await input.fill("0.99");
  await window.keyboard.press("Escape");

  await expect(window.locator(".graph-keyframe-edit-popup")).toHaveCount(0);

  const after = await window.evaluate(() => {
    const vivi2d = window.__vivi2d!;
    const editorStore = vivi2d.useEditorStore as any;
    const project = editorStore.getState().project;
    const clip = project?.clips?.[0] ?? project?.scenes?.[0]?.clips?.[0];
    return clip?.tracks?.[0]?.keyframes?.[0]?.value;
  });
  expect(after).toBe(before);
});

test("popup を閉じたあと focus が keyframe に戻る", async ({ window }) => {
  await setupGraphWithKeyframes(window);

  const dot = window.locator(".graph-keyframe-dot").first();
  await dot.focus();
  await window.keyboard.press("Enter");
  await expect(window.locator(".graph-keyframe-edit-popup")).toBeVisible();

  await window.keyboard.press("Escape");
  await expect(window.locator(".graph-keyframe-edit-popup")).toHaveCount(0);

  await window.waitForFunction(
    () => document.activeElement?.classList.contains("graph-keyframe-dot"),
    {
      timeout: 2000,
    },
  );
});

test("a11y: keyframe dot が必要な属性を持つ", async ({ window }) => {
  await setupGraphWithKeyframes(window);

  const dot = window.locator(".graph-keyframe-dot").first();
  await expect(dot).toHaveAttribute("role", "button");
  await expect(dot).toHaveAttribute("tabindex", "0");
  await expect(dot).toHaveAttribute("aria-haspopup", "dialog");
  await expect(dot).toHaveAttribute("aria-keyshortcuts", "Enter Space");
  await expect(dot).toHaveAttribute("aria-label", /Keyframe|キーフレーム/);
});
