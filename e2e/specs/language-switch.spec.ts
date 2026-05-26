import type { Locator, Page } from "playwright";
import { expect, test } from "../fixtures";
import { expectElementWithinViewport, waitForViviRuntime } from "../helpers/app";
import { clickSettingsMenuItem } from "../helpers/operations";

async function openSettingsPanel(window: Page): Promise<{
  trigger: Locator;
  panel: Locator;
}> {
  const trigger = window.locator(".menu-dropdown-trigger").nth(2);
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel = window.locator(".menu-dropdown-panel").last();
  await expect(panel).toBeVisible();
  return { trigger, panel };
}

async function expectDropdownBelowTrigger(
  trigger: Locator,
  panel: Locator,
): Promise<void> {
  const triggerBox = await trigger.boundingBox();
  const panelBox = await panel.boundingBox();
  if (!triggerBox || !panelBox) {
    throw new Error("Menu trigger or panel bounding box is unavailable");
  }
  if (panelBox.y + 1 < triggerBox.y + triggerBox.height) {
    throw new Error(
      `Expected dropdown to open below the trigger, got trigger bottom=${(triggerBox.y + triggerBox.height).toFixed(2)} panel top=${panelBox.y.toFixed(2)}`,
    );
  }
}

async function expectNoLocaleAbbreviations(panel: Locator): Promise<void> {
  const text = (await panel.textContent()) ?? "";
  expect(text).not.toMatch(/\bEN\b/);
  expect(text).not.toMatch(/\bJP\b/);
}

async function expectSettingsMenuLayout(window: Page): Promise<Locator> {
  const { trigger, panel } = await openSettingsPanel(window);
  await expectDropdownBelowTrigger(trigger, panel);
  await expectElementWithinViewport(window, panel);
  return panel;
}

async function readLocale(window: Page): Promise<string> {
  return window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useI18nStore as { getState: () => { locale: string } }).getState()
      .locale;
  });
}

test.beforeEach(async ({ window, loadCharacterPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await window.evaluate(() => {
    localStorage.setItem("vivi2d-locale", "ja");
    localStorage.setItem("vivi2d-workspace-mode", "default");
  });
  await window.reload();
  await loadCharacterPsd();
  await waitForViviRuntime(window);
});

test.afterEach(async ({ window }) => {
  await window
    .evaluate(() => {
      localStorage.setItem("vivi2d-locale", "ja");
      localStorage.setItem("vivi2d-workspace-mode", "default");
    })
    .catch(() => {
      /* noop */
    });
});

test("Japanese settings menu uses full localized language and theme labels", async ({
  window,
}) => {
  const locale = await readLocale(window);
  expect(locale).toBe("ja");

  const panel = await expectSettingsMenuLayout(window);
  await expect(
    panel.locator(".menu-dropdown-section", { hasText: "\u8a00\u8a9e" }),
  ).toBeVisible();
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: "\u82f1\u8a9e" }),
  ).toBeVisible();
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: "\u65e5\u672c\u8a9e" }),
  ).toBeVisible();
  await expectNoLocaleAbbreviations(panel);
});

test("switching to English updates the settings menu without clipping", async ({
  window,
}) => {
  await clickSettingsMenuItem(window, "English");

  await expect(async () => {
    expect(await readLocale(window)).toBe("en");
  }).toPass({ timeout: 3_000 });

  const panel = await expectSettingsMenuLayout(window);
  await expect(
    panel.locator(".menu-dropdown-section", { hasText: "Language" }),
  ).toBeVisible();
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: "English" }),
  ).toBeVisible();
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: "Japanese" }),
  ).toBeVisible();
  await expectNoLocaleAbbreviations(panel);
});

test("switching back to Japanese restores localized menu labels", async ({ window }) => {
  await clickSettingsMenuItem(window, "English");
  await clickSettingsMenuItem(window, "Japanese");

  await expect(async () => {
    expect(await readLocale(window)).toBe("ja");
  }).toPass({ timeout: 3_000 });

  const panel = await expectSettingsMenuLayout(window);
  await expect(
    panel.locator(".menu-dropdown-section", { hasText: "\u8a00\u8a9e" }),
  ).toBeVisible();
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: "\u82f1\u8a9e" }),
  ).toBeVisible();
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: "\u65e5\u672c\u8a9e" }),
  ).toBeVisible();
});

test("chrome labels switch to English after locale change", async ({ window }) => {
  await clickSettingsMenuItem(window, "English");

  await expect(
    window.locator(".menu-dropdown-trigger", { hasText: "File" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-trigger", { hasText: "View" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-trigger", { hasText: "Settings" }),
  ).toBeVisible();
  await expect(window.locator(".panel-header", { hasText: "Properties" })).toBeVisible();
});

test("chrome labels switch back to Japanese after returning the locale", async ({
  window,
}) => {
  await clickSettingsMenuItem(window, "English");
  await clickSettingsMenuItem(window, "Japanese");

  await expect(
    window.locator(".menu-dropdown-trigger", { hasText: "\u30d5\u30a1\u30a4\u30eb" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-trigger", { hasText: "\u8868\u793a" }),
  ).toBeVisible();
  await expect(
    window.locator(".menu-dropdown-trigger", { hasText: "\u8a2d\u5b9a" }),
  ).toBeVisible();
  await expect(
    window.locator(".panel-header", { hasText: "\u30d7\u30ed\u30d1\u30c6\u30a3" }),
  ).toBeVisible();
});
