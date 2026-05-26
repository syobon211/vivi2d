import { expect, test } from "../fixtures";
import { waitForAppReady } from "../helpers/app";
import { expectVisualSnapshot } from "../helpers/visual-capture";

async function waitForStableFrame(window: import("playwright").Page): Promise<void> {
  await window.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function setLocale(window: import("playwright").Page, locale: "ja" | "en") {
  await window.evaluate((nextLocale) => {
    const store = (window as any).__vivi2d.useI18nStore.getState();
    if (store.locale !== nextLocale) store.setLocale(nextLocale);
  }, locale);
  await waitForStableFrame(window);
  await waitForStableFrame(window);
}

test.describe("rig health visual", () => {
  test.beforeEach(async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await window.evaluate(() => {
      try {
        localStorage.clear();
        localStorage.setItem("vivi2d-theme", "light");
        localStorage.setItem("vivi2d-locale", "ja");
      } catch {
        /* noop */
      }
    });
    await window.reload();
    await waitForAppReady(window);
    await setLocale(window, "ja");
    await waitForStableFrame(window);
    await waitForStableFrame(window);
  });

  test("right panel rig health section", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    const section = window
      .locator(".properties-panel .properties-section")
      .filter({
        has: window.getByText("\u30ea\u30b0\u30d8\u30eb\u30b9", { exact: true }),
      })
      .first();

    await expect(
      section.getByText("\u30ea\u30b0\u30d8\u30eb\u30b9", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByText(
        "\u30ea\u30b0\u30d8\u30eb\u30b9\u306e\u554f\u984c\u306f\u691c\u51fa\u3055\u308c\u307e\u305b\u3093\u3067\u3057\u305f",
      ),
    ).toBeVisible();
    await expect(
      section.getByText("\u30e2\u30c7\u30eb\u691c\u8a3c\u3092\u958b\u304f"),
    ).toBeVisible();
    await waitForStableFrame(window);
    await expectVisualSnapshot(section, "rig-health-ja-panel.png");
  });
});
