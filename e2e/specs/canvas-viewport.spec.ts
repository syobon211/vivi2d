import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { clickViewMenuItem, selectLayer } from "../helpers/operations";

async function waitForVivi2D(window: Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function getViewportState(window: Page) {
  return window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const store = vivi?.useViewportStore;
    if (!store) {
      return null;
    }
    const state = store.getState();
    return {
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
    };
  });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("renders the canvas container and a visible canvas", async ({ window }) => {
  const container = window.locator(".canvas-container");
  await expect(container).toBeVisible();

  const canvas = container.locator("canvas");
  await expect(canvas).toBeVisible();

  const size = await canvas.evaluate((el) => ({
    width: el.clientWidth,
    height: el.clientHeight,
  }));
  expect(size.width).toBeGreaterThan(0);
  expect(size.height).toBeGreaterThan(0);
});

test("zooms in and out with the mouse wheel", async ({ window }) => {
  const canvas = window.locator(".canvas-container canvas");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();

  const initial = await getViewportState(window);
  expect(initial).toBeTruthy();

  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  await window.mouse.move(cx, cy);
  await window.mouse.wheel(0, -300);

  await expect
    .poll(async () => (await getViewportState(window))?.zoom ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(initial!.zoom);

  const zoomedIn = await getViewportState(window);
  await window.mouse.wheel(0, 600);

  await expect
    .poll(async () => (await getViewportState(window))?.zoom ?? 0, { timeout: 5_000 })
    .toBeLessThan(zoomedIn!.zoom);
});

test("pans the viewport with middle-mouse drag", async ({ window }) => {
  const canvas = window.locator(".canvas-container canvas");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();

  const before = await getViewportState(window);
  expect(before).toBeTruthy();

  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  await window.mouse.move(cx, cy);
  await window.mouse.down({ button: "middle" });
  await window.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await window.mouse.up({ button: "middle" });

  await expect
    .poll(async () => await getViewportState(window), { timeout: 5_000 })
    .not.toEqual(before);
});

test("resets the viewport from the View menu", async ({ window }) => {
  const canvas = window.locator(".canvas-container canvas");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();

  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  await window.mouse.move(cx, cy);
  await window.mouse.wheel(0, -500);
  await window.mouse.down({ button: "middle" });
  await window.mouse.move(cx + 80, cy + 40, { steps: 5 });
  await window.mouse.up({ button: "middle" });

  await expect
    .poll(async () => (await getViewportState(window))?.zoom ?? 0, { timeout: 5_000 })
    .not.toBe(1);

  await clickViewMenuItem(window, "Reset");

  await expect
    .poll(async () => await getViewportState(window), { timeout: 5_000 })
    .toEqual({ zoom: 1, panX: 0, panY: 0 });
});

test("keeps the canvas visible across viewport resize", async ({ window }) => {
  const canvas = window.locator(".canvas-container canvas");
  const initialSize = await canvas.evaluate((el) => ({
    width: el.clientWidth,
    height: el.clientHeight,
  }));

  await window.setViewportSize({ width: 1280, height: 720 });

  await expect(async () => {
    const resized = await canvas.evaluate((el) => ({
      width: el.clientWidth,
      height: el.clientHeight,
    }));
    expect(
      resized.width !== initialSize.width || resized.height !== initialSize.height,
    ).toBe(true);
  }).toPass({ timeout: 5_000 });

  await window.setViewportSize({ width: 1920, height: 1080 });
  await expect(canvas).toBeVisible();
});

test("selection updates the properties panel while the canvas stays visible", async ({
  window,
}) => {
  await selectLayer(window, "Red Circle");
  await expect(
    window.locator(".properties-form", { hasText: "Red Circle" }),
  ).toBeVisible();
  await expect(window.locator(".canvas-container canvas")).toBeVisible();

  await selectLayer(window, "Background");
  await expect(
    window.locator(".properties-form", { hasText: "Background" }),
  ).toBeVisible();
  await expect(window.locator(".canvas-container canvas")).toBeVisible();
});

test("editing draw order persists to project state", async ({ window }) => {
  await selectLayer(window, "Background");
  const drawOrderInput = window.locator('.prop-number-input[max="1000"]');
  await expect(drawOrderInput).toBeVisible();
  await drawOrderInput.fill("200");
  await drawOrderInput.press("Enter");
  await expect(drawOrderInput).toHaveValue("200");

  await selectLayer(window, "Red Circle");
  const drawOrderInput2 = window.locator('.prop-number-input[max="1000"]');
  await expect(drawOrderInput2).toBeVisible();
  await drawOrderInput2.fill("800");
  await drawOrderInput2.press("Enter");
  await expect(drawOrderInput2).toHaveValue("800");

  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const project = vivi?.useEditorStore?.getState().project;
    if (!project) return null;
    return project.layers.map((layer: any) => ({
      name: layer.name,
      drawOrder: layer.drawOrder,
    }));
  });

  expect(result).toBeTruthy();
  const background = result!.find((layer: any) => layer.name === "Background");
  const redCircle = result!.find((layer: any) => layer.name === "Red Circle");
  expect(background?.drawOrder).toBe(200);
  expect(redCircle?.drawOrder).toBe(800);
});
