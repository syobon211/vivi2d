import { findLayerById } from "@vivi2d/core/layer-utils";
import { getManualPngImportMetadata, isViviMesh } from "@vivi2d/core/types";
import { useCallback, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { reimportManualPngLayer } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { MenuDropdownItem } from "../MenuDropdown";

export function ManualPngReimportMenuItem() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const selectedLayerId = useSelectionStore((s) => s.selectedLayerId);

  const selectedManualPngLayer = useMemo(() => {
    if (!project || !selectedLayerId) return null;
    const layer = findLayerById(project.layers, selectedLayerId);
    if (!layer || !isViviMesh(layer)) return null;
    const manualPng = getManualPngImportMetadata(layer.importMetadata);
    return manualPng ? { layer, metadata: manualPng } : null;
  }, [project, selectedLayerId]);

  const canReimport = !!selectedManualPngLayer?.metadata.sourcePath;
  const title = !selectedManualPngLayer
    ? "Select a manual PNG-imported ViviMesh to reimport."
    : !selectedManualPngLayer.metadata.sourcePath
      ? "Selected imported PNG layer is missing a source path."
      : t("menu.reimportImageLayerTitle");

  const handleClick = useCallback(async () => {
    if (!selectedManualPngLayer) return;
    await reimportManualPngLayer(selectedManualPngLayer.layer.id);
  }, [selectedManualPngLayer]);

  return (
    <MenuDropdownItem onClick={handleClick} disabled={!canReimport} title={title}>
      {t("menu.reimportImageLayer")}
    </MenuDropdownItem>
  );
}
