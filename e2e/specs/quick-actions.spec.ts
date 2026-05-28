import { expect, test } from "../fixtures";
import { createClip } from "../helpers/operations";

async function setLocale(window: import("playwright").Page, locale: "ja" | "en") {
  await window.evaluate((loc) => {
    const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
    runtime?.useI18nStore?.getState().setLocale(loc);
  }, locale);
}

async function openQuickActions(window: import("playwright").Page) {
  await window.locator(".app").click({ position: { x: 20, y: 20 } });
  await window.evaluate(() => {
    globalThis.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "P",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
  });
  await expect(async () => {
    const open = await window.evaluate(() => {
      const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
      return runtime?.useQuickActionsStore?.getState().open ?? false;
    });
    expect(open).toBe(true);
  }).toPass({ timeout: 5_000 });
  return window.locator(".quick-actions-body");
}

function quickActionButton(dialog: import("playwright").Locator, title: string | RegExp) {
  const titleLocator =
    typeof title === "string"
      ? dialog.locator(".quick-actions-item-title", { hasText: new RegExp(`^${title}$`) })
      : dialog.locator(".quick-actions-item-title").filter({ hasText: title });
  return titleLocator.first().locator("..").locator("..");
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await setLocale(window, "en");
});

test("quick actions opens from the global shortcut and switches workspace mode", async ({
  window,
}) => {
  const dialog = await openQuickActions(window);
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/search actions/i).fill("animation workspace");
  await quickActionButton(dialog, "Animation workspace").click();

  await expect(window.locator("[data-workspace-mode='animation']")).toBeVisible();
  await expect(window.locator("[data-panel-name='ColliderPanel']")).toHaveAttribute(
    "hidden",
    "",
  );
  await expect(window.locator("[data-panel-name='ParameterPanel']")).not.toHaveAttribute(
    "hidden",
    "",
  );
});

test("quick actions shows disabled timeline actions until a clip exists", async ({
  window,
}) => {
  const dialog = await openQuickActions(window);
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/search actions/i).fill("motion preset");
  const action = dialog.getByRole("button", { name: /preset/i });
  await expect(action).toBeDisabled();
  await expect(dialog.getByText(/select an active clip first/i)).toBeVisible();
});

test("quick actions can open project and timeline dialogs", async ({ window }) => {
  let dialog = await openQuickActions(window);
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/search actions/i).fill("auto setup");
  await quickActionButton(dialog, "Auto Setup").click();
  await expect(window.locator(".auto-setup-dialog")).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(window.locator(".auto-setup-dialog")).not.toBeVisible();

  await createClip(window);

  dialog = await openQuickActions(window);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/search actions/i).fill("motion preset");
  await quickActionButton(dialog, /Preset\.\.\./).click();

  await expect(window.getByRole("dialog", { name: /motion presets/i })).toBeVisible();
});
