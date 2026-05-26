import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { AnimationClip } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import { useCallback, useMemo, useState } from "react";
import { type ExportOptions, exportForSpine } from "@/lib/export";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { DialogShell } from "./DialogShell";

interface ExportDialogProps {
  onClose: () => void;
}

export function ExportDialog({ onClose }: ExportDialogProps) {
  const t = useT();
  const project = useEditorStore((s) => s.project);

  const viviMeshNodes = useMemo(() => {
    if (!project) return [];
    return flattenLayers(project.layers).filter(isViviMesh);
  }, [project]);

  const allClips = useMemo<AnimationClip[]>(
    () => project?.scenes.flatMap((s) => s.clips) ?? [],
    [project],
  );

  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(
    () => new Set(viviMeshNodes.map((n) => n.id)),
  );
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(
    () => new Set(allClips.map((c) => c.id)),
  );

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState("");

  const toggleLayer = useCallback((id: string) => {
    setSelectedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleClip = useCallback((id: string) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllLayers = useCallback(() => {
    setSelectedLayerIds(new Set(viviMeshNodes.map((n) => n.id)));
  }, [viviMeshNodes]);

  const deselectAllLayers = useCallback(() => {
    setSelectedLayerIds(new Set());
  }, []);

  const selectAllClips = useCallback(() => {
    setSelectedClipIds(new Set(allClips.map((c) => c.id)));
  }, [allClips]);

  const deselectAllClips = useCallback(() => {
    setSelectedClipIds(new Set());
  }, []);

  const allLayersSelected = selectedLayerIds.size === viviMeshNodes.length;
  const allClipsSelected = selectedClipIds.size === allClips.length;
  const canExport = selectedLayerIds.size > 0;

  const handleExport = useCallback(async () => {
    if (!project || selectedLayerIds.size === 0) return;

    try {
      setProgress(t("export.selectingDest"));
      const dirPath = await window.electronAPI.selectExportDirectory();
      if (!dirPath) {
        setProgress("");
        return;
      }

      setIsExporting(true);
      setProgress(t("export.generatingData"));

      const options: ExportOptions | undefined =
        allLayersSelected && allClipsSelected
          ? undefined
          : {
              layerIds: allLayersSelected ? undefined : selectedLayerIds,
              clipIds: allClipsSelected ? undefined : selectedClipIds,
            };

      const result = await exportForSpine(project, allClips, options);

      for (const warning of result.warnings) {
        useNotificationStore.getState().addNotification("warning", warning);
      }

      setProgress(`${result.files.length} ${t("export.writingFileCountSuffix")}`);

      const serializedFiles = await Promise.all(
        result.files.map(async (file) => {
          if (file.content instanceof Blob) {
            const buffer = await file.content.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]!);
            }
            return {
              path: file.path,
              content: btoa(binary),
              isBlob: true,
            };
          }
          return {
            path: file.path,
            content: file.content,
            isBlob: false,
          };
        }),
      );

      await window.electronAPI.writeExportFiles({
        dirPath,
        files: serializedFiles,
      });

      useNotificationStore
        .getState()
        .addNotification(
          "info",
          `${t("export.completedPrefix")} ${result.files.length} ${t("export.fileCountSuffix")}`,
        );
      onClose();
    } catch (err) {
      useNotificationStore
        .getState()
        .addNotification(
          "error",
          `${t("export.failedPrefix")} ${err instanceof Error ? err.message : String(err)}`,
        );
    } finally {
      setIsExporting(false);
      setProgress("");
    }
  }, [
    project,
    allClips,
    selectedLayerIds,
    selectedClipIds,
    allLayersSelected,
    allClipsSelected,
    onClose,
    t,
  ]);

  return (
    <DialogShell
      onClose={onClose}
      title={t("export.spineTitle")}
      className="export-dialog"
      footer={
        <>
          <button
            type="button"
            className="modal-btn"
            onClick={onClose}
            disabled={isExporting}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={handleExport}
            disabled={isExporting || !project || !canExport}
          >
            {isExporting ? t("common.exporting") : t("common.export")}
          </button>
        </>
      }
    >
      <div className="export-dialog-body">
        <div className="export-section">
          <div className="export-section-header">
            <span className="export-section-title">
              {t("export.layers")} ({selectedLayerIds.size}/{viviMeshNodes.length})
            </span>
            <button
              type="button"
              className="export-toggle-btn"
              onClick={allLayersSelected ? deselectAllLayers : selectAllLayers}
              disabled={isExporting}
            >
              {allLayersSelected ? t("common.deselectAll") : t("common.selectAll")}
            </button>
          </div>
          <ul className="export-select-list" data-testid="layer-select-list">
            {viviMeshNodes.map((node) => (
              <li key={node.id} className="export-select-item">
                <label className="export-select-label">
                  <input
                    type="checkbox"
                    checked={selectedLayerIds.has(node.id)}
                    onChange={() => toggleLayer(node.id)}
                    disabled={isExporting}
                  />
                  <span className="export-select-name">{node.name}</span>
                </label>
              </li>
            ))}
            {viviMeshNodes.length === 0 && (
              <li className="export-select-empty">{t("export.noViviMesh")}</li>
            )}
          </ul>
        </div>

        {allClips.length > 0 && (
          <div className="export-section">
            <div className="export-section-header">
              <span className="export-section-title">
                {t("export.animations")} ({selectedClipIds.size}/{allClips.length})
              </span>
              <button
                type="button"
                className="export-toggle-btn"
                onClick={allClipsSelected ? deselectAllClips : selectAllClips}
                disabled={isExporting}
              >
                {allClipsSelected ? t("common.deselectAll") : t("common.selectAll")}
              </button>
            </div>
            <ul className="export-select-list" data-testid="clip-select-list">
              {allClips.map((clip) => (
                <li key={clip.id} className="export-select-item">
                  <label className="export-select-label">
                    <input
                      type="checkbox"
                      checked={selectedClipIds.has(clip.id)}
                      onChange={() => toggleClip(clip.id)}
                      disabled={isExporting}
                    />
                    <span className="export-select-name">{clip.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="export-section">
          <span className="export-section-title">{t("export.outputFiles")}</span>
          <ul className="export-file-list">
            <li>spine.json — {t("export.bonesSkinAnims")}</li>
            {selectedLayerIds.size > 0 && (
              <li>texture_00.png — {t("export.textureAtlas")}</li>
            )}
          </ul>
        </div>

        {progress && <p className="export-progress">{progress}</p>}
      </div>
    </DialogShell>
  );
}
