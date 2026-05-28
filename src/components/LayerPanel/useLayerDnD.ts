import { useCallback, useRef, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";

export interface LayerDnD {
  dragOverId: string | null;
  dragPosition: "above" | "below" | null;
  handleDragStart: (layerId: string) => void;
  handleDragOver: (e: React.DragEvent, layerId: string) => void;
  handleDrop: (e: React.DragEvent, targetLayerId: string) => void;
  handleDragEnd: () => void;
}

export function useLayerDnD(): LayerDnD {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"above" | "below" | null>(null);
  const dragSourceId = useRef<string | null>(null);

  const handleDragStart = useCallback((layerId: string) => {
    dragSourceId.current = layerId;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, layerId: string) => {
    e.preventDefault();
    if (dragSourceId.current === layerId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOverId(layerId);
    setDragPosition(e.clientY < midY ? "above" : "below");
  }, []);

  const handleDrop = useCallback(
    (_e: React.DragEvent, targetLayerId: string) => {
      const sourceId = dragSourceId.current;
      const pos = dragPosition;
      if (!sourceId || sourceId === targetLayerId || !pos) return;
      useEditorStore
        .getState()
        .reorderLayer(sourceId, targetLayerId, pos === "above" ? "before" : "after");
      dragSourceId.current = null;
      setDragOverId(null);
      setDragPosition(null);
    },
    [dragPosition],
  );

  const handleDragEnd = useCallback(() => {
    dragSourceId.current = null;
    setDragOverId(null);
    setDragPosition(null);
  }, []);

  return {
    dragOverId,
    dragPosition,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
