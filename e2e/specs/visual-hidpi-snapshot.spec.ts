import type { Page } from "playwright";
import { expect, test } from "../fixtures";
import { waitForAppReady } from "../helpers/app";
import { expectVisualSnapshot } from "../helpers/visual-capture";

const CANVAS_MASK_COLOR = "#3a3d4f";

async function waitForVivi2D(window: Page): Promise<void> {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 20_000 });
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

test.describe("Hi-DPI visual snapshots (DPR=2)", () => {
  test.beforeEach(async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await waitForVivi2D(window);
    await window.evaluate(() => {
      try {
        localStorage.clear();
        localStorage.setItem("vivi2d-theme", "dark");
        localStorage.setItem("vivi2d-locale", "ja");
      } catch {
        /* noop */
      }
    });
    await window.reload();
    await waitForAppReady(window);
    await waitForStableFrame(window);
    await waitForStableFrame(window);

    const cdp = await window.context().newCDPSession(window);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await waitForStableFrame(window);
    await waitForStableFrame(window);
  });

  async function maskedSnapshot(window: Page, name: string): Promise<void> {
    await waitForAppReady(window);
    await waitForStableFrame(window);
    await expectVisualSnapshot(window, name, {
      mask: [window.locator("canvas")],
      maskColor: CANVAS_MASK_COLOR,
    });
  }

  test("DPR=2 initial launch", async ({ window }) => {
    await waitForStableFrame(window);
    await maskedSnapshot(window, "hidpi-initial-launch.png");
  });

  test("DPR=2 after character PSD load", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    await waitForStableFrame(window);
    await waitForStableFrame(window);
    await maskedSnapshot(window, "hidpi-after-psd-load.png");
  });

  test("DPR=2 theme light", async ({ window }) => {
    await window.evaluate(() => {
      const store = window.__vivi2d?.useThemeStore as
        | { getState(): { setTheme(t: "light" | "dark"): void } }
        | undefined;
      store?.getState().setTheme("light");
    });
    await waitForStableFrame(window);
    await maskedSnapshot(window, "hidpi-theme-light.png");
  });

  test("DPR=2 file menu open", async ({ window }) => {
    await waitForStableFrame(window);
    await window.locator(".menu-dropdown-trigger").first().click();
    await window.locator('[role="menu"]').first().waitFor({ state: "visible" });
    await waitForStableFrame(window);
    await maskedSnapshot(window, "hidpi-menu-file-open.png");
  });
});
