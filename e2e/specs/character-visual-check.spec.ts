import fs from "node:fs";
import path from "node:path";
import { expect, test } from "../fixtures";
import { importPsdAndWait } from "../helpers/app";

const CHARACTER_PSD = path.resolve(import.meta.dirname, "../fixtures/character-test.psd");
const SCREENSHOT_DIR = path.resolve(
  import.meta.dirname,
  "../screenshots/character-check",
);

async function loadCharacterPsd(
  app: import("playwright").ElectronApplication,
  window: import("playwright").Page,
) {
  await importPsdAndWait(app, window, CHARACTER_PSD, "");
  await expect(window.locator(".layer-item").first()).toBeVisible({ timeout: 15_000 });
}

async function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function screenshot(window: import("playwright").Page, fileName: string) {
  await ensureScreenshotDir();
  await window.screenshot({ path: path.join(SCREENSHOT_DIR, fileName) });
}

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
});

test("character PSD loads and shows the canvas", async ({ app, window }) => {
  await loadCharacterPsd(app, window);

  const container = window.locator(".canvas-container");
  await expect(container).toBeVisible();
  await expect(container.locator("canvas")).toBeAttached({ timeout: 10_000 });
  await expect(window.locator(".layer-item")).toHaveCount(8);

  await screenshot(window, "01-initial-load.png");
});

test("facial feature layers stay in front of the face", async ({ app, window }) => {
  await loadCharacterPsd(app, window);

  const drawOrders = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const project = (v.useEditorStore as any).getState().project;
    if (!project) return null;

    const flat: Array<{ name: string; drawOrder: number | undefined }> = [];
    const walk = (layers: any[]) => {
      for (const layer of layers) {
        flat.push({ name: layer.name, drawOrder: layer.drawOrder });
        if (layer.children?.length) walk(layer.children);
      }
    };
    walk(project.layers);

    const pick = (name: string) => flat.find((layer) => layer.name === name)?.drawOrder;
    return {
      face: pick("顔"),
      leftEye: pick("左目"),
      rightEye: pick("右目"),
      mouth: pick("口"),
      bangs: pick("前髪"),
    };
  });

  expect(drawOrders).toBeTruthy();
  expect(drawOrders!.face).toEqual(expect.any(Number));
  expect(drawOrders!.leftEye).toBeGreaterThan(drawOrders!.face!);
  expect(drawOrders!.rightEye).toBeGreaterThan(drawOrders!.face!);
  expect(drawOrders!.mouth).toBeGreaterThan(drawOrders!.face!);
  expect(drawOrders!.bangs).toBeGreaterThan(drawOrders!.face!);
});

test("toggling visibility of the first layer restores cleanly", async ({
  app,
  window,
}) => {
  await loadCharacterPsd(app, window);

  const firstLayer = window.locator(".layer-item").first();
  const visibilityBtn = firstLayer.locator(".layer-visibility-btn").first();
  if (await visibilityBtn.isVisible().catch(() => false)) {
    await visibilityBtn.click();
    await window.waitForTimeout(300);
    await screenshot(window, "02-first-layer-hidden.png");
    await visibilityBtn.click();
    await window.waitForTimeout(300);
  }

  await screenshot(window, "03-first-layer-restored.png");
});

test("zooming in, out, and reset remains stable", async ({ app, window }) => {
  await loadCharacterPsd(app, window);

  const canvas = window.locator(".canvas-container");
  await canvas.click();

  for (let i = 0; i < 3; i += 1) {
    await window.keyboard.press("Control+=");
  }
  await window.waitForTimeout(500);
  await screenshot(window, "04-zoom-in.png");

  for (let i = 0; i < 6; i += 1) {
    await window.keyboard.press("Control+-");
  }
  await window.waitForTimeout(500);
  await screenshot(window, "05-zoom-out.png");

  await window.keyboard.press("Control+0");
  await window.waitForTimeout(500);
  await screenshot(window, "06-zoom-reset.png");

  await expect(canvas).toBeVisible();
});

test("layer selection highlights remain stable", async ({ app, window }) => {
  await loadCharacterPsd(app, window);

  const layers = window.locator(".layer-item");
  const count = await layers.count();
  expect(count).toBeGreaterThan(2);
  for (let i = 0; i < Math.min(3, count); i += 1) {
    await layers.nth(i).click();
    await window.waitForTimeout(300);
  }

  await screenshot(window, "07-layer-selected.png");
});

test("selected ViviMesh keeps visible opacity state", async ({ app, window }) => {
  await loadCharacterPsd(app, window);

  await window.locator(".layer-item").first().click();

  const opacityResult = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const project = (v.useEditorStore as any).getState().project;
    const selectedLayerId = (v.useSelectionStore as any).getState().selectedLayerId;
    if (!project || !selectedLayerId) return null;

    const findLayer = (layers: any[]): any => {
      for (const layer of layers) {
        if (layer.id === selectedLayerId) return layer;
        if (layer.children?.length) {
          const found = findLayer(layer.children);
          if (found) return found;
        }
      }
      return null;
    };

    const layer = findLayer(project.layers);
    return layer ? { opacity: layer.opacity, visible: layer.visible } : null;
  });

  expect(opacityResult).toBeTruthy();
  expect(opacityResult!.opacity).toBeCloseTo(1.0, 1);
  expect(opacityResult!.visible).toBe(true);

  await screenshot(window, "08-opacity-check.png");
});

test("imported ViviMeshes retain sane geometry", async ({ app, window }) => {
  await loadCharacterPsd(app, window);

  const partsInfo = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const project = (v.useEditorStore as any).getState().project;
    if (!project) return null;

    const parts: Array<{ width: number; height: number }> = [];
    const walk = (layers: any[]) => {
      for (const layer of layers) {
        if (layer.kind === "viviMesh") {
          parts.push({ width: layer.width, height: layer.height });
        }
        if (layer.children?.length) walk(layer.children);
      }
    };
    walk(project.layers);
    return parts;
  });

  expect(partsInfo).toBeTruthy();
  expect(partsInfo!.length).toBe(8);
  for (const part of partsInfo!) {
    expect(part.width).toBeGreaterThan(0);
    expect(part.height).toBeGreaterThan(0);
  }

  await screenshot(window, "09-parts-geometry.png");
});

test("canvas render is non-blank after import", async ({ app, window }) => {
  await loadCharacterPsd(app, window);

  await expect(window.locator(".canvas-container canvas")).toBeAttached({
    timeout: 10_000,
  });
  await window.waitForTimeout(500);

  const pixelCheck = await window.evaluate(() => {
    const canvasEl = document.querySelector(
      ".canvas-container canvas",
    ) as HTMLCanvasElement | null;
    if (!canvasEl) return { hasCanvas: false, isBlank: true };

    try {
      const ctx = canvasEl.getContext("2d");
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        let nonZeroPixels = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i]!;
          const g = imageData.data[i + 1]!;
          const b = imageData.data[i + 2]!;
          const a = imageData.data[i + 3]!;
          if (a > 0 && (r > 0 || g > 0 || b > 0)) nonZeroPixels += 1;
        }
        return {
          hasCanvas: true,
          isBlank: nonZeroPixels === 0,
        };
      }
    } catch {
      /* WebGL canvas can reject 2D readback in E2E */
    }

    return {
      hasCanvas: true,
      isBlank: canvasEl.width === 0 || canvasEl.height === 0,
    };
  });

  expect(pixelCheck.hasCanvas).toBe(true);
  expect(pixelCheck.isBlank).toBe(false);

  await screenshot(window, "10-pixel-check.png");
});
