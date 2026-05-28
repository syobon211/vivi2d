import { type Locale, useI18nStore } from "./i18n";

export function formatDialogText(text: string, locale: Locale): string {
  if (locale !== "ja") return text;
  return text.replace(/。(?=\S)/g, "。\n").trim();
}

export function useFormatDialogText(): (text: string) => string {
  const locale = useI18nStore((s) => s.locale);
  return (text: string) => formatDialogText(text, locale);
}
