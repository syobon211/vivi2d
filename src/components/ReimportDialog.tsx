import { useCallback, useState } from "react";
import { useFormatDialogText } from "@/lib/dialog-text";
import { useT } from "@/lib/i18n";
import type { PsdReimportDiff } from "@/lib/psd-reimport";
import { analyzePsdReimport, applyPsdReimport } from "@/lib/psd-reimport";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { replaceProject } from "@/stores/projectMutator";
import { DialogShell } from "./DialogShell";

interface ReimportDialogProps {
  onClose: () => void;
}

export function ReimportDialog({ onClose }: ReimportDialogProps) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const project = useEditorStore((s) => s.project);
  const [diff, setDiff] = useState<PsdReimportDiff | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSelectFile = useCallback(async () => {
    try {
      setIsAnalyzing(true);
      const result = await window.electronAPI.openPsdFile();
      if (!result || !project) return;

      const { diff: analyzed } = analyzePsdReimport(result.buffer, project);
      setDiff(analyzed);
      setBuffer(result.buffer);
    } catch (err) {
      useNotificationStore
        .getState()
        .addNotification(
          "error",
          `${t("reimport.parseFailedPrefix")} ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
    } finally {
      setIsAnalyzing(false);
    }
  }, [project, t]);

  const handleApply = useCallback(() => {
    if (!buffer || !project) return;

    try {
      const { project: updated, diff: resultDiff } = applyPsdReimport(buffer, project);
      replaceProject(updated);
      useNotificationStore
        .getState()
        .addNotification(
          "info",
          `${t("reimport.completedPrefix")} ${resultDiff.updated.length}${t(
            "reimport.updatedCountSuffix",
          )}, ${resultDiff.added.length}${t("reimport.addedCountSuffix")}`,
        );
      onClose();
    } catch (err) {
      useNotificationStore
        .getState()
        .addNotification(
          "error",
          `${t("reimport.failedPrefix")} ${err instanceof Error ? err.message : String(err)}`,
        );
    }
  }, [buffer, project, onClose, t]);

  const footer = !diff ? (
    <>
      <button type="button" className="modal-btn" onClick={onClose}>
        {t("common.cancel")}
      </button>
      <button
        type="button"
        className="modal-btn modal-btn-primary"
        onClick={handleSelectFile}
        disabled={isAnalyzing || !project}
      >
        {isAnalyzing ? t("reimport.analyzing") : t("reimport.selectPsd")}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="modal-btn" onClick={onClose}>
        {t("common.cancel")}
      </button>
      {(diff.updated.length > 0 || diff.added.length > 0) && (
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={handleApply}
        >
          {t("common.apply")}
        </button>
      )}
    </>
  );

  return (
    <DialogShell
      onClose={onClose}
      title={t("reimport.title")}
      className="reimport-dialog"
      footer={footer}
    >
      <div className="reimport-dialog-body">
        {!diff ? (
          <div>
            <p className="reimport-info">
              {formatDialogText(
                `${t("reimport.info1")}${t("reimport.info2")}${t("reimport.info3")}`,
              )}
            </p>
          </div>
        ) : (
          <div className="reimport-diff">
            {diff.updated.length > 0 && (
              <div className="reimport-section">
                <h3 className="reimport-section-title reimport-updated">
                  {t("reimport.updated")} ({diff.updated.length})
                </h3>
                <ul className="reimport-list">
                  {diff.updated.map((item) => (
                    <li key={item.nodeId}>{item.nodeName}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.added.length > 0 && (
              <div className="reimport-section">
                <h3 className="reimport-section-title reimport-added">
                  {t("reimport.added")} ({diff.added.length})
                </h3>
                <ul className="reimport-list">
                  {diff.added.map((item) => (
                    <li key={`added-${item.nodeName}`}>{item.nodeName}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.removed.length > 0 && (
              <div className="reimport-section">
                <h3 className="reimport-section-title reimport-removed">
                  {t("reimport.removedFromPsd")} ({diff.removed.length})
                </h3>
                <p className="reimport-note">{t("reimport.keptNote")}</p>
                <ul className="reimport-list">
                  {diff.removed.map((item) => (
                    <li key={item.nodeId}>{item.nodeName}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.updated.length === 0 &&
              diff.added.length === 0 &&
              diff.removed.length === 0 && (
                <p className="reimport-info">{t("reimport.noChanges")}</p>
              )}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
