import { useCallback, useId, useState } from "react";
import { useFormatDialogText } from "@/lib/dialog-text";
import { useT } from "@/lib/i18n";
import { DialogShell } from "./DialogShell";

export function VTSSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const urlId = useId();
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem("vivi2d-vts-url") ?? "ws://127.0.0.1:8001";
    } catch {
      return "ws://127.0.0.1:8001";
    }
  });

  const handleSave = useCallback(() => {
    try {
      localStorage.setItem("vivi2d-vts-url", url);
    } catch {
      /* ignore */
    }
    onClose();
  }, [url, onClose]);

  return (
    <DialogShell
      onClose={onClose}
      title={t("integration.vtsDialogTitle")}
      footer={
        <>
          <button type="button" className="prop-btn" onClick={handleSave}>
            {t("common.save")}
          </button>
          <button type="button" className="prop-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </>
      }
    >
      <div style={{ padding: "12px 0" }}>
        <div className="ai-gen-field">
          <label className="ai-gen-label" htmlFor={urlId}>
            {t("integration.vtsUrl")}
          </label>
          <input
            id={urlId}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="ai-gen-input"
            style={{ width: "100%" }}
            placeholder="ws://127.0.0.1:8001"
          />
        </div>
        <div className="ai-gen-notice" style={{ marginTop: 12 }}>
          {formatDialogText(t("integration.vtsNotice"))}
        </div>
      </div>
    </DialogShell>
  );
}
