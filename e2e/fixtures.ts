import { test as base, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { importPsdAndWait, launchApp } from "./helpers/app";
import { resolveCharacterPsdPath, resolveSimplePsdPath } from "./helpers/psd-fixtures";

const TEST_PSD = resolveSimplePsdPath();
const CHARACTER_PSD = resolveCharacterPsdPath();

type ViviFixtures = {
  app: ElectronApplication;
  window: Page;
  loadTestPsd: () => Promise<void>;
  loadCharacterPsd: () => Promise<void>;
};

async function setLegacyEditorE2eDefaults(window: Page): Promise<void> {
  // Most legacy editor E2E specs assert Japanese UI copy. The production app
  // still defaults to English; launch/i18n specs opt into that path explicitly.
  await window.evaluate(() => {
    localStorage.setItem("vivi2d-workspace-mode", "default");
    localStorage.setItem("vivi2d-locale", "ja");
    const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
    runtime?.useWorkspaceModeStore?.getState().setMode("default");
    runtime?.useI18nStore?.getState().setLocale("ja");
  });
}

export const test = base.extend<ViviFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require object destructuring for the first argument.
  app: async ({}, use, testInfo) => {
    const { app, window } = await launchApp();
    const video = window.video();
    try {
      await use(app);
    } finally {
      await app.close().catch(() => {});
      if (video) {
        const videoPath = await video.path().catch(() => null);
        if (videoPath) {
          await testInfo.attach("electron-video.webm", {
            contentType: "video/webm",
            path: videoPath,
          });
        }
      }
    }
  },

  window: async ({ app }, use) => {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await setLegacyEditorE2eDefaults(window);
    await use(window);
  },

  loadTestPsd: async ({ app, window }, use) => {
    const load = async () => {
      await setLegacyEditorE2eDefaults(window);
      await importPsdAndWait(app, window, TEST_PSD);
      await expect(window.getByText("Background")).toBeVisible({
        timeout: 10_000,
      });
    };
    await use(load);
  },

  loadCharacterPsd: async ({ app, window }, use) => {
    const load = async () => {
      await setLegacyEditorE2eDefaults(window);
      await importPsdAndWait(app, window, CHARACTER_PSD, "");
      await expect(window.locator(".layer-item .layer-name").first()).toBeVisible({
        timeout: 15_000,
      });
    };
    await use(load);
  },
});

export { expect };
