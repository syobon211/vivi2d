import type { Page } from "playwright";
import { expect, test } from "../fixtures";


async function waitForVivi2D(window: Page): Promise<void> {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test.describe("startup locale defaults", () => {
  test.afterEach(async ({ window }) => {
    await window
      .evaluate(() => {
        localStorage.removeItem("vivi2d-locale");
      })
      .catch(() => {
        /* ignore if the window already closed */
      });
  });

  test("defaults to English when no persisted locale exists", async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await window.evaluate(() => {
      localStorage.removeItem("vivi2d-locale");
    });
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await waitForVivi2D(window);

    const lang = await window.evaluate(() => document.documentElement.lang);
    expect(lang).toBe("en");
    await expect(window.getByText("Please open a PSD file")).toBeVisible();
  });

  test("restores a persisted Japanese locale on startup", async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await window.evaluate(() => {
      localStorage.setItem("vivi2d-locale", "ja");
    });
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await waitForVivi2D(window);

    const lang = await window.evaluate(() => document.documentElement.lang);
    expect(lang).toBe("ja");
    await expect(window.locator(".menu-dropdown-trigger", { hasText: "ファイル" })).toBeVisible();
  });

  test("restores a persisted Korean locale on startup", async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await window.evaluate(() => {
      localStorage.setItem("vivi2d-locale", "ko-KR");
    });
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await waitForVivi2D(window);

    const lang = await window.evaluate(() => document.documentElement.lang);
    expect(lang).toBe("ko-KR");
    await expect(window.locator(".menu-dropdown-trigger", { hasText: "파일" })).toBeVisible();
  });
});

test.describe("i18n fallback 動作 (P7-19)", () => {
  test.beforeEach(async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await window.evaluate(() => {
      try {
        localStorage.setItem("vivi2d-locale", "ja");
      } catch {
        /* noop */
      }
    });
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await waitForVivi2D(window);
  });

  test.afterEach(async ({ window }) => {
    await window
      .evaluate(() => {
        localStorage.setItem("vivi2d-locale", "ja");
      })
      .catch(() => {
        /* ignore if window already closed */
      });
  });

  test("P8-22: 起動直後 document.documentElement.lang が localStorage の locale と一致する", async ({
    window,
  }) => {
    const lang = await window.evaluate(() => document.documentElement.lang);
    expect(lang).toBe("ja");
  });

  test("P8-22: locale 切替で document.documentElement.lang が即時更新される", async ({
    window,
  }) => {
    await window.evaluate(() => {
      const v = window.__vivi2d as
        | { useI18nStore?: { getState(): { setLocale(l: "ja" | "en"): void } } }
        | undefined;
      v?.useI18nStore?.getState().setLocale("en");
    });
    await expect(async () => {
      const lang = await window.evaluate(() => document.documentElement.lang);
      expect(lang).toBe("en");
    }).toPass({ timeout: 2_000 });

    await window.evaluate(() => {
      const v = window.__vivi2d as
        | { useI18nStore?: { getState(): { setLocale(l: "ja" | "en"): void } } }
        | undefined;
      v?.useI18nStore?.getState().setLocale("ja");
    });
    await expect(async () => {
      const lang = await window.evaluate(() => document.documentElement.lang);
      expect(lang).toBe("ja");
    }).toPass({ timeout: 2_000 });
  });

  test("P8-23: prod build で欠落キーは MISSING: プレフィックスを付けず key 自体を返す", async ({
    window,
  }) => {
    const result = await window.evaluate(() => {
      const v = window.__vivi2d as { t?: (key: string) => string } | undefined;
      return v?.t?.("__nonexistent__.fallback.test.key");
    });
    expect(result).toBe("__nonexistent__.fallback.test.key");
    expect(result).not.toMatch(/^MISSING:/);
  });

  test("P8-23: en 専用モードで ja key を呼んでも文字列が返る (silent fallback)", async ({
    window,
  }) => {
    await window.evaluate(() => {
      const v = window.__vivi2d as
        | { useI18nStore?: { getState(): { setLocale(l: "ja" | "en"): void } } }
        | undefined;
      v?.useI18nStore?.getState().setLocale("en");
    });
    const enValue = await window.evaluate(() => {
      const v = window.__vivi2d as { t?: (key: string) => string } | undefined;
      return v?.t?.("menu.fileMenu");
    });
    expect(enValue).toBeTruthy();
    expect(enValue).not.toMatch(/^MISSING:/);
    expect(enValue).not.toBe("menu.fileMenu");
  });

  test("locale 切替後、同じキーの返り値が ja/en で異なる", async ({ window }) => {
    await window.evaluate(() => {
      const v = window.__vivi2d as
        | { useI18nStore?: { getState(): { setLocale(l: "ja" | "en"): void } } }
        | undefined;
      v?.useI18nStore?.getState().setLocale("ja");
    });
    const jaValue = await window.evaluate(() => {
      const v = window.__vivi2d as { t?: (key: string) => string } | undefined;
      return v?.t?.("menu.fileMenu");
    });

    await window.evaluate(() => {
      const v = window.__vivi2d as
        | { useI18nStore?: { getState(): { setLocale(l: "ja" | "en"): void } } }
        | undefined;
      v?.useI18nStore?.getState().setLocale("en");
    });
    const enValue = await window.evaluate(() => {
      const v = window.__vivi2d as { t?: (key: string) => string } | undefined;
      return v?.t?.("menu.fileMenu");
    });

    expect(jaValue).toBeTruthy();
    expect(enValue).toBeTruthy();
    expect(jaValue).not.toBe(enValue);
  });
});
