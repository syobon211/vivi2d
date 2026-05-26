import type { Locator, Page } from "playwright";
import { expect, test } from "../fixtures";
import { expectElementWithinViewport, waitForAppReady } from "../helpers/app";
import { clickSettingsMenuItem } from "../helpers/operations";

async function readTheme(window: Page): Promise<string | undefined> {
  return window.evaluate(() => document.documentElement.dataset.theme);
}

async function readLang(window: Page): Promise<string> {
  return window.evaluate(() => document.documentElement.lang);
}

async function openSettingsPanel(window: Page): Promise<Locator> {
  const trigger = window.locator(".menu-dropdown-trigger").nth(2);
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel = window.locator(".menu-dropdown-panel").last();
  await expect(panel).toBeVisible();
  await expectElementWithinViewport(window, panel);
  return panel;
}

async function addParameterInCurrentLocale(window: Page, name: string): Promise<void> {
  await window
    .locator(".parameter-panel-actions .param-action-btn", { hasText: /\+ Add|\+ 追加/ })
    .first()
    .click();
  await window.getByPlaceholder(/Parameter Name|パラメータ名/).fill(name);
  await window
    .locator(".param-add-actions .param-action-btn", { hasText: /^OK$/ })
    .click();
}

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await window.evaluate(() => {
    localStorage.setItem(
      "vivi2d-theme",
      JSON.stringify({ state: { theme: "dark" }, version: 1 }),
    );
    localStorage.setItem("vivi2d-locale", "ja");
  });
  await window.reload();
  await waitForAppReady(window);
});

test.afterEach(async ({ window }) => {
  await window
    .evaluate(() => {
      localStorage.setItem(
        "vivi2d-theme",
        JSON.stringify({ state: { theme: "dark" }, version: 1 }),
      );
      localStorage.setItem("vivi2d-locale", "ja");
    })
    .catch(() => {
      /* noop */
    });
});

test("switching locale to English keeps the dark theme", async ({ window }) => {
  expect(await readTheme(window)).toBe("dark");
  expect(await readLang(window)).toBe("ja");

  await clickSettingsMenuItem(window, "English");

  await expect(async () => {
    expect(await readLang(window)).toBe("en");
    expect(await readTheme(window)).toBe("dark");
  }).toPass({ timeout: 3_000 });
});

test("switching to light mode keeps the Japanese locale and menu labels", async ({
  window,
}) => {
  expect(await readLang(window)).toBe("ja");

  await clickSettingsMenuItem(window, "ライトモード");

  await expect(async () => {
    expect(await readTheme(window)).toBe("light");
    expect(await readLang(window)).toBe("ja");
  }).toPass({ timeout: 3_000 });

  const panel = await openSettingsPanel(window);
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: "ダークモード" }),
  ).toBeVisible();
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: "ライトモード" }),
  ).toHaveCount(0);
});

test("reload restores the chosen locale and theme combination", async ({ window }) => {
  await clickSettingsMenuItem(window, "ライトモード");
  await clickSettingsMenuItem(window, "English");

  await expect(async () => {
    expect(await readTheme(window)).toBe("light");
    expect(await readLang(window)).toBe("en");
  }).toPass({ timeout: 3_000 });

  await window.reload();
  await waitForAppReady(window);

  await expect(async () => {
    expect(await readTheme(window)).toBe("light");
    expect(await readLang(window)).toBe("en");
  }).toPass({ timeout: 3_000 });
});

test("light plus English still allows adding parameters", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await clickSettingsMenuItem(window, "ライトモード");
  await clickSettingsMenuItem(window, "English");

  await expect(async () => {
    expect(await readTheme(window)).toBe("light");
    expect(await readLang(window)).toBe("en");
  }).toPass({ timeout: 3_000 });

  await addParameterInCurrentLocale(window, "en-light");
  await expect(window.locator(".parameter-name", { hasText: "en-light" })).toBeVisible();
});

test("theme toggles do not switch the active locale back from English", async ({
  window,
}) => {
  await clickSettingsMenuItem(window, "English");
  await clickSettingsMenuItem(window, "Light Mode");

  await expect(async () => {
    expect(await readLang(window)).toBe("en");
    expect(await readTheme(window)).toBe("light");
  }).toPass({ timeout: 3_000 });

  await clickSettingsMenuItem(window, "Dark Mode");
  await expect(async () => {
    expect(await readLang(window)).toBe("en");
    expect(await readTheme(window)).toBe("dark");
  }).toPass({ timeout: 3_000 });
});
