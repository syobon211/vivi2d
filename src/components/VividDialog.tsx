import { useCallback, useState } from "react";
import { useFormatDialogText } from "@/lib/dialog-text";
import { useT } from "@/lib/i18n";
import { exportVividProject, importVividProject } from "@/stores/projectIO";
import { DialogShell } from "./DialogShell";

type Mode = "export" | "import";

interface VividDialogProps {
  mode: Mode;
  onClose: () => void;
}

export function VividDialog({ mode, onClose }: VividDialogProps) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "export" ? t("vivid.exportTitle") : t("vivid.importTitle");
  const submitLabel = mode === "export" ? t("vivid.exportBtn") : t("vivid.importBtn");

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!password) {
      setError(t("vivid.passwordEmpty"));
      return;
    }
    if (mode === "export" && password !== confirmPassword) {
      setError(t("vivid.passwordMismatch"));
      return;
    }

    setIsProcessing(true);
    try {
      const ok =
        mode === "export"
          ? await exportVividProject(password)
          : await importVividProject(password);
      if (ok) onClose();
    } finally {
      setIsProcessing(false);
    }
  }, [mode, password, confirmPassword, onClose, t]);

  return (
    <DialogShell
      onClose={onClose}
      title={title}
      className="vivid-dialog"
      disableEscape={isProcessing}
      disableBackdropClose={isProcessing}
    >
      <div className="vivid-dialog-body">
        <p className="vivid-info">
          {formatDialogText(
            `${t("vivid.description")} ${
              mode === "export" ? t("vivid.exportHint") : t("vivid.importHint")
            }`,
          )}
        </p>
        <label className="vivid-field">
          <span>{t("vivid.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isProcessing}
          />
        </label>
        {mode === "export" && (
          <label className="vivid-field">
            <span>{t("vivid.passwordConfirm")}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isProcessing}
            />
          </label>
        )}
        {error && (
          <p className="vivid-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="modal-footer">
        <button
          type="button"
          className="modal-btn"
          onClick={onClose}
          disabled={isProcessing}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={handleSubmit}
          disabled={isProcessing || !password}
        >
          {isProcessing ? t("vivid.processing") : submitLabel}
        </button>
      </div>
    </DialogShell>
  );
}
