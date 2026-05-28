import { expect, test } from "../fixtures";
import { addBone, bindAllBones, selectLayer } from "../helpers/operations";

async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

function boneLayers(window: import("playwright").Page) {
  return window.locator(".layer-item").filter({
    has: window.locator("[data-testid='layer-icon-bone']"),
  });
}

function bonePropertiesSection(window: import("playwright").Page) {
  return window
    .locator(".properties-section")
    .filter({ has: window.locator('.prop-slider[min="-180"]') })
    .first();
}

async function selectBoneLayer(window: import("playwright").Page, index: number) {
  const row = boneLayers(window).nth(index);
  await row.scrollIntoViewIfNeeded();
  const rowLabel = row.locator(".layer-name");
  if ((await rowLabel.count()) > 0) {
    await rowLabel.first().click();
  } else {
    await row.click();
  }
  await expect(row).toHaveAttribute("aria-selected", "true");
}

function skinPropertiesSection(window: import("playwright").Page) {
  return window
    .locator(".properties-section")
    .filter({ has: window.locator(".prop-bone-tag") })
    .first();
}

async function readFirstBone(window: import("playwright").Page) {
  return window.evaluate(() => {
    const v = window.__vivi2d;
    if (!v) return null;
    const store = (v as any).useEditorStore;
    const project = store.getState().project;
    if (!project) return null;

    const stack = [...project.layers];
    while (stack.length > 0) {
      const layer = stack.shift();
      if (!layer) break;
      if (layer.kind === "bone") {
        return layer;
      }
      if (layer.children?.length) stack.unshift(...layer.children);
    }
    return null;
  });
}

