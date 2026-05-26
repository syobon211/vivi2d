import type { LayerNode } from "@vivi2d/core/types";
import { memo } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";

const TREEITEM_KEYSHORTCUTS =
  "ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space Alt+ArrowUp Alt+ArrowDown";

function nodeIcon(layer: LayerNode): string {
  switch (layer.kind) {
    case "group":
      return "G";
    case "viviMesh":
      return "M";
    case "bone":
      return "B";
    case "artPath":
      return "P";
    default:
      return "?";
  }
}

export interface LayerItemProps {
  layer: LayerNode;
  depth: number;
  dragOverId: string | null;
  dragPosition: "above" | "below" | null;
  defaultTabFocusId: string | null;
  onContextMenu: (e: React.MouseEvent, layer: LayerNode) => void;
  onDragStart: (layerId: string) => void;
  onDragOver: (e: React.DragEvent, layerId: string) => void;
  onDrop: (e: React.DragEvent, layerId: string) => void;
  onDragEnd: () => void;
}

export const LayerItem = memo(function LayerItem({
  layer,
  depth,
  dragOverId,
  dragPosition,
  defaultTabFocusId,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: LayerItemProps) {
  const t = useT();
  const isSelected = useSelectionStore((s) => s.selectedLayerLookup[layer.id] === true);
  const isTabTarget = useSelectionStore((s) =>
    s.selectedLayerId ? s.selectedLayerId === layer.id : defaultTabFocusId === layer.id,
  );
  const isSolo = useSelectionStore((s) => s.soloLayerIds.includes(layer.id));
  const hasSolo = useSelectionStore((s) => s.soloLayerIds.length > 0);
  const hasChildren = layer.children.length > 0;
  const isDragOver = dragOverId === layer.id;
  const stopRowSelection = (e: React.SyntheticEvent) => e.stopPropagation();

  const dragClass =
    isDragOver && dragPosition === "above"
      ? "drag-above"
      : isDragOver && dragPosition === "below"
        ? "drag-below"
        : "";

  return (
    <>
      <div
        className={`layer-item ${isSelected ? "selected" : ""} ${!layer.visible ? "hidden-layer" : ""} ${dragClass}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onContextMenu={(e) => onContextMenu(e, layer)}
        onDragStart={() => onDragStart(layer.id)}
        onDragOver={(e) => onDragOver(e, layer.id)}
        onDrop={(e) => onDrop(e, layer.id)}
        onDragEnd={onDragEnd}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? layer.expanded : undefined}
        aria-keyshortcuts={TREEITEM_KEYSHORTCUTS}
        data-layer-id={layer.id}
        tabIndex={isTabTarget ? 0 : -1}
      >
        {hasChildren ? (
          <button
            type="button"
            className="layer-expand-btn"
            tabIndex={-1}
            onPointerDown={stopRowSelection}
            onClick={(e) => {
              e.stopPropagation();
              useEditorStore.getState().toggleExpanded(layer.id);
            }}
            aria-label={layer.expanded ? t("layer.collapse") : t("layer.expand")}
          >
            {layer.expanded ? "v" : ">"}
          </button>
        ) : (
          <span className="layer-expand-spacer" />
        )}

        <button
          type="button"
          className="layer-visibility-btn"
          tabIndex={-1}
          onPointerDown={stopRowSelection}
          onClick={(e) => {
            e.stopPropagation();
            useEditorStore.getState().toggleVisibility(layer.id);
          }}
          title={layer.visible ? t("layer.hide") : t("layer.show")}
          aria-label={layer.visible ? t("layer.hide") : t("layer.show")}
          aria-pressed={!layer.visible}
        >
          {layer.visible ? "on" : "off"}
        </button>

        <button
          type="button"
          className={`layer-solo-btn ${isSolo ? "solo-active" : ""} ${hasSolo && !isSolo ? "solo-dimmed" : ""}`}
          tabIndex={-1}
          onPointerDown={stopRowSelection}
          onClick={(e) => {
            e.stopPropagation();
            const { addToSolo, toggleSolo } = useSelectionStore.getState();
            if (e.ctrlKey || e.metaKey) {
              addToSolo(layer.id);
            } else {
              toggleSolo(layer.id);
            }
          }}
          title={t("layer.soloView")}
          aria-label={t("layer.soloView")}
          aria-pressed={isSolo}
        >
          S
        </button>

        <button
          type="button"
          className="layer-drag-handle"
          tabIndex={-1}
          draggable
          onPointerDown={stopRowSelection}
          onClick={stopRowSelection}
          onDragStart={() => onDragStart(layer.id)}
          onDragEnd={onDragEnd}
          title={t("layer.dragReorder")}
          aria-label={t("layer.dragReorder")}
        >
          ::
        </button>

        <span className="layer-icon" data-testid={`layer-icon-${layer.kind}`}>
          {nodeIcon(layer)}
        </span>

        <span className="layer-name" title={layer.name}>
          {layer.name}
        </span>

        {layer.clipMaskIds && layer.clipMaskIds.length > 0 && (
          <span className="layer-clip-badge" title={t("layer.clippingApplied")}>
            CM
          </span>
        )}

        {layer.opacity < 1 && (
          <span className="layer-opacity">{Math.round(layer.opacity * 100)}%</span>
        )}
      </div>

      {hasChildren && layer.expanded && (
        <div className="layer-children">
          {layer.children.map((child) => (
            <LayerItem
              key={child.id}
              layer={child}
              depth={depth + 1}
              dragOverId={dragOverId}
              dragPosition={dragPosition}
              defaultTabFocusId={defaultTabFocusId}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </>
  );
});
