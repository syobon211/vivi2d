import { findLayerById } from "@vivi2d/core/layer-utils";
import { getManualPngImportMetadata, isViviMesh } from "@vivi2d/core/types";
import { useCallback, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { reimportManualPngLayer } from "@/stores/projectIO";
import { replaceV11Image } from "@/stores/projectIO/v11Images";
import { useSelectionStore } from "@/stores/selectionStore";
import { MenuDropdownItem } from "../MenuDropdown";

export function ManualPngReimportMenuItem() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const v11 = useEditorStore((s) => !!s.projectV11);
  const selectedLayerId = useSelectionStore((s) => s.selectedLayerId);

  const selectedManualPngLayer = useMemo(() => {
    if (!project || !selectedLayerId) return null;
    const layer = findLayerById(project.layers, selectedLayerId);
    if (!layer || !isViviMesh(layer)) return null;
    const manualPng = getManualPngImportMetadata(layer.importMetadata);
    return manualPng ? { layer, metadata: manualPng } : null;
  }, [project, selectedLayerId]);

  const selectedV11Mesh =
    v11 &&
    project &&
    selectedLayerId &&
    findLayerById(project.layers, selectedLayerId)?.kind === "viviMesh";
  const canReimport = !!selectedManualPngLayer?.metadata.sourcePath || !!selectedV11Mesh;
  const title = !selectedManualPngLayer
    ? "Select a manual PNG-imported ViviMesh to reimport."
    : !selectedManualPngLayer.metadata.sourcePath
      ? "Selected imported PNG layer is missing a source path."
      : t("menu.reimportImageLayerTitle");

  const handleClick = useCallback(async () => {
    if (useEditorStore.getState().projectV11 && selectedLayerId) {
      try {
        await replaceV11Image(selectedLayerId);
      } catch {
        useNotificationStore.getState().addNotification("error", t("v11.editFailed"));
      }
      return;
    }
    if (!selectedManualPngLayer) return;
    await reimportManualPngLayer(selectedManualPngLayer.layer.id);
  }, [selectedManualPngLayer, selectedLayerId, t]);

  return (
    <MenuDropdownItem
      onClick={handleClick}
      disabled={!canReimport}
      title={v11 ? t("menu.v11Replace") : title}
    >
      {t(v11 ? "menu.v11Replace" : "menu.reimportImageLayer")}
    </MenuDropdownItem>
  );
}
