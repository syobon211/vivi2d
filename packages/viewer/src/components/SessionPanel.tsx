import type { ReactNode } from "react";
import { VIEWER_DEFAULTS } from "../constants";
import {
  type createT,
  type Locale,
  LOCALE_DISPLAY_NAMES,
  SUPPORTED_LOCALES,
} from "../i18n";
import type { RecordingFormat, RecordingState } from "../recorder";
import { selectStyle, smallBtnStyle } from "../styles";

interface SessionPanelProps {
  t: ReturnType<typeof createT>;
  loaded: boolean;
  bgMode: "transparent" | "green" | "blue";
  smoothing: number;
  alwaysOnTop: boolean;
  showHud: boolean;
  locale: Locale;
  recordingFormat: RecordingFormat;
  recordingState: RecordingState;
  recordingElapsed: number;
  onBgModeChange: (mode: "transparent" | "green" | "blue") => void;
  onSmoothingChange: (v: number) => void;
  onToggleAlwaysOnTop: () => void;
  onToggleHud: () => void;
  onSetLocale: (locale: Locale) => void;
  onUrlLoad: () => void;
  onRecordingFormatChange: (f: RecordingFormat) => void;
  onToggleRecording: () => void;
  onSaveThumbnail: () => void;
  onExportConfig: () => void;
  onImportConfig: () => void;
}

export function SessionPanel({
  t,
  loaded,
  bgMode,
  smoothing,
  alwaysOnTop,
  showHud,
  locale,
  recordingFormat,
  recordingState,
  recordingElapsed,
  onBgModeChange,
  onSmoothingChange,
  onToggleAlwaysOnTop,
  onToggleHud,
  onSetLocale,
  onUrlLoad,
  onRecordingFormatChange,
  onToggleRecording,
  onSaveThumbnail,
  onExportConfig,
  onImportConfig,
}: SessionPanelProps) {
  const statsLabel = t("stats");
  const statsToggleLabel = t("statsToggle");

  return (
    <div
      data-testid="settings-panel"
      data-panel-id="session-panel"
      style={{
        display: "grid",
        gap: "12px",
      }}
    >
      <PanelCard title={t("display")}>
        <select
          aria-label={t("background")}
          value={bgMode}
          onChange={(e) => onBgModeChange(e.target.value as typeof bgMode)}
          style={selectStyle}
        >
          <option value="transparent">{t("bgTransparent")}</option>
          <option value="green">{t("bgGreen")}</option>
          <option value="blue">{t("bgBlue")}</option>
        </select>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "var(--text-sm)",
          }}
        >
          {t("smoothing")}
          <input
            type="range"
            min={VIEWER_DEFAULTS.SMOOTHING_MIN}
            max={VIEWER_DEFAULTS.SMOOTHING_MAX}
            step={VIEWER_DEFAULTS.SMOOTHING_STEP}
            value={smoothing}
            onChange={(e) => onSmoothingChange(Number(e.target.value))}
            style={{ minWidth: "120px", flex: 1 }}
          />
          <span style={{ width: "34px", textAlign: "right" }}>
            {Math.round(smoothing * 100)}%
          </span>
        </label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onToggleAlwaysOnTop}
            style={smallBtnStyle(alwaysOnTop)}
          >
            {alwaysOnTop ? t("alwaysOnTopOn") : t("alwaysOnTopOff")}
          </button>
          <button
            type="button"
            data-testid="session-toggle-hud"
            aria-label={statsToggleLabel}
            onClick={onToggleHud}
            style={smallBtnStyle(showHud)}
          >
            {statsLabel}
          </button>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "var(--text-sm)" }}>{t("language")}</span>
            <select
              data-testid="viewer-session-locale-select"
              aria-label={t("language")}
              value={locale}
              onChange={(event) => onSetLocale(event.target.value as Locale)}
              style={selectStyle}
            >
              {SUPPORTED_LOCALES.map((option) => (
                <option key={option} value={option}>
                  {LOCALE_DISPLAY_NAMES[option]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onUrlLoad} style={smallBtnStyle()}>
            {t("openUrl")}
          </button>
        </div>
      </PanelCard>

      {loaded && (
        <PanelCard title={t("recording")}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <select
              value={recordingFormat}
              disabled={recordingState !== "idle"}
              onChange={(e) =>
                onRecordingFormatChange(e.target.value as RecordingFormat)
              }
              style={selectStyle}
            >
              <option value="webm">{t("recFormatWebm")}</option>
              <option value="mp4">{t("recFormatMp4")}</option>
              <option value="gif">{t("recFormatGif")}</option>
            </select>
            <button
              type="button"
              onClick={onToggleRecording}
              disabled={recordingState === "processing"}
              style={{
                ...smallBtnStyle(recordingState === "recording"),
                backgroundColor:
                  recordingState === "recording"
                    ? "var(--danger)"
                    : recordingState === "processing"
                      ? "var(--text-muted)"
                      : "var(--bg-hover)",
              }}
            >
              {recordingState === "recording"
                ? `${t("recStop")} ${Math.floor(recordingElapsed)}s`
                : recordingState === "processing"
                  ? t("recProcessing")
                  : t("recStart")}
            </button>
            <button
              type="button"
              onClick={onSaveThumbnail}
              style={smallBtnStyle()}
              title={t("saveThumbnailTitle")}
            >
              {t("saveThumbnail")}
            </button>
          </div>
        </PanelCard>
      )}

      <PanelCard title={t("configuration")}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" onClick={onExportConfig} style={smallBtnStyle()}>
            {t("exportConfig")}
          </button>
          <button type="button" onClick={onImportConfig} style={smallBtnStyle()}>
            {t("importConfig")}
          </button>
        </div>
      </PanelCard>
    </div>
  );
}

function PanelCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        display: "grid",
        gap: "10px",
        padding: "12px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        backgroundColor: "var(--bg-elevated)",
      }}
    >
      <h3 style={{ margin: 0, fontSize: "14px" }}>{title}</h3>
      {children}
    </section>
  );
}
