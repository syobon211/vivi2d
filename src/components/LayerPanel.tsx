import { isViviMesh } from "@vivi2d/core/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { endE2EPerfProbe, startE2EPerfProbe } from "@/lib/e2e-perf-probe";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { LayerContextMenu } from "./LayerPanel/ContextMenu";
import { LayerItem } from "./LayerPanel/Row";
import { useLayerContextMenu } from "./LayerPanel/useLayerContextMenu";
import { useLayerDnD } from "./LayerPanel/useLayerDnD";
import { useLayerFlatten } from "./LayerPanel/useLayerFlatten";
import { useLayerKeyboardNav } from "./LayerPanel/useLayerKeyboardNav";

// LayerPanel

export function LayerPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const treeRef = useRef<HTMLDivElement>(null);
  const pointerSelectionHandledRef = useRef<string | null>(null);
  const {
    dragOverId,
    dragPosition,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = useLayerDnD();
  const {
    contextMenu,
    openContextMenu,
    closeContextMenu,
    handleAddBone,
    handleAddArtPath,
    handleDelete,
  } = useLayerContextMenu(t("layer.boneName"), t("nodeKind.artPath"));

  const flat = useLayerFlatten(project?.layers);
  const layerById = useMemo(
    () => new Map(flat.map((entry) => [entry.layer.id, entry.layer])),
    [flat],
  );

  const defaultTabFocusId = flat[0]?.layer.id ?? null;

  const handleTreeKeyDown = useLayerKeyboardNav(flat, treeRef);

  const resolveLayerTargetId = useCallback(
    (target: EventTarget | null): string | null => {
      if (!(target instanceof HTMLElement)) return null;
      if (target.closest("button")) return null;
      const layerItem = target.closest<HTMLElement>(".layer-item[data-layer-id]");
      return layerItem?.dataset.layerId ?? null;
    },
    [],
  );

  const applySelection = useCallback(
    (layerId: string, mode: "single" | "toggle" | "range") => {
      const { toggleLayerSelection, rangeSelectLayer, selectLayer } =
        useSelectionStore.getState();
      startE2EPerfProbe("layerPanel.clickToNextFrame", layerId);
      const layer = layerById.get(layerId);
      if (layer && isViviMesh(layer)) {
        startE2EPerfProbe("selection.viviMeshReady", layerId);
      }
      if (mode === "toggle") {
        toggleLayerSelection(layerId);
      } else if (mode === "range") {
        rangeSelectLayer(layerId);
      } else {
        selectLayer(layerId);
      }
      requestAnimationFrame(() => {
        endE2EPerfProbe("layerPanel.clickToNextFrame", layerId, {
          layerId,
          mode,
        });
      });
    },
    [layerById],
  );

  const handleTreePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const layerId = resolveLayerTargetId(e.target);
      if (!layerId) return;
      pointerSelectionHandledRef.current = layerId;
      const mode = e.ctrlKey || e.metaKey ? "toggle" : e.shiftKey ? "range" : "single";
      applySelection(layerId, mode);
    },
    [applySelection, resolveLayerTargetId],
  );

  const handleTreeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const layerId = resolveLayerTargetId(e.target);
      if (!layerId) return;
      if (pointerSelectionHandledRef.current === layerId && e.detail !== 0) {
        pointerSelectionHandledRef.current = null;
        return;
      }
      pointerSelectionHandledRef.current = null;
      const mode = e.ctrlKey || e.metaKey ? "toggle" : e.shiftKey ? "range" : "single";
      applySelection(layerId, mode);
    },
    [applySelection, resolveLayerTargetId],
  );

  useEffect(() => {
    if (!project || project.layers.length === 0) return;
    endE2EPerfProbe("canvasOpen.layerListReady", "psd-import", {
      layerCount: project.layers.length,
    });
  }, [project]);

  return (
    // biome-ignore lint/a11y: This panel-level click only dismisses the context menu; the tree itself owns keyboard navigation and selection.
    <div className="panel layer-panel" onClick={closeContextMenu}>
      <div className="panel-header">{t("layer.title")}</div>
      {project && project.layers.length > 0 ? (
        <div
          ref={treeRef}
          className="panel-content layer-list scrollbar-thin"
          role="tree"
          aria-label={t("layer.title")}
          onPointerDown={handleTreePointerDown}
          onClick={handleTreeClick}
          onKeyDown={handleTreeKeyDown}
        >
          {project.layers.map((layer) => (
            <LayerItem
              key={layer.id}
              layer={layer}
              depth={0}
              dragOverId={dragOverId}
              dragPosition={dragPosition}
              defaultTabFocusId={defaultTabFocusId}
              onContextMenu={openContextMenu}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      ) : (
        <div className="panel-content layer-list scrollbar-thin">
          <div className="panel-empty">{t("layer.openPsd")}</div>
        </div>
      )}

      {contextMenu && (
        <LayerContextMenu
          contextMenu={contextMenu}
          onAddBone={handleAddBone}
          onAddArtPath={handleAddArtPath}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
