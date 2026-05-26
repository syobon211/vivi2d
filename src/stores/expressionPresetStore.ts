import {
  createExpressionPreset,
  getExpressionPresetValues,
  getExpressionPresetValuesByHotkey,
  removeExpressionPreset,
  renameExpressionPreset,
  setExpressionPresetHotkey,
  updateExpressionPresetValues,
} from "@vivi2d/editor-core/expression-preset-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { useParameterStore } from "./parameterStore";
import { mutateProject } from "./projectMutator";

interface ExpressionPresetActions {
  createPreset: (name: string) => string;
  applyPreset: (presetId: string) => void;
  removePreset: (presetId: string) => void;
  renamePreset: (presetId: string, name: string) => void;
  updatePresetValues: (presetId: string) => void;
  setHotkey: (presetId: string, hotkey: number | undefined) => void;
  applyByHotkey: (hotkey: number) => void;
}

function hasProject(): boolean {
  return Boolean(useEditorStore.getState().project);
}

export const useExpressionPresetStore = create<ExpressionPresetActions>()(
  withStandardMiddleware<ExpressionPresetActions>(
    () => ({
      createPreset: (name) => {
        if (!hasProject()) return "";
        const id = crypto.randomUUID();
        const values = { ...useParameterStore.getState().parameterValues };
        mutateProject((nextProject) => {
          createExpressionPreset(nextProject, { name, values }, () => id);
        });
        return id;
      },

      applyPreset: (presetId) => {
        const project = useEditorStore.getState().project;
        if (!project) return;
        const values = getExpressionPresetValues(project, presetId);
        if (!values) return;
        useParameterStore.getState().setAllValues(values);
      },

      removePreset: (presetId) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          removeExpressionPreset(project, presetId);
        });
      },

      renamePreset: (presetId, name) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          renameExpressionPreset(project, presetId, name);
        });
      },

      updatePresetValues: (presetId) => {
        if (!hasProject()) return;
        const values = { ...useParameterStore.getState().parameterValues };
        mutateProject((nextProject) => {
          updateExpressionPresetValues(nextProject, presetId, values);
        });
      },

      setHotkey: (presetId, hotkey) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          setExpressionPresetHotkey(project, presetId, hotkey);
        });
      },

      applyByHotkey: (hotkey) => {
        const project = useEditorStore.getState().project;
        if (!project) return;
        const values = getExpressionPresetValuesByHotkey(project, hotkey);
        if (!values) return;
        useParameterStore.getState().setAllValues(values);
      },
    }),
    { name: "ExpressionPresetStore", persistEnabled: false },
  ),
);
