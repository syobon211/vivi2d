import { applyDocumentLocale, detectLocale } from "./i18n";

export function applyViewerBootstrapLocale(): void {
  applyDocumentLocale(detectLocale());
}
