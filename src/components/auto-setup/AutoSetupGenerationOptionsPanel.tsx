import type { MeshDensityPreset } from "@vivi2d/core/constants";
import type { AutoSetupOptions } from "@/lib/auto-setup";
import { useT } from "@/lib/i18n";
import { MESH_PRESET_LABEL_KEYS } from "../AutoSetupHelpers";

interface AutoSetupGenerationOptionsPanelProps {
  options: AutoSetupOptions;
  setOptions: (updater: (o: AutoSetupOptions) => AutoSetupOptions) => void;
}

export function AutoSetupGenerationOptionsPanel({
  options,
  setOptions,
}: AutoSetupGenerationOptionsPanelProps) {
  const t = useT();

  return (
    <div className="auto-setup-panel">
      <div className="auto-setup-panel-header">
        <div>
          <p className="auto-setup-eyebrow">{t("autoSetup.settings")}</p>
          <h3>{t("autoSetup.generationPlan")}</h3>
        </div>
      </div>
      <div className="auto-setup-options">
        <label className="auto-setup-check auto-setup-option-card">
          <input
            type="checkbox"
            checked={options.generateBones}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                generateBones: event.target.checked,
              }))
            }
          />
          {t("autoSetup.generateBones")}
        </label>
        <label className="auto-setup-check auto-setup-option-card">
          <input
            type="checkbox"
            checked={options.generateMeshes ?? false}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                generateMeshes: event.target.checked,
              }))
            }
          />
          {t("autoSetup.generateMeshes")}
        </label>
        <label className="auto-setup-check auto-setup-option-card">
          <input
            type="checkbox"
            checked={options.generateWeights ?? false}
            disabled={!options.generateBones || !options.generateMeshes}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                generateWeights: event.target.checked,
              }))
            }
          />
          {t("autoSetup.generateWeights")}
          {options.generateWeights &&
            options.generateBones &&
            options.generateMeshes && (
              <span className="auto-setup-badge">
                {t("autoSetup.weightModeBadge")}
              </span>
            )}
        </label>
        <label className="auto-setup-check auto-setup-option-card">
          <input
            type="checkbox"
            checked={options.generatePhysics}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                generatePhysics: event.target.checked,
              }))
            }
          />
          {t("autoSetup.generatePhysics")}
        </label>
      </div>
      <div className="auto-setup-field-grid">
        {options.generateMeshes && (
          <label className="auto-setup-select auto-setup-field-card">
            {t("autoSetup.meshDensity")}:
            <select
              value={options.meshPreset ?? "standard"}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  meshPreset: event.target.value as MeshDensityPreset,
                }))
              }
              className="prop-select"
            >
              {(Object.keys(MESH_PRESET_LABEL_KEYS) as MeshDensityPreset[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {t(MESH_PRESET_LABEL_KEYS[key])}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        <label className="auto-setup-confidence auto-setup-field-card">
          {t("autoSetup.minConfidence")}:
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.1}
            value={options.minConfidence}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                minConfidence: Number(event.target.value),
              }))
            }
            className="prop-slider"
          />
          <span>{(options.minConfidence * 100).toFixed(0)}%</span>
        </label>
      </div>
    </div>
  );
}
