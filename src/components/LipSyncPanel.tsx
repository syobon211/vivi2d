import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { usePhysicsStore } from "@/stores/physicsStore";

export function LipSyncPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const setLipSyncConfig = usePhysicsStore((s) => s.setLipSyncConfig);
  const currentVolume = useLipSyncStore((s) => s.currentVolume);
  const isConnected = useLipSyncStore((s) => s.isConnected);
  const error = useLipSyncStore((s) => s.error);

  if (!project) return null;

  const config = project.lipsyncConfig;
  const { parameters } = project;

  return (
    <div className="panel lipsync-panel">
      <div className="panel-header">
        {t("lipSync.title")}
        <label className="physics-toggle">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setLipSyncConfig({ enabled: e.target.checked })}
          />
          {t("common.enabled")}
        </label>
      </div>
      <div className="panel-content scrollbar-thin">
        {error && <div className="lipsync-error">{error}</div>}

        <div className="lipsync-status">
          <span className={`lipsync-indicator ${isConnected ? "connected" : ""}`} />
          {isConnected ? t("lipSync.connected") : t("lipSync.disconnected")}
        </div>

        {/* Volume Meter */}
        <div className="lipsync-meter">
          <div className="lipsync-meter-label">{t("lipSync.volume")}</div>
          <div className="lipsync-meter-bar">
            <div
              className="lipsync-meter-fill"
              style={{ width: `${Math.round(currentVolume * 100)}%` }}
            />
          </div>
          <span className="lipsync-meter-value">{Math.round(currentVolume * 100)}%</span>
        </div>

        {/* Settings */}
        <div className="lipsync-config">
          <label className="lipsync-field">
            {t("lipSync.targetParam")}
            <select
              value={config.targetParameterId ?? ""}
              onChange={(e) =>
                setLipSyncConfig({
                  targetParameterId: e.target.value || null,
                })
              }
              className="lipsync-select"
            >
              <option value="">{t("lipSync.unset")}</option>
              {parameters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="lipsync-field">
            {t("lipSync.source")}
            <select
              value={config.source}
              onChange={(e) =>
                setLipSyncConfig({
                  source: e.target.value as "microphone" | "file",
                })
              }
              className="lipsync-select"
            >
              <option value="microphone">{t("lipSync.mic")}</option>
              <option value="file">{t("lipSync.file")}</option>
            </select>
          </label>

          <label className="lipsync-field">
            {t("lipSync.sensitivity")}
            <div className="lipsync-slider-row">
              <input
                type="range"
                min={0.1}
                max={10}
                step={0.1}
                value={config.gain}
                onChange={(e) => setLipSyncConfig({ gain: Number(e.target.value) })}
                className="lipsync-slider"
              />
              <span className="lipsync-value">{config.gain.toFixed(1)}</span>
            </div>
          </label>

          <label className="lipsync-field">
            {t("lipSync.smoothing")}
            <div className="lipsync-slider-row">
              <input
                type="range"
                min={0}
                max={0.99}
                step={0.01}
                value={config.smoothing}
                onChange={(e) => setLipSyncConfig({ smoothing: Number(e.target.value) })}
                className="lipsync-slider"
              />
              <span className="lipsync-value">{config.smoothing.toFixed(2)}</span>
            </div>
          </label>

          <label className="lipsync-field">
            {t("lipSync.threshold")}
            <div className="lipsync-slider-row">
              <input
                type="range"
                min={0}
                max={0.2}
                step={0.005}
                value={config.threshold}
                onChange={(e) => setLipSyncConfig({ threshold: Number(e.target.value) })}
                className="lipsync-slider"
              />
              <span className="lipsync-value">{config.threshold.toFixed(3)}</span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
