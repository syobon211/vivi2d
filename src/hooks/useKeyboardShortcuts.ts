import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useExpressionPresetStore } from "@/stores/expressionPresetStore";
import { useHistoryStore } from "@/stores/historyStore";
import { saveProject } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { matchesBinding, useShortcutStore } from "@/stores/shortcutStore";
import { useViewportStore } from "@/stores/viewportStore";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const keymap = useShortcutStore.getState().keymap;
      const setTool = useViewportStore.getState().setTool;

      // Undo / Redo
      if (matchesBinding(e, keymap.redo)) {
        e.preventDefault();
        useHistoryStore.getState().redo();
        return;
      }
      if (matchesBinding(e, keymap.undo)) {
        e.preventDefault();
        useHistoryStore.getState().undo();
        return;
      }

      if (matchesBinding(e, keymap.saveAs)) {
        e.preventDefault();
        const project = useEditorStore.getState().project;
        if (project) saveProject(true);
        return;
      }
      if (matchesBinding(e, keymap.save)) {
        e.preventDefault();
        const project = useEditorStore.getState().project;
        if (project) saveProject(false);
        return;
      }

      if (matchesBinding(e, keymap.moveLayerUp)) {
        e.preventDefault();
        const selectedLayerId = useSelectionStore.getState().selectedLayerId;
        if (selectedLayerId) {
          useEditorStore.getState().moveLayer(selectedLayerId, "up");
        }
        return;
      }
      if (matchesBinding(e, keymap.moveLayerDown)) {
        e.preventDefault();
        const selectedLayerId = useSelectionStore.getState().selectedLayerId;
        if (selectedLayerId) {
          useEditorStore.getState().moveLayer(selectedLayerId, "down");
        }
        return;
      }

      if (matchesBinding(e, keymap.selectAll)) {
        e.preventDefault();
        useSelectionStore.getState().selectAllLayers();
        return;
      }

      if (matchesBinding(e, keymap.toolSelect)) {
        setTool("select");
        return;
      }
      if (matchesBinding(e, keymap.toolPan)) {
        setTool("pan");
        return;
      }
      if (matchesBinding(e, keymap.toolMeshEdit)) {
        setTool("meshEdit");
        return;
      }

      if (!e.repeat && matchesBinding(e, keymap.tempPan)) {
        setTool("pan");
        return;
      }

      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        e.key >= "1" &&
        e.key <= "9"
      ) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
          useExpressionPresetStore.getState().applyByHotkey(Number(e.key));
          return;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const keymap = useShortcutStore.getState().keymap;
      if (matchesBinding(e, keymap.tempPan)) {
        useViewportStore.getState().setTool("select");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
