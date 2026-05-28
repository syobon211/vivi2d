import { useT } from "@/lib/i18n";
import { DelayedFallback } from "./DelayedFallback";

export function DialogLoadingFallback() {
  const t = useT();
  return (
    <DelayedFallback>
      <div
        className="dialog-loading-overlay"
        role="status"
        aria-live="polite"
        aria-label={t("dialog.loading")}
      >
        <div className="dialog-loading-spinner" aria-hidden="true" />
      </div>
    </DelayedFallback>
  );
}
