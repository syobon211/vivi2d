import { expect, test } from "../fixtures";
import { createScene } from "../helpers/operations";


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("シーンブレンドパネルが表示される", async ({ window }) => {
  const panel = window.locator(".scene-blend-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".panel-header")).toContainText(
    /シーンブレンド|Scene Blend/,
  );
});


test("シーンブレンドを作成できる", async ({ window }) => {
  await createScene(window);
  await createScene(window);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const blendStore = v.useSceneBlendStore as any;
    const project = store.getState().project;
    if (!project || project.scenes.length < 2) return;
    blendStore.getState().createSceneBlend(project.scenes[0].id, project.scenes[1].id);
  });

  await expect(window.locator(".scene-blend-item")).toBeVisible();
  await expect(window.locator(".scene-blend-label")).toContainText("→");
});


test("ブレンドモードを変更できる", async ({ window }) => {
  await createScene(window);
  await createScene(window);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const blendStore = v.useSceneBlendStore as any;
    const project = store.getState().project;
    if (!project || project.scenes.length < 2) return;
    blendStore.getState().createSceneBlend(project.scenes[0].id, project.scenes[1].id);
  });

  await expect(window.locator(".scene-blend-item")).toBeVisible();

  const modeSelect = window.locator(".scene-blend-controls select").first();
  await modeSelect.scrollIntoViewIfNeeded();
  await modeSelect.selectOption("additive");

  const mode = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.sceneBlends?.[0]?.mode;
  });
  expect(mode).toBe("additive");
});


test("遷移フレーム数を変更できる", async ({ window }) => {
  await createScene(window);
  await createScene(window);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const blendStore = v.useSceneBlendStore as any;
    const project = store.getState().project;
    if (!project || project.scenes.length < 2) return;
    blendStore.getState().createSceneBlend(project.scenes[0].id, project.scenes[1].id);
  });

  await expect(window.locator(".scene-blend-item")).toBeVisible();

  const framesInput = window.locator(".scene-blend-controls input[type='number']");
  await framesInput.scrollIntoViewIfNeeded();
  await framesInput.fill("60");

  const frames = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.sceneBlends?.[0]?.transitionFrames;
  });
  expect(frames).toBe(60);
});


test("シーンブレンドを削除できる", async ({ window }) => {
  await createScene(window);
  await createScene(window);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const blendStore = v.useSceneBlendStore as any;
    const project = store.getState().project;
    if (!project || project.scenes.length < 2) return;
    blendStore.getState().createSceneBlend(project.scenes[0].id, project.scenes[1].id);
  });

  await expect(window.locator(".scene-blend-item")).toBeVisible();

  const removeBtn = window.locator(".scene-blend-header .mesh-link-remove-btn").first();
  await removeBtn.scrollIntoViewIfNeeded();
  await removeBtn.click({ force: true });

  await expect(window.locator(".scene-blend-item")).not.toBeVisible();
});


test("イージングタイプを変更できる", async ({ window }) => {
  await createScene(window);
  await createScene(window);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const blendStore = v.useSceneBlendStore as any;
    const project = store.getState().project;
    if (!project || project.scenes.length < 2) return;
    blendStore.getState().createSceneBlend(project.scenes[0].id, project.scenes[1].id);
  });

  await expect(window.locator(".scene-blend-item")).toBeVisible();

  const easingSelect = window.locator(".scene-blend-controls select").last();
  await easingSelect.scrollIntoViewIfNeeded();
  await easingSelect.selectOption("bezier");

  const easing = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.sceneBlends?.[0]?.easing;
  });
  expect(easing).toBe("bezier");
});
