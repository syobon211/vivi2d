import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
  type ManualImageImportDialogMode,
  type ManualImageImportOptions,
} from "@/lib/manual-image-import-options";
import {
  importImageAsLayer,
  importImagesAsLayers,
  importPngFolderAsLayers,
  loadImage,
} from "@/stores/projectIO";

export interface MenuDialogsController {
  showExportDialog: boolean;
  openExportDialog: () => void;
  closeExportDialog: () => void;
  showReimportDialog: boolean;
  openReimportDialog: () => void;
  closeReimportDialog: () => void;
  showShortcuts: boolean;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  showMediaExport: boolean;
  openMediaExport: () => void;
  closeMediaExport: () => void;
  showAutoSetup: boolean;
  openAutoSetup: () => void;
  closeAutoSetup: () => void;
  showAIGenerate: boolean;
  openAIGenerate: () => void;
  closeAIGenerate: () => void;
  showComfyUISettings: boolean;
  openComfyUISettings: () => void;
  closeComfyUISettings: () => void;
  showOBSSettings: boolean;
  openOBSSettings: () => void;
  closeOBSSettings: () => void;
  showVTSSettings: boolean;
  openVTSSettings: () => void;
  closeVTSSettings: () => void;
  showVividExport: boolean;
  openVividExport: () => void;
  closeVividExport: () => void;
  showVividImport: boolean;
  openVividImport: () => void;
  closeVividImport: () => void;
  showImageImportOptions: boolean;
  imageImportDialogMode: ManualImageImportDialogMode;
  imageImportInitialOptions: ManualImageImportOptions;
  handleOpenImage: () => void;
  handleImportImageAsLayer: () => void;
  handleImportImagesAsLayers: () => void;
  handleImportFolderAsLayers: () => void;
  handleImageImportOptionsCancel: () => void;
  handleImageImportOptionsConfirm: (options: ManualImageImportOptions) => Promise<void>;
}

export function useMenuDialogs(): MenuDialogsController {
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showReimportDialog, setShowReimportDialog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMediaExport, setShowMediaExport] = useState(false);
  const [showAutoSetup, setShowAutoSetup] = useState(false);
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [showComfyUISettings, setShowComfyUISettings] = useState(false);
  const [showOBSSettings, setShowOBSSettings] = useState(false);
  const [showVTSSettings, setShowVTSSettings] = useState(false);
  const [showVividExport, setShowVividExport] = useState(false);
  const [showVividImport, setShowVividImport] = useState(false);
  const [showImageImportOptions, setShowImageImportOptions] = useState(false);
  const [imageImportDialogMode, setImageImportDialogMode] =
    useState<ManualImageImportDialogMode>("openProject");
  const [imageImportInitialOptions, setImageImportInitialOptions] =
    useState<ManualImageImportOptions>(DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS);

  const openImageImportOptions = useCallback((mode: ManualImageImportDialogMode) => {
    setImageImportDialogMode(mode);
    setImageImportInitialOptions(DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS);
    setShowImageImportOptions(true);
  }, []);

  const handleOpenImage = useCallback(() => {
    openImageImportOptions("openProject");
  }, [openImageImportOptions]);
  const handleImportImageAsLayer = useCallback(() => {
    openImageImportOptions("importLayer");
  }, [openImageImportOptions]);
  const handleImportImagesAsLayers = useCallback(() => {
    openImageImportOptions("importLayers");
  }, [openImageImportOptions]);
  const handleImportFolderAsLayers = useCallback(() => {
    openImageImportOptions("importFolder");
  }, [openImageImportOptions]);
  const handleImageImportOptionsCancel = useCallback(() => {
    setShowImageImportOptions(false);
  }, []);
  const handleImageImportOptionsConfirm = useCallback(
    async (options: ManualImageImportOptions) => {
      setShowImageImportOptions(false);
      switch (imageImportDialogMode) {
        case "openProject":
          await loadImage(options);
          return;
        case "importLayer":
          await importImageAsLayer(options);
          return;
        case "importLayers":
          await importImagesAsLayers(options);
          return;
        case "importFolder":
          await importPngFolderAsLayers(options);
          return;
      }
    },
    [imageImportDialogMode],
  );

  return useMemo(
    () => ({
      showExportDialog,
      openExportDialog: () => setShowExportDialog(true),
      closeExportDialog: () => setShowExportDialog(false),
      showReimportDialog,
      openReimportDialog: () => setShowReimportDialog(true),
      closeReimportDialog: () => setShowReimportDialog(false),
      showShortcuts,
      openShortcuts: () => setShowShortcuts(true),
      closeShortcuts: () => setShowShortcuts(false),
      showMediaExport,
      openMediaExport: () => setShowMediaExport(true),
      closeMediaExport: () => setShowMediaExport(false),
      showAutoSetup,
      openAutoSetup: () => setShowAutoSetup(true),
      closeAutoSetup: () => setShowAutoSetup(false),
      showAIGenerate,
      openAIGenerate: () => setShowAIGenerate(true),
      closeAIGenerate: () => setShowAIGenerate(false),
      showComfyUISettings,
      openComfyUISettings: () => setShowComfyUISettings(true),
      closeComfyUISettings: () => setShowComfyUISettings(false),
      showOBSSettings,
      openOBSSettings: () => setShowOBSSettings(true),
      closeOBSSettings: () => setShowOBSSettings(false),
      showVTSSettings,
      openVTSSettings: () => setShowVTSSettings(true),
      closeVTSSettings: () => setShowVTSSettings(false),
      showVividExport,
      openVividExport: () => setShowVividExport(true),
      closeVividExport: () => setShowVividExport(false),
      showVividImport,
      openVividImport: () => setShowVividImport(true),
      closeVividImport: () => setShowVividImport(false),
      showImageImportOptions,
      imageImportDialogMode,
      imageImportInitialOptions,
      handleOpenImage,
      handleImportImageAsLayer,
      handleImportImagesAsLayers,
      handleImportFolderAsLayers,
      handleImageImportOptionsCancel,
      handleImageImportOptionsConfirm,
    }),
    [
      handleImageImportOptionsCancel,
      handleImageImportOptionsConfirm,
      handleImportFolderAsLayers,
      handleImportImageAsLayer,
      handleImportImagesAsLayers,
      handleOpenImage,
      imageImportDialogMode,
      imageImportInitialOptions,
      showAIGenerate,
      showAutoSetup,
      showComfyUISettings,
      showExportDialog,
      showImageImportOptions,
      showMediaExport,
      showOBSSettings,
      showReimportDialog,
      showShortcuts,
      showVTSSettings,
      showVividExport,
      showVividImport,
    ],
  );
}
