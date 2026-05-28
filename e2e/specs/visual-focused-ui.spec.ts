import type { Page } from "playwright";
import { expect, test } from "../fixtures";
import { waitForAppReady } from "../helpers/app";
import { expectVisualSnapshot } from "../helpers/visual-capture";

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

async function openIntegrationsMenu(window: Page): Promise<void> {
  const trigger = window.locator(".menu-dropdown-trigger").nth(3);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(window.locator(".menu-dropdown-panel")).toBeVisible();
}

async function openAIGenerateDialog(window: Page): Promise<void> {
  await window.route(/^https?:\/\//, (route) => route.abort());
  await openIntegrationsMenu(window);
  await window.locator(".menu-dropdown-panel .menu-dropdown-item").first().click();
  const dialog = window.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await waitForStableFrame(window);
  await waitForStableFrame(window);
}

test.describe("focused ui screenshots", () => {
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
    await waitForStableFrame(window);
  });

  test("\u81ea\u52d5\u30e2\u30c7\u30eb\u751f\u6210\u30c0\u30a4\u30a2\u30ed\u30b0", async ({
    window,
  }) => {
    await openAIGenerateDialog(window);
    const dialog = window.getByRole("dialog");
    await expect(dialog.locator(".modal-title")).toBeVisible();
    await expectVisualSnapshot(dialog, "ai-generate-dialog-ja.png");
  });

  test("\u7269\u7406\u6f14\u7b97\u30bb\u30af\u30b7\u30e7\u30f3", async ({
    window,
    loadCharacterPsd,
  }) => {
    await loadCharacterPsd();
    const panelShell = window.locator(
      '.workspace-panel-shell[data-panel-name="PhysicsPanel"]',
    );
    await expect(panelShell).toBeVisible();
    const panel = panelShell.locator(".physics-panel");
    await panel.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    await waitForStableFrame(window);
    await expectVisualSnapshot(panel, "physics-panel-ja.png", { timeout: 15_000 });
  });

  test("\u53f3\u30da\u30a4\u30f3\u5168\u4f53", async ({ window, loadCharacterPsd }) => {
    await loadCharacterPsd();
    const rightPane = window.locator(".workspace-right");
    await expect(rightPane).toBeVisible();
    await expectVisualSnapshot(rightPane, "workspace-right-ja.png");
  });

  test("automatic model generation dialog", async ({ window }) => {
    await window.evaluate(() => {
      try {
        localStorage.setItem("vivi2d-locale", "en");
      } catch {
        /* noop */
      }
    });
    await window.reload();
    await waitForAppReady(window);
    await waitForStableFrame(window);
    await openAIGenerateDialog(window);
    const dialog = window.getByRole("dialog");
    await expect(dialog.locator(".modal-title")).toBeVisible();
    await expectVisualSnapshot(dialog, "ai-generate-dialog-en.png");
  });
});
