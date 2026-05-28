import { useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import type { FlatLayer } from "./useLayerFlatten";

export function useLayerKeyboardNav(
  flat: FlatLayer[],
  treeRef: React.RefObject<HTMLDivElement | null>,
): (e: React.KeyboardEvent<HTMLDivElement>) => void {
  return useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (flat.length === 0) return;
      const activeId = (document.activeElement as HTMLElement | null)?.dataset?.layerId;
      if (!activeId) return;
      const currentIdx = flat.findIndex((f) => f.layer.id === activeId);
      if (currentIdx < 0) return;

      const focusAt = (idx: number) => {
        const clamped = Math.max(0, Math.min(flat.length - 1, idx));
        const target = flat[clamped];
        if (!target) return;
        treeRef.current
          ?.querySelector<HTMLElement>(`[data-layer-id="${target.layer.id}"]`)
          ?.focus();
      };

      const selectionStore = useSelectionStore.getState();
      const editorStore = useEditorStore.getState();
      const current = flat[currentIdx];
      if (!current) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (e.altKey) {
          editorStore.moveLayer(current.layer.id, "down");
          requestAnimationFrame(() => {
            treeRef.current
              ?.querySelector<HTMLElement>(`[data-layer-id="${current.layer.id}"]`)
              ?.focus();
          });
          return;
        }
        focusAt(currentIdx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (e.altKey) {
          editorStore.moveLayer(current.layer.id, "up");
          requestAnimationFrame(() => {
            treeRef.current
              ?.querySelector<HTMLElement>(`[data-layer-id="${current.layer.id}"]`)
              ?.focus();
          });
          return;
        }
        focusAt(currentIdx - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusAt(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusAt(flat.length - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (current.layer.children.length > 0) {
          if (!current.layer.expanded) {
            editorStore.toggleExpanded(current.layer.id);
          } else {
            focusAt(currentIdx + 1);
          }
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (current.layer.expanded && current.layer.children.length > 0) {
          editorStore.toggleExpanded(current.layer.id);
        } else if (current.depth > 0) {
          for (let i = currentIdx - 1; i >= 0; i--) {
            const item = flat[i];
            if (item && item.depth < current.depth) {
              focusAt(i);
              break;
            }
          }
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          selectionStore.toggleLayerSelection(current.layer.id);
        } else if (e.shiftKey) {
          selectionStore.rangeSelectLayer(current.layer.id);
        } else {
          selectionStore.selectLayer(current.layer.id);
        }
      }
    },
    [flat, treeRef],
  );
}
