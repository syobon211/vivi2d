import { expect, test } from "../fixtures";
import { waitForAppReady } from "../helpers/app";
import { clickSettingsMenuItem } from "../helpers/operations";

async function readTheme(window: import("playwright").Page): Promise<string | undefined> {
  return window.evaluate(() => document.documentElement.dataset.theme);
}

async function readPersistedTheme(
  window: import("playwright").Page,
): Promise<string | null> {
  return window.evaluate(() => {
    const raw = localStorage.getItem("vivi2d-theme");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.state?.theme ?? null;
    } catch {
      return raw;
    }
  });
}

test.afterEach(async ({ window }) => {
  await window
    .evaluate(() => {
      localStorage.removeItem("vivi2d-locale");
      localStorage.setItem("vivi2d-theme", "dark");
    })
    .catch(() => {});
});

test("defaults to the OSS dark theme on startup", async ({ window }) => {
  await window.evaluate(() => {
    localStorage.removeItem("vivi2d-theme");
  });
  await window.reload();
  await waitForAppReady(window);

  const theme = await readTheme(window);
  expect(theme).toBe("dark");
});

test("restores a persisted light theme on startup", async ({ window }) => {
  await window.evaluate(() => {
    localStorage.setItem(
      "vivi2d-theme",
      JSON.stringify({ state: { theme: "light" }, version: 1 }),
    );
  });
  await window.reload();
  await waitForAppReady(window);

  const theme = await readTheme(window);
  expect(theme).toBe("light");
});

test("shows a theme toggle entry in the settings menu", async ({ window }) => {
  await window.locator(".menu-dropdown-trigger").nth(2).click();
  await expect(
    window.locator(".menu-dropdown-item", {
      hasText: /(Light Mode|Dark Mode|ライトモード|ダークモード)/,
    }),
  ).toBeVisible();
  await window.keyboard.press("Escape");
});

test("toggles the theme and can switch back", async ({ window }) => {
  const initialTheme = await readTheme(window);
  const firstTarget = initialTheme === "dark" ? "Light" : "Dark";
  const secondTarget = initialTheme === "dark" ? "Dark" : "Light";
  const expectedFirst = initialTheme === "dark" ? "light" : "dark";

  await clickSettingsMenuItem(window, firstTarget);
  await expect(async () => {
    expect(await readTheme(window)).toBe(expectedFirst);
  }).toPass({ timeout: 3_000 });

  await clickSettingsMenuItem(window, secondTarget);
  await expect(async () => {
    expect(await readTheme(window)).toBe(initialTheme);
  }).toPass({ timeout: 3_000 });
});

test("persists the selected theme to localStorage", async ({ window }) => {
  const initialTheme = await readTheme(window);
  const target = initialTheme === "dark" ? "Light" : "Dark";
  const expected = initialTheme === "dark" ? "light" : "dark";

  await clickSettingsMenuItem(window, target);
  await expect(async () => {
    expect(await readPersistedTheme(window)).toBe(expected);
  }).toPass({ timeout: 3_000 });
});

test("updates theme CSS variables after toggling", async ({ window }) => {
  const initialBg = await window.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg-base").trim(),
  );

  const initialTheme = await readTheme(window);
  await clickSettingsMenuItem(window, initialTheme === "dark" ? "Light" : "Dark");

  await expect(async () => {
    const nextBg = await window.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-base").trim(),
    );
    expect(nextBg).not.toBe(initialBg);
  }).toPass({ timeout: 3_000 });
});

test("still toggles the theme after a PSD project is loaded", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const initialTheme = await readTheme(window);
  await clickSettingsMenuItem(window, initialTheme === "dark" ? "Light" : "Dark");

  await expect(async () => {
    expect(await readTheme(window)).not.toBe(initialTheme);
  }).toPass({ timeout: 3_000 });
});
