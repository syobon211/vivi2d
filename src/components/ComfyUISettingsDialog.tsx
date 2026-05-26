import { ComfyUIClient, inspectViviCompatSupport } from "@vivi2d/provider-comfyui";
import { useCallback, useId, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ElectronComfyUITransport } from "@/lib/comfyui-electron-transport";
import { useFormatDialogText } from "@/lib/dialog-text";
import { useT } from "@/lib/i18n";
import { useComfyUIStore } from "@/stores/comfyuiStore";
import { DialogShell } from "./DialogShell";

export function ComfyUISettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const urlId = useId();
  const {
    baseUrl,
    compatBaseUrl,
    compatCapability,
    compatPluginVersion,
    compatManifestSchema,
    compatHasDecomposeNode,
    compatHasExportNode,
    compatIssues,
    compatStatus,
    setBaseUrl,
    setConnected,
    setCompatChecking,
    setCompatSupported,
    setCompatMissing,
  } = useComfyUIStore(
    useShallow((s) => ({
      baseUrl: s.baseUrl,
      compatBaseUrl: s.compatBaseUrl,
      compatCapability: s.compatCapability,
      compatPluginVersion: s.compatPluginVersion,
      compatManifestSchema: s.compatManifestSchema,
      compatHasDecomposeNode: s.compatHasDecomposeNode,
      compatHasExportNode: s.compatHasExportNode,
      compatIssues: s.compatIssues,
      compatStatus: s.compatStatus,
      setBaseUrl: s.setBaseUrl,
      setConnected: s.setConnected,
      setCompatChecking: s.setCompatChecking,
      setCompatSupported: s.setCompatSupported,
      setCompatMissing: s.setCompatMissing,
    })),
  );
  const [url, setUrl] = useState(baseUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const compatResult =
    testResult === "error" || testing
      ? null
      : compatBaseUrl === url && compatStatus === "ready"
        ? "ready"
        : compatBaseUrl === url && compatStatus === "missing"
          ? "missing"
          : null;

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const client = new ComfyUIClient({
        transport: new ElectronComfyUITransport(url),
      });
      const ok = await client.ping();
      setTestResult(ok ? "success" : "error");
      setConnected(ok);
      if (ok) {
        setCompatChecking(url);
        const report = await inspectViviCompatSupport(client);
        if (report.supported) {
          setCompatSupported(url, report);
        } else {
          setCompatMissing(url, report.issues, report);
        }
      }
    } catch {
      setTestResult("error");
      setConnected(false);
    } finally {
      setTesting(false);
    }
  }, [url, setCompatChecking, setCompatMissing, setCompatSupported, setConnected]);

  const handleSave = useCallback(() => {
    setBaseUrl(url);
    onClose();
  }, [url, setBaseUrl, onClose]);

  return (
    <DialogShell
      onClose={onClose}
      title={t("ai.comfyuiTitle")}
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
            {t("ai.comfyuiUrl")}
          </label>
          <input
            id={urlId}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="ai-gen-input"
            style={{ width: "100%" }}
            placeholder="http://127.0.0.1:8188"
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginTop: "8px",
          }}
        >
          <button
            type="button"
            className="prop-btn"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? t("ai.testing") : t("ai.testConnection")}
          </button>

          {testResult === "success" && (
            <span style={{ color: "#4caf50" }}>{t("ai.connectionSuccess")}</span>
          )}
          {testResult === "error" && (
            <span style={{ color: "#f44336" }}>{t("ai.connectionFailed")}</span>
          )}
        </div>

        {compatResult === "ready" && (
          <>
            <div
              className="ai-gen-notice"
              style={{ marginTop: "12px", color: "#4caf50" }}
            >
              {formatDialogText(t("ai.compatReady"))}
            </div>
            {compatManifestSchema && (
              <div className="ai-gen-notice" style={{ marginTop: "8px" }}>
                {t("ai.compatSchema")}: {compatManifestSchema}
              </div>
            )}
            {compatPluginVersion && (
              <div className="ai-gen-notice" style={{ marginTop: "8px" }}>
                {t("ai.compatPluginVersion")}: {compatPluginVersion}
              </div>
            )}
            <div className="ai-gen-notice" style={{ marginTop: "8px" }}>
              {t("ai.compatNodes")}: {t("ai.compatNode.decompose")}{" "}
              {compatHasDecomposeNode
                ? t("ai.compatNode.ok")
                : t("ai.compatNode.missing")}{" "}
              / {t("ai.compatNode.export")}{" "}
              {compatHasExportNode ? t("ai.compatNode.ok") : t("ai.compatNode.missing")}
            </div>
            {compatCapability && (
              <div className="ai-gen-notice" style={{ marginTop: "8px" }}>
                {t("ai.compatCapability")}: {compatCapability}
              </div>
            )}
          </>
        )}
        {compatResult === "missing" && (
          <>
            <div
              className="ai-gen-notice"
              style={{ marginTop: "12px", color: "#ff9800" }}
            >
              {formatDialogText(t("ai.compatFallback"))}
            </div>
            {compatIssues.length > 0 && (
              <div className="ai-gen-notice" style={{ marginTop: "8px" }}>
                {t("ai.compatIssue")}: {compatIssues[0]}
              </div>
            )}
            <div className="ai-gen-notice" style={{ marginTop: "8px" }}>
              {t("ai.compatNodes")}: {t("ai.compatNode.decompose")}{" "}
              {compatHasDecomposeNode
                ? t("ai.compatNode.ok")
                : t("ai.compatNode.missing")}{" "}
              / {t("ai.compatNode.export")}{" "}
              {compatHasExportNode ? t("ai.compatNode.ok") : t("ai.compatNode.missing")}
            </div>
            {compatCapability && (
              <div className="ai-gen-notice" style={{ marginTop: "8px" }}>
                {t("ai.compatCapability")}: {compatCapability}
              </div>
            )}
            {compatPluginVersion && (
              <div className="ai-gen-notice" style={{ marginTop: "8px" }}>
                {t("ai.compatPluginVersion")}: {compatPluginVersion}
              </div>
            )}
          </>
        )}

        <div className="ai-gen-notice" style={{ marginTop: "12px" }}>
          {formatDialogText(t("ai.comfyuiNotice"))}
        </div>
      </div>
    </DialogShell>
  );
}
