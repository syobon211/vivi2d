import { create } from "zustand";
import { en } from "./i18n/en";
import { ja } from "./i18n/ja";
import { koKR } from "./i18n/ko-KR";
import {
  FALLBACK_LOCALE,
  type Locale,
  normalizeLocale,
  resolveLocale,
} from "./i18n/locale";
import { zhHans } from "./i18n/zh-Hans";

export type { Locale } from "./i18n/locale";
export {
  FALLBACK_LOCALE,
  LOCALE_CYCLE_ORDER,
  SUPPORTED_LOCALES,
  detectPreferredLocale,
  normalizeLocale,
  resolveLocale,
  resolveLocaleFromSources,
} from "./i18n/locale";

export type I18nKey = keyof typeof en;

interface SetLocaleOptions {
  persist?: boolean;
}

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale, options?: SetLocaleOptions) => void;
}

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem("vivi2d-locale");
    return normalizeLocale(saved) ?? FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}

function applyDocumentLang(locale: Locale): void {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  } catch {
    /* noop */
  }
}

const initialLocale = detectLocale();
applyDocumentLang(initialLocale);

export const useI18nStore = create<I18nState>((set) => ({
  locale: initialLocale,
  setLocale: (locale, options = {}) => {
    const next = resolveLocale(locale);
    applyDocumentLang(next);
    if (options.persist === true) {
      try {
        localStorage.setItem("vivi2d-locale", next);
      } catch {
        /* noop */
      }
    }
    set({ locale: next });
  },
}));

const translations: Record<Locale, Record<string, string>> = {
  en,
  ja,
  "zh-Hans": zhHans,
  "ko-KR": koKR,
};
const IS_DEV =
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;

function lookup(locale: Locale, key: I18nKey): string {
  const direct = translations[locale]?.[key];
  if (direct !== undefined) return direct;
  const fallback = translations[FALLBACK_LOCALE]?.[key];
  if (fallback !== undefined) return fallback;
  if (IS_DEV) {
    console.warn(`[i18n] missing key: ${String(key)} (locale=${locale})`);
    return `MISSING:${String(key)}`;
  }
  return String(key);
}

export function t(key: I18nKey): string {
  const locale = useI18nStore.getState().locale;
  return lookup(locale, key);
}

export function useT(): (key: I18nKey) => string {
  const locale = useI18nStore((s) => s.locale);
  return (key: I18nKey) => lookup(locale, key);
}
