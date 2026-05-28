import type { ParticleEffectType } from "@vivi2d/renderer-pixi";
import type { ReactNode } from "react";
import type { createT, Locale } from "../i18n";
import { selectStyle, smallBtnStyle } from "../styles";
import type { LipSyncMode } from "../tracking/lipsync-analyser";

interface InputEffectsPanelProps {
  t: ReturnType<typeof createT>;
  loaded: boolean;
  locale: Locale;
  tracking: boolean;
  handTracking: boolean;
  lipSync: boolean;
  poseTracking: boolean;
  lipSyncMode: LipSyncMode;
  cameras: MediaDeviceInfo[];
  selectedCamera: string;
  colliderEffects: boolean;
  gamepadActive: boolean;
  midiActive: boolean;
  scriptInput: string;
  scriptRunning: boolean;
  onToggleTracking: () => void;
  onToggleHandTracking: () => void;
  onToggleLipSync: () => void;
  onTogglePoseTracking: () => void;
  onCameraChange: (deviceId: string) => void;
  onLipSyncModeChange: (mode: LipSyncMode) => void;
  onToggleColliderEffects: () => void;
  onPlayEffect: (type: ParticleEffectType) => void;
  onToggleGamepad: () => void;
  onToggleMidi: () => void;
  onScriptInputChange: (v: string) => void;
  onRunScript: () => void;
}

export function InputEffectsPanel({
  t,
  loaded,
  locale,
  tracking,
  handTracking,
  lipSync,
  poseTracking,
  lipSyncMode,
  cameras,
  selectedCamera,
  colliderEffects,
  gamepadActive,
  midiActive,
  scriptInput,
  scriptRunning,
  onToggleTracking,
  onToggleHandTracking,
  onToggleLipSync,
  onTogglePoseTracking,
  onCameraChange,
  onLipSyncModeChange,
  onToggleColliderEffects,
  onPlayEffect,
  onToggleGamepad,
  onToggleMidi,
  onScriptInputChange,
  onRunScript,
}: InputEffectsPanelProps) {
  return (
    <div data-testid="input-effects-panel" style={{ display: "grid", gap: "12px" }}>
      <PanelCard title={t("tracking")}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <TrackingButton
            testId="viewer-toggle-face-tracking"
            label={t("faceTrackingStart")}
            title={t("faceTrackingTip")}
            active={tracking}
            loaded={loaded}
            onClick={onToggleTracking}
          />
          <TrackingButton
            testId="viewer-toggle-hand-tracking"
            label={t("handTrackingStart")}
            title={t("handTrackingTip")}
            active={handTracking}
            loaded={loaded}
            onClick={onToggleHandTracking}
          />
          <TrackingButton
            testId="viewer-toggle-lip-sync"
            label={t("lipSyncStart")}
            title={t("lipSyncTip")}
            active={lipSync}
            loaded={loaded}
            onClick={onToggleLipSync}
          />
          <TrackingButton
            testId="viewer-toggle-pose-tracking"
            label={t("poseStart")}
            title={t("poseTrackingTip")}
            active={poseTracking}
            loaded={loaded}
            onClick={onTogglePoseTracking}
          />
        </div>
        {cameras.length > 1 && (
          <select
            data-testid="camera-select"
            aria-label={t("camera")}
            value={selectedCamera}
            disabled={tracking}
            onChange={(event) => onCameraChange(event.target.value)}
            style={selectStyle}
          >
            <option value="">{t("defaultCamera")}</option>
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label ||
                  `${t("cameraPrefix")} ${camera.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        )}
        {!lipSync && (
          <select
            aria-label={t("lipSyncMode")}
            value={lipSyncMode}
            onChange={(e) => onLipSyncModeChange(e.target.value as LipSyncMode)}
            style={selectStyle}
          >
            <option value="rms">{t("lipSyncRms")}</option>
            <option value="viseme">{t("lipSyncViseme")}</option>
          </select>
        )}
      </PanelCard>

      {loaded && (
        <PanelCard title={t("reactions")}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
          </div>
        </PanelCard>
      )}

      {loaded && (
        <PanelCard title={t("devicesAndScript")}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onToggleGamepad}
              style={smallBtnStyle(gamepadActive)}
            >
              {gamepadActive ? t("gamepadStop") : t("gamepadStart")}
            </button>
            <button
              type="button"
              onClick={onToggleMidi}
              style={smallBtnStyle(midiActive)}
            >
              {midiActive ? t("midiStop") : t("midiStart")}
            </button>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              data-testid="viewer-script-input"
              value={scriptInput}
              onChange={(e) => onScriptInputChange(e.target.value)}
              placeholder={t("scriptPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRunScript();
              }}
              style={{
                minWidth: 0,
                flex: 1,
                padding: "6px 8px",
                backgroundColor: "var(--border)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-sm)",
              }}
            />
            <button
              type="button"
              data-testid="viewer-script-run-button"
              onClick={onRunScript}
              style={smallBtnStyle(scriptRunning)}
            >
              {scriptRunning ? t("scriptStop") : t("scriptRun")}
            </button>
          </div>
        </PanelCard>
      )}
    </div>
  );
}

function TrackingButton({
  label,
  testId,
  title,
  active,
  loaded,
  onClick,
}: {
  label: string;
  testId: string;
  title: string;
  active: boolean;
  loaded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={!loaded}
      title={title}
      style={{
        ...smallBtnStyle(active),
        opacity: loaded ? 1 : 0.5,
        cursor: loaded ? "pointer" : "not-allowed",
      }}
    >
      {label}
    </button>
  );
}

function PanelCard({ title, children }: { title: string; children: ReactNode }) {
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
