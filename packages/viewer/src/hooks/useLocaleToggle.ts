import { useCallback, useLayoutEffect, useMemo, useState, useTransition } from "react";
import {
  applyDocumentLocale,
  createT,
  detectLocale,
  LOCALE_CYCLE_ORDER,
  type Locale,
  applyLocalePreference,
} from "../i18n";

export interface UseLocaleResult {
  locale: Locale;
  t: ReturnType<typeof createT>;
  setLocale: (locale: Locale) => void;
  cycleLocale: () => void;
  isPending: boolean;
}

export function useLocaleToggle(): UseLocaleResult {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const [isPending, startTransition] = useTransition();
  const t = useMemo(() => createT(locale), [locale]);

  useLayoutEffect(() => {
    // Bootstrap applies the initial <html lang>; this keeps tests and non-bootstrap mounts in sync.
    if (typeof document !== "undefined" && document.documentElement.lang !== locale) {
      applyDocumentLocale(locale);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    applyLocalePreference(next, { persist: true });
    startTransition(() => setLocaleState(next));
  }, []);

  const cycleLocale = useCallback(() => {
    const index = LOCALE_CYCLE_ORDER.indexOf(locale);
    const next = LOCALE_CYCLE_ORDER[(index + 1) % LOCALE_CYCLE_ORDER.length] ?? "en";
    setLocale(next);
  }, [locale, setLocale]);

  return { locale, t, setLocale, cycleLocale, isPending };
}
