// ============================================================
// LayerPanel context menu hook
// The hook owns local menu state and delegates actions to stores.
// ============================================================

import type { LayerNode } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";
import { useCallback, useState } from "react";
import { useArtPathStore } from "@/stores/artPathStore";
import { useBoneStore } from "@/stores/boneStore";

export interface ContextMenuState {
  x: number;
  y: number;
  layerId: string;
  layer: LayerNode;
}

export interface LayerContextMenu {
  contextMenu: ContextMenuState | null;
  openContextMenu: (e: React.MouseEvent, layer: LayerNode) => void;
  closeContextMenu: () => void;
  handleAddBone: () => void;
  handleAddArtPath: () => void;
  handleDelete: () => void;
}

// Create the context-menu state and handlers for a layer row.
// The caller passes already-localized labels for new bones and art paths.
export function useLayerContextMenu(
  boneName: string,
  artPathName: string,
): LayerContextMenu {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const openContextMenu = useCallback(
    (e: React.MouseEvent, layer: LayerNode) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, layerId: layer.id, layer });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleAddBone = useCallback(() => {
    if (!contextMenu) return;
    const { layer } = contextMenu;
    const x = layer.x + layer.width / 2;
    const y = layer.y + layer.height / 2;
    useBoneStore.getState().addBone(layer.id, boneName, x, y);
    setContextMenu(null);
  }, [contextMenu, boneName]);

  const handleAddArtPath = useCallback(() => {
    if (!contextMenu) return;
    const { layer } = contextMenu;
    const x = layer.x + layer.width / 2;
    const y = layer.y + layer.height / 2;
    useArtPathStore.getState().addArtPath(artPathName, x, y);
    setContextMenu(null);
  }, [contextMenu, artPathName]);

  const handleDelete = useCallback(() => {
    if (!contextMenu) return;
    const { layer } = contextMenu;
    if (isBone(layer)) {
      useBoneStore.getState().removeBone(layer.id);
    }
    setContextMenu(null);
  }, [contextMenu]);

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu,
    handleAddBone,
    handleAddArtPath,
    handleDelete,
  };
}
