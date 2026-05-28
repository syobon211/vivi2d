import fs from "node:fs";
import path from "node:path";
import { expect, test } from "../fixtures";

const SCREENSHOT_DIR = path.resolve(
  import.meta.dirname,
  "../../test-screenshots/full-app",
);

async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function clickFirstLayer(window: import("playwright").Page) {
  const firstLayer = window.locator(".layer-item .layer-name").first();
  await expect(firstLayer).toBeVisible({ timeout: 10_000 });
  await firstLayer.click();
}

test.beforeAll(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
});

test("launch full-app screenshot", async ({ window }) => {
  await waitForVivi2D(window);
  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "01-launch.png"),
    fullPage: false,
  });

  await expect(window.locator(".menu-bar")).toBeVisible();
  await expect(window.locator(".workspace")).toBeVisible();
});

test("PSD-loaded full-app screenshot", async ({ window, loadCharacterPsd }) => {
  await loadCharacterPsd();
  await waitForVivi2D(window);
  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "02-psd-loaded.png"),
    fullPage: false,
  });

  await expect(window.locator(".layer-item").first()).toBeVisible();
});

test("properties-panel full-app screenshot", async ({ window, loadCharacterPsd }) => {
  await loadCharacterPsd();
  await waitForVivi2D(window);

  await clickFirstLayer(window);
  await expect(window.locator(".properties-form")).toBeVisible();

  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "03-properties-panel.png"),
    fullPage: false,
  });
});

test("parameter-panel full-app screenshot", async ({ window, loadCharacterPsd }) => {
  await loadCharacterPsd();
  await waitForVivi2D(window);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useParameterDefinitionStore as any;
    store.getState().addParameter("顔X", 0, 1, 0);
    store.getState().addParameter("首Y", -1, 1, 0);
  });

  await expect(window.locator(".parameter-name", { hasText: "顔X" })).toBeVisible({
    timeout: 3_000,
  });

  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "04-parameter-panel.png"),
    fullPage: false,
  });
});

test("English locale full-app screenshot", async ({ window, loadCharacterPsd }) => {
  await loadCharacterPsd();
  await waitForVivi2D(window);

  await window.locator(".menu-dropdown-trigger").nth(2).click();
  await expect(
    window.locator(".menu-dropdown-section", { hasText: /言語|Language/ }),
  ).toBeVisible();
  await window.locator(".menu-dropdown-item", { hasText: /英語|English/ }).click();

  await expect(window.locator(".menu-dropdown-trigger", { hasText: "File" })).toBeVisible(
    {
      timeout: 3_000,
    },
  );

  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "05-locale-en.png"),
    fullPage: false,
  });

  await window.locator(".menu-dropdown-trigger").nth(2).click();
  await window.locator(".menu-dropdown-item", { hasText: /日本語|Japanese/ }).click();
});
