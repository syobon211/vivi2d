import type { ParticleEffectType } from "@vivi2d/renderer-pixi";
import { VIEWER_DEFAULTS } from "../constants";
import {
  type createT,
  type Locale,
  LOCALE_DISPLAY_NAMES,
  SUPPORTED_LOCALES,
} from "../i18n";
import type { RecordingFormat, RecordingState } from "../recorder";
import { selectStyle, smallBtnStyle } from "../styles";
import type { LipSyncMode } from "../tracking/lipsync-analyser";

interface SettingsPanelProps {
  t: ReturnType<typeof createT>;
  loaded: boolean;
  bgMode: "transparent" | "green" | "blue";
  smoothing: number;
  lipSync: boolean;
  lipSyncMode: LipSyncMode;
  alwaysOnTop: boolean;
  showHud: boolean;
  locale: Locale;
  colliderEffects: boolean;
  recordingFormat: RecordingFormat;
  recordingState: RecordingState;
  recordingElapsed: number;
  gamepadActive: boolean;
  midiActive: boolean;
  scriptInput: string;
  scriptRunning: boolean;
  onBgModeChange: (mode: "transparent" | "green" | "blue") => void;
  onSmoothingChange: (v: number) => void;
  onLipSyncModeChange: (mode: LipSyncMode) => void;
  onToggleAlwaysOnTop: () => void;
  onToggleHud: () => void;
  onSetLocale: (locale: Locale) => void;
  onUrlLoad: () => void;
  onToggleColliderEffects: () => void;
  onPlayEffect: (type: ParticleEffectType) => void;
  onRecordingFormatChange: (f: RecordingFormat) => void;
  onToggleRecording: () => void;
  onToggleGamepad: () => void;
  onToggleMidi: () => void;
  onScriptInputChange: (v: string) => void;
  onRunScript: () => void;
  onSaveThumbnail: () => void;
  onExportConfig: () => void;
  onImportConfig: () => void;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    t,
    loaded,
    bgMode,
    smoothing,
    lipSync,
    lipSyncMode,
    alwaysOnTop,
    showHud,
    locale,
    colliderEffects,
    recordingFormat,
    recordingState,
    recordingElapsed,
    gamepadActive,
    midiActive,
    scriptInput,
    scriptRunning,
    onBgModeChange,
    onSmoothingChange,
    onLipSyncModeChange,
    onToggleAlwaysOnTop,
    onToggleHud,
    onSetLocale,
    onUrlLoad,
    onToggleColliderEffects,
    onPlayEffect,
    onRecordingFormatChange,
    onToggleRecording,
    onToggleGamepad,
    onToggleMidi,
    onScriptInputChange,
    onRunScript,
    onSaveThumbnail,
    onExportConfig,
    onImportConfig,
  } = props;
  const statsLabel = t("stats");
  const statsToggleLabel = t("statsToggle");

  return (
    <div
      data-testid="settings-panel"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        padding: "8px 12px",
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
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
          gap: "4px",
          fontSize: "12px",
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
          style={{ width: "70px" }}
        />
        <span style={{ width: "28px", textAlign: "right", fontSize: "11px" }}>
          {Math.round(smoothing * 100)}%
        </span>
      </label>

      {!lipSync && (
        <select
          aria-label={t("lipSyncTip")}
          value={lipSyncMode}
          onChange={(e) => onLipSyncModeChange(e.target.value as LipSyncMode)}
          style={selectStyle}
        >
          <option value="rms">{t("lipSyncRms")}</option>
          <option value="viseme">{t("lipSyncViseme")}</option>
        </select>
      )}

      <button
        type="button"
        onClick={onToggleAlwaysOnTop}
        style={smallBtnStyle(alwaysOnTop)}
      >
        {alwaysOnTop ? t("alwaysOnTopOn") : t("alwaysOnTopOff")}
      </button>

      <button
        type="button"
        aria-label={statsToggleLabel}
        onClick={onToggleHud}
        style={smallBtnStyle(showHud)}
      >
        {statsLabel}
      </button>
      <select
        data-testid="viewer-settings-locale-select"
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
      <button type="button" onClick={onUrlLoad} style={smallBtnStyle()}>
        {t("openUrl")}
      </button>

      {loaded && (
        <span
          style={{
            display: "inline-flex",
            gap: "6px",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onToggleColliderEffects}
            style={smallBtnStyle(colliderEffects)}
          >
            {colliderEffects ? t("colliderEffectsOn") : t("colliderEffectsOff")}
          </button>
          <button
            type="button"
            onClick={() => onPlayEffect("confetti")}
            style={smallBtnStyle()}
          >
            {t("confetti")}
          </button>
          <button
            type="button"
            onClick={() => onPlayEffect("hearts")}
            style={smallBtnStyle()}
          >
            {t("hearts")}
          </button>
          <button
            type="button"
            onClick={() => onPlayEffect("stars")}
            style={smallBtnStyle()}
          >
            {t("stars")}
          </button>
          <button
            type="button"
            onClick={() => onPlayEffect("sparkles")}
            style={smallBtnStyle()}
          >
            {t("sparkles")}
          </button>
        </span>
      )}

      {loaded && (
        <>
          <span style={{ fontSize: "11px", opacity: 0.4 }}>|</span>
          <select
            value={recordingFormat}
            disabled={recordingState !== "idle"}
            onChange={(e) => onRecordingFormatChange(e.target.value as RecordingFormat)}
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
        </>
      )}

      {loaded && (
        <>
          <span style={{ fontSize: "11px", opacity: 0.4 }}>|</span>
          <button
            type="button"
            onClick={onToggleGamepad}
            style={smallBtnStyle(gamepadActive)}
          >
            {gamepadActive ? t("gamepadStop") : t("gamepadStart")}
          </button>
          <button type="button" onClick={onToggleMidi} style={smallBtnStyle(midiActive)}>
            {midiActive ? t("midiStop") : t("midiStart")}
          </button>
        </>
      )}

      {loaded && (
        <>
          <span style={{ fontSize: "11px", opacity: 0.4 }}>|</span>
          <input
            type="text"
            value={scriptInput}
            onChange={(e) => onScriptInputChange(e.target.value)}
            placeholder={t("scriptPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRunScript();
            }}
            style={{
              padding: "4px 8px",
              backgroundColor: "var(--border)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-sm)",
              width: "180px",
            }}
          />
          <button
            type="button"
            onClick={onRunScript}
            style={smallBtnStyle(scriptRunning)}
          >
            {scriptRunning ? t("scriptStop") : t("scriptRun")}
          </button>
        </>
      )}

      <span style={{ fontSize: "11px", opacity: 0.4 }}>|</span>
      {loaded && (
        <button
          type="button"
          onClick={onSaveThumbnail}
          style={smallBtnStyle()}
          title={t("saveThumbnailTitle")}
        >
          {t("saveThumbnail")}
        </button>
      )}
      <button type="button" onClick={onExportConfig} style={smallBtnStyle()}>
        {t("exportConfig")}
      </button>
      <button type="button" onClick={onImportConfig} style={smallBtnStyle()}>
        {t("importConfig")}
      </button>
    </div>
  );
}
