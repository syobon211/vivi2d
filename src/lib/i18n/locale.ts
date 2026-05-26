export const SUPPORTED_LOCALES = ["en", "ja", "zh-Hans", "ko-KR"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: Locale = "en";
export const LOCALE_CYCLE_ORDER = ["en", "ja", "zh-Hans", "ko-KR"] as const;

export type LocaleSource =
  | "explicitUserSelection"
  | "urlOverride"
  | "persistedPreference"
  | "browserLanguage"
  | "fallback";

export interface ResolvedLocale {
  locale: Locale;
  source: LocaleSource;
  mayPersist: boolean;
}

const MAX_LOCALE_TAG_LENGTH = 64;
const CONTROL_OR_SPACE_RE = /[\u0000-\u001f\u007f\s]/u;

function canonicalizeLocaleTag(value: string): string | null {
  const normalized = value.trim().replaceAll("_", "-");
  if (
    normalized.length === 0 ||
    [...normalized].length > MAX_LOCALE_TAG_LENGTH ||
    CONTROL_OR_SPACE_RE.test(normalized)
  ) {
    return null;
  }

  if (typeof Intl !== "undefined" && typeof Intl.getCanonicalLocales === "function") {
    try {
      return Intl.getCanonicalLocales(normalized)[0] ?? null;
    } catch {
      return null;
    }
  }

  if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/u.test(normalized)) {
    return null;
  }
  return normalized
    .split("-")
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : part.length === 4
          ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`
          : part.toUpperCase(),
    )
    .join("-");
}

function stripExtensionsAfterFamilyDecision(tag: string): string[] {
  const parts = tag.split("-");
  const cut = parts.findIndex((part) => part.length === 1);
  return cut === -1 ? parts : parts.slice(0, cut);
}

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const canonical = canonicalizeLocaleTag(value);
  if (canonical === null) return null;

  const parts = stripExtensionsAfterFamilyDecision(canonical);
  const language = parts[0]?.toLowerCase();
  const script = parts.find((part) => part.length === 4);
  const regions = new Set(parts.filter((part) => part.length === 2 || part.length === 3));

  if (language === "en") return "en";
  if (language === "ja") return "ja";
  if (language === "ko") return "ko-KR";
  if (language === "zh") {
    if (script === "Hant" || regions.has("TW") || regions.has("HK") || regions.has("MO")) {
      return null;
    }
    if (script === "Hans" || regions.has("CN") || regions.has("SG") || parts.length === 1) {
      return "zh-Hans";
    }
  }
  return null;
}

export function resolveLocale(value: unknown): Locale {
  return normalizeLocale(value) ?? FALLBACK_LOCALE;
}

export function detectPreferredLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale !== null) return locale;
  }
  return FALLBACK_LOCALE;
}

export function resolveLocaleFromSources(sources: {
  explicitUserSelection?: unknown;
  urlOverride?: unknown;
  persistedPreference?: unknown;
  browserLanguages?: readonly string[];
}): ResolvedLocale {
  const explicit = normalizeLocale(sources.explicitUserSelection);
  if (explicit) {
    return { locale: explicit, source: "explicitUserSelection", mayPersist: true };
  }
  const url = normalizeLocale(sources.urlOverride);
  if (url) return { locale: url, source: "urlOverride", mayPersist: false };
  const persisted = normalizeLocale(sources.persistedPreference);
  if (persisted) {
    return { locale: persisted, source: "persistedPreference", mayPersist: false };
  }
  const browser = sources.browserLanguages
    ? detectPreferredLocale(sources.browserLanguages)
    : FALLBACK_LOCALE;
  if (browser !== FALLBACK_LOCALE) {
    return { locale: browser, source: "browserLanguage", mayPersist: false };
  }
  return { locale: FALLBACK_LOCALE, source: "fallback", mayPersist: false };
}
