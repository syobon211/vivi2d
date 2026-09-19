import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatDialogText } from "@/lib/dialog-text";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  analyzePsdReimport,
  applyPsdReimport,
  disposePsdReimport,
  type PsdReimportPreview,
} from "@/lib/psd-reimport";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { DialogShell } from "./DialogShell";

interface ReimportDialogProps {
  onClose: () => void;
}

const reasonKeys = {
  "incoming-name-ambiguous": "reimport.reason.incomingNameAmbiguous",
  "existing-name-ambiguous": "reimport.reason.existingNameAmbiguous",
  "token-ambiguous": "reimport.reason.tokenAmbiguous",
  "target-conflict": "reimport.reason.targetConflict",
  "unsupported-target": "reimport.reason.unsupportedTarget",
  "missing-pixels": "reimport.reason.missingPixels",
  "missing-texture": "reimport.reason.missingTexture",
  "invalid-dimensions": "reimport.reason.invalidDimensions",
  "aspect-ratio-change": "reimport.reason.aspectRatioChange",
} satisfies Record<NonNullable<PsdReimportPreview["entries"][number]["reason"]>, I18nKey>;

const statusKeys = {
  eligible: "reimport.sameSize",
  "needs-confirmation": "reimport.needsConfirmation",
  held: "reimport.held",
  unmatched: "reimport.notAdded",
} satisfies Record<PsdReimportPreview["entries"][number]["status"], I18nKey>;

