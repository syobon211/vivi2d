import type { AutoSetupOptions } from "@/lib/auto-setup";
import { useFormatDialogText } from "@/lib/dialog-text";
import { useT } from "@/lib/i18n";
import type { AutoSetupExperienceMode } from "@/stores/autoSetupDraftStore";
import { AutoSetupGenerationOptionsPanel } from "./auto-setup/AutoSetupGenerationOptionsPanel";
import {
  AutoSetupSeeThroughPanel,
  type AutoSetupSeeThroughPanelProps,
} from "./auto-setup/AutoSetupSeeThroughPanel";

export interface AutoSetupStepDetectProps
  extends Omit<AutoSetupSeeThroughPanelProps, "busy" | "isAdvanced"> {
  options: AutoSetupOptions;
  setOptions: (updater: (o: AutoSetupOptions) => AutoSetupOptions) => void;
  experienceMode: AutoSetupExperienceMode;
  onChangeExperienceMode: (mode: AutoSetupExperienceMode) => void;
  onDetect: () => void;
  hasHiddenAdvancedSettings?: boolean;
  sourceBlockReason?: string | null;
  sourceBlockAction?: {
    label: string;
    run: () => void;
  } | null;
  busy?: boolean;
}

export function AutoSetupStepDetect({
  options,
  setOptions,
  experienceMode,
  onChangeExperienceMode,
  onDetect,
  hasHiddenAdvancedSettings = false,
  sourceBlockReason = null,
  sourceBlockAction = null,
  busy = false,
  ...seeThroughProps
}: AutoSetupStepDetectProps) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const isAdvanced = experienceMode === "advanced";

  return (
    <div className="auto-setup-step">
      <div className="auto-setup-hero">
        <div>
          <p className="auto-setup-eyebrow">{t("autoSetup.recommendedFlow")}</p>
          <p className="auto-setup-desc">
            {formatDialogText(t("autoSetup.detectDescription"))}
          </p>
        </div>
        <div className="auto-setup-mode-card">
          <span>{t("autoSetup.detailLevel")}</span>
          <fieldset
            className="auto-setup-mode-switch"
            aria-label={t("autoSetup.detailLevel")}
          >
            <button
              type="button"
              className={`modal-btn${!isAdvanced ? " modal-btn-primary" : ""}`}
              onClick={() => onChangeExperienceMode("beginner")}
            >
              {t("autoSetup.modeBeginner")}
            </button>
            <button
              type="button"
              className={`modal-btn${isAdvanced ? " modal-btn-primary" : ""}`}
              onClick={() => onChangeExperienceMode("advanced")}
            >
              {t("autoSetup.modeAdvanced")}
            </button>
          </fieldset>
          {hasHiddenAdvancedSettings && (
            <small>{t("autoSetup.advancedSettingsActive")}</small>
          )}
        </div>
      </div>

      <AutoSetupSeeThroughPanel
        {...seeThroughProps}
        busy={busy}
        isAdvanced={isAdvanced}
      />

      {sourceBlockReason && (
        <div className="auto-setup-panel auto-setup-warning-panel" role="status">
          <p>{sourceBlockReason}</p>
          {sourceBlockAction && (
            <button
              type="button"
              className="modal-btn modal-btn-primary"
              onClick={sourceBlockAction.run}
              disabled={busy}
            >
              {sourceBlockAction.label}
            </button>
          )}
        </div>
      )}

      <AutoSetupGenerationOptionsPanel options={options} setOptions={setOptions} />

      <div className="auto-setup-footer-cta">
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={onDetect}
          disabled={busy || Boolean(sourceBlockReason)}
        >
          {busy ? t("autoSetup.processing") : t("autoSetup.detectStart")}
        </button>
      </div>
    </div>
  );
}
