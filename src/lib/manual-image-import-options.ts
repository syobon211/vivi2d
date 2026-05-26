import type { ManualImageImportOptions } from "@vivi2d/editor-core/manual-png-import-command";

export type ManualImageImportDialogMode =
  | "openProject"
  | "importLayer"
  | "importLayers"
  | "importFolder";

export type { ManualImageImportOptions };

export const DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS: ManualImageImportOptions = {
  centerOnCanvas: false,
  trimTransparentBounds: false,
  createGroupForImportedLayers: false,
  autoGenerateMesh: false,
};

export function normalizeManualImageImportOptions(
  options?: Partial<ManualImageImportOptions>,
): ManualImageImportOptions {
  return {
    ...DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
    ...options,
  };
}

export function manualImageImportModeSupportsGrouping(
  mode: ManualImageImportDialogMode,
): boolean {
  return mode === "importLayers" || mode === "importFolder";
}
