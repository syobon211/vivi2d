import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importFreshI18nModule() {
  vi.resetModules();
  return import("@/lib/i18n");
}

describe("i18n startup locale defaults", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("defaults to English when no locale is persisted", async () => {
    const { useI18nStore } = await importFreshI18nModule();
    expect(useI18nStore.getState().locale).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("defaults to English when the persisted locale is invalid", async () => {
    localStorage.setItem("vivi2d-locale", "fr-FR");
    const { useI18nStore } = await importFreshI18nModule();
    expect(useI18nStore.getState().locale).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("restores a valid persisted locale instead of the English default", async () => {
    localStorage.setItem("vivi2d-locale", "ja");
    const { useI18nStore } = await importFreshI18nModule();
    expect(useI18nStore.getState().locale).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("normalizes a valid persisted locale before startup", async () => {
    localStorage.setItem("vivi2d-locale", "ko_kr");
    const { useI18nStore } = await importFreshI18nModule();
    expect(useI18nStore.getState().locale).toBe("ko-KR");
    expect(document.documentElement.lang).toBe("ko-KR");
  });
});
