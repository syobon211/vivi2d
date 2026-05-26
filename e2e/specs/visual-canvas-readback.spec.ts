import { Buffer } from "node:buffer";
import type { Page } from "playwright";
import { expect, test } from "../fixtures";
import { waitForAppReady } from "../helpers/app";

const E2E_CANVAS_READBACK_STORAGE_KEY = "vivi2d-e2e-canvas-readback";

async function waitForVivi2D(window: Page): Promise<void> {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function waitForStableFrame(window: Page): Promise<void> {
  await window.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function setTheme(window: Page, theme: "light" | "dark"): Promise<void> {
  await waitForVivi2D(window);
  await window.evaluate((nextTheme) => {
    const store = (window as any).__vivi2d.useThemeStore.getState();
    if (store.theme !== nextTheme) store.setTheme(nextTheme);
  }, theme);
  await waitForStableFrame(window);
  await waitForStableFrame(window);
}

async function readCanvasPng(window: Page): Promise<Buffer> {
  await waitForAppReady(window);
  await window.evaluate(() => {
    (
      window.__vivi2d as { forceEditorCanvasRender?: () => void } | undefined
    )?.forceEditorCanvasRender?.();
  });
  await waitForStableFrame(window);
  await waitForStableFrame(window);

  const canvasState = await window.evaluate(() => {
    const canvas = document.querySelector(
      ".canvas-container canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return null;
    return {
      width: canvas.width,
      height: canvas.height,
      pngBase64: canvas.toDataURL("image/png").split(",")[1] ?? null,
    };
  });

  expect(canvasState).not.toBeNull();
  expect(canvasState?.width ?? 0).toBeGreaterThan(0);
  expect(canvasState?.height ?? 0).toBeGreaterThan(0);
  expect(canvasState?.pngBase64).toBeTruthy();

  return Buffer.from(canvasState!.pngBase64!, "base64");
}

test.describe("canvas readback snapshots", () => {
  test.beforeEach(async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await window.evaluate(() => {
      try {
        localStorage.clear();
        localStorage.setItem("vivi2d-theme", "dark");
        localStorage.setItem("vivi2d-locale", "ja");
        localStorage.setItem(E2E_CANVAS_READBACK_STORAGE_KEY, "1");
      } catch {
        /* noop */
      }
    });
    await window.reload();
    await waitForAppReady(window);
    await setTheme(window, "dark");
  });

  test("initial launch canvas readback", async ({ window }) => {
    const png = await readCanvasPng(window);
    expect(png).toMatchSnapshot("canvas-readback-initial-dark.png");
  });

  test("initial launch canvas readback in light theme", async ({ window }) => {
    await setTheme(window, "light");
    const png = await readCanvasPng(window);
    expect(png).toMatchSnapshot("canvas-readback-initial-light.png");
  });

  test("canvas readback after character PSD load", async ({
    window,
    loadCharacterPsd,
  }) => {
    await loadCharacterPsd();
    await waitForStableFrame(window);
    await waitForStableFrame(window);
    const png = await readCanvasPng(window);
    expect(png).toMatchSnapshot("canvas-readback-after-psd-load-dark.png");
  });
});
