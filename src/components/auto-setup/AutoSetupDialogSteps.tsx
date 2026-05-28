import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type { AutoSetupOptions } from "@/lib/auto-setup";
import type { I18nKey } from "@/lib/i18n";
import { type AutoSetupDialogStep } from "@/stores/autoSetupDraftStore";
import { AutoSetupStepDetect } from "../AutoSetupStepDetect";
import { AutoSetupStepOptions } from "../AutoSetupStepOptions";
import { AutoSetupStepPreview } from "../AutoSetupStepPreview";

interface AutoSetupDialogStepsProps {
  detectError: string | null;
  detecting: boolean;
  detectProgress: {
    current: number;
    total: number;
    label: string;
  } | null;
  detectStep: Omit<
    ComponentProps<typeof AutoSetupStepDetect>,
    "options" | "setOptions"
  > & {
    options: AutoSetupOptions;
    setOptions: Dispatch<SetStateAction<AutoSetupOptions>>;
  };
  optionsStep: ComponentProps<typeof AutoSetupStepOptions> | null;
  previewStep: ComponentProps<typeof AutoSetupStepPreview> | null;
  step: AutoSetupDialogStep;
  t: (key: I18nKey) => string;
}

export function AutoSetupDialogSteps({
  detectError,
  detecting,
  detectProgress,
  detectStep,
  optionsStep,
  previewStep,
  step,
  t,
}: AutoSetupDialogStepsProps) {
  return (
    <>
      {step === "detect" && (
        <>
          <AutoSetupStepDetect {...detectStep} />
          {detecting && detectProgress && (
            <div
              className="auto-setup-progress"
              role="status"
              aria-live="polite"
            >
              {t("autoSetup.weightProgress")}: {detectProgress.current}/
              {detectProgress.total}
              {detectProgress.label
                ? ` ${t("autoSetup.target")}: ${detectProgress.label}`
                : ""}
            </div>
          )}
          {detectError && (
            <p className="auto-setup-error" role="alert">
              {detectError}
            </p>
          )}
        </>
      )}
      {step === "options" && optionsStep && <AutoSetupStepOptions {...optionsStep} />}
      {step === "preview" && previewStep && <AutoSetupStepPreview {...previewStep} />}
    </>
  );
}
