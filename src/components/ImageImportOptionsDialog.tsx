import { useEffect, useState } from "react";
import { useFormatDialogText } from "@/lib/dialog-text";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
  type ManualImageImportDialogMode,
  type ManualImageImportOptions,
  manualImageImportModeSupportsGrouping,
  normalizeManualImageImportOptions,
} from "@/lib/manual-image-import-options";
import { DialogShell } from "./DialogShell";

type Props = {
  mode: ManualImageImportDialogMode;
  initialOptions?: Partial<ManualImageImportOptions>;
  onCancel: () => void;
  onConfirm: (options: ManualImageImportOptions) => void;
};

function getTitleKey(mode: ManualImageImportDialogMode): I18nKey {
  switch (mode) {
    case "openProject":
      return "imageImportOptions.title.openProject";
    case "importLayer":
      return "imageImportOptions.title.importLayer";
    case "importLayers":
      return "imageImportOptions.title.importLayers";
    case "importFolder":
      return "imageImportOptions.title.importFolder";
  }
}

function getDescriptionKey(mode: ManualImageImportDialogMode): I18nKey {
  switch (mode) {
    case "openProject":
      return "imageImportOptions.description.openProject";
    case "importLayer":
      return "imageImportOptions.description.importLayer";
    case "importLayers":
      return "imageImportOptions.description.importLayers";
    case "importFolder":
      return "imageImportOptions.description.importFolder";
  }
}

export function ImageImportOptionsDialog({
  mode,
  initialOptions,
  onCancel,
  onConfirm,
}: Props) {
  const t = useT();
  const formatDialogText = useFormatDialogText();
  const [options, setOptions] = useState<ManualImageImportOptions>(() =>
    normalizeManualImageImportOptions(initialOptions),
  );

  useEffect(() => {
    setOptions(normalizeManualImageImportOptions(initialOptions));
  }, [initialOptions]);

  const supportsGrouping = manualImageImportModeSupportsGrouping(mode);

  const handleConfirm = () => {
    onConfirm({
      ...options,
      createGroupForImportedLayers: supportsGrouping
        ? options.createGroupForImportedLayers
        : DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS.createGroupForImportedLayers,
    });
  };

  return (
    <DialogShell
      onClose={onCancel}
      title={t(getTitleKey(mode))}
      className="image-import-options-dialog"
      minWidth={420}
      footer={
        <>
          <button type="button" className="modal-btn" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={handleConfirm}
          >
            {t("common.import")}
          </button>
        </>
      }
    >
      <div className="image-import-options-body">
        <p className="image-import-options-description">
          {formatDialogText(t(getDescriptionKey(mode)))}
        </p>
        <label className="image-import-options-row">
          <input
            type="checkbox"
            checked={options.centerOnCanvas}
            onChange={(e) =>
              setOptions((current) => ({
                ...current,
                centerOnCanvas: e.target.checked,
              }))
            }
          />
          <span>{t("imageImportOptions.centerOnCanvas")}</span>
        </label>
        <label className="image-import-options-row">
          <input
            type="checkbox"
            checked={options.trimTransparentBounds}
            onChange={(e) =>
              setOptions((current) => ({
                ...current,
                trimTransparentBounds: e.target.checked,
              }))
            }
          />
          <span>{t("imageImportOptions.trimTransparentBounds")}</span>
        </label>
        {supportsGrouping && (
          <label className="image-import-options-row">
            <input
              type="checkbox"
              checked={options.createGroupForImportedLayers}
              onChange={(e) =>
                setOptions((current) => ({
                  ...current,
                  createGroupForImportedLayers: e.target.checked,
                }))
              }
            />
            <span>{t("imageImportOptions.createGroupForImportedLayers")}</span>
          </label>
        )}
        <label className="image-import-options-row">
          <input
            type="checkbox"
            checked={options.autoGenerateMesh}
            onChange={(e) =>
              setOptions((current) => ({
                ...current,
                autoGenerateMesh: e.target.checked,
              }))
            }
          />
          <span>{t("imageImportOptions.autoGenerateMesh")}</span>
        </label>
        <p className="image-import-options-note">
          {formatDialogText(t("imageImportOptions.dragDropUsesDefaults"))}
        </p>
      </div>
    </DialogShell>
  );
}
