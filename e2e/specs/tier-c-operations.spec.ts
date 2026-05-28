import { expect, test } from "../fixtures";
import {
  clickContextMenuItem,
  createSceneAndClip,
  rightClickLayer,
  selectLayer,
} from "../helpers/operations";

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

test("adds Art Path from the layer context menu", async ({ window }) => {
  await rightClickLayer(window, "Background");
  await clickContextMenuItem(window, "Art Path");
  await expect(async () => {
    const created = await window.evaluate(() => {
      const vivi = window.__vivi2d!;
      const project = (vivi.useEditorStore as any).getState().project;
      const flatten = (layers: any[]): any[] =>
        layers.flatMap((layer) => [
          layer,
          ...(layer.children ? flatten(layer.children) : []),
        ]);
      return flatten(project.layers).some((layer) => layer.kind === "artPath");
    });
    expect(created).toBe(true);
  }).toPass({ timeout: 5_000 });
});

test("shows Art Path properties when the created layer is selected", async ({
  window,
}) => {
  const artPathName = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    (vivi.useArtPathStore as any).getState().addArtPath("UI Art Path", 100, 100);
    const project = (vivi.useEditorStore as any).getState().project;
    const flatten = (layers: any[]): any[] =>
      layers.flatMap((layer) => [
        layer,
        ...(layer.children ? flatten(layer.children) : []),
      ]);
    const artPath = flatten(project.layers).find((layer) => layer.kind === "artPath");
    return artPath?.name ?? "UI Art Path";
  });

  await selectLayer(window, artPathName);
  await expect(window.locator(".artpath-color-input")).toBeVisible();
  await expect(window.locator(".artpath-props .ik-num-input").first()).toBeVisible();
});

test("adds an image sequence track after creating a scene and clip", async ({
  window,
}) => {
  await createSceneAndClip(window);

  const added = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const editorStore = vivi.useEditorStore as any;
    const clipStore = vivi.useClipStore as any;
    const project = editorStore.getState().project;
    const scene = project?.scenes?.[0];
    const clip = scene?.clips?.[0];
    const meshId = project?.layers?.[0]?.id;
    if (!clip || !meshId) return false;
    clipStore.getState().addImageSequenceTrack(clip.id, meshId);
    return true;
  });

  expect(added).toBe(true);
  const trackCount = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const project = (vivi.useEditorStore as any).getState().project;
    return project?.scenes?.[0]?.clips?.[0]?.imageSequenceTracks?.length ?? 0;
  });
  expect(trackCount).toBe(1);
});
