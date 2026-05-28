import { useCallback, useId, useState } from "react";
import { useFormatDialogText } from "@/lib/dialog-text";
import { useT } from "@/lib/i18n";
import { DialogShell } from "./DialogShell";

export function OBSSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const urlId = useId();
  const passwordId = useId();
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem("vivi2d-obs-url") ?? "ws://127.0.0.1:4455";
    } catch {
      return "ws://127.0.0.1:4455";
    }
  });
  const [password, setPassword] = useState("");

  const handleSave = useCallback(() => {
    try {
      localStorage.setItem("vivi2d-obs-url", url);
    } catch {
      /* ignore */
    }
    onClose();
  }, [url, onClose]);

  return (
    <DialogShell
      onClose={onClose}
      title={t("integration.obsDialogTitle")}
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
            {t("integration.obsUrl")}
          </label>
          <input
            id={urlId}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="ai-gen-input"
            style={{ width: "100%" }}
            placeholder="ws://127.0.0.1:4455"
          />
        </div>
        <div className="ai-gen-field" style={{ marginTop: 8 }}>
          <label className="ai-gen-label" htmlFor={passwordId}>
            {t("integration.obsPassword")}
          </label>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ai-gen-input"
            style={{ width: "100%" }}
            placeholder={t("integration.obsPasswordPlaceholder")}
          />
        </div>
        <div className="ai-gen-notice" style={{ marginTop: 12 }}>
          {formatDialogText(t("integration.obsNotice"))}
        </div>
      </div>
    </DialogShell>
  );
}
