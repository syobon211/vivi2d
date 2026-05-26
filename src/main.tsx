import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { FALLBACK_LOCALE, type Locale, normalizeLocale } from "./lib/i18n/locale";

const App = lazy(() => import("./App").then((m) => ({ default: m.App })));

type BootstrapTheme = "dark" | "light";
type BootstrapLocale = Locale;

const DEFAULT_BOOTSTRAP_THEME: BootstrapTheme = "dark";
const DEFAULT_BOOTSTRAP_LOCALE: BootstrapLocale = FALLBACK_LOCALE;

function readBootstrapTheme(): BootstrapTheme {
  try {
    const raw = localStorage.getItem("vivi2d-theme");
    if (raw === "dark" || raw === "light") return raw;
    if (!raw) return DEFAULT_BOOTSTRAP_THEME;
    const parsed = JSON.parse(raw) as { state?: { theme?: unknown } };
    const theme = parsed?.state?.theme;
    return theme === "dark" || theme === "light" ? theme : DEFAULT_BOOTSTRAP_THEME;
  } catch {
    return DEFAULT_BOOTSTRAP_THEME;
  }
}

function readBootstrapLocale(): BootstrapLocale {
  try {
    const raw = localStorage.getItem("vivi2d-locale");
    return normalizeLocale(raw) ?? DEFAULT_BOOTSTRAP_LOCALE;
  } catch {
    return DEFAULT_BOOTSTRAP_LOCALE;
  }
}

function applyBootstrapDocumentState(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = readBootstrapTheme();
  document.documentElement.lang = readBootstrapLocale();
  document.documentElement.dataset.vivi2dReady = "false";
}

applyBootstrapDocumentState();

if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_E2E === "true") {
  import("./test-globals").then((m) => m.exposeForE2E()).catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="app" aria-hidden="true" />}>
      <App />
    </Suspense>
  </StrictMode>,
);
