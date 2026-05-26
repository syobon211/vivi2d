import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../i18n/en";
import {
  createT,
  detectLocale,
  detectPreferredLocale,
  FALLBACK_LOCALE,
  LOCALE_CYCLE_ORDER,
  applyLocalePreference,
  normalizeLocale,
  resolveLocaleFromSources,
  SUPPORTED_LOCALES,
  type Locale,
  type TranslationKey,
} from "../i18n";
import {
  FALLBACK_LOCALE as EDITOR_FALLBACK_LOCALE,
  LOCALE_CYCLE_ORDER as EDITOR_LOCALE_CYCLE_ORDER,
  SUPPORTED_LOCALES as EDITOR_SUPPORTED_LOCALES,
  normalizeLocale as normalizeEditorLocale,
} from "../../../../src/lib/i18n/locale";
import { ja } from "../i18n/ja";
import { koKR } from "../i18n/ko-KR";
import { zhHans } from "../i18n/zh-Hans";

const STORAGE_KEY = "vivi-viewer-locale";

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  ja,
  "zh-Hans": zhHans,
  "ko-KR": koKR,
};

const viewerSideSheetSurfaceKeys = [
  "session",
  "connect",
  "overlays",
  "calibration",
  "inputEffects",
  "closePanel",
  "sideSheetAria",
  "sideSheetTabsAria",
  "sideSheetSessionDescription",
  "sideSheetConnectDescription",
  "sideSheetOverlaysDescription",
  "sideSheetCalibrationDescription",
  "sideSheetInputEffectsDescription",
] as const;

describe("viewer i18n dictionaries", () => {
  it("declares the expected locale set", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "ja", "zh-Hans", "ko-KR"]);
  });

  it("keeps the viewer locale contract aligned with the editor", () => {
    expect(SUPPORTED_LOCALES).toEqual(EDITOR_SUPPORTED_LOCALES);
    expect(FALLBACK_LOCALE).toBe(EDITOR_FALLBACK_LOCALE);
    expect(LOCALE_CYCLE_ORDER).toEqual(EDITOR_LOCALE_CYCLE_ORDER);

    for (const value of [
      "en-US",
      "ja-JP-u-ca-japanese",
      "ZH_hans_CN",
      "ko-kr",
      "zh-Hant-TW-x-test",
      "fr-FR",
    ]) {
      expect(normalizeLocale(value)).toBe(normalizeEditorLocale(value));
    }
  });

  it.each(Object.entries(dictionaries))("keeps keys aligned for %s", (locale, dict) => {
    expect(Object.keys(dict).sort(), `${locale} keys`).toEqual(Object.keys(en).sort());
  });

  it.each(Object.entries(dictionaries))("does not contain empty values for %s", (locale, dict) => {
    const empty = Object.entries(dict).filter(([, value]) => value === "");
    expect(empty, `${locale} empty translations`).toEqual([]);
  });

  it.each(["zh-Hans", "ko-KR"] as const)(
    "does not fall back to English on the viewer side sheet for %s",
    (locale) => {
      const dict = dictionaries[locale];
      for (const key of viewerSideSheetSurfaceKeys) {
        expect(dict[key], `${locale}.${key} should be localized`).not.toBe(en[key]);
      }
    },
  );

  it("returns translations for all supported locales", () => {
    expect(createT("en")("openModel")).toBe("Open Model");
    expect(createT("ja")("openModel")).toBe("モデルを開く");
    expect(createT("zh-Hans")("openModel")).toBe("打开模型");
    expect(createT("ko-KR")("openModel")).toBe("모델 열기");
  });

  it("keeps short tracking button labels paired with their stop labels", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = createT(locale);
      expect(t("faceTrackingStart")).toBe(t("faceTrackingStop"));
      expect(t("handTrackingStart")).toBe(t("handTrackingStop"));
      expect(t("lipSyncStart")).toBe(t("lipSyncStop"));
      expect(t("poseStart")).toBe(t("poseStop"));
    }
  });

  it("falls back to the key for unknown translation keys", () => {
    const fn = createT("ja") as (key: string) => string;
    expect(fn("nonexistent_key_for_test")).toBe("nonexistent_key_for_test");
  });
});

describe("viewer locale normalization", () => {
  it("normalizes common BCP 47 variants", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("ja-JP-u-ca-japanese")).toBe("ja");
    expect(normalizeLocale("ZH_hans_CN")).toBe("zh-Hans");
    expect(normalizeLocale("ko-kr")).toBe("ko-KR");
  });

  it("rejects unsupported or unsafe locale strings", () => {
    expect(normalizeLocale("zh-Hant")).toBeNull();
    expect(normalizeLocale("zh-TW")).toBeNull();
    expect(normalizeLocale("fr-FR")).toBeNull();
    expect(normalizeLocale("x".repeat(65))).toBeNull();
  });

  it("chooses the first supported browser language", () => {
    expect(detectPreferredLocale(["fr-FR", "zh-SG", "ja-JP"])).toBe("zh-Hans");
  });

  it("resolves locale source priority without persisting non-user sources", () => {
    expect(
      resolveLocaleFromSources({
        explicitUserSelection: "ko",
        urlOverride: "ja",
        persistedPreference: "zh-CN",
        browserLanguages: ["en-US"],
      }),
    ).toEqual({ locale: "ko-KR", source: "explicitUserSelection", mayPersist: true });

    expect(
      resolveLocaleFromSources({
        urlOverride: "ja-JP",
        persistedPreference: "zh-CN",
        browserLanguages: ["ko-KR"],
      }),
    ).toEqual({ locale: "ja", source: "urlOverride", mayPersist: false });

    expect(
      resolveLocaleFromSources({
        persistedPreference: "zh-CN",
        browserLanguages: ["ko-KR"],
      }),
    ).toEqual({ locale: "zh-Hans", source: "persistedPreference", mayPersist: false });

    expect(resolveLocaleFromSources({ browserLanguages: ["ko-KR"] })).toEqual({
      locale: "ko-KR",
      source: "browserLanguage",
      mayPersist: false,
    });
  });
});

describe("viewer locale persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  afterEach(() => {
    document.documentElement.lang = "";
    vi.restoreAllMocks();
  });

  it("restores a normalized persisted locale", () => {
    localStorage.setItem(STORAGE_KEY, "ko_kr");
    expect(detectLocale()).toBe("ko-KR");
  });

  it("falls back to English when persisted locale is invalid", () => {
    localStorage.setItem(STORAGE_KEY, "fr");
    expect(detectLocale()).toBe("en");
  });

  it("persists explicit locale selection", () => {
    applyLocalePreference("zh-Hans", { persist: true });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("zh-Hans");
    expect(detectLocale()).toBe("zh-Hans");
    expect(document.documentElement.lang).toBe("zh-Hans");
  });

  it("does not persist locale changes unless explicitly requested", () => {
    applyLocalePreference("ko-KR");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(document.documentElement.lang).toBe("ko-KR");
  });

  it("does not throw when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => applyLocalePreference("en", { persist: true })).not.toThrow();
  });
});