async function addChildBone(window: import("playwright").Page) {
  await boneLayers(window).first().click({ button: "right" });
  await expect(window.locator(".context-menu")).toBeVisible();
  await window.locator(".context-menu-item").first().click();
  await expect(async () => {
    expect(await boneLayers(window).count()).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 5_000 });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("adding a bone shows a bone overlay entry", async ({ window }) => {
  await addBone(window, "Red Circle");
  await expect(boneLayers(window).first()).toBeVisible();
  await expect(
    boneLayers(window).first().locator("[data-testid='layer-icon-bone']"),
  ).toBeVisible();
  await expect(window.locator(".canvas-container canvas")).toBeVisible();
});

test("selecting a bone shows bone properties", async ({ window }) => {
  await addBone(window, "Red Circle");
  await selectBoneLayer(window, 0);

  const boneSection = bonePropertiesSection(window);
  await expect(boneSection).toBeVisible();
  await expect(boneSection.locator('.prop-slider[min="-180"]')).toBeVisible();
  await expect(boneSection.locator('.prop-slider[max="200"]')).toBeVisible();
  expect(await boneSection.locator(".prop-slider").count()).toBeGreaterThanOrEqual(4);
});

test("changing bone angle updates project state", async ({ window }) => {
  await addBone(window, "Red Circle");
  await selectBoneLayer(window, 0);

  const angleSlider = bonePropertiesSection(window).locator('.prop-slider[min="-180"]');
  await expect(angleSlider).toBeVisible();
  expect(Number(await angleSlider.inputValue())).toBe(0);

  await angleSlider.fill("45");
  await angleSlider.dispatchEvent("input");

  const bone = await readFirstBone(window);
  expect(bone).toBeTruthy();
  expect(Math.round((((bone as any).bone.angle as number) * 180) / Math.PI)).toBe(45);
});

test("changing bone scale updates project state", async ({ window }) => {
  await addBone(window, "Red Circle");
  await selectBoneLayer(window, 0);

  const boneSection = bonePropertiesSection(window);
  const sliders = boneSection.locator(".prop-slider");
  expect(await sliders.count()).toBeGreaterThanOrEqual(4);

  const scaleXSlider = sliders.nth(2);
  expect(Number(await scaleXSlider.inputValue())).toBe(100);
  await scaleXSlider.fill("150");
  await scaleXSlider.dispatchEvent("input");

  const bone = await readFirstBone(window);
  expect(bone).toBeTruthy();
  expect(Math.round(((bone as any).bone.scaleX as number) * 100)).toBe(150);
  expect(Math.round(((bone as any).bone.scaleY as number) * 100)).toBe(100);
});

test("changing bone length updates project state", async ({ window }) => {
  await addBone(window, "Red Circle");
  await selectBoneLayer(window, 0);

  const lengthSlider = bonePropertiesSection(window).locator('.prop-slider[max="200"]');
  await expect(lengthSlider).toBeVisible();
  expect(Number(await lengthSlider.inputValue())).toBe(50);

  await lengthSlider.fill("120");
  await lengthSlider.dispatchEvent("input");

  const bone = await readFirstBone(window);
  expect(bone).toBeTruthy();
  expect(Math.round((bone as any).bone.length as number)).toBe(120);
});

test("adding a child bone from the context menu creates a parent-child chain", async ({
  window,
}) => {
  await addBone(window, "Red Circle");
  await addChildBone(window);

  const result = await window.evaluate(() => {
    const v = window.__vivi2d;
    if (!v) return null;
    const store = (v as any).useEditorStore;
    const project = store.getState().project;
    if (!project) return null;

    const bones: Array<{
      id: string;
      parentBoneId?: string;
    }> = [];
    const stack = [...project.layers];
    while (stack.length > 0) {
      const layer = stack.shift();
      if (!layer) break;
      if (layer.kind === "bone") {
        bones.push({ id: layer.id, parentBoneId: layer.parentBoneId });
      }
      if (layer.children?.length) stack.unshift(...layer.children);
    }
    return bones;
  });

  expect(result).toBeTruthy();
  expect(result!.length).toBeGreaterThanOrEqual(2);
  const parentBone = result!.find((bone) => !bone.parentBoneId);
  const childBone = result!.find((bone) => bone.parentBoneId);
  expect(parentBone).toBeTruthy();
  expect(childBone).toBeTruthy();
  expect(childBone!.parentBoneId).toBe(parentBone!.id);
});

test("binding all bones creates a skin for the selected ViviMesh", async ({ window }) => {
  await addBone(window, "Red Circle");
  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  const skinSection = skinPropertiesSection(window);
  await expect(skinSection).toBeVisible();
  await expect(window.locator(".prop-bone-tag").first()).toBeVisible();
  await expect(window.locator(".canvas-container canvas")).toBeVisible();

  const result = await window.evaluate(() => {
    const v = window.__vivi2d;
    if (!v) return null;
    const store = (v as any).useEditorStore;
    const project = store.getState().project;
    if (!project) return null;

    const mesh = project.layers.find((layer: any) => layer.name === "Red Circle");
    if (!mesh) return null;
    const skin = project.skins[mesh.id];
    if (!skin) return null;
    return {
      hasWeights: skin.weights.length > 0,
      boneCount: Object.keys(skin.bindPoseInverse).length,
    };
  });

  expect(result).toBeTruthy();
  expect(result!.hasWeights).toBe(true);
  expect(result!.boneCount).toBeGreaterThanOrEqual(1);
});

test("selecting a child bone still shows bone properties", async ({ window }) => {
  await addBone(window, "Red Circle");
  await addChildBone(window);
  await selectBoneLayer(window, 1);

  const boneSection = bonePropertiesSection(window);
  await expect(boneSection).toBeVisible();
  await expect(boneSection.locator('.prop-slider[min="-180"]')).toBeVisible();
  await expect(boneSection.locator('.prop-slider[max="200"]')).toBeVisible();
});

test("binding after adding a child bone includes both bones in the skin", async ({
  window,
}) => {
  await addBone(window, "Red Circle");
  await addChildBone(window);
  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  const skinSection = skinPropertiesSection(window);
  await expect(skinSection).toBeVisible();
  await expect(window.locator(".prop-bone-tag").first()).toBeVisible();

  const result = await window.evaluate(() => {
    const v = window.__vivi2d;
    if (!v) return null;
    const store = (v as any).useEditorStore;
    const project = store.getState().project;
    if (!project) return null;

    const mesh = project.layers.find((layer: any) => layer.name === "Red Circle");
    if (!mesh) return null;
    const skin = project.skins[mesh.id];
    if (!skin) return null;
    return {
      hasWeights: skin.weights.length > 0,
      boneCount: Object.keys(skin.bindPoseInverse).length,
    };
  });

  expect(result).toBeTruthy();
  expect(result!.hasWeights).toBe(true);
  expect(result!.boneCount).toBeGreaterThanOrEqual(2);
});
