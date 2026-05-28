import { lazy, Suspense } from "react";
import { DialogLoadingFallback } from "@/components/DialogLoadingFallback";
import { ImageImportOptionsDialog } from "@/components/ImageImportOptionsDialog";
import type { MenuDialogsController } from "./useMenuDialogs";

const AIGenerateDialog = lazy(() =>
  import("../AIGenerateDialog").then((m) => ({ default: m.AIGenerateDialog })),
);
const AutoSetupDialog = lazy(() =>
  import("../AutoSetupDialog").then((m) => ({ default: m.AutoSetupDialog })),
);
const ComfyUISettingsDialog = lazy(() =>
  import("../ComfyUISettingsDialog").then((m) => ({ default: m.ComfyUISettingsDialog })),
);
const ExportDialog = lazy(() =>
  import("../ExportDialog").then((m) => ({ default: m.ExportDialog })),
);
const MediaExportDialog = lazy(() =>
  import("../MediaExportDialog").then((m) => ({ default: m.MediaExportDialog })),
);
const OBSSettingsDialog = lazy(() =>
  import("../OBSSettingsDialog").then((m) => ({ default: m.OBSSettingsDialog })),
);
const ReimportDialog = lazy(() =>
  import("../ReimportDialog").then((m) => ({ default: m.ReimportDialog })),
);
const ShortcutSettingsDialog = lazy(() =>
  import("../ShortcutSettingsDialog").then((m) => ({
    default: m.ShortcutSettingsDialog,
  })),
);
const VividDialog = lazy(() =>
  import("../VividDialog").then((m) => ({ default: m.VividDialog })),
);
const VTSSettingsDialog = lazy(() =>
  import("../VTSSettingsDialog").then((m) => ({ default: m.VTSSettingsDialog })),
);

export function MenuDialogsHost({ dialogs }: { dialogs: MenuDialogsController }) {
  return (
    <>
      {dialogs.showImageImportOptions && (
        <ImageImportOptionsDialog
          mode={dialogs.imageImportDialogMode}
          initialOptions={dialogs.imageImportInitialOptions}
          onCancel={dialogs.handleImageImportOptionsCancel}
          onConfirm={dialogs.handleImageImportOptionsConfirm}
        />
      )}
      <Suspense fallback={<DialogLoadingFallback />}>
        {dialogs.showExportDialog && <ExportDialog onClose={dialogs.closeExportDialog} />}
        {dialogs.showReimportDialog && (
          <ReimportDialog onClose={dialogs.closeReimportDialog} />
        )}
        {dialogs.showShortcuts && (
          <ShortcutSettingsDialog onClose={dialogs.closeShortcuts} />
        )}
        {dialogs.showMediaExport && (
          <MediaExportDialog onClose={dialogs.closeMediaExport} />
        )}
        {dialogs.showAutoSetup && <AutoSetupDialog onClose={dialogs.closeAutoSetup} />}
        {dialogs.showAIGenerate && <AIGenerateDialog onClose={dialogs.closeAIGenerate} />}
        {dialogs.showComfyUISettings && (
          <ComfyUISettingsDialog onClose={dialogs.closeComfyUISettings} />
        )}
        {dialogs.showOBSSettings && (
          <OBSSettingsDialog onClose={dialogs.closeOBSSettings} />
        )}
        {dialogs.showVTSSettings && (
          <VTSSettingsDialog onClose={dialogs.closeVTSSettings} />
        )}
        {dialogs.showVividExport && (
          <VividDialog mode="export" onClose={dialogs.closeVividExport} />
        )}
        {dialogs.showVividImport && (
          <VividDialog mode="import" onClose={dialogs.closeVividImport} />
        )}
      </Suspense>
    </>
  );
}
