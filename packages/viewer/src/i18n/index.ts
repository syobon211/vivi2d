import { en } from "./en";
import { ja } from "./ja";
import { koKR } from "./ko-KR";
import {
  FALLBACK_LOCALE,
  type Locale,
  LOCALE_CYCLE_ORDER,
  SUPPORTED_LOCALES,
  normalizeLocale,
  resolveLocale,
  resolveLocaleFromSources,
} from "./locale";
import { zhHans } from "./zh-Hans";

export {
  FALLBACK_LOCALE,
  LOCALE_CYCLE_ORDER,
  LOCALE_DISPLAY_NAMES,
  SUPPORTED_LOCALES,
  detectPreferredLocale,
  normalizeLocale,
  resolveLocale,
  resolveLocaleFromSources,
} from "./locale";
export type { Locale } from "./locale";

export type TranslationKey = keyof typeof en;

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en,
  ja,
  "zh-Hans": zhHans,
  "ko-KR": koKR,
};

const STORAGE_KEY = "vivi-viewer-locale";

export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const persisted = normalizeLocale(stored);
    if (persisted) return persisted;
  } catch {
    return FALLBACK_LOCALE;
  }
  return FALLBACK_LOCALE;
}

/** @public Synchronizes the Viewer document language without changing stored preferences. */
export function applyDocumentLocale(locale: Locale): void {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  } catch {
    // Embedded hosts may expose a restricted document object.
  }
}

/** @public Applies a user-facing locale choice and optionally persists it. */
export function applyLocalePreference(locale: Locale, options: { persist?: boolean } = {}): void {
  const next = resolveLocale(locale);
  // Runtime-only locale changes still need to keep assistive technology in sync.
  applyDocumentLocale(next);
  if (options.persist !== true) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage may be unavailable in embedded or test environments.
  }
}

export function createT(locale: Locale): (key: TranslationKey) => string {
  const resolved = resolveLocale(locale);
  const dict = translations[resolved] ?? translations[FALLBACK_LOCALE];
  return (key) => dict[key] ?? translations[FALLBACK_LOCALE][key] ?? key;
}