export function ReimportDialog({ onClose }: ReimportDialogProps) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const project = useEditorStore((s) => s.project);
  const [preview, setPreview] = useState<PsdReimportPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [resolutionConfirmed, setResolutionConfirmed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const previewRef = useRef<PsdReimportPreview | null>(null);
  const requestId = useRef(0);

  const disposeCurrentPreview = useCallback(() => {
    if (previewRef.current) disposePsdReimport(previewRef.current);
    previewRef.current = null;
  }, []);

  useEffect(
    () => () => {
      requestId.current++;
      disposeCurrentPreview();
    },
    [disposeCurrentPreview],
  );

  const clearPreview = useCallback(() => {
    disposeCurrentPreview();
    setPreview(null);
    setSelected([]);
    setResolutionConfirmed(false);
  }, [disposeCurrentPreview]);

  const handleClose = useCallback(() => {
    requestId.current++;
    clearPreview();
    setIsAnalyzing(false);
    onClose();
  }, [clearPreview, onClose]);

  const handleSelectFile = useCallback(async () => {
    if (!project || isAnalyzing) return;
    // Capture the project before opening the asynchronous native file dialog.
    const analysisProject = project;
    const currentRequest = ++requestId.current;
    clearPreview();
    setIsAnalyzing(true);
    try {
      const result = await window.electronAPI.openPsdFile();
      if (currentRequest !== requestId.current || !result) return;
      const analyzed = await analyzePsdReimport(result.buffer, analysisProject);
      if (currentRequest !== requestId.current) {
        disposePsdReimport(analyzed);
        return;
      }
      if (useEditorStore.getState().project !== analysisProject) {
        disposePsdReimport(analyzed);
        useNotificationStore
          .getState()
          .addNotification("error", t("reimport.parseFailedPrefix"));
        return;
      }
      previewRef.current = analyzed;
      setPreview(analyzed);
      setSelected(
        analyzed.entries
          .filter((entry) => entry.status === "eligible")
          .map((entry) => entry.leafIndex),
      );
    } catch {
      if (currentRequest === requestId.current) {
        useNotificationStore
          .getState()
          .addNotification("error", t("reimport.parseFailedPrefix"));
      }
    } finally {
      if (currentRequest === requestId.current) setIsAnalyzing(false);
    }
  }, [clearPreview, isAnalyzing, project, t]);

  const selectedSet = new Set(selected);
  const resolutionChanges =
    preview?.entries.filter(
      (entry) =>
        entry.status === "needs-confirmation" && selectedSet.has(entry.leafIndex),
    ) ?? [];
  const needsConfirmation = resolutionChanges.length > 0 && !resolutionConfirmed;

  const handleApply = () => {
    if (!preview || isAnalyzing || selected.length === 0 || needsConfirmation) return;
    try {
      const { updatedCount } = applyPsdReimport(preview, {
        selectedLeafIndices: selected,
        confirmedResolutionLeafIndices: resolutionConfirmed
          ? resolutionChanges.map((entry) => entry.leafIndex)
          : [],
      });
      useNotificationStore
        .getState()
        .addNotification(
          "info",
          updatedCount === 0
            ? t("reimport.noChanges")
            : `${t("reimport.completedPrefix")} ${updatedCount} ${t("reimport.updatedCountSuffix")}`,
        );
      handleClose();
    } catch {
      clearPreview();
      useNotificationStore
        .getState()
        .addNotification("error", t("reimport.failedPrefix"));
    }
  };

  const footer = (
    <>
      <button type="button" className="modal-btn" onClick={handleClose}>
        {t("common.cancel")}
      </button>
      <button
        type="button"
        className="modal-btn"
        onClick={handleSelectFile}
        disabled={isAnalyzing || !project}
      >
        {isAnalyzing ? t("reimport.analyzing") : t("reimport.selectPsd")}
      </button>
      {preview?.entries.some(
        (entry) => entry.status === "eligible" || entry.status === "needs-confirmation",
      ) && (
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={handleApply}
          disabled={isAnalyzing || selected.length === 0 || needsConfirmation}
        >
          {t("common.apply")}
        </button>
      )}
    </>
  );

  return (
    <DialogShell
      onClose={handleClose}
      title={t("reimport.title")}
      className="reimport-dialog"
      footer={footer}
    >
      <div className="reimport-dialog-body">
        {!preview ? (
          <p className="reimport-info">
            {formatDialogText(
              `${t("reimport.info1")} ${t("reimport.info2")} ${t("reimport.info3")}`,
            )}
          </p>
        ) : (
          <div className="reimport-diff">
            <p className="reimport-info">{t("reimport.preservedNotice")}</p>
            <p className="reimport-note">{t("reimport.framingNotice")}</p>
            <p className="reimport-note">
              {t("reimport.sourceDocumentSize")}: {preview.documentWidth} ×{" "}
              {preview.documentHeight} px. {t("reimport.sourcePlacementNotice")}
            </p>
            {preview.entries.length > 0 && (
              <ul className="reimport-list">
                {preview.entries.map((entry) => (
                  <li key={entry.leafIndex}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(entry.leafIndex)}
                        disabled={entry.status === "held" || entry.status === "unmatched"}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected((current) =>
                            checked
                              ? [...current, entry.leafIndex]
                              : current.filter((index) => index !== entry.leafIndex),
                          );
                          if (entry.status === "needs-confirmation") {
                            setResolutionConfirmed(false);
                          }
                        }}
                      />{" "}
                      {entry.nodeName}
                    </label>
                    <div>
                      {t(statusKeys[entry.status])}
                      {entry.reason ? `: ${t(reasonKeys[entry.reason])}` : ""}
                    </div>
                    <div>
                      {t("reimport.texturePixels")}: {entry.oldWidth ?? "—"} ×{" "}
                      {entry.oldHeight ?? "—"} → {entry.newWidth} × {entry.newHeight} px
                    </div>
                    <div>
                      {t("reimport.sourcePosition")}: ({entry.sourceLeft},{" "}
                      {entry.sourceTop}) px
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {resolutionChanges.length > 0 && (
              <div className="reimport-section">
                <h3 className="reimport-section-title">
                  {t("reimport.confirmResolutionTitle")}
                </h3>
                <ul className="reimport-list">
                  {resolutionChanges.map((entry) => (
                    <li key={entry.leafIndex}>
                      {entry.nodeName}: {entry.oldWidth} × {entry.oldHeight} →{" "}
                      {entry.newWidth} × {entry.newHeight} px
                    </li>
                  ))}
                </ul>
                <p className="reimport-note">{t("reimport.confirmResolutionNotice")}</p>
                {resolutionConfirmed && (
                  <p role="status">{t("reimport.resolutionConfirmed")}</p>
                )}
                <button
                  type="button"
                  className="modal-btn"
                  onClick={() => {
                    const resized = new Set(
                      resolutionChanges.map((entry) => entry.leafIndex),
                    );
                    setSelected((current) =>
                      current.filter((index) => !resized.has(index)),
                    );
                    setResolutionConfirmed(false);
                  }}
                >
                  {t("reimport.keepCurrent")}
                </button>
                <button
                  type="button"
                  className="modal-btn"
                  disabled={resolutionConfirmed}
                  onClick={() => setResolutionConfirmed(true)}
                >
                  {t("reimport.confirmSameFraming")}
                </button>
              </div>
            )}
            {preview.removed.length > 0 && (
              <div className="reimport-section">
                <h3 className="reimport-section-title reimport-removed">
                  {t("reimport.removedFromPsd")} ({preview.removed.length})
                </h3>
                <p className="reimport-note">{t("reimport.keptNote")}</p>
                <ul className="reimport-list">
                  {preview.removed.map((item) => (
                    <li key={item.nodeId}>{item.nodeName}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.entries.length === 0 && preview.removed.length === 0 && (
              <p className="reimport-info">{t("reimport.noChanges")}</p>
            )}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
