import { isBone } from "@vivi2d/core/types";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import type { ContextMenuState } from "./useLayerContextMenu";

export interface LayerContextMenuProps {
  contextMenu: ContextMenuState;
  onAddBone: () => void;
  onAddArtPath: () => void;
  onDelete: () => void;
}

export function LayerContextMenu({
  contextMenu,
  onAddBone,
  onAddArtPath,
  onDelete,
}: LayerContextMenuProps) {
  const t = useT();
  const v11 = useEditorStore((state) => !!state.projectV11);
  return (
    <div
      className="context-menu"
      role="menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        type="button"
        role="menuitem"
        className="context-menu-item"
        onClick={onAddBone}
      >
        {t("layer.addBone")}
      </button>
      <button
        type="button"
        role="menuitem"
        className="context-menu-item"
        onClick={onAddArtPath}
      >
        {t("artPath.addMenu")}
      </button>
      {(isBone(contextMenu.layer) || (v11 && contextMenu.layer.kind === "viviMesh")) && (
        <>
          <div className="context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            className="context-menu-item context-menu-danger"
            onClick={onDelete}
          >
            {t("common.delete")}
          </button>
        </>
      )}
    </div>
  );
}
